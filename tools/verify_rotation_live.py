"""Verify every reviewed file byte; stop for rollback review on mismatch."""
import concurrent.futures
import json
import urllib.parse
from pathlib import Path
from deploy_exact_live_bundle import request_bytes, normalize_index, digest

ROOT=Path(__file__).resolve().parents[1]
LIVE='https://sanksresearchlab.pages.dev/'

def compare(expected):
    def check(item):
        rel,wanted=item
        try:
            raw=request_bytes(LIVE+urllib.parse.quote(rel,safe='/'))
            if rel=='index.html':raw=normalize_index(raw)
            return rel if digest(raw)!=wanted else None
        except Exception:
            return rel
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        return sorted(p for p in pool.map(check,expected.items()) if p)

def main():
    report=ROOT/'work/rotation-audit'
    release=json.loads((report/'release.json').read_text())
    failures=compare(release['after'])
    result={'checked':len(release['after']),'failed_paths':failures,'rolled_back':False}
    result['rollback_required']=bool(failures)
    (report/'live-verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    if failures:raise SystemExit('Release verification failed; inspect current deployment and execute the documented rollback')

if __name__=='__main__':main()
