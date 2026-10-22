# Source validation — October 22, 2026

Baseline: current TEST manifest identifies `51c7805272c9db776df9728a0ba19761d957245c`, workflow 39798808841. Work starts from its successor snapshot commit `5511783bbeb2ad361fc5171bcb98e8d096cacb68`. The externally added mobile UFC CSS and existing application behavior are retained. Production is outside scope.

## NFL availability and actual statistics

Live HTTP tests succeeded without credentials:

| nflverse downloadable release | Result | Coverage / observation |
|---|---|---|
| `injuries/injuries_2026.csv` | 200; published Oct 22 12:55 UTC | 2,062 rows, weeks 1–7, stable GSIS IDs; 273 week-7 entries across 26 teams. Practice and game designation are separate. No individual report timestamp or final-report completeness flag. |
| `rosters/roster_2026.csv` | 200; published Oct 22 12:58 UTC | 3,054 players, stable GSIS/ESPN/Sleeper IDs; roster status and reserve codes. Season membership is not game-day clearance. |
| `weekly_rosters/roster_weekly_2026.csv` | 200; published Oct 22 12:58 UTC | 17,602 player-week rows; 708 week-7 QB/RB/WR/TE rows. No week-7 INA rows at validation. An inactive roster code alone is not accepted as an official game-day inactive list. |
| `stats_player/stats_player_week_2026.csv` | 200; published Oct 22 09:13 UTC | 6,488 rows; exact player and game IDs; fumbles lost, two-point conversions and fantasy totals included. |
| `players/players.csv` | 200 | 24,861 exact-ID crosswalk rows. |

Release base: https://github.com/nflverse/nflverse-data/releases/download/

License: https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0). Attribute nflverse and document derived calculations. No key, payment or owner computer required. Downloads run centrally; use 30-minute checks with conditional HTTP caching, not per-visitor downloads. Upstream publication can be daily; checking more often does not improve the underlying reporting cadence.

The guessed `player_stats/stats_player_week_2026.csv` endpoint returned 404. The tested `stats_player` path above works. This failure is recorded rather than substituted silently.

Official NFL injury reports, team reserve information and inactive lists are authoritative, but NFL.com terms prohibit systematic retrieval without permission: https://www.nfl.com/legal/terms/ . No new NFL.com scraper or restriction bypass is introduced. Current freely licensed mirrors do not establish complete official final reports or game-day inactive coverage. Consequently, absence from these mirrors cannot produce READY. A 95% verified-available target is not presently defensible; actual coverage and each unresolved reason must be published.

Reserve code reference: maintainer investigation at https://github.com/nflverse/nflreadr/issues/232 . Map only documented codes; preserve unfamiliar codes as RESERVE rather than guessing IR/PUP/NFI.

## Projections: publication withheld

Sleeper state test returned season 2026, regular season, week 7. `https://api.sleeper.com/projections/nfl/2026/7?season_type=regular` returned HTTP 200 with 9,418 rows, including 3,047 QB/RB/WR/TE rows across the returned categories. Filtering exact season 2026, week 7, category proj and numeric pts_ppr leaves 353 unique skill-player projections; 350 match the 820 skill-player Sleeper IDs in the current season roster file by exact ID. No name-only matching is needed. These counts document technical coverage, not permission to republish the projections. Rows include `pts_ppr`, provider `rotowire`, player IDs, week/season and update times. Technical access is real; access alone does not establish public redistribution rights.

`https://api.sleeper.app/v1/players/nfl` returned 12,229 entries, 831 team-associated skill players, stable IDs and injury fields. https://docs.sleeper.com/ grants noncommercial API access and limits the large player map to at most once daily. The official documentation does not document the projection endpoint or grant redistribution of the RotoWire projections. New general terms dated Oct 6, 2026 restrict third-party automated retrieval except with Sleeper authorization: https://support.sleeper.com/en/articles/5486620-general-terms-of-use . Because these permissions do not clearly cover this site's intended public projection display, neither Sleeper projections nor a new automated Sleeper injury collector is enabled. Do not reinterpret null injury status as healthy.

FantasyPros: https://www.fantasypros.com/about/legal/ restricts reuse beyond a personal copy without written permission. Its licensed API at https://www.fantasypros.com/api-data/ does not meet the requested no-key architecture. No projection-page scraping performed. FFToday's downloadable/published projection pages do not establish a public automated redistribution license; no scraping enabled. https://www.fftoday.com/rankings/index.html . Publicly available season-long ESPN projection documents do not establish current weekly projections or permission for automated republication. nflverse actual-stat files and DynastyProcess rankings/trade values are not weekly projection datasets. No replacement model or season-average-as-projection is substituted.

Decision: stop live projection ingestion/publication pending a sufficiently reliable, permitted source. Show projection unavailable and keep verified actual full-PPR history independent. Projection publication coverage is 0%, by design, not a technical-access failure.

## UFC times and local dates

Existing ESPN scoreboard tested: `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261022-20261231` (HTTP 200). It reports UFC 333's event start as 14:00Z, the early segment. Its main-card competitions have 18:00Z. Core competition endpoint `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/600061267/competitions/401911632?lang=en&region=us` returned HTTP 200 with `cardSegment.description=Main Card`, `matchNumber=1`, `timeValid=true`, `date=2026-10-24T18:00Z`. Core segmentation and explicitly published, consistent competition start times can distinguish segment starts without assumed spacing. Cache these alongside the existing centrally collected UFC schedule; flag source errors and stale times. Public API accessibility is not an unlimited-access or uptime guarantee; ESPN does not publish an SLA for this endpoint. This extends the existing schedule integration, with conservative cached requests, rather than adding official-site scraping.

Official UFC watch guide search evidence agrees on 14:00 US Eastern main card and 12:00 Eastern prelims for UFC 333: https://www.ufc.com/news/how-watch-and-stream-ufc . Direct official page requests returned 403; no retry through a bypass. Missing or conflicting segment times must remain Time TBA. Never use the event-level start as the main-card start.

NFL source `gametime` is explicitly Eastern regardless of venue: https://nflreadr.nflverse.com/articles/dictionary_schedules.html and its source dictionary. Convert centrally with `zoneinfo.ZoneInfo('America/New_York')`, preserving DST and UTC offsets. NCAA/ESPN timestamps already have explicit offsets; reject naive timestamps. Browser formatting uses the viewer's IANA timezone and groups by the converted local calendar date.

## Refresh and scope

Retain the existing TEST workflow's concurrency lock and 30-minute target. New collectors keep last-good data on failure, retain upstream modification times and expose freshness; a successful HTTP check does not make old reports current. No new visitor requests to injury/projection providers. Existing live-score polling is a separate functioning feature and is retained; moving that to centralized streaming infrastructure is not part of these static-data changes.
