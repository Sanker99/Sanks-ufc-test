# Production release status and required evidence

Production is authoritative. Neither `main` nor a source branch is a complete,
verified replacement. Do not merge this draft or run a legacy production publisher
until Cloudflare inventory, functions, routing, bindings and source triggers are
reviewed. The current account is not authenticated in the agent browser.

## Confirmed findings

The successful tracker workflow run 40765826742 published snapshot `da2507d2`
on 2026-10-28 at 20:45 UTC. The live tracker SHA-256 is
`168de1bb477fd7fa79c7b9fd289ba80a9bde230ce073684aed0acf71ae996f80`.
The previous snapshot `3492da57` contains an older tracker. The current index,
release metadata and experience script match both snapshots in the initial
four-file checks. Full manifest comparison is a separate required check.

The approved experience source is pinned to commit
`b52e2ed7786b9bbe0cf2a38f533b8448842c0790`; the original is pinned to
`6d44d2c17df1df02265aeb3e128293b1bd12b1ba`. The release stages only the
rotation block, verifies both complete script hashes, and preserves the current
tracker byte for byte. Tests use an isolated VM without network or navigation.

## Environment and workflow map

| Workflow / environment | Source | Destination | Trigger / concern |
| --- | --- | --- | --- |
| Production Lab | Published Cloudflare snapshot | `sanksresearchlab` | Authoritative until complete source is established |
| `deploy-cloudflare-production.yml` | `codex/11-task-improvements-2026-10-20` plus Command Center branch | `sanksresearchlab` | Manual; can overwrite newer production features; do not run |
| `deploy-exact-live-tracker.yml` | `main` plus Command Center branch | `sanksresearchlab` | Manual; old baseline; do not rerun |
| `deploy-approved-rotation-production.yml` | Trigger commit plus immutable approved source commits | `sanksresearchlab` | Manual; blocked until account preservation review is recorded |
| `deploy-cloudflare-test.yml` | `codex/11-task-improvements-2026-10-20` | `sanksresearchlab-test` | Every :17/:47, manual, or workflow-file push on main; can overwrite a temporary test rotation |
| `deploy-command-center-production.yml` | `feature/sanks-command-center` | `sanks-command-center-production` | Manual on main; defaults to provision only |
| `deploy-command-center-test.yml` | Application branch plus Command Center branch | `sanks-command-center-test` | Manual on Command Center branch |
| `deploy-design-preview.yml` | Trigger branch | `sanksresearchlab-test` branch preview | Design branch pushes/manual; not present on main |
| `import-batch-test.yml` | Trigger branch plus approved release packages | `sanksresearchlab-test` | Workflow-file push/manual; imports into development branch |
| UFC data updates | Trigger branch | Git data only | Manual on main; not direct production publishers |
| UFC preview | Not yet authenticated / established | `sanks-ufc-preview` | Inspect Cloudflare Git source before touching main |

No branch or project has been deleted. Legacy publishers remain unchanged while
account review is incomplete. Workflow names on non-default branches do not by
themselves establish that GitHub schedules them; inspect the registered workflows.

## Why the old release failed

The tracker-only release advanced production while the rotation release still
expected the old tracker hash. Its helper also silently replaced the tracker from
a mutable branch. Four mutable branches and two independent production publishers
made it possible to stage a mixture of unrelated versions. The test data refresher
also republishes its own branch, so a successful temporary test does not establish
what the next test or production build contains.

## Remaining publish gate

Authenticated review must record the full current deployment UUID, exact inventory
(including non-public configuration), static/functions mode, routing, bindings,
rollback availability and Git deployment triggers. Never infer completeness from
file count or an HTTP 200 (SPA fallback can return index HTML for missing assets).

`tools/check_rotation_account.py` reads sanitized account metadata through existing
GitHub Actions secrets. Publish mode requires a reviewed file at
`.github/deployment-manifests/rotation-account-review.json`, with the exact current
UUID, configuration fingerprint and SHA-256 of the sorted complete baseline hash
map, plus explicit preservation checks. This file is intentionally absent until
actual account review is completed. Do not fabricate it to unblock publication.

The audit downloads every path from the saved manifest from both snapshot and live
hosts. The stage verifies all bytes against the audit and emits a full before/after
hash map. Its only allowed change is `assets/experience.js`. A successful known-path
audit still cannot establish that there are no extra account assets or Functions.

## Intended repeatable workflow (pending account review)

1. Capture the complete verified production artifact, hash inventory, source commit,
   account settings fingerprint and rollback deployment ID as an immutable release.
2. Develop from that full source, not the incomplete main branch. Keep Command Center
   as an explicit pinned dependency and retain its independent project/bindings.
3. Deploy an immutable candidate to an isolated test deployment. Record browser and
   automated results against that exact artifact. Scheduled data refreshes must not
   replace the candidate being approved.
4. Promote the same tested artifact after approval and a current-baseline check.
   Use the shared `sanks-production-publish` lock and recheck the live deployment ID
   immediately before publication. Do not rebuild from another branch at promotion.
5. Verify the complete live hash inventory, routing, analytics, Command Center and
   tracker, plus the NFL/NCAA/UFC/search browser matrix. Roll back on regression.
6. Only after this path is proven, make legacy production workflows fail closed and
   document the authoritative source branch/artifact in main. Check Cloudflare Git
   auto-deployment before changing main; it may publish a separate preview project.

## Rollback

Record the full pre-release production UUID from authenticated Cloudflare, verify
that it is rollback eligible, and retain its full exact bundle. If verification fails,
use Cloudflare's deployment rollback for `sanksresearchlab` to that UUID. Verify the
restored index, tracker, experience script and complete inventory. Never deploy an
old Git branch as rollback. The prefix from Actions logs is evidence, not a substitute
for the authenticated current full UUID or rollback eligibility check.
