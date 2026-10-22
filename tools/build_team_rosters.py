"""Collect published depth order and cross-check current active roster availability."""
import json,re,urllib.request,urllib.parse,csv,io
from pathlib import Path
from datetime import datetime,timezone,timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
try:
 from .build_availability import TEAM_IDS,ALIASES,norm,instant,classify
 from .build_ncaa_official_availability import player_name,team_name
except ImportError:
 from build_availability import TEAM_IDS,ALIASES,norm,instant,classify
 from build_ncaa_official_availability import player_name,team_name
ROOT=Path(__file__).resolve().parents[1]
BASE='https://site.api.espn.com/apis/site/v2/sports/football/'
COLLEGE_INDEX='https://www.ourlads.com/ncaa-football-depth-charts/default.aspx'
POSITIONS=('QB','WR','RB','TE')

def fetch(url,ttl=1800):
 import hashlib
 cache=ROOT/'work/team-rosters-cache';cache.mkdir(parents=True,exist_ok=True)
 path=cache/(hashlib.sha256(url.encode()).hexdigest()+'.cache')
 if path.exists() and datetime.now().timestamp()-path.stat().st_mtime<ttl:return path.read_bytes()
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0 (scheduled roster check)'}),timeout=35) as r:raw=r.read()
 path.write_bytes(raw);return raw

def validate(payload,tid,now):
 if str(payload.get('team',{}).get('id'))!=str(tid) or payload.get('season',{}).get('year')!=now.year:raise ValueError('Team/season mismatch')
 stamp=instant(payload.get('timestamp'))
 if not stamp or not -300<=(now-stamp).total_seconds()<7200:raise ValueError('Roster/depth source timestamp is stale or absent')
 return stamp.isoformat()

def nfl_depth(payload):
 entries=[]
 for chart in payload.get('depthchart',[]):
  for slot,group in chart.get('positions',{}).items():
   pos=re.sub(r'[^A-Z]','',slot.upper())
   if pos not in POSITIONS:continue
   for level,a in enumerate(group['athletes']):entries.append({'espn_id':str(a['id']),'name':a['displayName'],'position':pos,'slot':slot.upper(),'tier':level+1,'slot_order':len(entries),'injuries':a.get('injuries',None)})
 return entries

def college_links(raw,teams):
 soup=BeautifulSoup(raw,'html.parser');found={};aliases={'miamiflorida':'miami','centralflorida':'ucf','southerncal':'usc','mississippi':'olemiss','connecticut':'uconn','pittsburgh':'pitt'}
 lookup={team_name(t['short_name']):str(t['id']) for t in teams}
 for a in soup.select('a[href^="depth-chart.aspx?"]'):
  head=a.parent.find_previous_sibling(class_='nfl-dc-mm-team')
  if not head:continue
  label=head.select_one('.nfl-dc-mm-team-name');key=team_name(label.get_text(' ',strip=True)) if label else ''
  tid=lookup.get(aliases.get(key,key))
  if tid:found[tid]=urllib.parse.urljoin(COLLEGE_INDEX,urllib.parse.quote(a['href'],safe='?=&/'))
 return found

def college_depth(raw,now):
 soup=BeautifulSoup(raw,'html.parser');text=soup.get_text(' ',strip=True)
 m=re.search(r'Updated:\s*(\d{1,2}/\d{1,2}/\d{4})\s*(\d{1,2}:\d{2})\s*(AM|PM)\s*ET',text)
 if not m:raise ValueError('Missing published depth-chart date')
 stamp=datetime.strptime(' '.join(m.groups()),'%m/%d/%Y %I:%M %p').replace(tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc)
 if stamp>now+timedelta(minutes=5) or now-stamp>timedelta(days=14):raise ValueError('College depth chart is stale')
 entries=[]
 for tr in soup.select('table tbody tr'):
  cells=tr.find_all('td',recursive=False)
  if not cells:continue
  slot=cells[0].get_text(strip=True);pos=slot.split('-')[0]
  if pos not in POSITIONS:continue
  for level,i in enumerate(range(2,len(cells),2)):
   a=cells[i].find('a');name=a.get_text(' ',strip=True) if a else ''
   if not name or ',' not in name:continue
   name=re.sub(r'\s+(?:(?:RS|TR)\s+)?(?:FR|SO|JR|SR|GR)(?:/TR)?$','',name)
   last,first=name.split(',',1);entries.append({'name':first.strip()+' '+last.strip(),'position':pos,'slot':slot,'tier':level+1,'slot_order':len(entries)})
 if not entries:raise ValueError('No offensive depth chart parsed')
 return entries,stamp.isoformat()

def ready_evidence(athlete,depth,stamp,source_url):
 # Empty injury fields alone never qualify: require a current explicit Active
 # status AND a matching current published depth-chart entry, checked separately.
 active=athlete.get('status',{}).get('type')=='active'
 if not active or athlete.get('injuries')!=[] or not depth or depth.get('injuries',[])!=[]:return None
 return {'state':'available','label':'Ready','reported_status':'Expected available','reported_at':stamp,'source_url':source_url,'reason':'Listed active on the current team roster and on its published depth chart, with no injury restriction in those feeds. Ready means expected available; it does not guarantee snaps or medical clearance.','basis':'active_roster_and_depth_chart'}

