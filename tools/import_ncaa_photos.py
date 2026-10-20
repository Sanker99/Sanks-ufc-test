"""Import the user-approved NCAA masters with exact Lab IDs; never match by name."""
import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
def read(path):
    return json.loads(path.read_text(encoding='utf-8'))
def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main(library):
    folder = library / 'data'
    manifest = read(folder / 'manifest.json')
    approval = read(folder / 'approval.json')
    registry = read(ROOT / 'data/athlete-photos.json')
    roster = {p['id']: p for p in read(ROOT / 'data/ncaa-data.json')['players']}
    records = [p for p in manifest['players'] if p['status'] == 'approved']
    assert len(records) == approval['approved_count']
    def prepare(p):
        pid = p['player_id']
        assert pid in roster and roster[pid]['name'] == p['name']
        assert str(roster[pid]['team_id']) == str(p['team_id'])
        assert approval['photos'][pid] == p['cutout_sha256']
        source = folder / p['cutout_file']
        assert sha(source) == p['cutout_sha256'], pid
        relative = 'assets/photos/ncaa/' + p['slug'] + '.webp'
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as im:
            im = im.convert('RGBA')
            im.thumbnail((640, 640), Image.Resampling.LANCZOS)
            im.save(target, 'WEBP', lossless=True, method=4, exact=True)
            with Image.open(target) as decoded:
                assert decoded.mode == 'RGBA' and decoded.getchannel('A').getextrema() == (0, 255)
                assert decoded.tobytes() == im.tobytes(), pid
            width, height = im.size
        return pid, {'id':pid, 'sport':'NCAA', 'name':p['name'], 'path':relative,
            'framing':p['framing'], 'source_page':p['source_page'],
            'source_image_url':p.get('source_image_url'),
            'source_attribution':p.get('source_attribution', p.get('attribution')),
            'master_sha256':p['cutout_sha256'], 'approval':'user_approved',
            'uniform_team_verified':p.get('uniform_team_verified', False),
            'roster':{k:p.get(k) for k in ['team_id','team','team_name','conference','position','jersey']},
            'width':width,'height':height,'bytes':target.stat().st_size,'sha256':sha(target)}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, (pid, photo) in enumerate(pool.map(prepare, records), 1):
            registry['photos'][pid] = photo
            registry['by_id']['NCAA:' + pid] = pid
            if i % 200 == 0: print('Prepared', i, '/', len(records), flush=True)
    # NCAA deliberately has no name lookup: duplicate names and roster IDs exist.
    save(ROOT / 'data/athlete-photos.json', registry)
    report = {'approved':len(records),'unresolved':len(roster)-len(records),
        'identity':'Exact NCAA Lab ID only; no name fallback',
        'delivery':'Transparent lossless WebP, maximum 640x640; decoded pixels verified against resized RGBA',
        'master_files':'Original transparent PNGs unchanged in standalone NCAA library',
        'bytes':sum(v['bytes'] for v in registry['photos'].values() if v['sport']=='NCAA'),
        'verified_at':datetime.now(timezone.utc).isoformat()}
    save(ROOT / 'ncaa-photo-integration.json', report)
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--library', type=Path, required=True)
    main(parser.parse_args().library.resolve())
