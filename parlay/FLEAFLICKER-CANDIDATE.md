# Fleaflicker candidate adapter

This is an isolated replacement candidate, not the source selected by the beta app. No ESPN fallback was hidden inside it. Existing tracking and saved cards remain unchanged.

## Implemented
- Public documented player listing requests without accounts or keys; fixed HTTPS host, bounded input, eight-second deadline, two-megabyte response cap, redirect/error rejection.
- Exact player joins via returned Sportradar external IDs. Names are search hints only. The current DynastyProcess snapshot supplies exact joins for 1,368 of 1,650 Lab roster entries; 282 remain unmapped. Most are linemen or defensive positions; four entries across QB/RB/WR/TE remain unmatched. A second exact NFL-ID bridge audit added no further joins.
- Exact game matchup/date/week validation and numeric category-specific mapping. Missing fields remain absent; explicit formatted zero is distinct from missing values. Completion/attempt and reception/target pairs are parsed directly, never reconstructed from rounded percentages or fantasy points.
- A conservative public game-log table reader can supplement missing position-specific fields. It requires exact provider player/game IDs, season, week and team; grouped headers prevent passing/rushing labels from being confused. Layout drift, duplicate rows/columns and ambiguous joins reject the supplement.
- No news text, headshots, league-owner fields or raw provider payloads are returned by the adapter.

## Real-source evidence
An unauthenticated listing plus a public game log matched the Lab's scheduled game exactly. Five API fields (passing yards/TDs, interceptions, completions, attempts) agreed with the game log; the supplement provided carries, rushing yards and rushing TDs. This was a completed-game check, not a verified live-update test.

## Boundaries before replacing the current feed
- The tested API view is scoped to public demonstration league202 linked from Fleaflicker's homepage. A production integration must explicitly configure its permitted league context; do not create an account/league or repurpose private league data automatically.
- Exact ID coverage must be improved for the missing entries; fuzzy joins must not silently stand in for IDs.
- Offensive plus special-teams TDs are not automatically treated as comprehensive anytime-touchdown totals. Missing defensive/return/recovery coverage cannot become a final zero.
- Supplemental HTML is more fragile than JSON. It needs game-day validation and source-consistency checks before selection in the app.
- No complete public-redistribution entitlement or sustained live timing was established. Public documentation and administrator support establish a supported access path, not a blanket license for every use.
- No feed switch, beta behavior change or production deployment is authorized by this module alone.

## Regeneration and provenance
Run from the repository root:
python parlay/tools/build-fleaflicker-identities.py path/to/db_playerids.csv

Player ID metadata: DynastyProcess/data, consumed via the nflreadr documented fantasy-player-ID crosswalk. Retain source attribution and comply with applicable dataset terms. No key or account material is embedded.

References:
- https://www.fleaflicker.com/api-docs/index.html
- https://www.fleaflicker.com/forums/help/topics/fleaflicker-api-22951
- https://www.fleaflicker.com/terms
- https://nflreadr.nflverse.com/reference/load_ff_playerids.html
- https://github.com/dynastyprocess/data
