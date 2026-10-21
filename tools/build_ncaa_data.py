"""Build the five-conference NCAA football snapshot from ESPN's published feeds.
No key required. Originals are cached; use --refresh to replace the cache.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
import argparse,json,time,urllib.request
CONFS={'1':'ACC','4':'Big 12','5':'B1G','9':'PAC-12','8':'SEC'}
BASE='https://site.api.espn.com/apis/site/v2/sports/football/college-football'
POSITIONS={'QB','RB','WR','TE'}
def dump(p,d):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8');tmp.replace(p)
def number(v):
 try:return float(v) if str(v).strip() not in ['','--','-','N/A'] else None
 except (ValueError,TypeError):return None
def build(season,out,cache,refresh=False):
 cache.mkdir(parents=True,exist_ok=True);errors=[]
 def get(key,url):
  path=cache/(key+'.json')
  if path.exists():
   age=time.time()-path.stat().st_mtime
   ttl=86400 if key.startswith(('summary-','roster-')) else 21600 if key in ['standings','team-catalog'] else 1800
   if not refresh or age<ttl:return json.loads(path.read_text(encoding='utf-8'))
  for attempt in range(3):
   try:
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SanksResearchLab/1.0'}),timeout=45) as r:d=json.load(r)
    dump(path,d);return d
   except Exception:
    if attempt==2:raise
    time.sleep(1+attempt)
 standings=get('standings',f'https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season={season}')
 catalog=get('team-catalog',BASE+'/teams?limit=1000')
 colors={str(x['team']['id']):x['team'].get('color','164b45') for x in catalog['sports'][0]['leagues'][0]['teams']}
 current=get('current-week',f'{BASE}/scoreboard?groups=80&dates={season}&limit=1').get('week',{}).get('number')
 teams={}
 for conf in standings.get('children',[]):
  if conf['id'] not in CONFS:continue
  for entry in conf['standings']['entries']:
   t=entry['team'];tid=str(t['id']);teams[tid]={'id':tid,'name':t['displayName'],'short_name':t.get('shortDisplayName',t['displayName']),'abbreviation':t['abbreviation'],'conference':CONFS[conf['id']],'color':colors.get(tid,t.get('color','164b45')),'source_url':f'https://www.espn.com/college-football/team/_/id/{tid}'}
 assert set(x['conference'] for x in teams.values())==set(CONFS.values()),'Missing conference membership'
 players={};events={};team_coverage=[]
 def fetch_team(tid):return tid,get('roster-'+tid,f'{BASE}/teams/{tid}/roster?season={season}'),get('schedule-'+tid,f'{BASE}/teams/{tid}/schedule?season={season}')
 with ThreadPoolExecutor(max_workers=5) as pool:
  futures={pool.submit(fetch_team,t):t for t in teams}
  for i,f in enumerate(as_completed(futures),1):
   tid,roster,schedule=f.result();team=teams[tid];count=0
   assert int(roster.get('season',{}).get('year',season))==season,'Roster season mismatch'
   for group in roster.get('athletes',[]):
    for a in group.get('items',[]):
     pos=a.get('position',{}).get('abbreviation');pos='RB' if pos=='HB' else pos
     if pos not in POSITIONS:continue
     aid=str(a['id']);pid='ncaa:'+aid
     if pid in players and players[pid]['team_id']!=tid:raise ValueError('Ambiguous current roster identity '+pid)
     players[pid]={'id':pid,'espn_id':aid,'name':a.get('displayName',a.get('fullName')),'team_id':tid,'team':team['abbreviation'],'team_name':team['name'],'conference':team['conference'],'position':pos,'jersey':a.get('jersey'),'height':a.get('displayHeight'),'weight':a.get('displayWeight'),'class':a.get('experience',{}).get('displayValue'),'source_url':f'https://www.espn.com/college-football/player/_/id/{aid}','games':[]};count+=1
   assert count>0,'No skill roster for '+tid
   assert schedule.get('events'),'No schedule for '+tid
   team_coverage.append({'team_id':tid,'team_name':team['name'],'conference':team['conference'],'players':count,'scheduled_games':len(schedule['events'])})
   for e in schedule['events']:
    assert int(e.get('season',{}).get('year',season))==season
    events[str(e['id'])]=e
   if i%15==0:print('ROSTERS/SCHEDULES',i,'/',len(teams),flush=True)
 games=[]
 for eid,e in events.items():
  c=e['competitions'][0];sides={x['homeAway']:x for x in c['competitors']}
  if not all(k in sides for k in ['home','away']):continue
  def score(x):
   s=x.get('score');return number(s.get('value') if isinstance(s,dict) else s)
  home,away=sides['home'],sides['away'];status=c.get('status',{}).get('type',{})
  games.append({'id':eid,'week':e.get('week',{}).get('number',0),'date':e['date'],'home_id':str(home['id']),'away_id':str(away['id']),'home':home['team']['abbreviation'],'away':away['team']['abbreviation'],'home_name':home['team'].get('displayName',home['team'].get('name')),'away_name':away['team'].get('displayName',away['team'].get('name')),'home_score':score(home),'away_score':score(away),'completed':bool(status.get('completed')),'status':status.get('shortDetail',status.get('description','Scheduled')),'venue':c.get('venue',{}),'kickoff_confirmed':c.get('timeValid') is True,'neutral':c.get('neutralSite',False),'season_type':e.get('seasonType',{}).get('type',2),'conferences':sorted({teams[str(x['id'])]['conference'] for x in [home,away] if str(x['id']) in teams}),'source_url':f'https://www.espn.com/college-football/boxscore/_/gameId/{eid}'})
 games.sort(key=lambda g:(g['date'],g['id']));completed=[g for g in games if g['completed']]
 def summary(g):return g,get('summary-'+g['id'],f'{BASE}/summary?event={g["id"]}')
 mapped={'passingYards':'passing_yards','passingTouchdowns':'passing_tds','interceptions':'interceptions','rushingAttempts':'carries','rushingYards':'rushing_yards','rushingTouchdowns':'rushing_tds','receivingYards':'receiving_yards','receivingReceptions':'receptions','receptions':'receptions','receivingTouchdowns':'receiving_tds','receivingTargets':'targets'}
 parsed_games=set();unrostered=[]
 with ThreadPoolExecutor(max_workers=5) as pool:
  futures={pool.submit(summary,g):g for g in completed}
  for i,f in enumerate(as_completed(futures),1):
   g,d=f.result();rows=d.get('boxscore',{}).get('players',[])
   if not rows:errors.append({'game_id':g['id'],'error':'completed_game_boxscore_missing'});continue
   for side in rows:
    tid=str(side['team']['id'])
    if tid not in teams:continue
    logs={}
    for group in side.get('statistics',[]):
     if group['name'] not in ['passing','rushing','receiving']:continue
     for row in group.get('athletes',[]):
      aid=str(row['athlete']['id']);pid='ncaa:'+aid
      if pid not in players:
       unrostered.append({'player_id':pid,'name':row['athlete'].get('displayName'),'team_id':tid,'game_id':g['id']});continue
      if players[pid]['team_id']!=tid:continue
      m=logs.setdefault(pid,{})
      for key,val in zip(group.get('keys',[]),row.get('stats',[])):
       if key=='completions/passingAttempts':
        vals=str(val).split('/');m['completions']=number(vals[0]) if len(vals)==2 else None;m['attempts']=number(vals[1]) if len(vals)==2 else None
       elif key in mapped:m[mapped[key]]=number(val)
    for pid,m in logs.items():
     opp=g['away'] if tid==g['home_id'] else g['home'];players[pid]['games'].append({'game_id':g['id'],'week':g['week'],'date':g['date'],'team':teams[tid]['abbreviation'],'team_id':tid,'opponent':opp,'metrics':m,'source_url':g['source_url']})
   parsed_games.add(g['id'])
   if i%60==0:print('BOX SCORES',i,'/',len(completed),flush=True)
 previous=json.loads(out.read_text(encoding='utf-8')) if out.exists() else {}
 prior={p['id']:p for p in previous.get('players',[])} if previous.get('season')==season else {}
 for p in players.values():
  old=prior.get(p['id'],{})
  if old.get('team_id')==p['team_id']:
   if old.get('availability'):p['availability']=old['availability']
   existing={g['game_id'] for g in p['games']}
   for g in old.get('games',[]):
    if g.get('source_kind')=='ESPN season player game log' and g['game_id'] not in existing and g['game_id'] in parsed_games:p['games'].append(g)
  p['games'].sort(key=lambda g:(g['date'],g['game_id']))
 result={'schema_version':1,'league':'NCAA','season':season,'current_week':current,'updated':datetime.now(timezone.utc).isoformat(),'source':'ESPN published conference standings, team rosters, schedules and final box scores','source_url':'https://www.espn.com/college-football/','conferences':list(CONFS.values()),'teams':list(teams.values()),'players':sorted(players.values(),key=lambda p:(p['conference'],p['team'],p['name'])),'games':games,'coverage':{'teams':len(teams),'players':len(players),'games':len(games),'completed_games':len(completed),'boxscores_loaded':len(parsed_games),'player_game_logs':sum(len(p['games']) for p in players.values()),'conference_teams':{c:sum(t['conference']==c for t in teams.values()) for c in CONFS.values()},'team_rosters':team_coverage,'issues':errors,'unrostered_boxscore_rows':len(unrostered)},'limitations':['Roster scope: QB, RB, WR and TE in the five selected conferences.','Games include nonconference opponents; their player rosters are not imported.','A player absent from a final box score has no game log. Missing values remain null and interrupt active streaks.','Targets are unavailable where not supplied by the box score.','Single-source ESPN snapshot; no independent verification or NCAA injury feed.']}
 assert not errors,errors
 dump(out,result);print('COMPLETE',json.dumps({k:v for k,v in result['coverage'].items() if k not in ['team_rosters']}),flush=True)
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--season',type=int,default=2026);p.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'data/ncaa-data.json');p.add_argument('--cache',type=Path,default=Path(__file__).resolve().parents[1]/'work/ncaa-cache');p.add_argument('--refresh',action='store_true');a=p.parse_args();build(a.season,a.out,a.cache,a.refresh)
