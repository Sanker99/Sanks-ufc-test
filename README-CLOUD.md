# Sanks Research Lab — Cloud starter

This is a **starter**, not a fully feature-equivalent cloud release.

## Deploy
1. Upload the contents of this folder to the root of the GitHub repository (including `.github/workflows/update.yml`).
2. In GitHub → Actions → Update NFL research data → Run workflow, run the first update. This needs repository Actions and write permissions enabled.
3. Connect the repository to Cloudflare Pages. Use the static site configuration (no build command, output directory `/`).
4. Once the data JSON files are committed, the website can read them.

## Limitations
- ESPN on-demand verification is **not available** in this static version. The interface explicitly reports this; no false verified labels are generated.
- A public Force Refresh that starts data collection needs an authenticated serverless endpoint and abuse controls. The GitHub Actions **Run workflow** control is the owner-only manual refresh for now. The website itself reloads published data once a minute.
- GitHub scheduled jobs may be delayed or skipped, especially on inactive repositories. The 30-minute interval is a target, not a guarantee.
- GitHub Actions usage and Cloudflare Pages free tier have usage limits. Private repository Actions minutes count toward quota.
- nflverse and ESPN are third-party data sources; availability and terms may change.
- Avoid placing passwords, API keys, or tokens in the repository.
- `server.py` remains for reference and is **not** hosted on Cloudflare Pages.

## v1.6: Refresh All Data
The header button bypasses browser/CDN caches and downloads the newest **already published** `data/data.json` and `data/injuries.json`. It also invalidates the UFC event cache and immediately reloads the ESPN UFC schedule when the UFC tab is open. It does **not** scrape new data, trigger GitHub Actions, update Cloudflare files, or guarantee that source datasets have changed. The existing GitHub Actions `workflow_dispatch` may be manually run in GitHub to rebuild the source JSON, but because this Cloudflare Pages site is a **Direct Upload** project, those updated GitHub files will not appear on Cloudflare until redeployed. To automate a full rebuild and publish, configure a trusted GitHub Actions deployment workflow with Cloudflare Pages credentials stored as GitHub secrets; never place credentials in browser JavaScript.

## v1.7 — UFC static data (experimental)
The UFC fighter panel now reads `data/ufc-data.json`, not the community UFC API. The event schedule still comes from ESPN. The ZIP includes an **empty, clearly labeled UFC seed dataset**, not fabricated fighter stats. Before meaningful UFC fighter data appears, run the new GitHub Actions workflow `Update UFC research data` (or `pip install requests beautifulsoup4 && python scripts/build_ufc_data.py`) and redeploy the updated `data/ufc-data.json` to the separate Cloudflare Pages Direct Upload project. GitHub Actions does NOT publish automatically to your Direct Upload Cloudflare project.

The experimental scraper accesses UFCStats public HTML with delays and limits. UFCStats accessibility, markup and access policies may change. Review site terms and robots policy before enabling recurring automated collection; disable it if not permitted. Collection and parser accuracy have not been verified against live UFCStats in this environment (network DNS unavailable). Verify fighter names, records, fight results, and per-fight totals against UFCStats before relying on the dataset. The site shows missing coverage explicitly. `Refresh All Data` only reloads published JSON and does not start a scrape.
