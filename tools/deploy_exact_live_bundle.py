import base64
import gzip
import hashlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
LIVE = "https://sanksresearchlab.pages.dev/"
REVIEWED_DEPLOYMENT = "https://3492da57.sanksresearchlab.pages.dev/"
EXPECTED_COUNT = 3632
EXPECTED = {
    "index.html": "f6234202341baf8cb55f292bb2ac953d1eee79b2b729bd51a1a6d95b8b0d61e1",
    "sanks-tracker.js": "2c6982f3aaea9eb73fffadb126a49897938ad44774785b1407028a9350584319",
    "data/release.json": "d90378881f74e9574a4035b6963b36acef36c2bace18f4c4bf900ecfa97406fd",
}
BEACON = re.compile(
    rb"<!-- Cloudflare Pages Analytics --><script\b[^>]*\bsrc=['\"]"
    rb"https://static\.cloudflareinsights\.com/beacon\.min\.js['\"][^>]*>"
    rb"</script><!-- Cloudflare Pages Analytics -->",
    re.IGNORECASE,
)
USER_AGENT = "SANKS-exact-live-bundle-deploy/1.0"


def request_bytes(url):
    for attempt in range(6):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"},
            )
            with urllib.request.urlopen(req, timeout=90) as response:
                if response.status != 200:
                    raise RuntimeError(f"{url} returned HTTP {response.status}")
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in (403, 408, 425, 429, 500, 502, 503, 504) or attempt == 5:
                raise
            time.sleep(min(2 ** attempt, 30))
        except Exception:
            if attempt == 5:
                raise
            time.sleep(min(2 ** attempt, 30))


def normalize_index(raw):
    normalized, removed = BEACON.subn(b"", raw)
    if removed > 1:
        raise RuntimeError("Unexpected duplicate Cloudflare analytics injections in index.html")
    return normalized


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def check_baseline():
    for base in (LIVE, REVIEWED_DEPLOYMENT):
        for rel, expected in EXPECTED.items():
            raw = request_bytes(base + urllib.parse.quote(rel, safe="/"))
            if rel == "index.html":
                raw = normalize_index(raw)
            actual = digest(raw)
            # The first approved tracker-only release changed this one live asset.
            # Keep its exact current hash as the live baseline while the immutable
            # reviewed deployment retains the original tracker hash in EXPECTED.
            live_expected = (
                "168de1bb477fd7fa79c7b9fd289ba80a9bde230ce073684aed0acf71ae996f80"
                if base == LIVE and rel == "sanks-tracker.js"
                else expected
            )
            if actual != live_expected:
                raise RuntimeError(
                    f"Production baseline changed at {base}{rel}; "
                    f"expected {live_expected}, got {actual}. No deployment was made."
                )
    print("Preflight passed: public production still matches the reviewed bundle.")


def paths_from_manifest():
    manifest_path = ROOT / ".github" / "deployment-manifests" / "sanksresearchlab-3492da57-files.txt.gz.b64"
    packed = base64.b64decode(manifest_path.read_text(encoding="ascii"), validate=True)
    paths = gzip.decompress(packed).decode("utf-8").splitlines()
    if len(paths) != EXPECTED_COUNT or len(set(paths)) != EXPECTED_COUNT:
        raise RuntimeError(f"Expected {EXPECTED_COUNT} unique paths; found {len(paths)}.")
    for rel in paths:
        path = PurePosixPath(rel)
        if path.is_absolute() or ".." in path.parts or "\\" in rel or not rel:
            raise RuntimeError(f"Unsafe path in deployment manifest: {rel!r}")
    if not {"index.html", "sanks-tracker.js", "data/release.json"}.issubset(paths):
        raise RuntimeError("Manifest is missing a required production file.")
    return paths


def download_bundle():
    check_baseline()
    paths = paths_from_manifest()
    output = ROOT / "work" / "site"
    if output.exists():
        import shutil
        shutil.rmtree(output)
    output.mkdir(parents=True)

    def download(rel):
        raw = request_bytes(REVIEWED_DEPLOYMENT + urllib.parse.quote(rel, safe="/"))
        if rel == "index.html":
            raw = normalize_index(raw)
        target = output.joinpath(*PurePosixPath(rel).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        return rel

    completed = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(download, rel) for rel in paths if rel != "sanks-tracker.js"]
        for future in as_completed(futures):
            future.result()
            completed += 1
            if completed % 250 == 0 or completed == len(futures):
                print(f"Downloaded {completed}/{len(futures)-1} verified production assets.", flush=True)

    tracker_source = ROOT / "integration" / "sanks-tracker.js"
    tracker = tracker_source.read_bytes()
    required = (b"tits-mcgee-match", b"localStorage.removeItem('sanks-location-choice')")
    if any(marker not in tracker for marker in required):
        raise RuntimeError("Integration tracker is missing the approved search or consent update.")
    (output / "sanks-tracker.js").write_bytes(tracker)

    actual = sorted(path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file())
    if actual != sorted(paths):
        raise RuntimeError(
            f"Staged asset inventory differs from production manifest: "
            f"{len(actual)} files staged vs {len(paths)} expected."
        )
    check_baseline()
    print(f"Staged {len(actual)} production files; only sanks-tracker.js was replaced.")


def verify_live():
    staged = (ROOT / "work" / "site" / "sanks-tracker.js").read_bytes()
    for attempt in range(12):
        live_tracker = request_bytes(LIVE + "sanks-tracker.js")
        if digest(staged) == digest(live_tracker):
            break
        if attempt == 11:
            raise RuntimeError("Live tracker does not match the staged tracker.")
        time.sleep(5)
    live_index = request_bytes(LIVE)
    if b'<script defer src="/sanks-tracker.js"></script>' not in live_index:
        raise RuntimeError("Live Research Lab is missing the tracker loader.")
    if b'admin-link' not in live_index:
        raise RuntimeError("Live Research Lab is missing the existing ADMIN link.")
    print("Live verification passed: tracker, ADMIN link, and production page are present.")


if __name__ == "__main__":
    if "--preflight-only" in sys.argv:
        check_baseline()
    elif "--verify-live" in sys.argv:
        verify_live()
    else:
        download_bundle()



