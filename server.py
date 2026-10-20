import csv, io, json, os, time, threading, urllib.request, urllib.error, webbrowser
from urllib.parse import urlparse, parse_qs
from verification import verify_player
import injuries
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'cache'; CACHE.mkdir(exist_ok=True)
YEAR=datetime.now().year
URLS={
 'stats':f'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{YEAR}.csv',
 'schedule':'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',
}
INTERVAL={'stats':1800,'schedule':900}
lock=threading.Lock(); _built_cache=None; _built_key=None; _injury_cache=None; _injury_key=None; state={'stats':{'rows':[],'updated':None,'error':None},'schedule':{'rows':[],'updated':None,'error':None}}
def load_cache():
 for key in state:
  p=CACHE/(key+'.json')
  if p.exists():
   try: state[key]=json.loads(p.read_text(encoding='utf-8'))
   except Exception: pass

def fetch(key):
 try:
  req=urllib.request.Request(URLS[key],headers={'User-Agent':'SanksResearchLab/0.1 (personal statistics research)','Accept':'text/csv'})
  with urllib.request.urlopen(req,timeout=35) as r: raw=r.read(18000000)
  rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
  if key=='schedule': rows=[r for r in rows if str(r.get('season',''))==str(YEAR)]
  if not rows: raise ValueError('Source returned no rows; retaining previous data')
  payload={'rows':rows,'updated':datetime.now(timezone.utc).isoformat(),'error':None}
  with lock:
   state[key]=payload
   (CACHE/(key+'.json')).write_text(json.dumps(payload),encoding='utf-8')
 except Exception as e:
  with lock: state[key]['error']=str(e)
def worker():
 # Independent workers prevent slow stats downloads from blocking schedules or injuries.
 def sync_dataset(key):
  while True:
   with lock:
    updated=state[key]['updated']
   age=time.time()-datetime.fromisoformat(updated).timestamp() if updated else 1e9
   if age>=INTERVAL[key]:fetch(key)
   time.sleep(60)
 def sync_injuries():
  while True:
   injuries.refresh(CACHE)
   time.sleep(60)
 for key in state:
  threading.Thread(target=sync_dataset,args=(key,),daemon=True).start()
 threading.Thread(target=sync_injuries,daemon=True).start()

def number(row,keys):
 for k in keys:
  x=row.get(k)
  if x not in ('',None):
   try: return float(x)
   except: pass
 return None
