#!/usr/bin/env python3
"""Build SANKS UFC data from public UFCStats CSV snapshots.

Conservatively validates fight statistics; unknown or inconsistent metrics
are omitted rather than shown as misleading landed counts.
"""
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
FILES = ('ufc_fighter_details.csv', 'ufc_fight_results.csv',
         'ufc_fight_stats.csv', 'ufc_event_details.csv', 'ufc_fighter_tott.csv')

def read_csv(filename):
    request = urllib.request.Request(BASE + filename,
                                     headers={'User-Agent': 'SanksResearchLab/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read().decode('utf-8-sig')
    rows = list(csv.DictReader(io.StringIO(data)))
    if not rows:
        raise RuntimeError('Empty source: ' + filename)
    print(f'{filename}: {len(rows)} rows', flush=True)
    return rows

def key(value):
    value = unicodedata.normalize('NFKD', str(value or ''))
    return re.sub('[^a-z0-9]', '', ''.join(c for c in value
                   if not unicodedata.combining(c)).lower())

def col(row, *names):
    lookup = {key(k): v for k, v in row.items() if k}
    for name in names:
        if key(name) in lookup:
            return lookup[key(name)]
    return ''

def iso_date(value):
    for fmt in ('%B %d, %Y', '%b %d, %Y', '%Y-%m-%d', '%m/%d/%Y'):
        try:
            return datetime.strptime(str(value).strip(), fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return ''

def fight_names(bout):
    parts = re.split(r'\s+vs\.?\s+', bout, maxsplit=1, flags=re.I)
    return [p.strip() for p in parts] if len(parts) == 2 else []

def landed_count(value, max_value):
    """Accept integer counts and 'landed of attempted' pairs, never percentages.

    Values such as '100%' or '0.50' cannot be safely treated as counts.
    """
    value = str(value or '').strip()
    if not value or '%' in value or value in ('--', 'N/A'):
        return None
    match = re.fullmatch(r'(\d+)\s*(?:of\s*(\d+))?', value, re.I)
    if not match:
        return None
    landed = int(match.group(1))
    attempted = int(match.group(2)) if match.group(2) is not None else None
    if landed > max_value or (attempted is not None and landed > attempted):
        return None
    return landed

def main():
    fighters, results, stats, events, measurements = map(read_csv, FILES)
    event_dates = {key(col(r, 'EVENT')): iso_date(col(r, 'DATE')) for r in events}
    physical = {key(col(r, 'FIGHTER')): r for r in measurements}
    totals = defaultdict(lambda: defaultdict(int))
    seen = defaultdict(set)
    matched_stats = 0
    invalid_values = 0
    # Only use exact count columns; percentage fields must never be substituted.
    metrics = (('SIG.STR.', 'sig_strikes', 400),
               ('TOTAL STR.', 'total_strikes', 500),
               ('TD', 'takedowns', 25),
               ('SUB.ATT.', 'submissions', 25))
    for row in stats:
        identity = (key(col(row, 'EVENT')), key(col(row, 'BOUT')),
                    key(col(row, 'FIGHTER')))
        found = False
        for source, metric, ceiling in metrics:
            raw = col(row, source)
            value = landed_count(raw, ceiling)
            if value is not None:
                totals[identity][metric] += value
                seen[identity].add(metric)
                found = True
            elif str(raw or '').strip() not in ('', '--', 'N/A'):
                invalid_values += 1
        matched_stats += int(found)

    histories = defaultdict(list)
    joined_fights = 0
    dropped_inconsistent = 0
    for row in results:
        event = col(row, 'EVENT')
        bout = col(row, 'BOUT')
        names = fight_names(bout)
        if len(names) != 2:
            continue
        outcome = col(row, 'OUTCOME').upper().replace(' ', '')
        for index, (name, opponent) in enumerate(((names[0], names[1]),
                                                   (names[1], names[0]))):
            if outcome == 'W/L':
                result = 'W' if index == 0 else 'L'
            elif outcome == 'L/W':
                result = 'L' if index == 0 else 'W'
            elif outcome in ('DRAW', 'D/D'):
                result = 'D'
            elif 'NC' in outcome:
                result = 'NC'
            else:
                result = ''
            identity = (key(event), key(bout), key(name))
            fight_stats = {metric: value for metric, value in totals.get(identity, {}).items()
                           if metric in seen[identity]}
            # Total strikes landed must include significant strikes landed.
            if ('sig_strikes' in fight_stats and 'total_strikes' in fight_stats
                    and fight_stats['total_strikes'] < fight_stats['sig_strikes']):
                del fight_stats['total_strikes']
                dropped_inconsistent += 1
            joined_fights += bool(fight_stats)
            entry = {
                'date': event_dates.get(key(event), ''),
                'event': event, 'opponent': opponent, 'result': result,
                'method': col(row, 'METHOD'), 'round': col(row, 'ROUND'),
                'weightclass': col(row, 'WEIGHTCLASS'),
            }
            entry.update(fight_stats)
            histories[key(name)].append(entry)

    output = {}
    for row in fighters:
        name = ' '.join(part.strip() for part in
                        (col(row, 'FIRST'), col(row, 'LAST')) if part.strip())
        ident = key(name)
        if not ident:
            continue
        fights = sorted(histories.get(ident, []),
                        key=lambda f: f['date'], reverse=True)
        measure = physical.get(ident, {})
        division = next((f['weightclass'] for f in fights
                         if f.get('weightclass')), '')
        wins = sum(f['result'] == 'W' for f in fights)
        losses = sum(f['result'] == 'L' for f in fights)
        draws = sum(f['result'] == 'D' for f in fights)
        def measure_value(field):
            value = col(measure, field).strip()
            return '' if value in ('--', 'N/A') else value
        output[ident] = {
            'name': name, 'nickname': col(row, 'NICKNAME'),
            'record': f'{wins}-{losses}-{draws}',
            'weightclass': division, 'height': measure_value('HEIGHT'),
            'weight': measure_value('WEIGHT'), 'reach': measure_value('REACH'),
            'stance': measure_value('STANCE'),
            'profile_url': measure_value('URL'),
            'fights': fights[:7],
        }

    with_history = sum(bool(f['fights']) for f in output.values())
    with_measurements = sum(bool(f['height'] or f['reach']) for f in output.values())
    with_stats = sum(any('sig_strikes' in fight or 'takedowns' in fight
                         for fight in f['fights']) for f in output.values())
    with_dates = sum(any(fight['date'] for fight in f['fights'])
                     for f in output.values())
    coverage = {
        'fighters': len(output), 'with_history': with_history,
        'with_measurements': with_measurements,
        'with_stats': with_stats, 'with_dates': with_dates,
        'results': len(results), 'stats_rows': len(stats),
        'matched_stats_rows': matched_stats,
        'joined_fighter_fights': joined_fights,
        'invalid_stat_cells': invalid_values,
        'inconsistent_total_strikes_omitted': dropped_inconsistent,
        'events': len(events),
        'latest_event_date': max(event_dates.values(), default=''),
    }
    print('Coverage:', coverage, flush=True)
    if (len(output) < 100 or with_history < 50 or
            with_measurements < 50 or with_stats < 50 or with_dates < 50):
        raise RuntimeError('Incomplete UFC data join. Existing published file preserved.')
    payload = {'updated': datetime.now(timezone.utc).isoformat(),
               'source': BASE, 'coverage': coverage, 'fighters': output}
    destination = Path('data/ufc-data.json')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False,
                                    separators=(',', ':')), encoding='utf-8')
    temporary.replace(destination)
    print('Published', destination, flush=True)

if __name__ == '__main__':
    main()
