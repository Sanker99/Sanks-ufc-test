"""Restore only the existing approved, ignored helmet regression fixtures."""
import hashlib, json, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse
from urllib.error import HTTPError
ROOT=Path(__file__).resolve().parents[2]
def restore(entry):
 relative=entry['path']
 if not relative.startswith('assets/helmets/') or '..' in Path(relative).parts:
  raise ValueError('Invalid approved fixture path')
 target=ROOT/relative
 if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==entry['sha256']:
  return
 if urlparse(entry['image_url']).hostname!='www.helmethistory.com':
  raise ValueError('Unexpected fixture source')
 try:
  with urllib.request.urlopen(entry['image_url'],timeout=60) as response:
   content=response.read()
 except HTTPError as error:
  if error.code not in (404,410):
   raise
  # The owner's existing public deployment preserves the same approved originals.
  with urllib.request.urlopen('https://sanksresearchlab.pages.dev/'+relative,timeout=60) as response:
   content=response.read()
 if hashlib.sha256(content).hexdigest()!=entry['sha256']:
  raise ValueError('Approved fixture hash mismatch: '+relative)
 target.parent.mkdir(parents=True,exist_ok=True)
 target.write_bytes(content)
if __name__=='__main__':
 entries=json.loads((ROOT/'data/lab-experience.json').read_text(encoding='utf-8'))['helmets'].values()
 with ThreadPoolExecutor(max_workers=6) as pool:
  list(pool.map(restore,entries))
 print('Approved helmet fixtures verified')
