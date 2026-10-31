# Demand-based NFL tracking — implementation and activation
Updated October 30, 2026.

## Status
The new branch implements shared demand registration, a serialized SQLite Durable Object collector, a quota manager, a conservative Big Balls adapter and the existing V4 card integration. It is NOT authenticated or live-game validated. The identity module is intentionally empty; unknown identities never match by name. No fake provider reports are loaded by the application.

Existing V4 preview and production must remain unchanged. This branch uses a NEW Pages project, sanks-parlay-demand-preview, and private Worker, sanks-parlay-demand-collector. The root Wrangler config belongs only to this isolated branch; do not copy it into the old V4 or production deployment.

## Provider contract
Official contract: https://bigballsdata.com/openapi.json
Base: https://api.bigballsdata.com
Authentication: server-only x-api-key.
- GET /v1/live-stats/american_football/{matchId}/players: documented Free game-level player groups.
- GET /v1/matches/{id}?sport=american_football: separate score and status check.
- Paid play-by-play is never requested. There is no ESPN or Sleeper fallback in the active routes.
- 250 requests/day until an authenticated X-RateLimit-Limit-Day: 500 response establishes the larger cap. No higher tier is enabled.
- Categories implemented against SIMULATED fixtures: passing yards/TDs/completions/attempts/INTs, rushing yards/carries/TDs, receiving yards/receptions/TDs, and rushing+receiving yards when both exist. Actual group-key compatibility still requires the first authenticated sample.
- Anytime TD remains unavailable: comprehensive scoring/return/recovery coverage has not been established. Quarter/clock are not invented.
- Missing fields and absent rows never become zero; participation needs reported activity.
- Terms permit site/dashboard display and derived outputs, not raw feed redistribution: https://bigballsdata.com/legal/terms . The Pages routes provide only tracker observations, omit provider IDs, expose no bulk/list/export surface and do not return raw provider payloads. Existing backups contain selection/result/progress records, not raw source responses. Do not turn these routes into a third-party data feed.

## Architecture and privacy
Browsers send only {games:[scheduleId,...]} to POST /api/parlay/demand, at most once per minute while the tracker is visible. Only unresolved legs of locked active cards register. No slip name, stake, image, player selection, IP or visitor/session identifier is retained in the registry. The backend assigns a 15-minute lease per game. Multiple visitors extend the same lease without storing individual activity. Closing the browser may leave collection running for the remainder of that lease; indefinite background tracking is not promised. Reopening resumes registration.

Pages forwards through PARLAY_FEED, a private Worker service binding. The Worker always addresses the same Durable Object name, nfl-free-budget-v1. Browser GET requests read its cached tracker projection; they never initiate provider requests. The Durable Object alarm is the sole scheduled collector. A serialized queue coordinates alarms and visitors. Quota reservations and next-attempt times are persisted BEFORE network I/O, including a recovery alarm, so crashes spend a slot rather than duplicate requests.

No D1/KV binding was present in the repository configuration reviewed. The actual Cloudflare account's existing bindings could not be inspected without authentication. SQLite Durable Objects are available on Workers Free; exceeding free infrastructure limits fails rather than enabling billing. Documentation:
https://developers.cloudflare.com/durable-objects/platform/pricing/
https://developers.cloudflare.com/durable-objects/api/alarms/
https://developers.cloudflare.com/pages/functions/bindings/

## Budget and scheduling
Every complete refresh costs TWO requests: match/status/score and player box score. Estimation includes all registered mapped games, including upcoming kickoffs, remaining estimated duration and final/retry reserves. The collector chooses three minutes, five minutes or a longer displayed interval. It does not poll before the verified kickoff. Live planning uses up to four hours per game, with a minimum half-hour allowance for overlong games.

The persisted cap defaults to 250, resets at UTC midnight and never exceeds authenticated 500. Minute coordination conservatively limits attempts to 80. Response day-cap/remaining/reset/Retry-After headers can further restrict usage. Use a dedicated provider key for this collector: unrelated consumers using the same key cannot be fully coordinated by its local counter.

Live traffic reserves eight shared requests plus six per active game. Each late/final game can use at most six reserved request slots per UTC day. Due games are served oldest-attempt first. Failures use exponential backoff, rate-limit headers can pause all requests, and authentication/denial errors pause for an hour. Exhaustion waits safely; the UI retains old observations and reports delay. Forecasts do not guarantee a three-minute cadence under arbitrary new demand.

