"""Best-effort current ESPN injury-report ingestion. Does not infer health from absence."""
import json, threading, time, urllib.request, csv, io
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

URL='https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'
TEAM_IDS={'ATL':1,'BUF':2,'CHI':3,'CIN':4,'CLE':5,'DAL':6,'DEN':7,'DET':8,'GB':9,'TEN':10,'IND':11,'KC':12,'LV':13,'LA':14,'MIA':15,'MIN':16,'NE':17,'NO':18,'NYG':19,'NYJ':20,'PHI':21,'ARI':22,'PIT':23,'LAC':24,'SF':25,'SEA':26,'TB':27,'WAS':28,'CAR':29,'JAC':30,'BAL':33,'HOU':34}
LOCK=threading.Lock()
STATE={'updated':None,'error':'Not yet fetched','teams':{},'source':URL,'last_attempt':None,'last_http':None,'groups':0,'entries':0,'season':None,'weekly':{}}
LAST_ATTEMPT=0
TTL=900

def normalize(s):
 import re,unicodedata
 s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
 return re.sub(r'[^a-z0-9]','',s)

# ESPN changes its unofficial response structure. Accept both team-grouped
# reports and individual injury entries, but never guess a player's team.
TEAM_ALIASES={'WSH':'WAS','JAX':'JAC','LAR':'LA','OAK':'LV','SD':'LAC','STL':'LA'}
def team_abbr(obj):
 if isinstance(obj,str):return TEAM_ALIASES.get(obj.upper(),obj.upper())
 if isinstance(obj,dict):
  ab=obj.get('abbreviation') or obj.get('abbr') or ''
  if ab:return team_abbr(ab)
  nested=obj.get('team')
  if nested:return team_abbr(nested)
 return ''

def parse(payload, default_team=''):
 teams={}
 def collect(node, inherited=''):
  if isinstance(node,list):
   for item in node:collect(item,inherited)
   return
  if not isinstance(node,dict):return
  team=team_abbr(node.get('team')) or team_abbr(node.get('teamAbbreviation')) or inherited
  athlete=node.get('athlete') or node.get('player')
  if isinstance(athlete,dict) and team:
   name=athlete.get('fullName') or athlete.get('displayName') or athlete.get('name') or ''
   if name:
    status=node.get('status') or node.get('type') or node.get('statusType') or ''
    if isinstance(status,dict):status=status.get('name') or status.get('description') or status.get('abbreviation') or ''
    details=node.get('details') or {}
    if not isinstance(details,dict):details={}
    description=node.get('description') or details.get('detail') or details.get('type') or ''
    if isinstance(description,dict):description=description.get('name') or description.get('description') or ''
    date=node.get('date') or node.get('lastUpdated') or ''
    teams.setdefault(team,{})[normalize(name)]={'name':name,'status':str(status),'description':str(description),'reported_at':str(date)}
  for key in ('injuries','items','entries','athletes','players'):
   if isinstance(node.get(key),(list,dict)):collect(node[key],team)
 collect(payload.get('injuries',payload),default_team)
 return teams

def fallback_teams():
 # Independent per-team request route on the same public ESPN host. Bounded
 # concurrency avoids 32 serial requests; partial results are not presented
 # as a complete league-wide report.
 def fetch_team(item):
  abbr,tid=item
  u=f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{tid}/injuries'
  req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
  with urllib.request.urlopen(req,timeout=9) as response:
   raw=response.read(8_000_001)
   if len(raw)>8_000_000:raise ValueError('Team injury response too large')
  payload=json.loads(raw)
  return abbr,parse(payload,abbr).get(abbr,{})
 results={};ok=0;errors=[]
 with ThreadPoolExecutor(max_workers=8) as pool:
  tasks={pool.submit(fetch_team,item):item[0] for item in TEAM_IDS.items()}
  for future in as_completed(tasks):
   try:
    abbr,entries=future.result();results[abbr]=entries;ok+=1
   except Exception as e:errors.append(tasks[future]+': '+type(e).__name__)
 return results,ok,errors

