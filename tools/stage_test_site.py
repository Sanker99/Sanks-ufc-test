"""Restore approved delivery assets by recorded hash and stage the TEST static site."""
import hashlib,json,shutil,urllib.request,subprocess,os
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PUBLIC='https://sanksresearchlab-test.pages.dev/'
def restore(photo):
    relative=photo['path'];assert relative.startswith('assets/photos/') and '..' not in relative
    path=ROOT/relative
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==photo['sha256']:return
    with urllib.request.urlopen(PUBLIC+relative,timeout=90) as r:raw=r.read()
    assert hashlib.sha256(raw).hexdigest()==photo['sha256'],'Approved asset hash mismatch: '+relative
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
def main():
    photos=json.loads((ROOT/'data/athlete-photos.json').read_text(encoding='utf-8'))['photos']
    with ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(restore,photos.values()))
    from urllib.parse import urlparse
    experience=ROOT/'data/lab-experience.json'
    if experience.exists():
        def restore_helmet(entry):
            relative=entry['path'];assert relative.startswith('assets/helmets/') and '..' not in relative
            path=ROOT/relative
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']:return
            assert urlparse(entry['image_url']).hostname=='www.helmethistory.com'
            with urllib.request.urlopen(entry['image_url'],timeout=60) as response:raw=response.read()
            assert hashlib.sha256(raw).hexdigest()==entry['sha256'],'Helmet asset hash mismatch'
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
        with ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(restore_helmet,json.loads(experience.read_text(encoding='utf-8'))['helmets'].values()))
    dest=ROOT/'work/site';dest.mkdir(parents=True,exist_ok=True)
    for directory in ['assets','data']:shutil.copytree(ROOT/directory,dest/directory,dirs_exist_ok=True)
    for file in ['index.html','sanks-header.png','data.json','injuries.json','ufc-data.json']:
        if (ROOT/file).exists():shutil.copyfile(ROOT/file,dest/file)
    for name in ['injuries.json','data.json']:
        if (ROOT/'data'/name).exists():shutil.copyfile(ROOT/'data'/name,dest/name)
    revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    code=['index.html','assets/v5.js','assets/ncaa.js','assets/weather.js','assets/team-identities.js','assets/lab.js','assets/v5.css','assets/lab.css','assets/experience.js','assets/experience.css','assets/live-scores.js','assets/live-scores.css','assets/research-upgrades.js','assets/research-upgrades.css']
    release={'schema_version':1,'project':'sanksresearchlab-test','source_repository':'Sanker99/Sanks-ufc-test','source_branch':'codex/11-task-improvements-2026-10-20','code_commit':revision,'built_at':datetime.now(timezone.utc).isoformat(),'workflow_run_id':os.environ.get('GITHUB_RUN_ID'),'code_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in code},'snapshot_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'data').glob('*.json')},'approved_photo_count':len(photos)}
    (dest/'data/release.json').write_text(json.dumps(release,indent=2),encoding='utf-8')
    print('Staged test site; verified approved photo assets:',len(photos));print('Release source:',revision)

if __name__=='__main__':main()
