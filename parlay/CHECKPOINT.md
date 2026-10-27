# Parlay tracker checkpoint
Updated October 27, 2026.

## Workspace and publication
- Source: Sanker99/Sanks-ufc-test, feature/parlay-tracker-v4.
- Base: feature/for-the-boys-rotation at 6d44d2c17df1df02265aeb3e128293b1bd12b1ba.
- Draft PR: https://github.com/Sanker99/Sanks-ufc-test/pull/4 .
- Feature preview: https://feature-parlay-tracker-v4.sanks-ufc-preview.pages.dev/parlay/ .
- Production and Command Center were not changed. Do not merge or deploy production without authorization.
- Original brief: Sanker99/-sanks-research-lab#2. The source destination above was explicitly approved after matching the live app.
- Keep private runtime diagnostics and browser records out of commits and repository documentation.

## Completed
- Browser-local Tesseract OCR, conservative roster matching, category/target parsing, multi-image deduplication and review safeguards.
- Manual player/team search, props and moneylines, named drafts, Confirm All, immutable locking and browser persistence.
- Validated backup restore, conflict/duplicate checks and import-count reconciliation.
- Compact high-tech sports styling, accessible red/green stat bars and expandable source/check details.
- Local Tuesday–Monday game-week defaults with editable per-leg game choices. Explicit saved games and dated imports are preserved.
- Reopening a missing-game draft uses its creation week; new imports use the current week.
- Draft cards explicitly require review/lock and do not display empty tracking bars.

## Experimental source integration
- Extends the Lab's existing ESPN source, with no new signup, key, subscription or production change.
- /api/parlay/game validates event/season/date/matchup and exact athlete references.
- Generated identities cover 272 games and 1,621 players; 29 unmapped identities remain unavailable.
- Positive activity counts establish participation. Missing/failed source data does not become zero.
- Primary summary reports provide numeric props and team scores. Structured source categories keep passing TDs separate.
- Scoring-event touchdown coverage requires unique game/team-scoped source-name-to-ID resolution, complete monotonic scoring progression and agreement with both scoreboard totals.
- Core athlete-stat requests denied by the source remain errors; no proxy/hostname/header bypass. Denials are cached as errors, not stats.
- Regional Cloudflare source caching/coalescing; bounded calls, input/body/timeout limits, fixed destinations and rejected redirects.
- Active/visible-only grouped polling: live reports 30 seconds, reported finals five minutes. Corrections remain reversible.
- Final verification and automatic settlement stay disabled. Permission and sustained live reliability remain unresolved.
- Regenerate identities: python parlay/tools/build-live-identities.py path/to/downloaded/games.csv .

## Validation and remaining work
- 119 parlay tests, 71 existing JavaScript tests and 18 Python tests pass locally: 208 checks.
- Actual Cloudflare summary retrieval and warm-cache reuse were observed. Final scoring-event deployment verification is pending this checkpoint update.
- Source failures preserve saved results. The client updates locked selections only; user review/lock remains required.
- V5 CI encountered an unrelated missing approved image URL. Fixture restore permits only a same-SHA256 fallback to the existing public Lab deployment for HTTP404/410, never for denied access.
- Finish exact-head CI and deployed scoring-event/browser verification. Preserve sources and report any genuine external limitation honestly.
