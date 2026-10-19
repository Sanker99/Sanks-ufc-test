# SANKS six-athlete illustration integration (TEST only)

This branch is based on `codex/sanks-v5-athlete-pages`, not V4 or production.

The V5 athlete profile and UFC matchup views now reference the following optional transparent WebP files:

- `assets/athletes/ufc/alexander-volkanovski.webp`
- `assets/athletes/ufc/movsar-evloev.webp`
- `assets/athletes/ufc/justin-gaethje.webp`
- `assets/athletes/ufc/max-holloway.webp`
- `assets/athletes/nfl/jalen-hurts.webp`
- `assets/athletes/nfl/justin-herbert.webp`

**Pending:** Upload all six WebP binary assets to these exact paths. The files were generated in ChatGPT and packaged separately but are NOT yet committed to this repository. The current code branch is not a finished visual preview.

**Review:** Verify image orientation in UFC matchup, missing-image fallbacks, desktop/mobile layout, NFL player pages, and preserved research stats. Deploy to TEST only after assets are present. Never merge to production without explicit approval.
