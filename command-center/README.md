# SANKS Command Center

Private analytics and operations dashboard for the existing Research Lab. This is **implemented and locally tested, but not approved for production deployment**. No production settings, public application source, refresh workflows, or live traffic were changed.

## Source and deployment investigation — October 26, 2026

- The requested issue is [Sanker99/-sanks-research-lab #1](https://github.com/Sanker99/-sanks-research-lab/issues/1). That private repository has only `main` and older root/experimental HTML. Neither matches the live site.
- The live site's published refresh ledger identifies `Sanker99/Sanks-ufc-test`. Its `feature/for-the-boys-rotation` branch at `6d44d2c17df1df02265aeb3e128293b1bd12b1ba` matches the live HTML; downloaded `assets/v5.js`, `ncaa.js`, `lab.js`, and `experience.js` also match after normalizing Windows line endings. This is the PR base. Do not replace the live site with either repository's `main`.
- `/data/release.json` still names an earlier test release (`codex/11-task-improvements-2026-10-20`, commit `2e34e15e7d5009690180d6831bfeb1485a617003`); it is not reliable evidence of the latest production code revision. The exact Cloudflare account deployment settings are **not accessible here**.
- The existing workflows target the separate `sanksresearchlab-test` project. Scheduled refresh/publish checks out the `codex/11-task-improvements-2026-10-20` branch. Existing documentation describes Direct Upload. None of these deployment or refresh workflows were changed or run. The validation-only V5 workflow now restores its previously ignored approved helmet fixtures before testing.
- Public sources include NFL/injuries, NCAA, UFC, cards, weather, availability, verification, and experience snapshots. The new monitor reads their published ledger rather than inventing upstream uptime or historical failure counts.
- No authentication or Cloudflare Web Analytics / Google Analytics beacon was found in the inspected public HTML/scripts. Account-level analytics settings and historical Cloudflare data remain unknown. If historical Web Analytics exists, view/export it in Cloudflare; do not combine its visitor definition with these cookie-based estimates. There is no fabricated historical import.

## What is implemented

`/admin` has Overview, Visitors, Site Activity, and System Health. It includes UTC calendar counts, six time ranges, equivalent-period growth when comparison coverage is available, daily/weekly/monthly/yearly history, distinct visitors, returning browsers, visits, pages per visit, a lazily imported Albers USA state map with AK/HI insets and keyboard focus, state rankings, international/unknown location, device/referrer breakdowns, sport leaderboards, recent activity, and source diagnostics.

The custom tracker observes existing hash navigation and public controls. NFL/NCAA athlete views, UFC fighter views, games, teams, conferences, statistics, stable UFC card/bout IDs, comparisons, all three Streak Finders, search/filter usage, and anonymous browser-error counts are supported. No raw search text, query strings, IP addresses, coordinates, error messages, or stack traces are stored. Names/IDs used as entities refer to sports content, not visitors. Categories without emitted data remain empty.

The app has no framework, external font, runtime chart dependency, or third-party map request. Admin HTML/CSS/JS and map data are embedded in the Worker and served only after authorization. They are not copied as public static admin files.

## Security model

- `ADMIN_ENABLED` must be exactly `true`; otherwise all admin routes return 403.
- Every `/admin`, `/admin/*`, `/api/admin`, and `/api/admin/*` request validates the signed Cloudflare Access JWT, fixed issuer, fixed application audience, RS256 algorithm, subject, issue time, expiration, and optional not-before time. A missing/malformed/forged token fails closed, including preview hostnames and direct asset/API requests.
- Public paths pass through the existing `ASSETS` binding. Collection is the only public API and accepts only bounded JSON POSTs from the exact configured production origin and same-origin browser context. Preview collection is disabled. Same-origin headers are an abuse filter, not proof of a human visitor.
- Reports use `no-store, private`; frame embedding and script execution from other origins are blocked. Inline styles are permitted for numeric chart/bar styling; inline scripts are prohibited.
- There is no server mutation/refresh endpoint and no hardcoded owner credential. GitHub's authenticated workflow UI remains the refresh control. Running a workflow can target a different branch/project; inspect its checkout/target before use.
- `__Host-sanks_v` is a random UUID in a Secure, HttpOnly, SameSite=Lax host cookie, retained up to 400 days. D1 stores a server-secret HMAC of that value. Do not rotate `ANALYTICS_SECRET` casually: rotation resets continuity of visitor estimates.
- Cloudflare's own operational logging is outside this application's storage policy.

## Counting and retention

Page views count initial public loads and recognized hash navigation. Feature events do not increment page views. Visitor totals count distinct anonymous browser identifiers across the chosen period; daily uniques are never added to produce period uniques. Visits use a 30-minute inactivity boundary, applied transactionally in D1. Returning means first observed before that visit's UTC day. Cookie deletion, browser privacy, multiple devices, shared browsers, blocked scripts and excluded privacy signals make these estimates incomplete.

“Active” means an event within five minutes, **not presence on a currently open page**. There is no heartbeat. Only the small indexed live report polls every 60 seconds while Overview is visible; full history is fetched on navigation/filter/manual update, not on every live poll.

Event detail is retained for 90 days and stale sessions for 24 hours; cleanup runs on collection. If collection stops, cleanup waits for the next event. Daily visitor/page-view records, the HMAC visitor first/last-seen ledger, and collection start metadata are retained for lifetime totals. This deliberate pseudonymous retention is necessary for those totals; it is not raw-IP storage. Monitor D1 size and export/compact before approaching the free database limit. An owner-requested purge must explicitly reset the lifetime coverage date and totals rather than imply complete all-time coverage afterward.

Per-browser collection is capped at 30 events/minute. A site-wide safety budget stops collection after 2,500 valid collection attempts per UTC day to limit free-tier consumption; attempts excluded by privacy/bot/schema checks do not consume it. The dashboard flags capped days as incomplete. This is a conservative application guard, not a guarantee against infrastructure quotas or deliberate abuse. Cloudflare request and D1 row-read/write quotas still apply. High-cardinality reports and lifetime uniqueness queries grow with retained data; review actual usage before increasing the budget or polling frequency. D1 quota failures stop collection/reporting; they never replace actual traffic with mock numbers.

Geography uses `request.cf.country` and `request.cf.regionCode` only. State and device groups can overlap for a browser and should not be summed as global visitors. Unknown country is ZZ; unknown state is `--`. Detail, visits, page-per-visit, sources, sport events and peak-hour breakdowns cover at most the retained 90 days, even for YEAR/ALL TIME. Lifetime/day history remains available. Equivalent-period comparisons are unavailable before tracking began or outside the detailed retention window.

## Build without changing the public app

Requires Node 24+. The application and tests have no install step or npm runtime dependencies.

1. Check out `feature/sanks-command-center` based on the verified production source branch.
2. Restore the existing approved photos, flags, helmets and full published data using the project's established asset process. Do not substitute `main` snapshots. Existing tests verify their hashes.
3. Stage a complete static export using `python tools/package_preview.py`; this prepares `work/v5-preview/site` without deploying. If production has since changed, obtain its current full export instead.
4. In a clean checkout run `node command-center/build.mjs work/v5-preview/site`. This creates `dist`. An optional third argument chooses another project-local output directory. The builder refuses an existing output or an existing source Worker, preventing silent overwrite of previous server behavior.
5. The builder copies all public files, adds only a deferred `/sanks-tracker.js` tag to the HTML, embeds protected admin assets in `_worker.js`, and writes `_routes.json`. Public sports code/data is otherwise untouched.
6. Run `node --test command-center/tests/*.test.mjs`, `node --test tests/*.test.cjs`, and `python -m unittest discover -s tests -p 'test_*.py'`.

Never upload the repository root or `command-center/ui` directly. Deploy only the generated static export with its `_worker.js` through Wrangler/Pages advanced mode. Dashboard drag-and-drop is not the approved path for this server-backed build. Existing test deployment workflows do not include this integration automatically.

## Minimum Cloudflare owner/account actions

These require account access unavailable to this session. Complete once, using a separate test Pages project first:

1. Confirm the actual project serving `sanksresearchlab.pages.dev`, its current source/deployment mode, and all custom/preview domains. Keep the public application public. Keep existing deployment credentials private.
2. Create a free D1 database and bind it as `ANALYTICS` in the test and eventual production environments. Use separate databases for testing and production. Apply `command-center/migrations/0001_analytics.sql`. Example CLI: `wrangler d1 execute sanks-command-center --remote --file=command-center/migrations/0001_analytics.sql`. It is idempotent. Use the database's actual name and correct account.
3. Add `ANALYTICS_SECRET` as an encrypted Pages secret containing at least 32 random characters. Configure exact `PUBLIC_ORIGIN`, `ACCESS_ISSUER`, and `ACCESS_AUD` using the example TOML as a reference. Do not commit a real database ID or secret in this example.
4. Create a Cloudflare Access self-hosted application with an explicit owner-email allow policy covering **both** `/admin` (and descendants) and `/api/admin` (and descendants) on the chosen hostname. Include custom domains. Do not add an allow-everyone or bypass rule. Use the application AUD and team issuer in the Worker configuration. If the provider cannot support the required path application on the `pages.dev` host, use a custom hostname that supports it; do not enable admin until that is resolved.
5. Keep preview `ADMIN_ENABLED=false` by default and give previews no production database/secret. A test preview may use its own Access application, database and collection origin. Explicitly verify every preview/direct deployment URL; a path-only Access policy on the production hostname does not protect all aliases by itself. The Worker's JWT check remains mandatory even behind Access.
6. Deploy the complete generated export to the **separate test project** with admin disabled. Using the Access test configuration, enable admin there and run the security/browser checklist below. Verify real Cloudflare state metadata and a real D1 collection event. Local SQL tests cannot verify account bindings or edge metadata.
7. Review historical data in Cloudflare Web Analytics/zone analytics if present. Record actual coverage and its distinct counting method. No historical recovery is claimed here.
8. Only after the test gates pass, enable the same reviewed protection for production, rebuild from the latest production export, and obtain deployment approval. No automatic deployment was added. After deployment, the owner visits `https://sanksresearchlab.pages.dev/admin` and signs in through the configured Access policy; reports remain empty until collection succeeds.

Useful references: [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Release gates still required

- Without an Access session: production, test, branch-preview and direct-deployment `/admin`, `/admin/`, admin JS/CSS/map, `/api/admin/report`, `/api/admin/live`, and `/api/admin/health` must return Access redirect or 403. Check GET, HEAD, POST, and direct URLs. Fake JWT headers must fail. With an authorized session, the UI and reports must work; POST mutations must remain 405.
- Use real Cloudflare D1 on the separate test project to verify one anonymous browser with repeated page/feature events produces one visitor and correct page views, state/country fallback, and cookie persistence. Preview traffic must not enter production D1. Never disable auth to produce a screenshot.
- Inspect Overview, Visitors/map, sport tabs, empty/error/expired-session states, all six periods and all four aggregations at 1440px and 390px widths. Verify keyboard focus, state touch selection, no horizontal overflow, reduced-motion preference, browser Back, and unchanged public NFL/NCAA/UFC/Streak Finder navigation.
- Measure the authorized initial load against the approximately five-second target using real Cloudflare queries and realistic data volume. Local build duration is not dashboard load performance.
- Confirm Access policy allowlist, preview isolation, TLS cookie behavior, D1 quotas, upstream job targets, and current production export before merge/deploy.

## Validation completed locally

- 21 Command Center tests passed: SQL migration and counting, period boundaries, privacy/bot exclusion, payload/origin/preview rejection, browser and site budgets, visit inactivity, retention, empty states, HMAC continuity, genuine RSA-signed JWTs and failures, built Worker protected assets/APIs on preview and main hosts, public passthrough, serial cookie establishment, NCAA/UFC identities, and control taxonomy.
- 71 existing JavaScript public application tests passed, including all 3,350 approved photo assets, flags and hash-verified helmets.
- 18 existing Python tests passed.
- A complete static integration build and JavaScript syntax checks are recorded in `VALIDATION.md`.
- Browser rendering was **not verified**: the installed browser launch was blocked by the environment, and the in-app browser's initial navigation repeatedly timed out. No successful mobile layout check, screenshot, five-second browser load result, or deployed security check is claimed.

Manual refresh job triggering, historical failed-attempt counts, authenticated Cloudflare history recovery and production deployment remain unavailable. The UI labels those limits instead of presenting nonfunctional controls or invented values.

US state topology is US Atlas v3 under the bundled ISC license in `ui/MAP-LICENSE`.
