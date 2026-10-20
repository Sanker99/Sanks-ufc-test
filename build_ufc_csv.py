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
    """Prefer exact CSV headers; never confuse a count with a % column."""
    for name in names:
        if name in row:
            return row[name] or ''
    # Allow whitespace/case differences while preserving punctuation and %.
    lookup = {str(k).strip().casefold(): v for k, v in row.items() if k}
    for name in names:
        value = lookup.get(str(name).strip().casefold())
        if value is not None:
            return value
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
    """Parse landed/attempted pairs, rejecting standalone percentages."""
    raw = str(value or '').strip()
    if not raw or raw.upper() in ('--', 'N/A', 'NONE'):
        return None
    pair = re.match(r'^\s*(\d+)\s*(?:of|/)\s*(\d+)', raw, re.I)
    if pair:
        landed, attempted = map(int, pair.groups())
        return landed if landed <= attempted and landed <= max_value else None
    if re.fullmatch(r'\d+', raw):
        n = int(raw)
        return n if n <= max_value else None
    return None

def main():
    fighters, results, stats, events, measurements = map(read_csv, FILES)
    print('STAT CSV COLUMNS:', list(stats[0].keys()), flush=True)
    print('STAT FIRST ROW:', stats[0], flush=True)
    event_dates = {key(col(r, 'EVENT')): iso_date(col(r, 'DATE')) for r in events}
    physical = {key(col(r, 'FIGHTER')): r for r in measurements}
    from tools.ufc_round_stats import aggregate
    totals, round_coverage = aggregate(stats, results)
    seen = {identity: set(values) for identity, values in totals.items()}
    matched_stats = len(stats)
    invalid_values = round_coverage['conflicting_metric_cells']
    rejected_examples = []
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
            entry['fight_url'] = col(row, 'URL').strip()
            entry['time'] = col(row, 'TIME').strip()
            entry['time_format'] = col(row, 'TIME FORMAT').strip()
            entry['scheduled_rounds'] = parse_scheduled_rounds(col(row, 'SCHEDULED ROUNDS', 'SCHEDULED_ROUNDS', 'TIME FORMAT'))
            entry['scheduled_rounds_source'] = entry['fight_url']
            entry.update(fight_stats)
            if 'control_seconds' in entry:
                entry['control_source'] = entry['fight_url']
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
            'fights': fights,
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
    print('Rejected cell examples:', rejected_examples, flush=True)
    if (len(output) < 100 or with_history < 50 or
            with_measurements < 50 or with_stats < 50 or with_dates < 50):
        raise RuntimeError('Incomplete UFC data join. Existing published file preserved.')
    payload = {'updated': datetime.now(timezone.utc).isoformat(),
               'source': BASE, 'coverage': coverage, 'control_coverage': round_coverage, 'fighters': output}
    destination = Path('data/ufc-data.json')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False,
                                    separators=(',', ':')), encoding='utf-8')
    temporary.replace(destination)
    print('Published', destination, flush=True)

def parse_scheduled_rounds(value):
    raw = str(value or '').strip()
    if raw in ('3', '5'):
        return int(raw)
    match = re.fullmatch(r'([35]) Rnd \(([\d-]+)\)', raw)
    if match and match[2].split('-') == ['5'] * int(match[1]):
        return int(match[1])
    return None

if __name__ == '__main__':
    main()
