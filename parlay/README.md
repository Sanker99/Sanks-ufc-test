# SANKS Parlay Tracker

Development foundation for Issue https://github.com/Sanker99/-sanks-research-lab/issues/2. Open `/parlay/index.html` through a static server. The existing application links to it. `python tools/package_preview.py` includes its public files in the normal static export, excluding tests/tools/docs. No production deploy or merge is part of this change.

## Run validation

`node --test parlay/tests/*.test.mjs`

`node --test tests/*.test.cjs` (requires the existing approved ignored helmet files, as on the base branch)

`python -m unittest discover -s tests -p 'test_*.py'`

`python tools/package_preview.py`

The browser loads the existing `/data/data.json` roster and schedule. It preserves the source's player IDs, team and season; it does not infer historical team membership from the name alone. Games must be selected and verified by the user. Current snapshot availability is shown to the user. Unknown names/targets remain reviewable. Ambiguous names such as the two Justin Jeffersons never resolve silently.

Tesseract.js 6.0.1 is loaded on demand from jsDelivr; its worker/core/language downloads need network access on first use. Images remain on device. Up to ten PNG/JPEG/WebP files are processed sequentially with one worker, grayscale/contrast preprocessing and a 24-megapixel guard. Supported inputs include clear photographs, but perspective correction and guaranteed photo accuracy are not claimed. Pinning the top-level library does not vendor all transitive OCR assets. Privacy-sensitive/offline deployments should vendor these with their licenses and verify cache behavior.

## Data and settlement boundaries

Every imported leg requires explicit review, even if its name confidence is high. OCR numeric substitutions are never guessed. Bare numbers, price-only lines and conflicting targets remain unresolved. Player name, game, category, operator, threshold, team, season, confidence and verification status are saved; raw OCR text and images are not persisted. `gameId` is the existing schedule identifier, not an ESPN event ID; a source integration must maintain an explicit crosswalk.

`BrowserRepository` stores versioned JSON under `sanks.parlays.v1`. Drafts can be edited; locked selections cannot be edited through its API. Browser storage is origin-specific and does not sync devices; clearing site storage removes local history. Export is provided. Corrupt or unavailable storage fails visibly without resetting saved data. This is an account-free convenience store, not tamper-proof evidence of bets placed with a sportsbook.

`evaluateLeg` and `evaluateParlay` accept verified identity-scoped observations. Missing values never become zero. Live values and unverified finals stay provisional; current threshold satisfaction can reverse. All legs must resolve before a parlay settles. Postponement/DNP/unavailable data alone do not automatically void a selection: explicit confirmed settlement is required. `recordObservations` persists results and resolution day without allowing locked selection edits. Completed results remain Active through the stored timezone's resolution day, then appear in Won/Lost; all-void parlays stay Active and history is retained. The UI has no observation source enabled yet.

The pure ESPN mapper is deliberately disconnected from the UI. It uses exact externally supplied ESPN-to-GSIS IDs, validates game/season, maps group-specific labels, and omits missing values. Combined yards requires both component values. Anytime TD is withheld because passing TDs are excluded and return/recovery TD coverage and sportsbook rules need verification. `finalVerified` requires an explicit later verification decision. A final game flag alone is not evidence that all stat corrections or sportsbook settlements are complete.

See LIVE-DATA.md for source feasibility and CHECKPOINT.md to resume.
