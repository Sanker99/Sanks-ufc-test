"""Optional, on-demand cross-check of nflverse player game logs against ESPN final box scores.
Only exact player/team/metric matches are reported as verified; absent/ambiguous records remain pending.
"""
import json, re, time, threading, urllib.request
from datetime import datetime, timezone
from urllib.parse import urlencode
from pathlib import Path

BASE='https://site.api.espn.com/apis/site/v2/sports/football/nfl'
CACHE=Path(__file__).resolve().parent/'cache'/'espn_verify'
CACHE.mkdir(parents=True,exist_ok=True)
_lock=threading.Lock()
MEM={}
MAPPING={'passing_yards':('passing','YDS'),'passing_tds':('passing','TD'),'attempts':('passing','C/ATT'),'completions':('passing','C/ATT'),'interceptions':('passing','INT'), 'rushing_yards':('rushing','YDS'),'carries':('rushing','CAR'),'rushing_tds':('rushing','TD'),'receiving_yards':('receiving','YDS'),'receptions':('receiving','REC'),'targets':('receiving','TGTS'),'receiving_tds':('receiving','TD')}
TEAM_ALIASES={'LA':'LAR','WSH':'WAS','JAC':'JAX','OAK':'LV','SD':'LAC','STL':'LAR'}
def norm(s):return re.sub(r'[^a-z0-9]','',str(s or '').lower().replace('jr.','').replace('iii','').replace('ii',''))
def get(url, ttl=86400):
 key=re.sub('[^a-zA-Z0-9]','_',url)[-170:]
 file=CACHE/(key+'.json')
 if file.exists() and time.time()-file.stat().st_mtime<ttl:
  try:return json.loads(file.read_text())
  except Exception:pass
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 SanksResearchLab/0.7','Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=10) as r: result=json.load(r)
 file.write_text(json.dumps(result))
 return result

def events_for_week(year,week):
 url=BASE+'/scoreboard?'+urlencode({'dates':year,'seasontype':2,'week':week,'limit':30})
 board=get(url,3600)
 return board.get('events',[])

def find_event(year,week,team,opp):
 teams={TEAM_ALIASES.get(x,x) for x in (team,opp)}
 for event in events_for_week(year,week):
  competitions=event.get('competitions',[])
  if not competitions:continue
  competitors=competitions[0].get('competitors',[])
  found={TEAM_ALIASES.get(c.get('team',{}).get('abbreviation'),c.get('team',{}).get('abbreviation')) for c in competitors}
  if found==teams:return event
 return None

def read_stat(labels,stats,category,metric):
 label=[str(x).upper().strip() for x in labels]
 wanted=MAPPING[metric][1]
 if wanted not in label:return None
 idx=label.index(wanted)
 if idx>=len(stats):return None
 value=str(stats[idx]).strip()
 if metric in ('attempts','completions'):
  parts=value.split('/')
  if len(parts)!=2:return None
  value=parts[1] if metric=='attempts' else parts[0]
 try:return float(value.replace(',',''))
 except (ValueError,TypeError):return None

def verify_one(player,game,metric,year):
 week=int(game['week']); result={'week':week,'metric':metric,'primary':game['metrics'].get(metric),'status':'pending','source':'nflverse','checked_at':datetime.now(timezone.utc).isoformat()}
 if metric not in MAPPING or result['primary'] is None:return result
 try:
  event=find_event(year,week,game.get('team') or player['team'],game['opponent'])
  if not event:
   result['reason']='ESPN matchup not found';return result
  competition=event['competitions'][0]
  if not competition.get('status',{}).get('type',{}).get('completed',False):
   result['reason']='Game not final';return result
  eventid=event['id'];summary=get(BASE+'/summary?event='+str(eventid),86400*3)
  box=summary.get('boxscore',{})
  matching=[]
  for teamblock in box.get('players',[]):
   abbr=teamblock.get('team',{}).get('abbreviation','')
   if TEAM_ALIASES.get(abbr,abbr)!=TEAM_ALIASES.get(game.get('team') or player['team'],game.get('team') or player['team']):continue
   for cat in teamblock.get('statistics',[]):
    if cat.get('name','').lower()!=MAPPING[metric][0]:continue
    for athlete in cat.get('athletes',[]):
     person=athlete.get('athlete',{})
     if norm(person.get('displayName'))==norm(player['name']) or norm(person.get('fullName'))==norm(player['name']):
      value=read_stat(cat.get('labels',[]),athlete.get('stats',[]),cat['name'],metric)
      if value is not None:matching.append(value)
  if len(matching)!=1:
   result['reason']='No unique ESPN player/stat match';return result
  result['secondary']=matching[0]
  result['secondary_url']='https://www.espn.com/nfl/boxscore/_/gameId/'+str(eventid)
  result['status']='verified' if abs(float(result['primary'])-matching[0])<0.001 else 'discrepancy'
 except Exception as e:
  result['reason']='ESPN unavailable: '+str(e)[:140]
 return result

def verify_player(player,metric,year,limit=10):
 games=[g for g in player.get('games',[]) if g.get('metrics',{}).get(metric) is not None][-min(max(limit,1),17):]
 results=[verify_one(player,g,metric,year) for g in games]
 return {'player':player['name'],'metric':metric,'results':results,'sources':['nflverse','ESPN NFL box score'],'checked_at':datetime.now(timezone.utc).isoformat(),'note':'Two-source agreement confirms matching published totals, not independence of underlying statistical collection. Injury statuses are not verified.'}
