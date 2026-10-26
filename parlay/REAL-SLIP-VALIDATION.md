# Real FanDuel screenshot validation — October 26, 2026

Two original user-supplied screenshots were processed by the app's actual browser Tesseract.js OCR. Images remained local. The raw OCR transcript, including receipt data, was kept only in the ignored local work directory. Checked-in fixtures contain only the selection text, public matchup lines and the parlay leg-count header; account/balance, stake, payout and aggregate-price information is excluded. No screenshot image was committed or uploaded to GitHub.

## Image 1: 11-leg touchdown parlay

Recovered all 11 roster identities: Pat Freiermuth, Dalton Schultz, George Kittle, T.J. Hockenson, Harold Fannin Jr., Mark Andrews, Trey McBride, Tucker Kraft, Tyler Higbee, Travis Kelce and Jake Ferguson. Every market is anytime touchdown, >= 1. The declared header count matches the recognized count. Odds, mini betslip text, promotions and repeated compact summaries are not interpreted as extra selections.

## Image 2: eight selections

Recovered these seven supported player props:

- Brock Purdy — passing yards >= 225
- Brock Purdy — passing touchdowns >= 2
- Christian McCaffrey — rushing yards >= 50
- Terry McLaurin — receiving yards >= 40
- George Kittle — receiving yards >= 50
- Christian McCaffrey — anytime touchdown >= 1
- Jayden Daniels — rushing yards >= 30

The eighth selection, San Francisco 49ers moneyline, is supported as canonical team SF with no player ID or numeric threshold. The team and scheduled game require confirmation. Browser validation confirmed all eight selections can be reviewed and locked together.

## General parser changes

- Resolve bounded leading logo/OCR fragments against the full season roster, without player-specific correction tables.
- Keep signed odds separate from numeric selection targets.
- Associate a title's explicit target with its following market descriptor; join wrapped rushing/receiving/passing category lines.
- Avoid repeated compact summaries and duplicate title/descriptor rows.
- Keep conflicting targets unresolved; do not infer game dates from phone clocks or kickoff times.
- Warn and block locking when a declared leg total differs from recognized selections. The owner must explicitly reconcile the warning against the original slip, and all remaining legs still need confirmation.
- Keep unsupported markets visible and persist them in drafts without allowing settlement.

## Evidence and limits

80 parlay automated tests pass, including both actual OCR fixtures, overlap, crop/leg-count mismatch, icon noise on other players, team-moneyline persistence and other unsupported-market handling, target conflicts and malformed reconciliation warnings. Browser review verified 11 selections with no count warning for image 1, eight review rows for image 2, and successful confirmation and locking of all eight selections, including its moneyline. Images were screenshots; physical-camera photographs and broader sportsbook layouts are still unverified. These two successful examples are not an accuracy benchmark. Game/date selection and live-stat integration remain separate gates.
