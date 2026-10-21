# Lab redesign and streak-filter update

Target: Sanker99/Sanks-ufc-test / sanksresearchlab-test.pages.dev only.

- Full-width athlete stages replace the side panel. NFL and UFC charts, controls, history, summaries and news are inline; NCAA retains inline research with shared athlete presentation.
- Bold UFC-inspired typography and green/black presentation across the Lab. NFL/NCAA matchups show verified location and larger mascot names. Team metadata comes from ESPN team endpoints; source URLs are retained in data/team-identities.json.
- NFL/NCAA directory cards use four distinct position colors: QB dark green, RB muted green, WR slate gray, TE medium gray, with a text legend.
- NFL defaults to the next uncompleted week, restoring upcoming-game weather after the prior week ends. Indoor/roof status labels remain explicit.
- NCAA streak coverage checks all 2,312 QB/RB/WR/TE players across 75 scoped teams. 1,261 currently have published offensive logs. All 75 team filters are regression-checked against the global scan; numeric/string IDs normalize consistently. Changing teams clears residual search text. Reset and historical-run controls explain and recover empty results. Missing logs/statistics break runs.

Validation: 43 JavaScript tests and 10 Python tests pass. Browser checks covered desktop/mobile layout, inline NFL metric/window controls, NCAA directory/profile, Miami team streaks (4 players), and UFC inline striking/results. Existing 3,350 approved photos remain intact.

Publication: The existing TEST-only GitHub workflow publishes this branch; deployment status is verified separately in the task response.
