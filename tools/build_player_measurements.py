"""Publish listed football measurements using exact provider IDs, never name joins."""
import csv
import io
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv'
TEAM_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 34]


def fetch(url):
    with urllib.request.urlopen(url, timeout=40) as response:
        return response.read().decode('utf-8-sig')


def number(value, low, high):
    try:
        n = float(value)
        return int(n) if n.is_integer() and low <= n <= high else None
    except (ValueError, TypeError):
        return None


def measurements(height, weight, source, checked):
    h, w = number(height, 48, 96), number(weight, 100, 500)
    return {'height': f'{h // 12}\' {h % 12}"' if h else None,
            'weight': f'{w} lbs' if w else None,
            'height_inches': h, 'weight_pounds': w,
            'source_url': source, 'checked_at': checked}


def main():
    now = datetime.now(timezone.utc).isoformat()
    season = datetime.now(timezone.utc).year
    snapshot = json.loads((ROOT / 'data/data.json').read_text(encoding='utf-8'))
    rows = list(csv.DictReader(io.StringIO(fetch(PLAYERS))))
    by_id = {}
    for row in rows:
        pid = row.get('gsis_id')
        if pid:
            if pid in by_id:
                raise ValueError('Ambiguous GSIS identifier: ' + pid)
            by_id[pid] = row

    def roster(tid):
        url = f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{tid}/roster?season={season}'
        payload = json.loads(fetch(url))
        if int(payload.get('season', {}).get('year', season)) != season:
            raise ValueError('Roster season mismatch')
        return [a for group in payload.get('athletes', []) for a in group.get('items', [])]

    espn, errors = {}, []
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(roster, tid): tid for tid in TEAM_IDS}
        for future in as_completed(jobs):
            try:
                for athlete in future.result():
                    aid = str(athlete.get('id', ''))
                    previous = espn.get(aid)
                    if previous and (previous.get('height'), previous.get('weight')) != (athlete.get('height'), athlete.get('weight')):
                        raise ValueError('Conflicting roster measurements: ' + aid)
                    espn[aid] = athlete
            except Exception as exc:
                errors.append({'team_id': jobs[future], 'error': str(exc)})

    path = ROOT / 'data/athlete-content.json'
    output = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'athletes': {}}
    missing, sourced, current = [], 0, 0
    for player in snapshot['players']:
        pid = str(player['id'])
        crosswalk = by_id.get(pid)
        if not crosswalk:
            missing.append(pid)
            continue
        aid = str(crosswalk.get('espn_id') or '')
        a = espn.get(aid)
        m = measurements(crosswalk.get('height'), crosswalk.get('weight'), PLAYERS, now)
        m['identity_source_url'] = PLAYERS
        if a:
            official = measurements(a.get('height'), a.get('weight'), f'https://www.espn.com/nfl/player/_/id/{aid}', now)
            # A roster omission of one field must not erase a sourced measurement.
            for key, value in official.items():
                if value is not None:
                    m[key] = value
            m['espn_id'] = aid
            current += 1
        if m['height'] or m['weight']:
            output['athletes'].setdefault('NFL:' + pid, {})['measurements'] = m
            sourced += 1
        if not m['height'] or not m['weight']:
            missing.append(pid)
    if not sourced:
        raise ValueError('No exact-ID NFL measurements; refusing to replace snapshot')
    college_path = ROOT / 'data/ncaa-data.json'
    college_added, college_errors = 0, []
    if college_path.exists():
        college = json.loads(college_path.read_text(encoding='utf-8'))
        incomplete = [p for p in college['players'] if not p.get('height') or not p.get('weight')]
        teams = {str(p['team_id']) for p in incomplete}
        def college_roster(tid):
            url = f'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/{tid}/roster?season={season}'
            payload = json.loads(fetch(url))
            if int(payload.get('season', {}).get('year', season)) != season:
                raise ValueError('College roster season mismatch')
            return {str(a['id']): a for group in payload.get('athletes', []) for a in group.get('items', [])}
        with ThreadPoolExecutor(max_workers=6) as pool:
            jobs = {pool.submit(college_roster, tid): tid for tid in teams}
            for future in as_completed(jobs):
                tid = jobs[future]
                try:
                    athletes = future.result()
                    for p in incomplete:
                        if str(p['team_id']) != tid:
                            continue
                        a = athletes.get(str(p['espn_id']))
                        if not a:
                            continue
                        m = measurements(a.get('height'), a.get('weight'), p['source_url'], now)
                        if m['height'] or m['weight']:
                            output['athletes'].setdefault('NCAA:' + p['id'], {})['measurements'] = m
                            college_added += 1
                except Exception as exc:
                    college_errors.append({'team_id': tid, 'error': str(exc)})
    output.update(updated=now, measurement_coverage={'players': len(snapshot['players']), 'sourced': sourced,
                  'current_espn_roster': current, 'missing_or_partial': missing, 'source_errors': errors},
                  notes='Listed height/weight: exact GSIS-to-ESPN ID crosswalk; current ESPN roster preferred, nflverse player register fallback. No name-only joins.')
    output['measurement_coverage'].update(ncaa_gap_rosters_checked=len(teams) if college_path.exists() else 0,
                                        ncaa_additional_measurements=college_added, ncaa_source_errors=college_errors)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(output, separators=(',', ':')), encoding='utf-8')
    temp.replace(path)
    print(json.dumps(output['measurement_coverage']))


if __name__ == '__main__':
    main()
