"""Licensed, exact-ID NFL availability evidence and actual full-PPR history.

Projections deliberately disabled: no validated public redistribution permission.
"""
import csv
import io
import json
import math
import urllib.request
import urllib.error
from collections import Counter
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://github.com/nflverse/nflverse-data/releases/download/'
SCHEDULE = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
POSITIONS = {'QB', 'RB', 'WR', 'TE'}
ALIASES = {'JAX': 'JAC', 'WSH': 'WAS', 'LAR': 'LA'}
RESERVE = {'R01': 'IR', 'R04': 'PUP', 'R05': 'NFI'}
WEIGHTS = {'receptions': 1, 'rushing_yards': .1, 'receiving_yards': .1,
           'passing_yards': .04, 'passing_tds': 4, 'rushing_tds': 6,
           'receiving_tds': 6, 'passing_interceptions': -2,
           'fumbles_lost_total': -2, 'passing_2pt_conversions': 2,
           'rushing_2pt_conversions': 2, 'receiving_2pt_conversions': 2}


def utc(value):
    try:
        d = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return d.astimezone(timezone.utc) if d.tzinfo else None
    except (ValueError, TypeError):
        return None


def team(value):
    return ALIASES.get(value, value)


def kickoff(row):
    try:
        return datetime.fromisoformat(row['gameday'] + 'T' + row['gametime']).replace(
            tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc)
    except (KeyError, ValueError, TypeError):
        return None


def numeric(value):
    try:
        n = float(value)
        return n if str(value).strip() and math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def ppr(row):
    """Missing scored fields invalidate the total; a numeric zero is real."""
    values = {k: numeric(row.get(k)) for k in WEIGHTS}
    if any(v is None for v in values.values()):
        return None
    return round(sum(values[k] * weight for k, weight in WEIGHTS.items()), 2)


def fetch_csv(name, url):
    cache = ROOT / 'work/nfl-intelligence-cache'
    cache.mkdir(parents=True, exist_ok=True)
    data, meta = cache / (name + '.csv'), cache / (name + '.json')
    previous = json.loads(meta.read_text(encoding='utf-8')) if meta.exists() else {}
    headers = {'User-Agent': 'SanksResearchLab/1.0 (NFL data; CC BY 4.0)'}
    if data.exists() and previous.get('etag'):
        headers['If-None-Match'] = previous['etag']
    if data.exists() and previous.get('http_last_modified'):
        headers['If-Modified-Since'] = previous['http_last_modified']
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=50) as r:
            raw = r.read()
            modified = r.headers.get('Last-Modified')
            info = {'url': url, 'etag': r.headers.get('ETag'), 'http_last_modified': modified,
                    'published_at': parsedate_to_datetime(modified).isoformat() if modified else None}
    except urllib.error.HTTPError as exc:
        if exc.code != 304 or not data.exists():
            raise
        raw, info = data.read_bytes(), previous
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    if not rows:
        raise ValueError(name + ': empty source')
    data.write_bytes(raw)
    info['checked_at'] = datetime.now(timezone.utc).isoformat()
    meta.write_text(json.dumps(info), encoding='utf-8')
    return rows, info


def fresh(source, now, hours=36):
    published = utc(source.get('published_at'))
    checked = utc(source.get('checked_at'))
    return bool(published and checked and -300 <= (now-published).total_seconds() <= hours*3600
                and -300 <= (now-checked).total_seconds() <= 7200)


