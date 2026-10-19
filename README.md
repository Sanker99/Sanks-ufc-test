# SANKS Research Lab

V5 athlete profiles, same-sport comparisons, full-page UFC matchups, validation results and separate-preview deployment instructions: [README-V5.md](README-V5.md). V5 development is isolated on `codex/sanks-v5-athlete-pages`.

NFL: original static dashboard and scheduled NFL/injury refresh preserved.

UFC: public UFCStats HTML collector with no API key, publishing `data/ufc-data.json`. Run from the repository root: `pip install requests beautifulsoup4` then `python scripts/build_ufc_data.py --max-fighters 60 --delay 0.8`. The GitHub Actions workflow `Update UFC research data` can be started manually.

**Status:** Collector code passes local syntax checks, but live UFCStats access was unavailable in the build environment, so live collection is not verified. UFCStats may challenge automated access. An unsuccessful run does not overwrite the existing dataset. Upcoming cards are not implemented in this package. The NFL module should be tested after deployment.

Do not use the UFC tab as a live source until a GitHub Actions run confirms it has published actual fighter profiles.
