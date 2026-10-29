# Production release completed

Production deployment: `4f1ba1aa-4823-4759-8349-17b66b873a48`  
Deployed application source: `651200bba9e2c20a7553f8459d606982e1abda92`  
Complete source: `production/verified-site` branch, `production-site/` directory  
Rollback deployment: `da2507d2-bc4d-4cd0-8532-62d8deb8b328`  
Original complete baseline commit: `67cc287` (parent of the approved application release)

## Production and preservation evidence

The approved 19-destination persistent rotation is deployed. The original and
approved experience files were pinned by full commit and SHA-256. The change was
restricted to the approved rotation block. No destination content was opened,
downloaded or inspected.

Cloudflare's authenticated asset manifest matched all 3,632 saved paths exactly.
The old saved snapshot differed at the tracker: the newer tracker-only release
had already advanced production to da2507d2. The release retained that newer
tracker, rather than replacing it with the outdated baseline or a mutable branch.

All 3,632 snapshot-versus-live files matched before deployment. The staged release
changed only `assets/experience.js`. All 3,632 deployed files passed full
post-publication SHA-256 verification; no unexpected file additions/removals or
content differences were detected. Account inspection confirmed a static Lab
deployment without Functions; the Command Center is an independent worker project.
Bindings and project configuration were preserved.

Browser checks after publication rendered NFL games, an NFL player profile and
weekly graph, NFL Streak Finder, NCAA games, UFC events and event details, fighter
comparison, fighter profile and navigation. Player search was exercised before
publication and its source remained byte-identical. The production ADMIN link
resolved to the Command Center login page. An authenticated admin session and
end-to-end parlay operations were not exercised; no claim is made that those
authenticated workflows were tested. Their production assets and independent
deployment were not changed by this release.

The six focused rotation/staging tests passed. Three promotion safety tests also
passed. Rollback was prepared and guarded but was not needed or executed.

## Workflow repair and validation

The former publishers assembled different mutable branches; main was incomplete.
A stale tracker hash then prevented the prepared rotation release. The release
also called a helper that replaced the tracker as a side effect.

The full original production snapshot and approved update are now durable
consecutive commits in the dedicated complete source branch. Main contains the
trusted promotion infrastructure, not the application build source.

The supported workflow is **Promote verified production bundle** on main:
development from the complete source → isolated SHA-specific test preview →
owner approval of the successful test run → promotion of that exact artifact.
It rejects unexpected changed paths, stale production, different account settings,
changed inventories, and routing/Functions changes. It verifies every published
file and supports a guarded rollback on content-verification failure.

The isolated test run succeeded, checked all 3,632 preview files, and retained the
exact artifact. A separate read-only validation loaded that actual artifact and
passed the production preparation gate without a second production deployment.
Legacy Lab publishers on main, the release branch, and the verified source branch
were quarantined as applicable. The successful one-time publisher was retired.
No branch or Cloudflare project was deleted.

| Evidence | Run |
| --- | --- |
| Authenticated baseline and full file comparison | 40797752085 |
| Complete sanitized Cloudflare topology/inventory | 40798051863 |
| API secret-redaction confirmation | 40798334479 |
| Successful production release and all-file verification | 40798605489 |
| Successful isolated artifact test | 40799233068 |
| Successful actual-artifact production preparation, no deploy | 40799850106 |

A temporary broad diagnostic artifact was removed; its replacement retained only
sanitized fields and the public asset manifest. API secret values were confirmed
redacted. No credentials were changed.

See `PRODUCTION-WORKFLOW.md` for the environment map and future release steps.
No owner action is required for this completed deployment.