METRICS={'passing_yards':['passing_yards'],'passing_tds':['passing_tds'],'attempts':['attempts','passing_attempts'],'completions':['completions'],'interceptions':['interceptions'],'rushing_yards':['rushing_yards'],'carries':['carries','rushing_attempts'],'receiving_yards':['receiving_yards'],'receptions':['receptions'],'targets':['targets'],'rushing_tds':['rushing_tds'],'receiving_tds':['receiving_tds']}
def build():
 global _built_cache,_built_key
 with lock:
  key=(state['stats']['updated'],state['schedule']['updated'],state['stats']['error'],state['schedule']['error'])
  if _built_cache is not None and _built_key==key:return _built_cache
  s={k:v for k,v in state.items()}

 players={}
 for r in s['stats']['rows']:
  if str(r.get('season',''))!=str(YEAR):continue
  if str(r.get('season_type','REG')).upper() not in ('REG',''):continue
  pid=r.get('player_id') or r.get('player_name')
  if not pid:continue
  name=r.get('player_display_name') or r.get('player_name') or pid
  p=players.setdefault(pid,{'id':pid,'name':name,'team':r.get('recent_team') or r.get('team') or '', 'position':r.get('position') or '', 'games':[]})
  game={'week':r.get('week'),'team':r.get('recent_team') or r.get('team') or '', 'opponent':r.get('opponent_team') or '', 'metrics':{k:number(r,v) for k,v in METRICS.items()}}
  p['games'].append(game)
 for p in players.values():
  unique={}
  for g in p['games']:
   ident=(str(g['week']),g['team'])
   if ident in unique:
    for k,v in g['metrics'].items():
     if unique[ident]['metrics'].get(k)!=v:unique[ident]['metrics'][k]=None
   else:unique[ident]=g
  p['games']=sorted(unique.values(),key=lambda g:int(g['week']) if str(g['week']).isdigit() else 0)
  if p['games']:p['team']=p['games'][-1]['team']
 games=[]
 for r in s['schedule']['rows']:
  if (r.get('game_type') or r.get('season_type') or 'REG')!='REG':continue
  games.append({'week':r.get('week'),'away':r.get('away_team'),'home':r.get('home_team'),'date':r.get('gameday'),'time':r.get('gametime'),'away_score':r.get('away_score'),'home_score':r.get('home_score')})
 games.sort(key=lambda g:(g['date'] or '',g['time'] or ''))
 result={'season':YEAR,'players':list(players.values()),'games':games,'sources':{k:{'url':URLS[k],'updated':v['updated'],'error':v['error'],'rows':len(v['rows'])} for k,v in s.items()},'note':'Weekly stats may lag live games. nflverse injury data is a best-effort weekly report, not official NFL confirmation or evidence of early game exits.'}
 with lock:
  _built_cache=result;_built_key=key
 return result
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_GET(self):
  if self.path.startswith('/api/data'):
   b=json.dumps(build()).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
  if self.path.startswith('/api/injuries'):
   args=parse_qs(urlparse(self.path).query)
   if args.get('refresh')==['1']:injuries.force_refresh(CACHE)
   snap=injuries.snapshot()
   if self.path.startswith('/api/injuries?') and args.get('player'):
    player=next((p for p in build()['players'] if p['id']==args['player'][0]),None)
    if not player:self.send_error(404,'Player not found');return
    payload=injuries.lookup(player,snap)
   else:
    global _injury_cache,_injury_key
    current=build()
    key=(snap.get('updated'),snap.get('error'),snap.get('last_attempt'),id(current))
    with lock:
     cached=_injury_cache if _injury_key==key else None
    if cached is not None:
     b=cached;self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
    payload={'updated':snap['updated'],'error':snap['error'],'source':snap['source'],'last_attempt':snap.get('last_attempt'),'last_http':snap.get('last_http'),'groups':snap.get('groups'),'entries':snap.get('entries'),'feed_season':snap.get('season'),'route':snap.get('route'),'coverage':snap.get('coverage'),'players':{p['id']:injuries.lookup(p,snap) for p in current['players']}}
   b=json.dumps(payload).encode();
   if not args.get('player'):
    with lock:
     _injury_cache=b
     _injury_key=key
    self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b);return
  if self.path.startswith('/api/verify?'):
   args=parse_qs(urlparse(self.path).query)
   pid=args.get('player',[''])[0]; metric=args.get('metric',[''])[0]
   if metric not in METRICS:self.send_error(400,'Invalid metric');return
   player=next((p for p in build()['players'] if p['id']==pid),None)
   if not player:self.send_error(404,'Player not found');return
   try:
    result=verify_player(player,metric,YEAR,int(args.get('limit',['10'])[0]))
    b=json.dumps(result).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
   except Exception as e:self.send_error(502,'Verification unavailable: '+str(e)[:100])
   return
  return super().do_GET()
 def log_message(self,*args):pass
if __name__=='__main__':
 load_cache();injuries.load(CACHE);threading.Thread(target=worker,daemon=True).start()
 print('Sanks Research Lab: http://127.0.0.1:8891')
 print('Phone access (same Wi-Fi): http://YOUR-COMPUTER-LAN-IP:8891')
 webbrowser.open('http://127.0.0.1:8891')
 ThreadingHTTPServer(('0.0.0.0',8891),Handler).serve_forever()