def availability(player, roster, injury, sources, now, week, game=None):
    record = {'state': 'unknown', 'designation': 'UNVERIFIED', 'label': 'UNVERIFIED',
              'reason': 'No current exact-ID roster match.', 'verified': False,
              'verified_at': now.isoformat(), 'week': week, 'season': now.year,
              'roster_status': roster.get('status') if roster else None,
              'practice_status': injury.get('practice_status') if injury else None,
              'source_url': sources['rosters']['url'], 'source_published_at': sources['rosters'].get('published_at')}
    if not roster:
        return record
    if not fresh(sources['rosters'], now):
        record['reason'] = 'Roster publication is stale or has no verifiable publication timestamp.'
        return record
    if team(roster.get('team')) != team(player.get('team')):
        record['reason'] = 'Current roster team differs from this player card; identity retained, availability withheld.'
        return record
    status, code = roster.get('status'), roster.get('status_description_abbr')
    designation = None
    if status == 'RES':
        designation = RESERVE.get(code, 'RESERVE')
        record['reason'] = 'Current exact-ID reserve listing: ' + str(code) + '.'
    elif status != 'ACT':
        record['reason'] = 'Roster status ' + str(status) + ' does not verify game availability.'
    if not designation and status == 'ACT' and injury:
        record['source_url'] = sources['injuries']['url']
        record['source_published_at'] = sources['injuries'].get('published_at')
        if not fresh(sources['injuries'], now):
            record['reason'] = 'Injury publication is stale or undated.'
            return record
        value = injury.get('report_status', '').strip().upper()
        if value in {'OUT', 'QUESTIONABLE', 'DOUBTFUL'}:
            designation = value
            record['reason'] = 'Current-week game designation: ' + value + '. Practice participation is separate.'
        else:
            record['reason'] = 'Active roster verified; practice report has no final game designation. Final-report completeness and game-day inactive list are unverified.'
    elif not designation and status == 'ACT':
        record['reason'] = 'Active roster verified; absence from the injury mirror does not establish a complete final report or game-day clearance.'
    # READY/INACTIVE require explicit, game-specific, dated evidence. The tested
    # freely licensed files do not contain a final-report/inactive-list completeness flag.
    if designation:
        record.update(verified=True, designation=designation, label=designation,
                      state='questionable' if designation in {'QUESTIONABLE', 'DOUBTFUL'} else 'out')
    return record


def build(players, rows, sources, now):
    season = now.year
    schedule = [r for r in rows['schedule'] if r.get('season') == str(season) and r.get('game_type') == 'REG']
    if len(schedule) < 250:
        raise ValueError('Current season schedule incomplete')
    future = sorted((r for r in schedule if kickoff(r) and kickoff(r) >= now-timedelta(hours=12)), key=kickoff)
    week = int(future[0]['week']) if future else max(int(r['week']) for r in schedule)
    season_rows = [r for r in rows['rosters'] if r.get('season') == str(season)]
    injuries = [r for r in rows['injuries'] if r.get('season') == str(season) and int(r['week']) == week]
    if not season_rows or not injuries:
        raise ValueError('Current season roster or current-week injury file unavailable')
    def unique(items, key):
        result = {}
        for item in items:
            if not item.get('gsis_id'):
                continue
            pid = key(item)
            if pid in result and result[pid] != item:
                raise ValueError('Ambiguous source identity ' + str(pid))
            result[pid] = item
        return result
    roster = unique(season_rows, lambda r: r.get('gsis_id'))
    injury = unique(injuries, lambda r: (r.get('gsis_id'), team(r.get('team'))))
    weekly = unique([r for r in rows['weekly_rosters'] if r.get('season') == str(season)], lambda r: (r.get('gsis_id'), int(r['week'])))
    weekly_by_player={}
    for (pid,w),r in weekly.items():weekly_by_player.setdefault(pid,[]).append((w,team(r.get('team'))))
    games = {r['game_id']: r for r in schedule}
    stats = {}
    for r in rows['stats']:
        if r.get('season') != str(season) or r.get('season_type') != 'REG':
            continue
        g = games.get(r['game_id'])
        if not g or numeric(g.get('home_score')) is None or numeric(g.get('away_score')) is None or not kickoff(g) or kickoff(g)>now:
            continue
        stats.setdefault(r['player_id'], []).append(r)
    output, unresolved = {}, []
    last_week = max((int(g['week']) for g in games.values() if numeric(g['home_score']) is not None and kickoff(g) and kickoff(g)<now), default=0)
    for p in players:
        if p.get('position') not in POSITIONS:
            continue
        pid = str(p['id'])
        ro = roster.get(pid)
        av = availability(p, ro, injury.get((pid, team(p['team']))), sources, now, week)
        histories, seen = [], set()
        for r in sorted(stats.get(pid, []), key=lambda r: int(r['week'])):
            if r['game_id'] in seen:
                raise ValueError('Duplicate fantasy player/game: ' + pid)
            seen.add(r['game_id'])
            score = ppr(r)
            histories.append({'week': int(r['week']), 'game_id': r['game_id'], 'team': r['team'], 'opponent': r['opponent_team'],
                              'actual_ppr': score, 'status': 'played' if score is not None else 'missing_scoring_fields',
                              'scoring_stats': {k: numeric(r.get(k)) for k in WEIGHTS},
                              'provider_ppr': numeric(r.get('fantasy_points_ppr'))})
        for w in range(1, last_week+1):
            if any(h['week']==w for h in histories):
                continue
            hist_ro = weekly.get((pid,w)); t = team(hist_ro.get('team')) if hist_ro else None
            if not t:
                before=[(pw,t) for pw,t in weekly_by_player.get(pid,[]) if pw<w]
                after=[(pw,t) for pw,t in weekly_by_player.get(pid,[]) if pw>w]
                if before and after and max(before)[1]==min(after)[1]:
                    t=max(before)[1]
            scheduled = [g for g in schedule if int(g['week'])==w and t and t in {team(g['home_team']),team(g['away_team'])}]
            bye = bool(t and not scheduled)
            histories.append({'week': w, 'actual_ppr': None, 'status': 'bye' if bye else 'no_verified_game_log',
                              'reason': 'BYE' if bye else 'No verified game statistics; participation/injury not established.'})
        histories.sort(key=lambda h:h['week'])
        usable = [h['actual_ppr'] for h in histories if h['actual_ppr'] is not None]
        output[pid] = {'name': p['name'], 'position': p['position'], 'team': p['team'], 'availability': av,
                       'history': histories, 'actual_games': len(usable), 'season_actual_ppr': round(sum(usable),2) if usable else None,
                       'average_actual_ppr': round(sum(usable)/len(usable),2) if usable else None, 'projected_ppr': None}
        if not av['verified']:
            unresolved.append({'id':pid,'name':p['name'],'team':p['team'],'position':p['position'],'reason':av['reason']})
    active = [p for p in output.values() if p['availability']['roster_status']=='ACT']
    scoped = [p for p in output.values() if p['availability']['roster_status'] in {'ACT','RES','INA'}]
    verified = sum(p['availability']['verified'] for p in scoped)
    active_verified = sum(p['availability']['verified'] for p in active)
    return {'schema_version':1, 'season':season,'week':week,'updated':now.isoformat(),'sources':sources,
            'license':'nflverse CC BY 4.0; derived scoring and availability checks by SANKS Research Lab',
            'scoring':WEIGHTS,'projection_status':'unavailable_permission_not_validated',
            'projection_note':'Current weekly projections are unavailable: public redistribution permission has not been verified. No estimated substitute is shown.',
            'players':output,'unverified_players':unresolved,
            'coverage':{'library_players':len(output),'current_roster_players':len(scoped),'verified':verified,
                        'verified_percent':round(100*verified/len(scoped),2) if scoped else 0,
                        'active_roster_players':len(active),'active_verified':active_verified,
                        'active_verified_percent':round(100*active_verified/len(active),2) if active else 0,
                        'statuses':dict(Counter(p['availability']['designation'] for p in output.values())),
                        'fantasy_actual_players':sum(p['actual_games']>0 for p in output.values()),
                        'projection_players':0,'projection_percent':0},'error':None}


