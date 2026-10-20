# NCAA statistical completeness

The 75-team, five-conference roster has 2,312 skill-position records. Initially, 1,052 players had no offensive game logs in the 314 completed-game box scores. Those records were independently queried by exact ESPN athlete ID and the explicit 2026 season filter in ESPN's player game-log feed.

The audit recovered one additional verified game log. The final snapshot has 1,261 players with recorded offensive statistics, 1,051 with no recorded appearances in the available offensive logs, and no unresolved player-feed errors after retry. `ncaa-availability-audit.json` records the counts. Raw responses remain cached under the ignored work directory.

“No recorded appearances” describes the available offensive statistical records only. It is not a claim that a player did not dress, play special teams, take an unrecorded snap, or was injured/inactive. “Statistics unavailable” is reserved for failed season checks, incomplete final box-score coverage, or a recorded appearance without supported offensive statistics. Unknown profiles are never labeled inactive by default.

The recovery checks the season, completed game ID, and athlete's team ID before joining values. Genuine zeroes are retained. Existing photos and stable player IDs are unchanged. Directory cards, player profiles and empty game-log tables use the new distinction. Fixtures outside the five selected conferences remain schedule opponents, without importing out-of-scope rosters.

Source: ESPN's season-specific player game logs (`https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/{athlete_id}/gamelog?season=2026`) and the existing ESPN final box-score integration. These are two ESPN endpoints, not independent providers. Source timestamps remain separate from the time the availability audit was performed.
