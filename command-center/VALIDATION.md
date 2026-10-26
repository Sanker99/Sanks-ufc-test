# Validation record — October 26, 2026

Base: `Sanker99/Sanks-ufc-test`, `feature/for-the-boys-rotation`, commit `6d44d2c17df1df02265aeb3e128293b1bd12b1ba`.

| Check | Result |
|---|---|
| Command Center automated tests | 30 passed, 0 failed |
| Existing public JavaScript suite | 71 passed, 0 failed |
| Existing Python suite | 18 passed, 0 failed |
| SQL migration | Executed against real SQLite in the D1 API test adapter |
| Valid signed Access JWT | Accepted by both security module and built Worker |
| Missing/forged/expired/wrong issuer/audience JWT | Denied |
| Admin HTML, JS, CSS, map, reports and health | Denied by default on main/preview-host test requests |
| Public request passthrough | Passed |
| Built admin content available after authorization | Passed |
| Admin mutation requests | 405 with authorization; 403 without it |
| Map geometry | 51 finite state/DC SVG paths; focus displays stored counts |
| Visitor identity initialization | Tracker serializes page/feature requests before cookie continuation |
| Collection limits | Browser/minute and site/day budgets verified; capped-day flag verified |
| Source static package | 3,623 files staged by the existing packaging tool |
| Complete integration build | Generated protected Worker and routes with current public static export |
| Generated Worker / tracker / dashboard JavaScript syntax | Passed |
| Public application code/data diff | None; generated HTML adds only the deferred tracker tag |
| Existing photo/flag/helmet checks | Passed after restoring approved assets and verifying hashes |
| Existing CI fixture setup | Restores ignored helmets using approved hashes before public-site tests |
| Desktop/mobile browser rendering | Unverified; browser launch/initial navigation blocked or timed out |
| Cloudflare Access policy | Unverified; no account connection |
| Existing automatic raw preview | Detected during PR publication; denial-only root guard added; earlier immutable snapshots require owner deletion |
| Live D1 bindings, ingestion and request.cf geography | Unverified; no production deployment performed |
| Authorized browser load under approximately 5 seconds | Unverified; requires test deployment and browser measurement |
| Historical Cloudflare analytics recovery | Unavailable without account access |

These are local results, not a claim of Cloudflare deployment acceptance. Unit tests use synthetic, explicitly local test fixtures; no test traffic or example totals are embedded in the deployed dashboard. Production reports remain empty/unavailable until real collection succeeds.

No existing sports UI, sport calculation, published dataset, production configuration, refresh/deployment target, or production workflow trigger was modified. The sole existing workflow change prepares missing approved helmet fixtures for its current test suite. A new validation workflow has no deployment job.

Password update: eight additional tests validate configuration denial, opaque secure sessions, wrong passwords, verifier replay denial, expiry/rotation, CSRF-safe logout, throttling and missing auth migration. The built-Worker test also verifies that the local setup helper generates a matching credential pair and that anonymous assets/APIs remain denied. Cloudflare Access signup was declined by the owner; real-edge password login remains gated pending owner secrets.
