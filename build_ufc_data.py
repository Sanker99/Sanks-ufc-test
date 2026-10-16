#!/usr/bin/env python3
"""Publish a cached UFCStats research dataset from public HTML, without an API key.

Does not bypass bot protection. Failed runs leave the previous dataset unchanged.
"""
import argparse
import datetime as dt
import json
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE = 'http://ufcstats.com'
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; SanksResearchLab/1.0; research cache)'}


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


def txt(node):
    return node.get_text(' ', strip=True) if node else ''


def number(value):
    m = re.search(r'\d+(?:\.\d+)?', str(value or ''))
    return float(m.group()) if m else None


def fetch(session, url, delay):
    url = urljoin(BASE + '/', url)
    if urlparse(url).hostname not in {'ufcstats.com', 'www.ufcstats.com'}:
        raise ValueError('Unexpected host: ' + url)
    time.sleep(delay)
    response = session.get(url, timeout=25)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    if not soup.select('table') and ('checking your browser' in response.text.lower() or 'verify you are human' in response.text.lower()):
        raise RuntimeError('UFCStats returned browser verification instead of records')
    return soup


def fighter_index(session, delay):
    result = {}
    for letter in 'abcdefghijklmnopqrstuvwxyz':
        soup = fetch(session, f'/statistics/fighters?char={letter}&page=all', delay)
        for row in soup.select('tr.b-statistics__table-row'):
            links = row.select('a[href*="fighter-details/"]')
            if not links:
                continue
            name = ' '.join(txt(a) for a in links[:2]).strip()
            if name:
                result[norm(name)] = {'name': name, 'url': links[0]['href']}
    print(f'Indexed {len(result)} fighters', flush=True)
    if not result:
        raise RuntimeError('No fighter index rows found; check page markup or access restrictions')
    return result


def completed_events(session, delay, count=12):
    soup = fetch(session, '/statistics/events/completed?page=all', delay)
    links = []
    for a in soup.select('a[href*="event-details/"]'):
        url = urljoin(BASE, a.get('href', ''))
        if url not in links:
            links.append(url)
    print(f'Found {len(links)} completed event links', flush=True)
    return links[:count]


def recent_fighters(session, index, delay, limit):
    selected, seen = [], set()
    for event_url in completed_events(session, delay):
        if len(selected) >= limit:
            break
        try:
            event = fetch(session, event_url, delay)
            # UFCStats event pages normally link to fight details, not fighter profiles.
            fight_urls = []
            for row in event.select('tr[data-link*="fight-details/"]'):
                fight_urls.append(row['data-link'])
            for a in event.select('a[href*="fight-details/"]'):
                fight_urls.append(a['href'])
            for fight_url in dict.fromkeys(fight_urls):
                if len(selected) >= limit:
                    break
                try:
                    fight = fetch(session, fight_url, delay)
                    for a in fight.select('a[href*="fighter-details/"]'):
                        url = urljoin(BASE, a['href'])
                        if url in seen:
                            continue
                        name = txt(a)
                        if not name:
                            continue
                        seen.add(url)
                        selected.append(index.get(norm(name), {'name': name, 'url': url}))
                        if len(selected) >= limit:
                            break
                except Exception as exc:
                    print(f'Skipped fight {fight_url}: {exc}', flush=True)
        except Exception as exc:
            print(f'Skipped event {event_url}: {exc}', flush=True)
    print(f'Selected {len(selected)} recent fighters', flush=True)
    return selected


