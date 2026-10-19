# SANKS Research Lab V5

Development repository: `Sanker99/Sanks-ufc-test`.
Base: `preview/universal-search-v4`.
Working branch: `codex/sanks-v5-athlete-pages`.

## Behavior

- Universal search opens a main-content athlete profile with a direct hash link. The original detailed research sidebar remains available and can be hidden or reopened.
- Add Athlete opens an inline same-sport selector. Comparisons preserve the first athlete; the second can be replaced or removed. NFL comparisons show position-relevant published season totals, averages and sample counts. UFC comparisons show source-coverage records, measurements and available recent striking/grappling statistics, with last-five fight histories.
- UFC event matchups open inside the dashboard, without the former overlay. They link to individual profiles and support browser Back. Event names and scheduled dates travel in the URL; missing fighter coverage does not discard a published opponent name.
- The header and tabs occupy their own layout space. On desktop, the main workspace and right sidebar scroll independently. On narrow screens the sidebar occupies a separate lower scroll region; the profile’s Show/Hide detailed statistics button remains available.
- Displayed dates use MM/DD/YYYY. Timestamps also retain local time and timezone. Source values such as `2026 week 1` are preserved as week context rather than invented calendar dates.
- NFL and injury loading prefer `data/` snapshots, then fall back to root snapshots. Unchanged automatic refreshes preserve open comparison selectors. Athlete changes invalidate pending sidebar responses.

## Architecture and source audit

The existing dashboard remains static, with no server or paid service required. Legacy NFL research, streak calculations, charts, injury logic and UFC detail controls remain in `index.html`. New routing, adapters, profiles, comparison logic and news states live in `assets/v5.js`; workspace layout and profile presentation live in `assets/v5.css`.

The starting branch contains 1,597 NFL player entries in root `data.json` and 4,619 UFC fighter entries in `data/ufc-data.json`. The existing universal-search eligibility for NFL skill positions is preserved. Comparisons can search the available same-sport dataset. Sport adapters separate identity, presentation, source links and statistical fields; future NCAA support needs a real data adapter and dataset before it can be enabled.

NFL data is built through `server.py` and `build_cloud_data.py` from nflverse weekly statistics and schedules. Injury data comes through `injuries.py`. The root NFL snapshot contains the 2026 season and lacks player photographs, physical measurements and full career totals. Existing independent ESPN box-score verification is already unavailable in this static branch; V5 continues to label it unavailable.

UFC history is built by `build_ufc_csv.py` from public UFCStats CSV snapshots maintained by `Greco1899/scrape_ufc_stats`. Records in this builder are calculated from covered results, not authoritative complete professional records. Weight class comes from source bout labels; measurements can reflect a different historical point. Current organization, career rates, finish times, scheduled rounds and submission attempts are not consistently supplied. V5 does not infer them. Recent averages use only available cells in the last five recorded results and show the count of included fights. The existing ESPN UFC scoreboard supplies upcoming cards.

Recent news uses ESPN’s public sport news endpoint, with no key. Articles must have a safe source URL, publication date within 90 days and an exact normalized full-name match in headline, description or category text. The latest 50 articles are requested, but provider limits may return fewer; no complete athlete archive is promised. Success, no matching coverage, loading, source failure and retry are distinct states. Third-party access/CORS can change.

Optional sourced enrichment is supported by `data/athlete-content.json`, keyed by `NFL:<player id>` or `UFC:<normalized name key>`. Its initial athlete map is empty. Measurements need `source_url`; biography needs `text` and `source_url`. Photos need HTTPS `url`, `attribution` and a `license_url`; an editor must verify the license applies to this use before adding one. No new athlete photographs or biographies were added, and missing fields are explicit. Additional licensed photos, NFL measurements and full career datasets require source selection and identity mapping.

## Investigation: layout problems

The V4 sidebar was fixed to viewport top zero with a higher stacking order than the header. Its mobile rules expanded it to full-screen dimensions. The UFC matchup reused this sidebar with a viewport-wide shadow and modal-like geometry. Multiple historical overrides combined margin shifts, fixed positioning and body scrolling. V5 removes the matchup overlay rules and uses a bounded workspace grid with separately scrollable main and detail areas. Mobile research headers scroll with their panel, avoiding a sticky header taller than the available research area.

