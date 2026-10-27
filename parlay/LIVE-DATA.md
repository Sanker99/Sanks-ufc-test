# Live NFL data feasibility — October 26, 2026

## Evidence collected

The existing public application HTML at https://sanksresearchlab.pages.dev/ matched the selected source branch before editing. ESPN scoreboard `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261025` was accessible from the development machine. Two bounded requests to `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401873011` returned HTTP 200, 558,573 bytes, in 461 ms and 223 ms. Cache-Control was max-age=1 and max-age=10 respectively. These are local observations, not Cloudflare measurements, update-frequency measurements or an uptime guarantee.

The summary identified a 2026 final PIT/NO game. Passing labels included C/ATT, YDS, TD, INT; rushing included CAR, YDS, TD; receiving included REC, YDS, TD. Athlete IDs and team abbreviations were present. Passing completion/attempt splits can be parsed. A synthetic contract test covers the reusable adapter. No provider sample is used as proof of corrected final settlement.

## Gate assessment

- Local endpoint access: observed successful scoreboard and summary reads.
- Actual Cloudflare Worker access: UNVERIFIED. No Worker was deployed or account settings changed for this feature.
- Supported mapping: passing yards/TD/completions/attempts/interceptions; rushing yards/attempts/TD; receiving yards/receptions/TD. Combined rush+receive yards only when both values exist.
- Anytime TD: UNVERIFIED. Rushing+receiving TD alone is incomplete for returns and recoveries. No fabricated zero or passing-TD inclusion.
- Player identity: provider IDs exist; exact GSIS crosswalk still required. The local schedule ID also needs an exact provider event crosswalk.
- Game status: final flag observed; pre/live adapter paths tested synthetically. No observed live change cadence or stat correction history.
- Missing players: no assumption that missing rows mean DNP or zero; participation must be verified by a future source integration.
- Reliability/rate limits: no documented SLA, quota, sustained measurement or live-game polling test. Two reads do not establish stability. Caching utility defaults to 30 seconds, errors propagate; no automatic network polling enabled.
- Final verification: repeated historical response access is not independent verification or proof of immutable statistics.
- Permitted use: https://disneytermsofuse.com/english/ applies to ESPN-branded products and restricts automated extraction in its restrictions section. Public access does not establish permission for this app's automated use. No specific developer license/permission was established. This is a release gate; obtain a permitted source or applicable permission before enabling polling. No paid provider was introduced.

## Next source experiment

After the permission gate is resolved, use an isolated Cloudflare preview to measure cold/warm latency, cache hits, errors/429s, multiple game states and repeated final corrections. Record source and observed timestamps. Verify all ID joins without fuzzy name joins for live updates; validate participation, missing groups, postponed/rescheduled games and sportsbook void rules. Keep previews separate from production and Command Center. Enable UI results only after this evidence exists.

## Follow-up source review

See RELEASE-READINESS.md for the alternative-provider investigation. nflverse's documented player-stat cadence supports delayed post-game processing, not a guaranteed live-player-stat feed. NFLMeta documents live totals but requires a key and a paid plan for commercial use. nfldata.org did not establish a continuous live-player-stat contract during this review. None was enabled as an automatic live source. The ESPN adapter now requires explicit participation evidence, and duplicate concurrent reads coalesce through the cache helper.

## Non-commercial source and runtime milestone — October 26, 2026

The owner confirmed in chat that the site is strictly personal and non-commercial, with no ads, sponsorships, paid access, client work or business use. Sleeper's documented read-only NFL state endpoint is eligible under its non-commercial API documentation: https://docs.sleeper.com/ . This establishes eligibility for that documented endpoint, not a supported live player-stat feed.

Exact identity audit: existing data/athlete-content.json provides 1,621 collision-free ESPN-to-GSIS mappings for the 1,650-player roster. The 29 missing IDs remain unmatched. A downloaded https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv joined all 272 current schedule games by exact schedule ID, season, date and canonical home/away team, with unique ESPN event IDs. No name matching or guessed event IDs is used. Reproduce with python parlay/tools/audit-identities.py path/to/games.csv. These checks do not license ESPN polling or establish current player participation.

Added isolated Pages Function /api/parlay/health, following https://developers.cloudflare.com/pages/functions/routing/ and https://developers.cloudflare.com/workers/runtime-apis/cache/ . It probes only documented Sleeper NFL state and nflverse schedule URLs. Eight-second timeout, four-megabyte response limit, schema checks, fixed destinations with redirects rejected, sanitized failures, and a 60-second Cloudflare cache bound diagnostic traffic. Cached observedAt is retained. It exposes no credentials, user data, or arbitrary upstream URL option. liveTrackingEnabled is always false.

