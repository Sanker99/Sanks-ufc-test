# SANKS Research Lab — TEST deployment

The active TEST application source is in `Sanker99/Sanks-ufc-test`, branch `codex/11-task-improvements-2026-10-20`. Its existing workflow `deploy-cloudflare-test.yml` runs from `main`, explicitly checks out that application branch, refreshes source snapshots, restores approved photos by SHA-256, validates the application, and publishes `work/site` to Cloudflare Pages project `sanksresearchlab-test`.

Live TEST: https://sanksresearchlab-test.pages.dev/

The separate repository `Sanker99/-sanks-research-lab` is a historical/production source and is not updated by this workflow. Earlier V5 deployment guides and `deployment.json` describe historical releases; they are not proof of the current live build. No promotion to production is part of this change.

## Current release evidence

Each staged release exposes `/data/release.json`, containing the source repository/branch, checkout commit, build time, workflow run ID, hashes of application code and all data snapshots, and approved photo count. The photo registry hash is included in the snapshot hashes. `code_commit` identifies the checkout at staging; a later workflow commit may persist refreshed data without changing that application code. Root NFL fallback snapshots are copied from the staged `data/` versions.

## Validation

Run `node --test tests/*.test.cjs` and `python -m unittest discover -s tests -p 'test_*.py'` from the repository root. Run `python tools/update_test_data.py` for scheduled refresh behavior, or `--force --only Availability Verification UFC_events NCAA` to refresh selected feeds. `python tools/stage_test_site.py` verifies all 3,350 approved image hashes and creates the static release.

Collectors use free existing sources: nflverse weekly NFL statistics and historical injury reports; ESPN schedules, NCAA box scores/rosters and dated player availability; UFCStats source-covered fight histories; ESPN overall professional records for available scheduled fighters; and Open-Meteo venue forecasts. Source errors retain last-good snapshots and appear in `data/refresh-status.json`.

## Availability and verification boundaries

Only an exact player-specific report dated within 72 hours, checked within two hours, receives a colored availability check. Green means an explicit available/active designation, yellow means questionable/doubtful, and red means out/inactive. Availability is not a guarantee of participation or a claim of perfect health. Missing, old, unmatched and unsupported reports show **Unconfirmed**. Offensive appearance records and historical weekly injury designations are kept separate from current availability. The accessible NCAA injury endpoint currently provides no current matched reports for this scope.

`data/stat-verification.json` is a bounded sample: two NFL athletes per position and one NCAA quarterback per conference, using each selected athlete's latest published game. NFL compares nflverse against ESPN. NCAA rechecks ESPN itself and is never labeled independent verification. Missing secondary values remain unavailable; they are not inferred to be zero. Profile annotations match sport, exact athlete ID, week/game, statistic and primary value.

`data/ncaa-stat-exclusions.json` preserves source rows rejected by the roster join. Team aggregates and known positions outside QB/RB/WR/TE are classified separately. Unresolved athlete/team identities remain excluded; no name-only reassignment or invented statistics is allowed. New roster changes can reduce exact photo coverage without removing approved assets.

UFC overall professional records are labeled separately from counts in the UFCStats history snapshot. Athletes without joined fight history remain explicitly unavailable; an empty history does not prove a professional debut. All upcoming ESPN events remain in the streak filter, including events without an approved-photo match. Event instants retain timezone information.

## Remaining source work

Current NCAA medical coverage needs reliable team/conference reports before additional colored checks can be asserted. The NCAA exclusion ledger still contains unresolved athlete/team identities, and independent checking is sampled rather than league-wide. Five approved UFC photographs have no joined source fight history. The audit's broader maintenance roadmap (legacy-code consolidation, dependency pinning, payload optimization, additional photos and full NCAA comparison controls) remains follow-up work.


## News desk and refreshed matchup presentation (October 21)

The default home is `#/news`, with ten ESPN article headlines per sport and links to the publisher's full stories. Videos are excluded. `tools/build_lab_experience.py` refreshes headline metadata every 30 minutes through the existing TEST updater, and stores exact-team helmet source pages, original image URLs, and SHA-256 hashes in `data/lab-experience.json`. `tools/stage_test_site.py` restores helmet originals by hash before deployment; `assets/helmets/` is intentionally not committed. Athlete photographs retain their existing approval registry and files.

All 32 NFL teams and all 75 conference teams have representative sourced helmet photographs. Additional scheduled opponents are included where matched; remaining archive gaps are listed in the experience manifest. A representative helmet is not a confirmed game-specific uniform. Dates use Eastern calendar-day sections, with games sorted by kickoff and unknown NCAA times placed last. Season records are computed only from completed published season games, with genuine score zeroes included.

The new shared UI is `assets/experience.js` and `assets/experience.css`. It implements the news home, helmet/date matchups, player status labels, fixed-size average-line charts, scroll-preserving graph controls, and UFC comparison presentation. The average line excludes missing values and confirmed injury DNPs; the separate research threshold controls continue to support streak inspection. Unknown absence reasons remain explicitly unreported rather than being inferred as injury.

Current-season explicit IR/season-long reports have a separate 180-day validity window while the source still lists that designation and the feed was checked within two hours. Other player-specific designations expire after 72 hours. All classifications retain date/source context. This does not establish that an athlete will participate.
