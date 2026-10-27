# Moneyline and progress bars

## Moneyline support

- Builder: choose **Team moneyline**, search the canonical 32-team NFL catalog, choose the matching game, confirm and lock.
- OCR: full team names, canonical codes, aliases and nicknames are matched conservatively. Unknown or ambiguous names require review. The supplied second FanDuel screenshot now reconstructs all eight supported selections, including SF moneyline.
- Team legs use `kind: team`, a canonical team code and schedule game ID, `operator: win`, and a null target/player ID. They are not player props with an invented yardage target.
- Existing unlocked unsupported-moneyline drafts upgrade when opened for editing. Locked selections remain immutable.
- Team observations match game, season and selected team. A lead is provisional and can reverse. Final wins/losses require independently verified final status. Tied finals, cancellations and postponements do not silently become wins or automatic voids; confirmed settlement evidence is required for voiding.

## Numeric progress bars

- Empty black track until a verified stat observation exists; unavailable is shown as an em dash, never fabricated zero.
- For an at-least-40-yard leg, 32 yards fills 80% in red, and 40 yards fills 100% in green. Actual values remain visible even above the target or below zero; only the bar width is bounded.
- Strict over, under and at-most operators retain their own comparison semantics. For example, exactly 40 does not hit Over 40. Under bars turn red if their cap is crossed.
- Green during a game means the target is provisionally met, not an irreversible win. Stat corrections can move a bar back to red.
- Moneylines show the selected team's actual score, opposing score and red/green trailing/tied/leading status. Their score bar is categorical; it is not an invented chance-of-winning percentage or yardage progression.
- Color is accompanied by stat numbers, target text, source and state labels. Numeric bars expose accessible values and respect reduced-motion preferences.

## Observation integration

`recordObservations` evaluates and saves both the states and progress models without changing locked selections, then dispatches `sanks:parlays-updated` in the browser. The app also refreshes saved records on storage/focus events. Team score mapping is implemented in `mapEspnMoneylines`, with exact local/provider game identity checks and canonical team validation. No upstream polling was enabled: the existing permitted-source and real Cloudflare-runtime gates still apply.

## Validation

81 parlay tests plus 71 existing JavaScript and 18 Python tests: 170 passing checks. Coverage includes team identity/aliases, eight-leg real-slip preservation, moneyline persistence/deduplication, provisional/final results, tied finals, corrections, score mapping, invalid observations, 32/40 and 40/40 bars, strict comparisons, missing/zero/negative/overshoot values, immutable results and malformed progress backups.

Actual browser checks covered manual moneyline search/add/confirm/lock, all eight imported real-slip legs locking together, and an explicit local synthetic-data harness showing 32 -> 40 -> 32 updates while the tracker remained open. Harness data and screenshots are clearly labeled LOCAL QA DATA — NOT LIVE. No example score or player-stat observation was published to the application or its dataset. Production and Command Center remain unchanged.

Observation refresh now merges the latest saved results per leg rather than replacing an entire parlay with a partial batch. Older/equal timestamps are ignored, corrections with newer timestamps still apply, and explicit new unavailability clears stale data. Saved stat bars show a Checked timestamp. Old untimed backups continue to load; invalid/inconsistent new timestamps are rejected. Nine regression tests cover cross-poll ordering, partial batches, newer corrections, backups, locks and timestamp rendering. No live feed or QA observation is enabled in the public app.
