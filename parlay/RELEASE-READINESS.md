# Release readiness checkpoint — October 26, 2026

## Verified in this pass

- 44 parlay domain tests, 71 existing Lab JavaScript tests and 18 existing Python tests passed (133 total).
- Browser iframe layout checks at 320, 390, 768 and 1440 pixels reported no page overflow and no form controls outside their viewport. Content widths were 305, 375, 753 and 1425 pixels respectively because of the frame's vertical scrollbar. These are browser responsive checks, not physical iOS/Android tests.
- Browser restored a valid synthetic locked-parlay backup while preserving existing history.
- Browser imported an alternate passing-yards selection, matched its explicitly supplied slip date to the exact scheduled game, required confirmation, and immediately reset confirmation after a target edit. Locking the changed selection was blocked.
- Duplicate selections are rejected at lock, including duplicates created by editing imported selections after their initial deduplication.
- Backup parsing rejects invalid shapes, duplicate IDs and inconsistent saved outcomes. Conflicting restores are atomic; existing history is not overwritten.
- Box-score rows no longer imply player participation. Exact participation evidence is required independently. Invalid observation timestamps cannot settle results.
- Concurrent source reads share one request; failures do not poison the cache.

## Still not cleared for full live release

1. **Representative original slip/photo evidence.** No original sportsbook screenshots or photographs were present in the supplied attachments/local scanner environment. The successful browser OCR check remains synthetic. Original redacted FanDuel examples and photographs are needed before claiming real-world scanner accuracy.
2. **Permitted continuous live statistics.** The current ESPN adapter remains disconnected. Endpoint access alone is not a permitted-use contract, a reliability test or an actual Cloudflare-runtime result.
3. **Complete source identity and settlement contract.** Provider-to-GSIS and event-to-schedule crosswalks, explicit participation, return/recovery touchdowns, corrected finals and sportsbook void policies still require source-backed validation.
4. **Actual device checks.** Touch/keyboard, camera selection and OCR performance should be checked on representative iOS/Android devices.

## Source investigation

- nflverse publishes its ordinary datasets under CC BY 4.0 (with identified dataset exceptions): https://github.com/nflverse . Its player-stat schedule is nightly after game days plus specified game-day runs, with later correction refreshes recommended. It is a candidate for delayed post-game results, not a verified continuous live feed: https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html . Roster documentation includes exact GSIS/ESPN identity fields: https://nflreadr.nflverse.com/reference/load_rosters.html . No new remote polling was enabled.
- NFLMeta documents best-effort near-real-time player totals, but programmatic access requires a key and its free tier does not permit commercial use. It was not adopted under the project's free/no-user-key constraints: https://nflmeta.org/faq . No account was created and no plan accepted.
- nfldata.org advertises keyless historical/player-stat endpoints. No permitted, reliable continuous live-player-stat contract was established in this review: https://www.nfldata.org/ . It was not substituted for live statistics.

## Release decision

Keep the feature in preview. The scanner/builder foundation is stronger, but a complete live tracker is not ready. Production and Command Center were not changed. The next useful owner-provided evidence is representative redacted slip screenshots/photos; the next engineering dependency is a permitted source meeting the live-stat coverage and verification requirements.
