# Demand NFL preview — October 31, 2026

The isolated preview has an authenticated free Big Balls Sports Data account and a private, service-bound Cloudflare collector. Production and the original V4 preview are unchanged.

## Verified coverage

- 14 exact game mappings for October 29, November 1 and November 2 (2026 week 8).
- 839 unique player mappings using the preserved roster ID, exact full name with case/punctuation normalization, position and provider current-team UUID. 315 of the 445 QB/RB/WR/TE entries on these 28 teams meet all checks.
- Passing, rushing, receiving and moneyline observations confirmed against authenticated provider responses.
- The actual stored box score uses flat camelCase fields under a `players` group. Unassigned-team rows are ignored, absent values remain unavailable, and observations join only by verified provider player UUID.
- Thursday's completed CAR/GB game was served by the deployed shared collector. A real browser QA card moved from Active to Won after the second agreeing final check; Remove and Undo were verified, then the temporary card was removed. Its observed QB totals (Love 288 passing yards; Young 200) are covered by a reduced regression fixture.

## Beta limits

This is a limited two-person test, not complete NFL coverage. Conflicting current-team data, ambiguous records and unmatched names/positions stay unavailable. For example, the provider currently assigns Justin Herbert to the Rams; the tracker does not override that conflict. Anytime-touchdown totals remain unavailable because comprehensive scorer coverage is not verified.

Only these week-eight games are mapped. A later week's identities must be verified before claiming that week's coverage. Use `node tools/build-demand-identities.mjs path/to/private-discovery-files` to regenerate from authenticated schedule/roster responses; private discovery files and credentials are not committed.

The free allowance is 250 requests per UTC day. The backend reserves requests before I/O, deduplicates demand and shares one game report across visitors. Checks begin at kickoff; 3/5-minute intervals slow when the number of games or remaining allowance requires it. Final promotion requires two agreeing final reports at least five minutes apart, followed by a bounded correction check. Reported results are not sportsbook settlement.

## Test procedure

1. Open the isolated preview on each tester's own browser/device. Cards are stored locally in that browser; export backups when needed.
2. Import a clear slip, review every player/team, game, category and threshold, and verify wager/payout amounts before confirming.
3. Keep the tracker open during games. Check the actual-stat progress bars, source time and Live/Delayed/Scheduled/Unavailable labels. Unsupported legs should remain unavailable, not zero or a guessed result.
4. After completion, confirm the card changes only once every leg has a verified final result. Exercise Remove card and Undo in Active/Won/Lost.

Never put API credentials in the browser, a slip, source control, artifacts or diagnostic output. The provider key is an encrypted Worker secret; the separate GitHub deployment token expires November 6, 2026. That expiry affects future deployments, not the already-running Worker.

