"""Stage only the approved rotation from an audited current snapshot.

No tracker integration or old-bundle reconstruction is run. This stages known
manifest paths only; authenticated account review is a separate publish gate.
"""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from audit_rotation_baseline import SNAPSHOT, LIVE
from deploy_exact_live_bundle import paths_from_manifest

ROOT = Path(__file__).resolve().parents[1]
BASE_SHA = 'b6ba10afbdc92fb193abb5087c4f585943392c4ea0190634e6e9b01c11ec17b9'
APPROVED_SHA = '104e7a7f829725cb628cd39acd548ed88a7faf91620dfc7bdd6cc9447f5165e7'
TRACKER_SHA = '168de1bb477fd7fa79c7b9fd289ba80a9bde230ce073684aed0acf71ae996f80'
TARGET = 'assets/experience.js'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def approved_replacement(original, updated):
    if sha(original) != BASE_SHA or sha(updated) != APPROVED_SHA:
        raise ValueError('Unreviewed original or approved rotation source')
    marker = b'// Tits McGee novelty link:'
    stop = b'function openForTheBoys(event)'
    for data in (original, updated):
        if data.count(marker) != 1 or data.count(stop) != 1:
            raise ValueError('Unexpected rotation structure')
    start, end = original.index(marker), original.index(stop)
    expected = original[:start] + updated[updated.index(marker):updated.index(stop)] + original[end:]
    if updated != expected:
        raise ValueError('Approved source changes unrelated code')
    return expected

def inventory(site):
    if any(p.is_symlink() for p in site.rglob('*')):
        raise ValueError('Symlinks are not allowed in release bundles')
    return {p.relative_to(site).as_posix(): sha(p.read_bytes())
            for p in site.rglob('*') if p.is_file()}

def stage(audit, approved, output, paths):
    report = json.loads((audit / 'comparison.json').read_text())
    rows = report['results']
    if (report['snapshot'] != SNAPSHOT or report['errors'] or report['differences']
            or report['paths_checked'] != len(paths)
            or len(rows) != len(paths)
            or sorted(r['path'] for r in rows) != sorted(paths)):
        raise ValueError('Incomplete or mismatched live audit')
    expected = {r['path']: r['live_sha256'] for r in rows}
    if any(not r.get('equal') or r['snapshot_sha256'] != r['live_sha256'] for r in rows):
        raise ValueError('Live content differs from the pinned snapshot')
    before = inventory(audit / 'live')
    if before != expected or inventory(audit / 'snapshot') != expected:
        raise ValueError('Audited bundle was altered or has unexpected paths')
    if before['sanks-tracker.js'] != TRACKER_SHA:
        raise ValueError('Current production tracker changed')
    replacement = approved_replacement((audit / 'live' / TARGET).read_bytes(), approved.read_bytes())
    if output.exists():
        raise ValueError('Use a fresh output directory; existing files will not be deleted')
    shutil.copytree(audit / 'live', output)
    (output / TARGET).write_bytes(replacement)
    after = inventory(output)
    changed = sorted(p for p in before if before[p] != after.get(p))
    if before.keys() != after.keys() or changed != [TARGET]:
        raise ValueError('Release modifies files outside the approved rotation')
    subprocess.run(['node', '--check', str(output / TARGET)], check=True)
    release = {'snapshot': SNAPSHOT, 'live': LIVE, 'files': len(before), 'changed': changed,
               'before': before, 'after': after,
               'publish_authorized': False,
               'remaining_gate': 'Authenticated Cloudflare inventory, routing, bindings and rollback review'}
    (audit / 'release.json').write_text(json.dumps(release, indent=2) + '\n')
    print(f'PASS: {len(before)} known paths preserved; only {TARGET} changed. Account review still required.')
    return release

def main():
    stage(ROOT / 'work/rotation-audit', ROOT / 'approved-update/assets/experience.js',
          ROOT / 'work/site', paths_from_manifest())

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError) as error:
        raise SystemExit(f'ABORT: {error}')
