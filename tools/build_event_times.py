"""Cache unambiguous game instants and explicitly sourced UFC segment starts."""
import json
import urllib.request
import csv
import io
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools.build_nfl_intelligence import kickoff, utc, SCHEDULE

ROOT=Path(__file__).resolve().parents[1]
BOARD='https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates='


def get(url):
    with urllib.request.urlopen(url,timeout=35) as response:return json.load(response)


def segment_times(event, competitions, checked):
    groups={};bout_groups={}
    for c in competitions:
        name=c.get('cardSegment',{}).get('description')
        if name not in {'Main Card','Prelims','Early Prelims'}:continue
        bout_groups[str(c['id'])]=name
        if c.get('timeValid') is True and utc(c.get('date')):
            groups.setdefault(name,set()).add(utc(c['date']).isoformat())
    # Multiple different dates within a segment may be individual estimated bout
    # times. Only a single, explicitly shared scheduled segment time is accepted.
    return {'name':event['name'],'event_id':str(event['id']),'checked_at':checked,
            'source_url':'https://www.espn.com/mma/fightcenter/_/id/'+str(event['id']),
            'segments':{k:{'start':next(iter(groups[k])) if len(groups.get(k,set()))==1 else None,
                           'reason':None if len(groups.get(k,set()))==1 else 'Section time not published or conflicting.'}
                        for k in ['Main Card','Prelims','Early Prelims']},'bout_groups':bout_groups}


def main():
    now=datetime.now(timezone.utc);checked=now.isoformat();dest=ROOT/'data/event-times.json'
    old=json.loads(dest.read_text(encoding='utf-8')) if dest.exists() else {'ufc':{},'nfl':{}}
    result={'schema_version':1,'updated':checked,'ufc':dict(old.get('ufc',{})),'nfl':{},'errors':[]}
    with urllib.request.urlopen(SCHEDULE,timeout=40) as response:rows=list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))))
    for r in rows:
        if r.get('season')!=str(now.year) or r.get('game_type')!='REG':continue
        instant=kickoff(r)
        if instant:result['nfl'][r['game_id']]={'start':instant.isoformat(),'source_zone':'America/New_York','source_url':SCHEDULE,
             'date':r['gameday'],'time':r['gametime'],'away':r['away_team'],'home':r['home_team']}
    if len(result['nfl'])<250:raise ValueError('Current NFL schedule incomplete')
    events=get(BOARD+now.strftime('%Y%m%d')+'-'+(now+timedelta(days=90)).strftime('%Y%m%d')).get('events',[])
    if not events:raise ValueError('No upcoming UFC events')
    cache=ROOT/'work/event-times-cache';cache.mkdir(parents=True,exist_ok=True)
    def competition(item):
        eid,c=item;path=cache/(eid+'-'+str(c['id'])+'.json')
        near=utc(c.get('date'))
        ttl=1800 if near and near<now+timedelta(days=7) else 21600
        if path.exists() and now.timestamp()-path.stat().st_mtime<ttl:return json.loads(path.read_text(encoding='utf-8'))
        url=f'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/{eid}/competitions/{c["id"]}?lang=en&region=us'
        payload=get(url);path.write_text(json.dumps(payload),encoding='utf-8');return payload
    for e in events:
        try:
            with ThreadPoolExecutor(max_workers=4) as pool:core=list(pool.map(competition,[(str(e['id']),c) for c in e.get('competitions',[])]))
            result['ufc'][str(e['id'])]=segment_times(e,core,checked)
        except Exception as exc:
            result['errors'].append({'event':str(e['id']),'error':str(exc)})
            if str(e['id']) in result['ufc']:result['ufc'][str(e['id'])]['error']=str(exc)
    temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(result,indent=2),encoding='utf-8');temp.replace(dest)
    print('Event times:',len(result['nfl']),'NFL;',len(result['ufc']),'UFC;',len(result['errors']),'errors')
    return result


if __name__=='__main__':main()