def fighter_details(session, item, delay):
    soup = fetch(session, item['url'], delay)
    name = txt(soup.select_one('.b-content__title-highlight')) or item['name']
    fields = {}
    for li in soup.select('li.b-list__box-list-item'):
        raw = txt(li)
        if ':' in raw:
            k, v = raw.split(':', 1)
            fields[k.strip().lower()] = v.strip()
    fights = []
    for row in soup.select('tr.b-fight-details__table-row[data-link]'):
        cells = row.select('td')
        if len(cells) < 10 or '/fight-details/' not in row.get('data-link', ''):
            continue
        names = [txt(a) for a in cells[1].select('a')]
        opponent = next((n for n in names if norm(n) != norm(name)), None)
        event = txt(cells[6].select_one('a'))
        fights.append({
            'opponent': opponent, 'result': txt(cells[0]).upper() or None,
            'method': txt(cells[7]), 'round': number(txt(cells[8])),
            'time': txt(cells[9]), 'date': txt(cells[6]).replace(event, '').strip(),
            'event': event, 'fight_url': row['data-link'],
            'sig_strikes': None, 'total_strikes': None, 'takedowns': None, 'submissions': None,
        })
    return {
        'name': name, 'record': txt(soup.select_one('.b-content__title-record')),
        'slpm': fields.get('slpm'), 'str_acc': fields.get('str. acc.'),
        'sapm': fields.get('sapm'), 'str_def': fields.get('str. def.'),
        'td_avg': fields.get('td avg.'), 'td_acc': fields.get('td acc.'),
        'td_def': fields.get('td def.'), 'sub_avg': fields.get('sub. avg.'),
        'source_url': item['url'], 'fights': fights,
    }


def fight_details(session, url, fighter, delay):
    soup = fetch(session, url, delay)
    names = [txt(a) for a in soup.select('.b-fight-details__person-name a')]
    index = next((i for i, name in enumerate(names) if norm(name) == norm(fighter)), None)
    if index is None:
        return {}
    table = soup.select_one('table.b-fight-details__table')
    row = table.select_one('tbody tr') if table else None
    if row is None:
        return {}
    cells = row.select('td')

    def cell_value(col):
        if col >= len(cells):
            return None
        parts = cells[col].select('p')
        return txt(parts[index]) if index < len(parts) else None

    def landed(col):
        value = cell_value(col)
        return number(value.split('of')[0]) if value else None

    return {'sig_strikes': landed(2), 'total_strikes': landed(4),
            'takedowns': landed(5), 'submissions': number(cell_value(7))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--max-fighters', type=int, default=60)
    parser.add_argument('--max-events', type=int, default=12)
    parser.add_argument('--delay', type=float, default=0.8)
    parser.add_argument('--names-file')
    parser.add_argument('--output', default='data/ufc-data.json')
    args = parser.parse_args()
    session = requests.Session()
    session.headers.update(HEADERS)
    output = Path(args.output)
    index = fighter_index(session, args.delay)
    if args.names_file:
        names = [x.strip() for x in Path(args.names_file).read_text().splitlines() if x.strip()]
        selected = [index[norm(name)] for name in names if norm(name) in index]
    else:
        selected = recent_fighters(session, index, args.delay, args.max_fighters)
    if not selected:
        raise RuntimeError('No fighters selected. Existing UFC data left untouched.')
    fighters, errors = {}, []
    for i, item in enumerate(selected[:args.max_fighters], 1):
        try:
            fighter = fighter_details(session, item, args.delay)
            for fight in fighter['fights'][:7]:
                try:
                    fight.update(fight_details(session, fight['fight_url'], fighter['name'], args.delay))
                except Exception as exc:
                    errors.append(f"{fighter['name']}: {exc}")
            fighters[norm(fighter['name'])] = fighter
        except Exception as exc:
            errors.append(f"{item['name']}: {exc}")
        if i % 10 == 0:
            print(f'Processed {i}/{len(selected)}', flush=True)
    if not fighters:
        raise RuntimeError('No fighter profiles collected. Existing UFC data left untouched.')
    payload = {
        'schema': 1, 'source': 'UFCStats', 'source_url': BASE,
        'updated': dt.datetime.now(dt.timezone.utc).isoformat(),
        'fighters': fighters, 'events': [], 'errors': errors[:30],
        'coverage': {'indexed': len(index), 'processed': len(fighters)},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(output)
    print(f'Published {len(fighters)} fighter profiles; {len(errors)} partial errors', flush=True)


if __name__ == '__main__':
    main()
