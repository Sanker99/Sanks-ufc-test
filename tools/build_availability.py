"""Source-backed availability. No clearance inferred from roster membership or absence."""
import json,re,unicodedata,urllib.request
from pathlib import Path
from datetime import datetime,timezone,timedelta
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
TEAM_IDS={'ATL':1,'BUF':2,'CHI':3,'CIN':4,'CLE':5,'DAL':6,'DEN':7,'DET':8,'GB':9,'TEN':10,'IND':11,'KC':12,'LV':13,'LA':14,'MIA':15,'MIN':16,'NE':17,'NO':18,'NYG':19,'NYJ':20,'PHI':21,'ARI':22,'PIT':23,'LAC':24,'SF':25,'SEA':26,'TB':27,'WAS':28,'CAR':29,'JAC':30,'BAL':33,'HOU':34}
ALIASES={'JAX':'JAC','WSH':'WAS','LAR':'LA'}
def norm(value):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',str(value)).encode('ascii','ignore').decode().lower())
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def instant(value):
    try:return datetime.fromisoformat(str(value).replace('Z','+00:00')).astimezone(timezone.utc)
    except (ValueError,TypeError):return None
def classify(status,reported_at,now):
    reported=instant(reported_at)
    if not reported or reported>now+timedelta(minutes=5) or now-reported>(timedelta(days=180) if str(status).strip().lower() in ['injured reserve','ir','out for season'] and reported.year==now.year else timedelta(hours=72)):return 'unknown','Unconfirmed','The player-specific report is missing a current date.'
    text=str(status).strip().lower()
    if text in ['active','available','cleared','will play','probable']:return 'available','Available',f'ESPN reports {status}. This is a source designation, not a guarantee of game-day participation.'
    if text in ['questionable','doubtful','day-to-day','day to day','game time decision']:return 'questionable',str(status).title(),f'ESPN reports {status}; participation remains uncertain.'
    if text in ['out','inactive','injured reserve','ir','out for season','suspended','pup','nfi']:return 'out','Out',f'ESPN reports {status}. Check the linked report for the reason and latest updates.'
    return 'unknown','Unconfirmed',f'The source designation {status or "unknown"} does not confirm availability.'
def parse(league,payload,roster,now):
    if int(payload.get('season',{}).get('year',0))!=now.year:raise ValueError('Availability season mismatch')
    groups=payload.get('injuries')
    if not isinstance(groups,list) or not groups:raise ValueError('Availability feed has no team groups')
    url='https://site.api.espn.com/apis/site/v2/sports/football/'+('nfl' if league=='NFL' else 'college-football')+'/injuries'
    by_name={};by_id={};scope=set()
    for p in roster:
        team=str(TEAM_IDS.get(ALIASES.get(p.get('team'),p.get('team')),'')) if league=='NFL' else str(p['team_id'])
        scope.add(team);by_name.setdefault((team,norm(p['name'])),[]).append(p);by_id[(team,str(p.get('espn_id','')))]=p
    players={};current=set();stale=0;unmatched=0;entries=0
    for group in groups:
        team=str(group.get('id',''))
        if team not in scope:continue
        for row in group.get('injuries',[]):
            athlete=row.get('athlete',{});aid=str(athlete.get('id',''));candidates=by_name.get((team,norm(athlete.get('displayName',''))),[])
            p=by_id.get((team,aid)) if league=='NCAA' else (candidates[0] if len({x['id'] for x in candidates})==1 else None)
            if not p:unmatched+=1;continue
            status=row.get('status','');date=row.get('date');state,label,reason=classify(status,date,now);entries+=1
            if state=='unknown':stale+=1
            else:current.add(team)
            record={'state':state,'label':label,'reason':reason,'reported_status':status,'reported_at':date,'source_url':f'https://www.espn.com/'+('nfl' if league=='NFL' else 'college-football')+'/player/_/id/'+aid,'source_feed':url,'source_athlete_id':aid,'team_id':team}
            previous=players.get(str(p['id']))
            if not previous or (instant(date) or datetime.min.replace(tzinfo=timezone.utc))>(instant(previous.get('reported_at')) or datetime.min.replace(tzinfo=timezone.utc)):players[str(p['id'])]=record
    return {'source_url':url,'checked_at':now.isoformat(),'source_timestamp':payload.get('timestamp'),'scoped_teams':len(scope),'teams_seen':sum(str(g.get('id')) in scope for g in groups),'teams_with_current_reports':len(current),'matched_entries':entries,'stale_or_unknown_entries':stale,'unmatched_entries':unmatched,'partial':len(current)<len(scope),'players':players,'error':None}
def main():
    now=datetime.now(timezone.utc);dest=ROOT/'data/player-availability.json';old=read(dest) if dest.exists() else {'schema_version':1,'leagues':{}}
    nfl=read(ROOT/'data/data.json')['players'];photos=read(ROOT/'data/athlete-photos.json')['photos'];names={(ALIASES.get(p['team'],p['team']),norm(p['name'])) for p in nfl}
    for p in photos.values():
        if p['sport']=='NFL' and (ALIASES.get(p['roster']['team'],p['roster']['team']),norm(p['name'])) not in names:nfl.append({'id':p['id'],'name':p['name'],**p['roster']})
    ncaa=read(ROOT/'data/ncaa-data.json')['players']
    def collect(item):
        league,roster=item;url='https://site.api.espn.com/apis/site/v2/sports/football/'+('nfl' if league=='NFL' else 'college-football')+'/injuries'
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=35) as response:payload=json.load(response)
            return league,parse(league,payload,roster,now)
        except Exception as exc:
            previous=old['leagues'].get(league,{})
            return league,{**previous,'error':str(exc),'last_attempt':now.isoformat(),'partial':True}
    with ThreadPoolExecutor(max_workers=2) as pool:leagues=dict(pool.map(collect,[('NFL',nfl),('NCAA',ncaa)]))
    result={'schema_version':1,'policy_version':2,'updated':now.isoformat(),'policy':'Explicit reports dated within 72 hours receive a colored check. Current-season IR/season-long reports may remain classified for 180 days while still explicitly present in a freshly checked source. Missing, old and mismatched reports remain unconfirmed.','leagues':leagues}
    temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(dest)
    print('Availability:',{k:{x:v.get(x) for x in ['teams_seen','teams_with_current_reports','matched_entries','error']} for k,v in leagues.items()})
    return result
if __name__=='__main__':main()