A game needs two agreeing final match/box-score reports at least five minutes apart before finalResultsEnabled. One bounded correction check follows ten minutes later if its demand lease still exists. Corrections reopen verification; repeated matching finals stop collection. Postponed/canceled/suspended games stop and await verified schedule/settlement review. Missing/DNP/tied/unsupported legs remain unresolved under existing core rules. This is reported-stat verification, not sportsbook adjudication.

The cache keeps its original stat-cell timestamp. Stale data, source failures, unavailable identities and unavailable metrics cannot earn a green LIVE label. Locked selections/localStorage are unchanged. New preview origins have separate browser storage: export/restore is required to move the owner's existing cards, as before.

## Identity activation — developer work pending a key
workers/parlay-demand/identities.mjs is server-only and contains an empty version-1 manifest. After authenticated access, prepare and validate:
- games[scheduleId]: providerId, season, week, home, away, homeId, awayId, kickoff, verifiedAt, evidence.
- players[GSIS]: providerId, team, position, verifiedAt, evidence.

Game checks require exact season/week/catalog matchup, team UUIDs and kickoff/date agreement. Player UUIDs require an independently verified GSIS bridge and roster team/position. Names alone do not establish a mapping. Duplicate UUIDs, conflicting teams and ambiguous players reject configuration. Actual identifiers, availability and crosswalk coverage remain pending; the owner is not expected to manually map players.

BBS_IDENTITIES can override the module for a small validation sample, subject to Cloudflare's variable-size limits. For full coverage, build the verified manifest into the PRIVATE Worker module; do not put an oversized manifest in an environment variable or publish a raw provider dataset. The empty committed module must never be replaced by guessed/synthetic IDs in a deployment claiming real data.

## Deployment and owner-only actions
The branch workflow .github/workflows/test-demand-preview.yml tests, builds and attempts deployment using the repository's EXISTING CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. It targets only the new Worker/project/branch. It never installs a provider key or enables a paid plan.

If Cloudflare credentials are absent or lack the required Worker/Pages permissions, account access is needed to deploy. Existing secret values are never read or printed by this integration. No credentials should be pasted into chat.

Provider setup, when the owner is ready:
1. Open https://bigballsdata.com/pricing and create the permanently Free account/key; no card or paid plan. Connecting GitHub is optional.
2. In Cloudflare Workers & Pages, select ONLY sanks-parlay-demand-collector > Settings > Variables and Secrets. Add encrypted secret BBS_API_KEY with that key and deploy. Do not add it to browser code or the production Lab.
   CLI equivalent, from this branch: npx wrangler@4.156.0 secret put BBS_API_KEY --config workers/parlay-demand/wrangler.jsonc
3. After key configuration, the developer must capture a limited authenticated match/box-score sample through the budgeted collector, verify the account headers and identity bridge, prepare the private mapping manifest, and rerun activation/live-game checks. A key alone does not complete mapping or prove live tracking.

A fresh dedicated key is recommended so the persisted budget starts from known consumption. Never reset/recreate the coordinator or change its singleton name to reclaim quota. If migrating storage/key mid-day, conservatively carry forward consumed allowance or wait for UTC reset.

## Validation
- 155 tracker tests passed (133 retained baseline checks plus 22 new demand tests; two obsolete health-probe checks were replaced by the collector health contract).
- Coverage includes concurrent visitors/alarms, restart cache reuse, expiry, no early polling, missing credentials/mappings, quotas and headers, adaptive intervals, backoff, stale values, exact/ambiguous identities, missing/combined stats, shared players/cards, multiple games, moneylines, final agreement/corrections, postponement and unsafe destinations.
- Existing OCR text fixtures, manual-entry validation, locking, backup restore and persistence tests pass. A real image OCR engine/network test was not rerun.
- Worker dry-run succeeds; Pages Functions compile. Local Wrangler/SQLite runtime and service-bound Pages health route were exercised without any provider credentials.
- Local browser: player search, manual receiving prop, Confirm All & Track, unavailable-key display and locked-card persistence after reload were verified with an explicitly labeled local QA card.
- Authenticated provider sample and an actual live-game comparison: PENDING.

## First CI deployment attempt
All 155 tests and build checks passed on commit 6de2abdb07e197773fd885d1861bc115052b6cf8. Cloudflare denied the existing repository token access to the new Worker secrets resource (No access to the specified resource). The workflow can publish an explicitly unavailable-backend UI preview without a service binding if Pages access is permitted. This is not a deployed collector. Worker account access is an owner-only activation requirement.