## Verification on 10/19/2026

Run `node --test tests/v5.test.cjs` (Node 22+). Twelve automated checks passed locally, covering script syntax, JSON parsing, route identities, actual snapshot totals, missing versus zero statistics, last-five coverage, news matching and retry, canonical-file fallback, dates, refresh stability, photo URL guards and injury absence exclusions. The dedicated V5 validation workflow runs these checks without deploying.

Actual browser checks used the Codex in-app browser at desktop 1440×1000, phone 390×844 and the default narrow viewport. These were interactive checks, not a Playwright test-suite run.

| Check | Result |
| --- | --- |
| NFL universal search → Patrick Mahomes profile | Passed; correct direct link, source totals, sidebar |
| Dated, linked athlete news | Passed; live ESPN article shown for Patrick Mahomes |
| NFL comparison → Josh Allen; replacement/removal | Passed; original athlete retained |
| UFC search/profile → Alex Pereira | Passed; measurements and last-five results |
| UFC comparison → Jon Jones | Passed; records, measurements, per-fight sample counts, unavailable metrics |
| Live UFC card → Volkanovski/Evloev matchup | Passed; full dashboard page, no overlay |
| Matchup → fighter profile → browser Back | Passed |
| UFC sidebar Results / Last 5 / All available | Passed; 5 and 7 visible rows for checked fighter |
| Desktop main/sidebar independent scrolling | Passed; moving either kept the other’s scroll position |
| Mobile main/sidebar independent scrolling | Passed; both remained accessible |
| Mobile page horizontal overflow | None at 390px in the checked profile/matchup views |
| NFL week picker and matchup roster navigation | Passed |
| Streak Finder → athlete profile | Passed; rushing-yard statistic and 50 threshold retained |
| Sidebar hide/show | Passed |
| Unknown athlete URL | Passed; unavailable state, retry and navigation links |
| Browser application error log | No application errors observed in checked flows |

Limits: not every athlete or upstream statistic was manually verified. No Safari/Firefox or physical-device tests were performed. Network failure/retry was tested with automated mocked responses; a live provider outage was not induced. Photo attribution rendering was unit-tested with fixtures, but there are no licensed photos to verify visually. NFL measurements, full career biographies, missing UFC rates and static ESPN box-score verification remain unavailable. No production or Cloudflare deployment was performed.

## Separate preview deployment

1. Check out `codex/sanks-v5-athlete-pages` in the development repository. Run the tests above.
2. Run `python tools/package_preview.py`. This stages only website files under `work/v5-preview/site` and creates `work/v5-preview/sanks-v5-preview.zip`. No Cloudflare operation runs. NFL root snapshots are also staged at canonical `data/` paths.
3. In Cloudflare Pages, select the **existing separate preview project serving `https://sanks-ufc-preview.pages.dev`**. Verify the project URL before proceeding. Create a deployment and upload the ZIP or staged site folder, with `index.html` at its root. If the project uses Git integration instead of Direct Upload, use its existing approved preview deployment process for this branch; do not change its settings to follow these instructions.
4. A branch-preview environment creates a branch-specific URL. To replace the root preview URL, use the deployment environment already configured to serve the root URL on that separate preview project. A Cloudflare environment label of “Production” in this separate project does not refer to the actual SANKS production site; verify the hostname before any upload.
5. Recheck search, profiles, comparisons, news, UFC matchup links and mobile scrolling at the resulting preview URL.

The two pre-existing deployment workflows target `sanksresearchlab-test`, which differs from the requested preview hostname. Their triggers and deployment targets are unchanged; they only gained asset copying so a future authorized deployment includes V5 assets. They do not deploy on a V5 branch push. Do not run them expecting to update `sanks-ufc-preview.pages.dev`.

Do not merge into `main`, touch `Sanker99/-sanks-research-lab`, deploy to `sanksresearchlab.pages.dev`, or change any Cloudflare project settings without explicit approval. No paid API, subscription, scheduled task or recurring cost was added.
