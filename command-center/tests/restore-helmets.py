"""Restore ignored, approved helmet bytes for the existing public-site CI tests."""
import hashlib
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]

def restore(row):
    relative = row['path']
    if not relative.startswith('assets/helmets/') or '..' in Path(relative).parts:
        raise ValueError('Invalid helmet path')
    path = ROOT / relative
    def valid(raw):
        return hashlib.sha256(raw).hexdigest() == row['sha256']
    if path.exists() and valid(path.read_bytes()):
        return
    urls = ['https://sanksresearchlab.pages.dev/' + relative]
    original = row.get('image_url', '')
    if urlparse(original).scheme == 'https' and urlparse(original).hostname == 'www.helmethistory.com':
        urls.append(original)
    for url in urls:
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 SANKS-asset-validation'}), timeout=45) as response:
                raw = response.read(8 * 1024 * 1024)
            if not valid(raw):
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
            return
        except (OSError, ValueError):
            continue
    raise RuntimeError('Cannot restore approved hash: ' + relative)

if __name__ == '__main__':
    rows = json.loads((ROOT / 'data/lab-experience.json').read_text(encoding='utf-8'))['helmets'].values()
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(restore, rows))
    print('Approved helmet assets restored and SHA-256 verified')
