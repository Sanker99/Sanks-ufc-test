# SANKS production workflow

The complete authoritative application is the `production/verified-site` branch,
inside `production-site/`. Never upload the repository root or rebuild production
from `main` or a legacy application branch.

Production now uses deployment `4f1ba1aa-4823-4759-8349-17b66b873a48`, sourced from
commit `651200bba9e2c20a7553f8459d606982e1abda92`.
The previous exact baseline is commit `67cc287` in that branch and Cloudflare
deployment `da2507d2-bc4d-4cd0-8532-62d8deb8b328`.
The approved release changed only `assets/experience.js`; all 3,632 live files
passed complete post-publication hash verification.

## Future updates: develop, test, approve, promote

1. Branch from `production/verified-site`. Edit only the intended files under
   `production-site/`. Use the manifest helper from main:
   `python promotion-tools/update_manifest.py /path/to/source-checkout`.
   Commit the source and updated manifest. The full source SHA is the candidate.
2. Run **Promote verified production bundle** from **main**, target **test**.
   Enter the full candidate SHA and exact comma-separated changed paths relative
   to `production-site/`. Empty paths are allowed for a no-change verification.
3. Review the isolated preview and successful test run. The preview branch is
   `review-<first 12 SHA characters>` on `sanksresearchlab-test`, so scheduled
   test data refreshes cannot replace the candidate under review.
4. Approve by running the same workflow from **main**, target **production**,
   supplying that successful test run ID. Production downloads the exact tested
   bundle; it does not check out or rebuild a different application branch.
5. After success, fast-forward `production/verified-site` to the deployed candidate
   commit when it is a descendant. Keep the full deployed SHA from the receipt
   as the precise release identifier. Never force-push over other work.

The production promotion refuses a stale baseline, changed account settings or
asset inventory, a different artifact, unapproved changed paths, or a Functions /
routing mode change. Both test and production verify every static file. A failed
production content check rolls back only if the current deployment still belongs
to that release, then verifies the restored bytes. Artifacts expire after 30 days;
retest an older candidate rather than bypass the gate.

The workflow on main is trusted release infrastructure. The complete application
source is the dedicated branch. Root `main/index.html` remains historical and is
not a production build source. Two old default-branch production publishers are
retained but disabled. Historical runs/old workflow revisions are not a supported
release path; never rerun them. No branches or Cloudflare projects were deleted.

## Environment map

| Environment | Cloudflare project | Source / behavior |
| --- | --- | --- |
| Live Lab | `sanksresearchlab` | Exact verified static bundle; no Functions worker |
| Scheduled test Lab | `sanksresearchlab-test`, main deployment | Existing data refresh on `codex/11-task-improvements-2026-10-20` |
| Candidate test | `sanksresearchlab-test`, review-SHA preview | Immutable candidate, isolated from refresh |
| UFC Git preview | `sanks-ufc-preview` | Git-linked, production branch `preview/universal-search-v4`; other branches are previews |
| Production Command Center | `sanks-command-center-production` | Independent Functions worker and ANALYTICS D1 binding |
| Command Center test | `sanks-command-center-test` | Independent test worker and binding |

The live Lab ADMIN link and analytics endpoint point to the separate production
Command Center. Neither its worker, database, binding values nor authentication
secrets were changed by the rotation release. The previous release failed because
a stale reconstruction pinned the old tracker while other publishers assembled
different mutable branches. The new source preserves all production bytes and
promotes a single tested artifact.

Authenticated audit runs: 40797752085 (all known paths), 40798051863 (complete
account inventory/topology), 40798334479 (sanitized redaction check).
Production release: 40798605489. Its rollback step was not needed.
