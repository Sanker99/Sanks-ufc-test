# Approved NFL and UFC photos

This update integrates all 1,044 user-approved authentic athlete photos: 767 NFL players across all 32 teams and 277 UFC fighters. It is based on Sanker99/Sanks-ufc-test, design/v6-cinematic-rebuild at c34e188.

The registry in data/athlete-photos.json binds stable Lab player IDs, unique exact names and documented aliases to local transparent assets. Profiles, comparisons, UFC event tiles, NFL player tiles and NFL research panels share that registry. Unknown athletes keep the existing fallback. Images retain their orientation, full framing and source colors; old fighter-specific clipping, mirroring, masks and color filters are overridden.

Each source PNG remains unchanged in its standalone library. The Lab uses smaller transparent, lossless WebP copies (640px wide maximum, 960px tall for UFC and 640px tall for NFL). Every encoded copy was decoded and checked against the resized RGBA pixels. Total photo payload is 188.3 MB across 1,044 independently lazy-loaded files; the complete library is not fetched on page load. Original uniforms can reflect a different team; photos do not determine team assignments.

Players/fighters lacking a statistical record receive searchable photo-only profiles with empty game/fight histories. Existing statistical records and team labels remain intact. No statistics are fabricated. Current NFL roster metadata stays with the photograph. Source attribution and source URLs remain in the registry. User approval is recorded separately from copyright/license status.

## Validation

14 application tests pass, including every approved photo's identity, local path, searchable profile coverage, cross-sport isolation, missing-image fallback and unchanged statistical behavior. Desktop NFL and UFC layouts and a 390px NFL mobile layout were inspected in the running application. All delivery images decode with real transparency and their saved hashes match the registry.

## Regenerate photos

Run tools/import_photo_libraries.py --libraries /path/to/folder/containing/the/nfl-and-ufc-libraries using Python with Pillow installed. The importer accepts only approved masters whose recorded approval hash and actual file hash match. Run node --test tests/v5.test.cjs afterward.

## Deployment

User selected the test Lab. The dedicated workflow deploys only to the existing sanksresearchlab-test Cloudflare Pages project. The production Lab is outside this change.
