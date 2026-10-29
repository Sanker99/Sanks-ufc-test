"""Stage the approved 19-link rotation without altering other production assets.

This release intentionally fails closed if the reviewed production baseline
or its experience.js differs from the approved source. No deployment here.
"""
from pathlib import Path
import hashlib
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "work" / "site"
BASE = ROOT / "approved-base" / "assets" / "experience.js"
APPROVED = ROOT / "approved-update" / "assets" / "experience.js"
TARGET = SITE / "assets" / "experience.js"

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    subprocess.run(["python", "tools/deploy_exact_live_bundle.py"], cwd=ROOT, check=True)
    original = BASE.read_bytes()
    current = TARGET.read_bytes()
    updated = APPROVED.read_bytes()
    if current != original:
        raise SystemExit("ABORT: reconstructed production experience.js does not match approved base.")
    marker = b"// Tits McGee novelty link:"
    stop = b"function openForTheBoys(event)"
    for name, data in (("base", original), ("approved", updated)):
        if data.count(marker) != 1 or data.count(stop) != 1:
            raise SystemExit(f"ABORT: unexpected {name} rotation structure.")
    start = original.index(marker)
    end = original.index(stop, start)
    replacement = updated[updated.index(marker):updated.index(stop, updated.index(marker))]
    expected = original[:start] + replacement + original[end:]
    if updated != expected:
        raise SystemExit("ABORT: approved update modifies code outside rotation block.")
    TARGET.write_bytes(expected)
    subprocess.run(["node", "--check", str(TARGET)], check=True)
    files = [p for p in SITE.rglob("*") if p.is_file()]
    if len(files) != 3632:
        raise SystemExit(f"ABORT: expected 3632 staged files, found {len(files)}")
    print(f"PASS: 3632 assets preserved; only assets/experience.js changed ({sha(original)} -> {sha(expected)}).")

if __name__ == "__main__":
    main()
