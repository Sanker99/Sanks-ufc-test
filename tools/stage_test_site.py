"""Restore approved delivery assets by recorded hash and stage the TEST static site."""
import hashlib,json,shutil,urllib.request
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
    dest=ROOT/'work/site';dest.mkdir(parents=True,exist_ok=True)
    for directory in ['assets','data']:shutil.copytree(ROOT/directory,dest/directory,dirs_exist_ok=True)
    for file in ['index.html','sanks-header.png','data.json','injuries.json','ufc-data.json']:
        if (ROOT/file).exists():shutil.copyfile(ROOT/file,dest/file)
    print('Staged test site; verified approved photo assets:',len(photos))
if __name__=='__main__':main()
