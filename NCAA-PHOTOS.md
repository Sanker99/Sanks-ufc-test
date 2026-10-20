# Approved NCAA photos

The user approved the prepared NCAA photos on October 20, 2026. This update binds 2,306 approved records to exact `ncaa:<ESPN athlete ID>` keys across NCAA directory and matchup player cards, profiles, and Streak Finder. Conference, team and position labels come from the Lab roster. Six unresolved players keep the initials fallback; NCAA never uses a name-only photo match.

Original transparent PNGs remain unchanged in the standalone NCAA library. The Lab uses individually lazy-loaded transparent lossless WebP copies, capped at 640x640. Every delivery file was decoded and compared to the resized RGBA pixels, and each source PNG was checked against its approval checksum. The NCAA delivery payload is 349,533,006 bytes across 2,306 records. Marlon Harbin's two documented roster IDs deliberately point to the same person, while preserving both exact Lab IDs.

Run `tools/import_ncaa_photos.py --library ../ncaa-photo-library` with Pillow available to regenerate. `ncaa-photo-integration.json` records coverage and verification. User approval remains separate from source licensing status. The registry now contains 3,350 approved records: NFL 767, UFC 277, NCAA 2,306.

All 20 application tests pass, including exact-ID coverage, duplicate-name isolation, cross-sport isolation, six missing-photo fallbacks and unchanged NFL/UFC behavior. NCAA profile navigation also resets the research pane so the complete portrait starts in view. Desktop player profiles and streak cards were inspected. Publication targets only `sanksresearchlab-test`; see `deployment.json` for the final hosted verification.