def refresh(cache_dir):
 global LAST_ATTEMPT
 now=time.time()
 with LOCK:
  if now-LAST_ATTEMPT<TTL:return
  LAST_ATTEMPT=now
 updated=datetime.now(timezone.utc).isoformat()
 year=datetime.now(timezone.utc).year
 url=f'https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{year}.csv'
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.2','Accept':'text/csv'})
  with urllib.request.urlopen(req,timeout=22) as response:
   content=response.read(18_000_001)
   if len(content)>18_000_000:raise ValueError('Injury file too large')
  rows=list(csv.DictReader(io.StringIO(content.decode('utf-8-sig'))))
  if not rows or not {'team','full_name','week'}.issubset(rows[0]):raise ValueError('Unexpected injury CSV columns')
  weeks=[int(r['week']) for r in rows if str(r.get('week','')).isdigit()]
  latest=max(weeks) if weeks else None
  if latest is None:raise ValueError('No numbered injury weeks')
  teams={}; weekly={}
  for r in rows:
   if not str(r.get('week','')).isdigit():continue
   team=team_abbr(r.get('team',''))
   name=r.get('full_name','').strip()
   if not team or not name:continue
   status=r.get('report_status','') or r.get('practice_status','') or 'Listed (designation pending)'
   detail=', '.join(filter(None,[r.get('report_primary_injury',''),r.get('practice_primary_injury','')]))
   record={'name':name,'status':status,'description':detail,'reported_at':str(r.get('date_modified') or f'{year} week {r["week"]}'),'week':int(r['week']),'team':team}
   key=normalize(name)
   bucket=weekly.setdefault(str(r['week']),{}).setdefault(team,{})
   prior=bucket.get(key)
   def priority(x):
    v=str(x.get('status','')).lower()
    return 3 if v in ('out','inactive','injured reserve','ir') else 2 if v in ('doubtful','questionable') else 1 if v else 0
   if prior is None or priority(record)>=priority(prior):bucket[key]=record
   if int(r['week'])==latest:teams.setdefault(team,{})[key]=bucket[key]
  entries=sum(map(len,teams.values()))
  if not entries:raise ValueError('No player injuries in latest published week')
  state={'updated':updated,'error':None,'teams':teams,'source':url,'last_attempt':updated,'last_http':200,'groups':len(teams),'entries':entries,'season':year,'route':'nflverse_csv','coverage':len(teams),'week':latest,'weekly':weekly}
  with LOCK:STATE.update(state)
  try:(Path(cache_dir)/'injuries.json').write_text(json.dumps(state),encoding='utf-8')
  except OSError:pass
 except Exception as e:
  with LOCK:
   STATE['error']='nflverse injury download failed: '+type(e).__name__+': '+str(e)[:180]
   STATE['last_attempt']=updated
   STATE['route']='nflverse_unavailable'
   STATE['source']=url
   STATE['entries']=0
   if not STATE.get('weekly'):STATE['teams']={}
   STATE['coverage']=0

def force_refresh(cache_dir):
 global LAST_ATTEMPT
 with LOCK:LAST_ATTEMPT=0
 refresh(cache_dir)

def load(cache_dir):
 p=Path(cache_dir)/'injuries.json'
 if p.exists():
  try:
   state=json.loads(p.read_text(encoding='utf-8'))
   if isinstance(state.get('teams'),dict):STATE.update(state)
  except (OSError,ValueError):pass

def snapshot():
 with LOCK:return json.loads(json.dumps(STATE))

def lookup(player, data):
 team=player.get('team','').upper(); name=player.get('name','')
 # Exact normalized name+team matching only; do not equate missing entry with healthy.
 record=data['teams'].get(team,{}).get(normalize(name))
 weekly={}
 for week, by_team in data.get('weekly',{}).items():
  match=by_team.get(team,{}).get(normalize(name))
  if match:weekly[str(week)]={'status':match['status'],'description':match['description'],'reported_at':match['reported_at']}
 return {'weekly':weekly,'status':record['status'] if record else 'Not listed / unknown',
         'description':record['description'] if record else '',
         'reported_at':record['reported_at'] if record else '',
         'matched':bool(record),'source':'nflverse injury reports',
         'source_url':data.get('source',URL),'checked_at':data['updated'],'error':data['error'],
         'official_verified':False,'feed_entries':data.get('entries',0),'feed_season':data.get('season'),'coverage':data.get('coverage',0),'route':data.get('route','unknown')}
