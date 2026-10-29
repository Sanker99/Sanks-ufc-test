"""Read-only comparison of every saved manifest path; never authorizes deployment.

This cannot detect extra files, Pages Functions, redirects, or account bindings.
Authenticated Cloudflare inventory review remains required before publication.
"""
import concurrent.futures
import json
import urllib.parse
from pathlib import Path
from deploy_exact_live_bundle import paths_from_manifest, request_bytes, normalize_index, digest

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = 'https://da2507d2.sanksresearchlab.pages.dev/'
LIVE = 'https://sanksresearchlab.pages.dev/'

def main():
    paths = paths_from_manifest()
    out = ROOT / 'work' / 'rotation-audit'
    out.mkdir(parents=True, exist_ok=True)
    def compare(rel):
        bodies = []
        for name, base in [('snapshot', SNAPSHOT), ('live', LIVE)]:
            raw = request_bytes(base + urllib.parse.quote(rel, safe='/'))
            if rel == 'index.html':
                raw = normalize_index(raw)
            dest = out / name / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(raw)
            bodies.append(raw)
        return {'path': rel, 'snapshot_sha256': digest(bodies[0]),
                'live_sha256': digest(bodies[1]), 'equal': bodies[0] == bodies[1]}
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(compare, rel): rel for rel in paths}
        for future in concurrent.futures.as_completed(futures):
            try:
                results.append(future.result())
            except Exception as error:
                results.append({'path': futures[future], 'error': str(error)})
            if len(results) % 100 == 0:
                (out / 'comparison-progress.json').write_text(json.dumps({'complete': False, 'checked': len(results), 'results': results}, indent=2) + '\n')
                print(f'Compared {len(results)}/{len(paths)} saved paths', flush=True)
    results.sort(key=lambda row: row['path'])
    report = {'snapshot': SNAPSHOT, 'paths_checked': len(results),
              'differences': [r for r in results if r.get('equal') is False],
              'errors': [r for r in results if 'error' in r],
              'complete_account_inventory_verified': False, 'results': results}
    (out / 'comparison.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'results'}, indent=2))
    if report['errors'] or report['differences']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