def main():
    now=datetime.now(timezone.utc)
    urls={'rosters':BASE+f'rosters/roster_{now.year}.csv','weekly_rosters':BASE+f'weekly_rosters/roster_weekly_{now.year}.csv',
          'injuries':BASE+f'injuries/injuries_{now.year}.csv','stats':BASE+f'stats_player/stats_player_week_{now.year}.csv','schedule':SCHEDULE}
    rows,sources={},{}
    for name,url in urls.items():
        rows[name],sources[name]=fetch_csv(name,url)
    players=json.loads((ROOT/'data/data.json').read_text(encoding='utf-8'))['players']
    registry=json.loads((ROOT/'data/athlete-photos.json').read_text(encoding='utf-8'))['photos']
    indexed={str(p['id']):p for p in players}
    for p in registry.values():
        if p['sport']=='NFL':indexed.setdefault(str(p['id']),{'id':p['id'],'name':p['name'],**p['roster']})
    for row in rows['rosters']:
        if row.get('gsis_id') and row.get('position') in POSITIONS:
            indexed.setdefault(row['gsis_id'],{'id':row['gsis_id'],'name':row['full_name'],'team':row['team'],'position':row['position']})
    result=build(list(indexed.values()),rows,sources,now)
    dest=ROOT/'data/nfl-intelligence.json';temp=dest.with_suffix('.tmp')
    temp.write_text(json.dumps(result,separators=(',',':')),encoding='utf-8');temp.replace(dest)
    print(json.dumps(result['coverage']))
    return result


if __name__=='__main__':main()
