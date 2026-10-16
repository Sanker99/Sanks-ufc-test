#!/usr/bin/env python3
"""Build Sanks UFC research dataset from downloadable public CSV snapshots."""
import csv
import io
import json
import re
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BASE = 'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/'
FILES = ['ufc_fighter_details.csv', 'ufc_fight_results.csv', 'ufc_fight_stats.csv', 'ufc_event_details.csv']

def read_csv(name):
    req = urllib.request.Request(BASE + name, headers={'User-Agent': 'SanksResearchLab/1.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        rows = list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))))
    print(f'{name}: {len(rows)} rows', flush=True)
    if not rows:
        raise RuntimeError(f'Empty CSV: {name}')
    return rows

def key(name):
    name = unicodedata.normalize('NFKD', str(name or ''))
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in name if not unicodedata.combining(c)).lower())

def first_number(value):
    m = re.match(r'\s*(\d+)', str(value or ''))
    return int(m.group(1)) if m else None

def date_iso(value):
    for fmt in ('%B %d, %Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(value.strip(), fmt).strftime('%Y-%m-%d')
        except (ValueError, AttributeError):
            pass
    return ''

def main():
    fighters, results, stats, events = [read_csv(f) for f in FILES]
    dates = {r['EVENT']: date_iso(r.get('DATE', '')) for r in events}
    totals = defaultdict(lambda: defaultdict(int))
    for row in stats:
        ident = (row.get('EVENT', ''), row.get('BOUT', ''), key(row.get('FIGHTER', '')))
        for column, metric in [('SIG. STR.', 'sig_strikes'), ('TOTAL STR.', 'total_strikes'), ('TD', 'takedowns'), ('SUB. ATT.', 'submissions')]:
            value = first_number(row.get(column))
            if value is not None:
                totals[ident][metric] += value
    histories = defaultdict(list)
    for row in results:
        bout = row.get('BOUT', '')
        names = re.split(r'\s+vs\.?\s+', bout, maxsplit=1, flags=re.I)
        if len(names) != 2:
            continue
        a, b = [x.strip() for x in names]
        outcome = (row.get('OUTCOME', '') or '').upper().replace(' ', '')
        for index, (name, opponent) in enumerate(((a, b), (b, a))):
            if outcome == 'W/L':
                result = 'W' if index == 0 else 'L'
            elif outcome == 'L/W':
                result = 'L' if index == 0 else 'W'
            elif outcome in ('D/D', 'DRAW'):
                result = 'D'
            elif 'NC' in outcome:
                result = 'NC'
            else:
                result = ''
            entry = {'date': dates.get(row.get('EVENT', ''), ''), 'event': row.get('EVENT', ''), 'opponent': opponent,
                     'result': result, 'method': row.get('METHOD', ''), 'round': row.get('ROUND', ''),
                     'weightclass': row.get('WEIGHTCLASS', '')}
            entry.update(totals.get((row.get('EVENT', ''), bout, key(name)), {}))
            histories[key(name)].append(entry)
    output = {}
    for row in fighters:
        name = ' '.join(x.strip() for x in (row.get('FIRST', ''), row.get('LAST', '')) if x.strip())
        ident = key(name)
        if not ident:
            continue
        fights = sorted(histories.get(ident, []), key=lambda f: f['date'], reverse=True)
        wins = sum(f['result'] == 'W' for f in fights)
        losses = sum(f['result'] == 'L' for f in fights)
        draws = sum(f['result'] == 'D' for f in fights)
        output[ident] = {'name': name, 'nickname': row.get('NICKNAME', ''),
                         'record': f'{wins}-{losses}-{draws}', 'fights': fights[:7]}
    with_history = sum(bool(f['fights']) for f in output.values())
    if len(output) < 100 or with_history < 50:
        raise RuntimeError(f'Insufficient fighter coverage: {len(output)} total, {with_history} with fights; not publishing')
    payload = {'updated': datetime.now(timezone.utc).isoformat(), 'source': BASE,
               'coverage': {'fighters': len(output), 'with_history': with_history, 'results': len(results),
                            'stats_rows': len(stats), 'events': len(events), 'latest_event_date': max(dates.values(), default='')},
               'fighters': output}
    target = Path('data/ufc-data.json')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(target)
    print('Published', target, payload['coverage'], flush=True)

if __name__ == '__main__':
    main()