This branch has no root _worker.js. If a separate advanced-mode Worker is merged later, compose this endpoint into that Worker; Pages Functions routing cannot be assumed to survive advanced mode automatically. This milestone does not change Command Center or production.

Validation: 86 parlay tests pass, including identity collisions/missing IDs, wrong game date/team/season, upstream errors/429s/oversize/aborts, invalid schemas, cache reuse, query isolation and disabled tracking. Actual preview runtime verification is recorded below after deployment.

### Actual Cloudflare preview result

Verified deployment 1901524131ad4ccf96a54e13422b8825e62072ea at https://9265916d.sanks-ufc-preview.pages.dev/api/parlay/health on 2026-10-27T00:30:02.786Z (October 26, Central time). The endpoint returned HTTP 200 JSON and X-Parlay-Cache: MISS. Sleeper state returned HTTP 200 with valid schema in 10 ms; nflverse schedule returned HTTP 200 with valid schema in 62 ms. This closes the Cloudflare-access experiment for these two documented endpoints only. It is one observation, not sustained availability or live-player-stat evidence.

The first runtime attempt rejected the fetch redirect mode before upstream access. Using manual redirects and treating non-2xx responses as failures resolved the actual preview failure; redirects are never followed. Fetch also retains its global receiver. Unit tests enforce the receiver and manual redirect behavior. No raw runtime error or source body is exposed in failures.

All three CI test jobs and Cloudflare deployment passed for the verified code revision. Local totals: 86 parlay tests, 71 existing JavaScript tests, 18 Python tests (175 total). The separate advanced-mode Worker integration caveat above remains. Live tracking is explicitly false; a permitted, supported live player-stat source, participation, full anytime-TD coverage and corrected-final/settlement evidence remain required.
A repeated request returned X-Parlay-Cache: HIT with the same observedAt and source measurements, confirming cache reuse on this preview. Evidence was saved in the chat deliverable Cloudflare-Source-Probe.json.

## Experimental ESPN preview connection — October 27, 2026

The owner explicitly instructed proceeding with the Lab's existing ESPN sources after discussion of the unresolved usage terms. Added a preview-only connection, not a claim that permission or production reliability has been established. No account, owner API key, paid plan or production deployment was introduced.

A fixed-route Pages endpoint /api/parlay/game validates exact schedule/event IDs, season, home/away teams and Eastern game date. The generated live-identities.mjs covers 272 schedule games and 1,621 exact ESPN/GSIS identities from the existing roster/athlete-content and the public nflverse games.csv; 29 unmapped players remain unknown. No live name matching. Source URLs are fixed; redirects, oversized bodies and unknown request IDs are rejected. Eight-second per-source deadlines, capped player detail requests, bounded concurrency, shared Cloudflare cache and in-flight request coalescing limit reads. The cache is regional (per Cloudflare data center), not a global single-request guarantee. Upstream failures/429s preserve saved stats and do not become zero observations.

The source adapter uses category-specific box-score fields and positive activity counts (passing attempts, rushing attempts, receptions/targets or return/tackle counts) to establish participation; zero-only/missing rows do not prove participation. ESPN core athlete statistics use exact competition/athlete/competitor references. Touchdowns scored use totalScoringTouchdowns, or totalTouchdowns minus passingTouchdowns; passing TDs are never counted as a scorer's TD. Missing TD fields remain unavailable. These are provisional provider totals, not independent sportsbook settlement.

Browser polling runs only while Active is visible: live games every 30 seconds; reported finals every five minutes to pick up corrections. Requests are grouped by game. Saved per-leg observations merge by timestamp; failed/partial/late responses do not erase unaffected legs. Stat-detail expansion survives rerenders. The UI labels ESPN experimental and values provisional; finalVerified and finalSettlementEnabled stay false, so no automatic Won/Lost settlement is enabled.

Development source observation: event 401873009 mapped to 2026_07_DAL_PHI. The fetched summary reported final PHI21/DAL38. Selected actual provider values were Lamb74 receiving yards, Pickens57, Cooper17, Barkley2 receptions, Ferguson0 receptions with one target, Prescott212 passing yards, and Goedert0 touchdowns scored from his exact athlete-stat endpoint. These were fetched provider reports, not test values. Actual Cloudflare and browser results are recorded at the checkpoint after deployment. Static data samples are not shipped as observations.

Validation: 117 parlay tests, 71 existing JavaScript tests and 18 Python tests pass (206 total). Added 12 contracts covering identity/date mismatch, participation and explicit zero, scorer vs passing TDs, cache/coalescing, oversized/invalid/redirect/rate-limit failure paths, fixed source destinations, hidden-tab polling, cadence/grouping, preserved values, correction reversal and disabled final settlement.
