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
