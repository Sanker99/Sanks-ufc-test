# 11-task development batch

Test repository only: Sanker99/Sanks-ufc-test. Branch: codex/11-task-improvements-2026-10-20. Production is outside this work.

The deployed test source, including all approved photos, was preserved as a baseline commit before task changes.

| Task | Status | Evidence |
|---|---|---|
| 1. UFC duplicate cards | COMPLETE | Stable photo IDs group one fighter card; category sections highlight highest threshold and retain alternatives. Regression test covers six categories in one card. |
| 2–11 | Pending | Executed sequentially. |

Task 2 — COMPLETE: added KO/TKO finishes, total strikes, submission attempts and control-time-ready numerical categories; chronological completed-bout deduplication; missing values break runs. Minimum 3/4/5 verified by regression tests. Actual source-history cross-check and control data coverage are recorded with Tasks 4–5.

Task 3 — COMPLETE: country representations are extracted from exact red/blue athlete links on official UFC event cards, with source URL/time. Local official flag PNGs appear beside names on event bout cards and matchup views. Unknown representations remain blank. Country is never inferred from birthplace.

Task 4 — COMPLETE: exact historical UFCStats event/fighter/opponent join added source TIME FORMAT and bout URLs. 12,006 fighter-bout rows matched; 11,574 have verified standard 3/5-round format. Nonstandard and missing formats show Unknown. Last-five and existing all-history panels distinguish scheduled rounds from finish round. Enrichment timestamps do not overwrite original dataset freshness.

Task 5 — COMPLETE: existing public UFCStats CSV integration now sums only complete per-round CTRL data. 11,673 existing fighter-bout records have control time; 289 matched records have unknown control. Per-round duplicates/conflicts and invalid durations are checked. Corrected source SUB.ATT header so submission attempts are populated. Last-five averages, history panels, graphs and streaks display m:ss. The free mirror preserves original UFCStats bout URLs; direct UFCStats access returned 502 during this audit, so coverage is source-consistency validated rather than independently re-scraped.
`nTask 6 — COMPLETE: event-card photo heights increased 35% (91 to 123px desktop; 78 to 105px mobile); UFC profile images increased 35%. Matchup art has a larger balanced stage with reserved label space. Desktop and 390px mobile layouts inspected; both fighter images are contained, labels do not intersect image bounds, and mobile document width equals viewport. Original image assets are unchanged. Screenshot: ../batch-preview/ufc-mobile.png.
