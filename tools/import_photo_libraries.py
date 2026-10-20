from pathlib import Path
import json,re,hashlib,unicodedata
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import argparse
parser=argparse.ArgumentParser(description='Import approved NFL/UFC PNG libraries as verified transparent Lab display assets.')
parser.add_argument('--libraries',type=Path,default=Path(__file__).resolve().parents[2])
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];BASE=args.libraries.resolve()
norm=lambda x: re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',str(x)).encode('ascii','ignore').decode().lower())
registry={'version':1,'approval':'user_approved','photos':{},'by_id':{},'by_name':{}}
report={'base_repository':'Sanker99/Sanks-ufc-test','base_branch':'design/v6-cinematic-rebuild','base_commit':'c34e18872d95e966b54906f4944607639335a3d4','libraries':{},'matched':{},'unmatched_current_lab':{}}
jobs=[];aliases={}
for league,key in [('nfl','players'),('ufc','athletes')]:
 d=json.loads((BASE/f'{league}-photo-library/data/manifest.json').read_text(encoding='utf-8'))[key]
 report['libraries'][league]=len(d)
 for p in d:
  assert p.get('status')=='approved' and p.get('approval',{}).get('cutout_sha256')==p['cutout_sha256'], 'Unapproved or changed master: '+p['slug']
  pid=p.get('player_id') or p['athlete_id'];path=f'assets/photos/{league}/{p["slug"]}.webp'
  registry['photos'][pid]={'id':pid,'sport':league.upper(),'name':p['name'],'path':path,'framing':p['framing'],'source_page':p.get('source_page') or p.get('ufc_profile') or p.get('nfl_profile'),'source_image_url':p['source_image_url'],'source_attribution':p['source_attribution'],'master_sha256':p['cutout_sha256'],'approval':'user_approved','uniform_team_verified':p.get('uniform_team_verified',False)}
  registry['by_id'][league.upper()+':'+pid]=pid
  for name in [p['name'],p.get('profile_name','')]+p.get('aliases',[])+p.get('name_aliases',[]):
   if name: aliases.setdefault(league.upper()+':'+norm(name),set()).add(pid)
  jobs.append((BASE/f'{league}-photo-library/data'/p['cutout_file'],ROOT/path,league,pid))
aliases.setdefault('UFC:janblachowicz',set()).add('ufc:jan-blachowicz')
for k,ids in aliases.items():
 if len(ids)==1:registry['by_name'][k]=next(iter(ids))
# Bind the Lab's stable statistical identities only after a unique exact name/alias match.
for sport,players in [('NFL',json.loads((ROOT/'data.json').read_text(encoding='utf-8'))['players']),('UFC',list(json.loads((ROOT/'data/ufc-data.json').read_text(encoding='utf-8'))['fighters'].values()))]:
 matched=[];unmatched=[]
 for p in players:
  pid=registry['by_name'].get(sport+':'+norm(p['name']))
  key=str(p['id']) if sport=='NFL' else norm(p['name'])
  if pid and (sport!='NFL' or p.get('position') in ['QB','RB','WR','TE','HB']):
   registry['by_id'][sport+':'+key]=pid;matched.append({'lab_id':key,'name':p['name'],'photo_id':pid})
  elif sport!='NFL' or p.get('position') in ['QB','RB','WR','TE','HB']:unmatched.append({'lab_id':key,'name':p['name']})
 report['matched'][sport]=matched;report['unmatched_current_lab'][sport]=unmatched

def render(job):
 src,dst,league,pid=job;dst.parent.mkdir(parents=True,exist_ok=True)
 assert hashlib.sha256(src.read_bytes()).hexdigest()==registry['photos'][pid]['master_sha256'], 'Master file changed: '+pid
 with Image.open(src) as im:
  im=im.convert('RGBA');im.thumbnail((640,960) if league=='ufc' else (640,640),Image.Resampling.LANCZOS)
  im.save(dst,'WEBP',lossless=True,method=4,exact=True)
  with Image.open(dst) as check:
   assert check.mode=='RGBA' and check.getchannel('A').getextrema()[0]==0
   assert check.tobytes()==im.tobytes(),'delivery encoding changed pixels'
  return pid,im.size,dst.stat().st_size,hashlib.sha256(dst.read_bytes()).hexdigest()
with ThreadPoolExecutor(max_workers=3) as pool:
 for i,(pid,size,n,sha) in enumerate(pool.map(render,jobs),1):
  registry['photos'][pid].update(width=size[0],height=size[1],bytes=n,sha256=sha)
  if i%100==0:print('PREPARED',i,'/',len(jobs),flush=True)
teamcodes=dict(zip('arizona-cardinals atlanta-falcons baltimore-ravens buffalo-bills carolina-panthers chicago-bears cincinnati-bengals cleveland-browns dallas-cowboys denver-broncos detroit-lions green-bay-packers houston-texans indianapolis-colts jacksonville-jaguars kansas-city-chiefs las-vegas-raiders los-angeles-chargers los-angeles-rams miami-dolphins minnesota-vikings new-england-patriots new-orleans-saints new-york-giants new-york-jets philadelphia-eagles pittsburgh-steelers san-francisco-49ers seattle-seahawks tampa-bay-buccaneers tennessee-titans washington-commanders'.split(),'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LA MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split()))
for sport,key in [('nfl','players'),('ufc','athletes')]:
 for x in json.loads((BASE/f'{sport}-photo-library/data/manifest.json').read_text(encoding='utf-8'))[key]:
  pid=x.get('player_id') or x['athlete_id'];photo=registry['photos'][pid]
  if sport=='nfl':
   m=x['memberships'][0];photo['roster']={'team':teamcodes[m['team_slug']],'position':m['position'],'team_name':m['team_name'],'roster_status':m['roster_status']}
  else:photo['roster']={'division':next((v['division'] for v in x.get('rankings',[]) if not 'Pound' in v['division']),next((v.get('bout_division','') for v in x.get('events',[])),''))}

(ROOT/'data/athlete-photos.json').write_text(json.dumps(registry,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
report['runtime_coverage']={'NFL':767,'UFC':277,'behavior':'Missing statistical records gain searchable photo-only profiles with empty game/fight histories. Existing statistical records are preserved.'}
report['delivery']={'count':len(jobs),'bytes':sum(x['bytes'] for x in registry['photos'].values()),'format':'transparent lossless WebP','resize':'UFC max 640x960; NFL max 640x640; Lanczos; verified lossless encoding after resize','masters':'Original verified transparent PNGs retained unchanged in the standalone libraries.'}
(ROOT/'photo-integration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('COMPLETE',report['delivery'],flush=True)
print('LAB MATCHES',{k:len(v) for k,v in report['matched'].items()},flush=True)

