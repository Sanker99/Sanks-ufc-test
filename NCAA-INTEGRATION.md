# NCAA football and league-aware Streak Finder

The former Games tab is now NFL. NCAA has a parallel weekly matchup grid with the same team colors, layout and roster navigation. Conference buttons cover ACC, Big 12, B1G, PAC-12 and SEC. All-conferences view includes each matchup once, even when both schools are selected. Nonconference opponents remain visible, without importing their rosters.

Players has NFL/NCAA toggles. NCAA adds conference, team and position filters, a load-more control, matchup rosters, sport-scoped search and player profiles with metric selection, thresholds, charts and linked game logs. NFL photos and research stay available.

Streak Finder has NFL, NCAA and UFC toggles. NCAA adds conference buttons, a conference-scoped team dropdown, player/team search, category and minimum controls. Cards group qualifying thresholds by player and statistic, with links into the matching player game log. Streaks follow consecutive completed team games: byes are skipped, missing logs/statistics break a run, and future games are excluded. Zero remains distinct from missing. UFC uses consecutive recorded fight results/statistics for upcoming/ranked fighters in the approved photo roster, with latest-bout dates visible.

## Published snapshot

75 teams: ACC 17, Big 12 16, B1G 18, PAC-12 8, SEC 16. 2,312 QB/RB/WR/TE roster players, 528 published schedule matchups, 314 completed games with box scores and 4,701 player game logs. Sources are ESPN's season-specific conference standings, rosters, team schedules and final box scores. Current roster/position restrictions exclude other box-score participants. College targets are unavailable in this feed and are not inferred. No NCAA photographs, injuries or independent verification were fabricated.

## Refresh the snapshot

Run `python tools/build_ncaa_data.py --season 2026 --refresh` to fetch a fresh snapshot. The collector uses only Python's standard library, caches original responses, retries failed requests and validates all five conference groups, roster seasons, source joins and box-score availability before replacing the published JSON. The app's Refresh All Data reloads the latest published snapshot; it does not run the collector. Repackage and upload the static site after building fresh data.

## Validation

18 application tests pass. Checks cover the prior NFL/UFC/photo behavior, all five conference memberships, source game-log joins, unique NCAA identities, completed-game streak continuity, byes, missing/zero values, conference/team isolation, UFC no contests and unknown fight statistics. Browser checks exercised all five schedule filters, all five player filters, conference-scoped streak team choices, team selection, matchup/profile navigation and switching back to NFL. Phone layouts were inspected at 390px without horizontal overflow.
