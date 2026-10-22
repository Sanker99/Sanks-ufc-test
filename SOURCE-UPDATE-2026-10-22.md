# Test Lab: injury repair, free fantasy projections, UFC cards

This update preserves the application branch and all existing features. Production workflows are unchanged.

## Injury evidence
NFL ESPN reports now join by athlete ID from official HTTPS links and a current-season nflverse GSIS/ESPN/team crosswalk. A fresh valid ESPN report survives missing supplemental nflverse data. Photo-only identities use a unique current-roster full-name/team/position crosswalk. Unknown statuses have no badge or panel. Doubtful is distinct from Questionable. Current explicit Active is labelled Ready, with source/date and participation caveat.

NCAA: all 75 teams and 2,312 loaded QB/RB/WR/TE players in ACC, Big 12, B1G, SEC and PAC-12 are checked. Official conference public reports are now collected before publication. ACC, B1G, Big 12 and SEC use their public HD Intelligence publish feed; Pac-12 uses the public JSON document embedded in its official reporting page. Reports must match the loaded conference, both opponents, game date and a unique team/full-name/position identity. Jersey discrepancies are recorded without discarding an otherwise unique identity. Current explicit Out stays Out even in an exempt roster category; an actual Exempt designation stays unknown. Probable and Doubtful remain yellow and do not become Ready. General Covers injury reports remain a dated fallback.

The verified collection has 60 teams with current official game reports and 1,527 current NCAA status matches across 67 teams after fallback. It contains 1,354 explicit Available, 71 uncertain, and 102 Out records. A full team coverage ledger records every checked roster and missing-report reason. Bye weeks, Exempt entries and Pac-12 players omitted from its limited-player report do not establish Healthy. Unknown statuses stay blank. Reports expire by age and after the linked game's six-hour window; no Ready status carries into another game. If a conference collection fails, a still-current last-good game-bound report is retained and the failure is recorded.

## Fantasy Projection
The scheduled updater retrieves four public eDraft HTML tables once per hour (not a provider API). It checks season, week, headings, required columns, finite numbers, duplicate identities and current schedule opponents. Published Bye/free-agent rows are excluded. Name aliases are explicit; one canonical GSIS identity plus its photo-only aliases may share a projection. Ambiguous identities are withheld.

Scoring: passing yards .04; passing TD 4; interception -1; rushing/receiving yards .1; rushing/receiving TD 6; reception 1. Only supplied components are used. Bonus: 5 at 100 rushing/receiving or 300 passing; 10 instead at 200 rushing/receiving or 400 passing. Separate categories and unrounded boundaries. No unsupported fumble/conversion values are invented. Projections are excluded from historical actual totals; historical full-PPR actuals retain their separately disclosed scoring.

Initial tables: 35 QB, 59 RB, 60 WR, 42 TE; 195 unique matched athletes with 389 canonical/photo keys. All source QB/RB/WR/TE identities match; the remaining provider RB row is Kyle Juszczyk, a fullback outside the loaded four-position scope. The provider does not supply a projection for every rostered backup. Collection time is disclosed; failed collection preserves the previous file. The UI withholds completed-game, wrong-team, wrong-season and seven-day-old projections.

No added refresh button or backend trigger. Existing Refresh All Data reads the latest published projection snapshot. Hourly collection is handled by the existing scheduled TEST workflow, whose actual start time may be delayed by GitHub.

Public eDraft terms and robots.txt were inspected. Public rankings paths are allowed by robots.txt; terms reviewed do not expressly grant third-party redistribution rights. No claim of a provider redistribution license is made. No login, access-control bypass, private endpoint, subscription or payment is used. Data-source attribution is available in the collapsed sources area.

## UFC
Removed Explore The Card. Event grids adapt to a minimum useful card width. Each fighter name occupies its own column beneath the image, with wrapping contained within the column. Existing mobile rules and all other styling are preserved.

## Validation
82 application checks and 41 Python checks passed, including source-ID conflicts, missing evidence, bonus boundaries, negative projected rushing, unchanged live scores/timezones, and projection expiry/team/season guards. Local browser profile verified Ready status, source link, and Fantasy Projection 20.5 for Brock Purdy. Existing approved athlete assets remain intact.

## Team roster presentation and expected availability follow-up

Matchup rosters now separate both teams, offer Both Teams and individual-team buttons, and group QB, WR, RB and TE in that order. Cards use the team's primary color with its secondary color as an accent, while the general player directory keeps the position palette. NFL directory has an all-32-team filter. Published depth-chart tiers and slots determine ordering; players not present on a chart follow as Additional roster and are never assigned a fabricated depth rank. Search does not renumber a player's published position within the full team roster.

The scheduled Team_rosters collector joins exact ESPN IDs/current team/position against fresh ESPN rosters. NFL uses ESPN published depth charts; NCAA uses dated public Ourlads depth charts matched by current team, normalized full name and position. All 32 NFL and all 75 scoped NCAA team requests succeeded in validation. Depth coverage: 1,037 NFL identity keys (including photo aliases) and 1,250 NCAA athletes. Additional roster athletes remain visible after depth-listed players.

Ready now means expected available: explicit Active on a fresh team roster, a matching current depth-chart entry, and no restriction in the checked roster/depth injury fields. It is not a guarantee of snaps or medical clearance. Current explicit adverse designations and reserve/IR evidence take priority, including newly reported roster injury restrictions. Exempt NCAA entries and recently adverse official reports cannot be cleared by this fallback. Failed, wrong-team, wrong-season and stale source checks do not produce Ready. Each resulting status retains its source, time and evidence basis.

UFC card names are split into intact name components, first names smaller and surnames scaled to the available column with container-relative sizing. No mid-word wrapping or ellipsis is used. Browser verification checked all 24 displayed name components for overflow. Existing comparison, fantasy, live-score and approved-photo behavior is retained.