def main():
 now=datetime.now(timezone.utc);ncaa=json.loads((ROOT/'data/ncaa-data.json').read_text(encoding='utf-8'));nfl=json.loads((ROOT/'data/data.json').read_text(encoding='utf-8'))
 photos=json.loads((ROOT/'data/athlete-photos.json').read_text(encoding='utf-8'))['photos'];nflplayers={str(p['id']):p for p in nfl['players'] if p.get('position') in POSITIONS}
 for p in photos.values():
  if p['sport']=='NFL':nflplayers.setdefault(str(p['id']),{'id':p['id'],'name':p['name'],**p['roster']})
 cross=list(csv.DictReader(io.StringIO(fetch(f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{now.year}.csv').decode('utf-8-sig'))))
 espn={(r['gsis_id'],ALIASES.get(r['team'],r['team'])):r['espn_id'] for r in cross if r.get('gsis_id') and r.get('espn_id')}
 links=college_links(fetch(COLLEGE_INDEX,21600),ncaa['teams']);oldpath=ROOT/'data/team-rosters.json';old=json.loads(oldpath.read_text(encoding='utf-8')) if oldpath.exists() else {'leagues':{}}
 result={'schema_version':1,'policy_version':1,'season':now.year,'updated':now.isoformat(),'leagues':{'NFL':{'teams':{},'players':{}},'NCAA':{'teams':{},'players':{}}},'errors':[]}
 tasks=[('NFL',str(tid),abbr) for abbr,tid in TEAM_IDS.items()]+[('NCAA',str(t['id']),str(t['id'])) for t in ncaa['teams']]
 def one(task):
  sport,tid,key=task;path='nfl' if sport=='NFL' else 'college-football';roster_url=BASE+path+'/teams/'+tid+'/roster';depth_url=BASE+path+'/teams/'+tid+'/depthcharts' if sport=='NFL' else links.get(tid)
  try:
   r=json.loads(fetch(roster_url));stamp=validate(r,tid,now)
   roster=[a for group in r['athletes'] for a in group['items'] if a.get('position',{}).get('abbreviation') in POSITIONS]
   if sport=='NFL':d=json.loads(fetch(depth_url));validate(d,tid,now);entries=nfl_depth(d);depthstamp=d['timestamp']
   elif depth_url:entries,depthstamp=college_depth(fetch(depth_url,21600),now)
   else:entries=[];depthstamp=None
   if sport=='NFL' and not entries:raise ValueError('Missing NFL offensive depth chart')
   records={};source_url='https://www.espn.com/'+path+'/team/roster/_/id/'+tid;local=list(nflplayers.values()) if sport=='NFL' else ncaa['players']
   local=[p for p in local if (ALIASES.get(p.get('team'),p.get('team'))==key if sport=='NFL' else str(p.get('team_id'))==tid)]
   for p in local:
    aid=espn.get((str(p['id']),key)) if sport=='NFL' else str(p['espn_id'])
    matches=[a for a in roster if (str(a['id'])==aid if aid else player_name(a['displayName'])==player_name(p['name'])) and a['position']['abbreviation']==p['position']]
    if len(matches)!=1:continue
    a=matches[0];dep=[e for e in entries if e['position']==p['position'] and (e.get('espn_id')==str(a['id']) if sport=='NFL' else player_name(e['name'])==player_name(p['name']))]
    dep=min(dep,key=lambda e:(e['tier'],e['slot_order'])) if dep else None
    availability=ready_evidence(a,dep,stamp,source_url)
    for injury in sorted(a.get('injuries',[]),key=lambda i:i.get('date','')):
     state,label,reason=classify(injury.get('status'),injury.get('date'),now)
     if state in ('questionable','out'):availability={'state':state,'label':label,'reported_status':injury['status'],'reported_at':injury['date'],'source_url':source_url,'reason':'Current ESPN team roster injury listing: '+injury['status']+'.','basis':'explicit_roster_injury'}
    records[str(p['id'])]={'team':key,'name':p['name'],'espn_id':str(a['id']),'position':p['position'],'depth':{k:v for k,v in dep.items() if k!='injuries'} if dep else None,'availability':availability,'source_url':source_url,'depth_source_url':depth_url,'depth_published_at':depthstamp}
   return sport,key,{'name':r['team']['displayName'],'color':'#'+r['team']['color'],'checked_at':now.isoformat(),'roster_published_at':stamp,'depth_published_at':depthstamp,'depth_source_url':depth_url,'source_url':source_url,'players_matched':len(records),'depth_players':sum(bool(r['depth']) for r in records.values()),'error':None},records
  except Exception as exc:return sport,key,{'error':str(exc)},{}
 with ThreadPoolExecutor(max_workers=4) as pool:
  for sport,key,t,players in pool.map(one,tasks):
   league=result['leagues'][sport]
   if t.get('error'):
    result['errors'].append({'sport':sport,'team':key,'error':t['error']});previous=old.get('leagues',{}).get(sport,{})
    league['teams'][key]={**previous.get('teams',{}).get(key,{}),**t}
    league['players'].update({pid:p for pid,p in previous.get('players',{}).items() if p['team']==key})
   else:league['teams'][key]=t;league['players'].update(players)
 if not result['leagues']['NFL']['players']:raise ValueError('No NFL team roster matches')
 tmp=oldpath.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8');tmp.replace(oldpath)
 print(json.dumps({s:{'teams':len(l['teams']),'players':len(l['players']),'depth':sum(bool(p['depth']) for p in l['players'].values()),'ready_evidence':sum((p['availability'] or {}).get('state')=='available' for p in l['players'].values())} for s,l in result['leagues'].items()}));print('Errors:',result['errors']);return result
if __name__=='__main__':main()
