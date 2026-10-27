# Experimental NFL statistics integration
Updated October 27, 2026.

## Scope
The feature preview extends the main Lab's existing ESPN connection without new accounts, API keys or paid services. It is experimental: access success does not establish a vendor license, sustained reliability or sportsbook settlement equivalence. The public source terms remain unresolved:
https://disneytermsofuse.com/english/ .

No production or Command Center changes were made. Raw user images, OCR/account information, browser records and private runtime diagnostics must not be published.

## Source and identity contract
The Pages route /api/parlay/game accepts only allowlisted schedule IDs and bounded player-ID detail requests. It constructs fixed ESPN summary/core destinations rather than accepting arbitrary source URLs. Redirects are not followed. It validates exact event ID, season, game date, home/away teams and core athlete/competition/competitor references.

live-identities.mjs was generated from the Lab's existing roster, athlete-content metadata and the public nflverse schedule. It contains 272 game joins and 1,621 exact ESPN/GSIS player joins; 29 missing mappings remain unknown. The identity helpers reject collisions and matchup/date disagreement.

Regenerate with:
python parlay/tools/build-live-identities.py path/to/downloaded/games.csv

Upstream identity/schedule references:
- https://github.com/nflverse/nflverse-data/releases/download/players/players.csv
- https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv

## Statistics
Passing, rushing and receiving fields are mapped within their source category. A shared label such as TD is never mapped globally. Completions/attempts split from the explicit passing pair. Combined rushing/receiving yards requires both components.

Participation requires positive reported activity such as attempts, carries, receptions/targets, returns or tackles. Mere row presence, missing rows and zero-only rows do not prove participation. Explicit zero values can be used only with participation evidence.

Touchdowns scored exclude passing touchdowns. Core fields use totalScoringTouchdowns or totalTouchdowns minus passingTouchdowns, with exact source references. Cloudflare access to the separate core endpoint was denied during runtime verification; the integration does not bypass that denial and caches denied requests as errors.

The accessible summary also reports scoring events. Their explicit full scorer names are resolved only against unique ID-bearing players on the scoring team within that same event; there is no fuzzy/global name matching. Every scoring event must have a unique ID, monotonic scores, allowed point delta and scoring-team agreement. The sequence must finish at both reported scoreboard totals. Unknown/ambiguous scorers or incomplete/inconsistent sequences withhold touchdown coverage. Passing scores credit the receiving scorer, not the passer; conversions do not create extra touchdowns.

These are provisional reported statistics, not independent settlement adjudication. Final flags from the source do not enable automatic Won/Lost settlement.

## Caching and failures
Source reads have eight-second deadlines and two-megabyte response limits. Player detail count and concurrency are bounded. Cloudflare cache entries retain their original observedAt; concurrent identical reads coalesce. Cache scope is a Cloudflare data center, not a worldwide single-request guarantee.

Live reports cache for 30 seconds; reported finals cache for five minutes. Denied athlete endpoints are cached as errors for an hour. Invalid, redirected, oversized and failed responses do not become observations. Errors are sanitized. The client backs off after failed/rate-limited reads and preserves prior saved values.

## Client behavior
Polling runs only while the Active view is visible. Requests are grouped by game. Locked selections receive timestamp-ordered result updates, and newer corrections can reverse prior bars. Partial/empty/older batches retain unaffected observations. Stat-detail expansion survives rerendering.

Drafts do not begin tracking or display empty tracking bars. They require reviewed game choices, confirmation and locking. Explicit saved games remain unchanged; missing games in reopened drafts use the draft's creation week rather than shifting overnight.

The UI identifies ESPN as experimental and results as provisional. /api/parlay/health reports the experimental connection separately from disabled final settlement. Do not insert fabricated examples into application observations.

## Evidence
Local validation: 119 parlay tests, 71 existing JavaScript tests and 18 Python tests passed (208 checks). Coverage includes identity/date mismatches, explicit zero versus absent participation, scorer versus passing TDs, scoring completeness/ambiguity, source-cache behavior, body/redirect/429/403 failures, polling visibility/cadence/grouping, preserved results and correction reversal.

Actual Cloudflare summary access returned HTTP200. One cold/warm pair measured 879/173 ms with an unchanged observedAt on reuse. These are individual access/cache observations, not an uptime or update-frequency guarantee. The core athlete source returned HTTP403 and was left inaccessible. Final deployed scoring-event verification is recorded after publication.

A V5 CI preparation step encountered HTTP404 for an existing approved helmet fixture. The restore helper may fetch the exact same approved asset from the owner's existing public Lab deployment for missing/gone source URLs only; the original SHA256 must match. Denied responses are not routed through this fallback. Targeted restoration/hash/denial checks passed.

## Provider alternatives already reviewed
- nflverse player totals update after games on its documented schedule, not as a continuous live player feed: https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html .
- Sleeper documents a free non-commercial read-only API for league/roster/state data, not the full live-player-stat contract required here: https://docs.sleeper.com/ .
- New provider signup was excluded by the owner. Do not repeat account/key signup requests without changed instructions.

## Deployment caveat
This feature uses file-based Pages Functions and no root advanced-mode _worker.js. A future advanced-mode Worker must explicitly compose these routes. Static source packaging is distinct from deploying the Functions runtime.
