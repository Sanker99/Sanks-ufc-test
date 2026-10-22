# Test Lab: injury repair, free fantasy projections, UFC cards

This update preserves the application branch and all existing features. Production workflows are unchanged.

## Injury evidence
NFL ESPN reports now join by athlete ID from official HTTPS links and a current-season nflverse GSIS/ESPN/team crosswalk. A fresh valid ESPN report survives missing supplemental nflverse data. Photo-only identities use a unique current-roster full-name/team/position crosswalk. Unknown statuses have no badge or panel. Doubtful is distinct from Questionable. Current explicit Active is labelled Ready, with source/date and participation caveat.

NCAA: national ESPN data is stale and insufficient. Public Covers team injury tables supplement exact ESPN IDs, restricted to the loaded five conferences. Supplemental matches require a unique team/position/first-initial/surname combination; ambiguous matches are excluded. Only dated current reports and explicitly listed current-season season-ending reports are displayed. Missing reports never establish Healthy. Initial coverage is partial: 42 current matches across 30 teams, 72 scoped teams seen. No claim of near-complete NCAA verification is made.

## Fantasy Projection
The scheduled updater retrieves four public eDraft HTML tables once per hour (not a provider API). It checks season, week, headings, required columns, finite numbers, duplicate identities and current schedule opponents. Published Bye/free-agent rows are excluded. Name aliases are explicit; one canonical GSIS identity plus its photo-only aliases may share a projection. Ambiguous identities are withheld.

Scoring: passing yards .04; passing TD 4; interception -1; rushing/receiving yards .1; rushing/receiving TD 6; reception 1. Only supplied components are used. Bonus: 5 at 100 rushing/receiving or 300 passing; 10 instead at 200 rushing/receiving or 400 passing. Separate categories and unrounded boundaries. No unsupported fumble/conversion values are invented. Projections are excluded from historical actual totals; historical full-PPR actuals retain their separately disclosed scoring.

Initial tables: 35 QB, 59 RB, 60 WR, 42 TE; 192 unique matched athletes with 383 canonical/photo keys. Four source identities are unresolved. The provider does not supply a projection for every rostered backup. Collection time is disclosed; failed collection preserves the previous file. The UI withholds completed-game, wrong-team, wrong-season and seven-day-old projections.

No added refresh button or backend trigger. Existing Refresh All Data reads the latest published projection snapshot. Hourly collection is handled by the existing scheduled TEST workflow, whose actual start time may be delayed by GitHub.

Public eDraft terms and robots.txt were inspected. Public rankings paths are allowed by robots.txt; terms reviewed do not expressly grant third-party redistribution rights. No claim of a provider redistribution license is made. No login, access-control bypass, private endpoint, subscription or payment is used. Data-source attribution is available in the collapsed sources area.

## UFC
Removed Explore The Card. Event grids adapt to a minimum useful card width. Each fighter name occupies its own column beneath the image, with wrapping contained within the column. Existing mobile rules and all other styling are preserved.

## Validation
81 application checks and 35 Python checks passed, including source-ID conflicts, missing evidence, bonus boundaries, negative projected rushing, unchanged live scores/timezones, and projection expiry/team/season guards. Local browser profile verified Ready status, source link, and Fantasy Projection 20.5 for Brock Purdy. Existing approved athlete assets remain intact.
