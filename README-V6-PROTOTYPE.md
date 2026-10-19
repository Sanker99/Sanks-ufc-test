# V6 visual direction — approval prototype

Branch: `codex/sanks-v6-cinematic-prototype`, based on the fetched latest V5 head `30ae55bdef6f9bda6e6ff48d3c7f8cbef1ed0ada` in `Sanker99/Sanks-ufc-test`.

## Approval boundary

This delivery implements the image registry and **one representative UFC design inside the application**. Open `/#/design/ufc-faceoff` after serving the repository. The sample compares Islam Makhachev and Charles Oliveira using published snapshot data. It does not announce or imply a scheduled bout.

The new visual treatment is restricted to that explicit route. It has not been rolled out to athlete profiles, NFL pages, existing comparisons or normal UFC matchup pages. That work requires the user's approval of the rendered direction. No production repository, production website, deployment target or Cloudflare setting was changed. No deployment or merge was performed.

## Design

The representative page replaces the card arrangement with a single wide arena composition: inward-facing authentic photographs, large condensed typography, outlined background lettering, CSS spotlights and smoke, a prominent central VS and an integrated Tale of the Tape. Names, country flags, source-coverage records and recent form sit within the composition. The original photograph pixels are preserved; there is no generated athlete imagery, mirrored anatomy or background reconstruction.

The layout reflows at phone widths: the portraits and names stay side by side while measurements continue below them in the same composition. Readable last-five histories and detailed statistics follow below. Profile links and the existing research comparison view remain available. The main application header, search and navigation continue to work; prototype-specific styling is removed on navigation away from this route.

The historical belt in Islam's 2022 photograph is not used to assert a current title. Records and measurements come from the existing UFCStats snapshot and retain its explicit coverage limitations. In this snapshot the fighters' listed weights differ; the design does not invent a shared weight class or booked fight.

## Image-source audit — reviewed 10/19/2026

The registry is `data/athlete-images.json`. Every entry includes its athlete identity, source page, original source, license URL, credit, capture date, adaptation rights, restrictions, packaged dimensions/size and SHA-256. The assets are local WebP files, avoiding third-party image hotlink dependencies. Registry entries for the two NFL athletes are prepared for a later approved design; the images are not inserted into existing V5 profile pages.

| Athlete | Selected source and copyright permission | Obligations and limits |
| --- | --- | --- |
| Islam Makhachev | [2022 archival portrait, NNT / Новости ННТ via Commons](https://commons.wikimedia.org/wiki/File:Islam_Makhachev_2022_UFC_belt_(cropped).png), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Retain credit, source/license links and modification notice. Source description credits an earlier crop/logo removal to Nyuhn. This is a documentary image, not a current studio portrait. |
| Charles Oliveira | [Renan Silva training photograph, 2021](https://commons.wikimedia.org/wiki/File:Charles_Oliveira_UFC_(51604091797).jpg), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Commons records a reviewed CC0 source. Credit and source links are retained even though attribution is not a CC0 condition. |
| Patrick Mahomes | [All-Pro Reels photograph, 2021](https://commons.wikimedia.org/wiki/File:Patrick_Mahomes_(51615475056).jpg), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | Credit/link/changes notice; photo adaptations remain under the same license. Not yet used in a redesigned NFL page. |
| Jalen Hurts | [All-Pro Reels / Joe Glorioso photograph, 2021](https://commons.wikimedia.org/wiki/File:Jalen_Hurts_1.jpg), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | Credit/link/changes notice; photo adaptations remain under the same license. Not yet used in a redesigned NFL page. |

**Sources not selected:** Official UFC/ESPN/Getty-style promotional portraits were not added because an applicable open reuse license was not established. Public visibility of an image is insufficient permission. A Charles Oliveira file carrying a Public Domain Mark was considered but an explicitly reviewed CC0 alternative was selected instead. The U.S. government Mahomes selfie and Hurts training-camp candidates had other people obscuring the athlete, so clearer licensed action photographs were selected for the registry.

Copyright permission is not an athlete endorsement, a trademark license or a general release of publicity/personality rights. These assets are used as attributed editorial research illustrations, with no endorsement claim. Source licenses are linked in the rendered credits. No paid photo service or recurring cost was introduced. If studio-quality promotional cutouts are desired later, obtain an applicable license or supply approved assets; no questionable replacement has been inserted.

### Adaptations and optimization

Photos were re-encoded as WebP without synthesized content. For the UFC prototype, hand-authored SVG silhouette masks remove background at render time, with CSS desaturation, contrast, lighting and responsive cropping. These are reversible display adaptations of the licensed photographs. Source files, authorship and change notices are preserved in the registry and the expandable in-app credits. The masks are a prototype and can receive further edge refinement after the direction is approved.

The two UFC portraits total **177,540 bytes** (about 178 KB): Islam 74,222 bytes; Charles 103,318 bytes. The two NFL images are not requested by the prototype. Existing text-only rendering is used when approved image metadata is absent; failed portrait downloads display an unavailable state. Registry failures provide a retry control. Sources with adaptation permission disabled do not render as masked portraits.

## Verification

Run `node --test tests/*.test.cjs` with Node 22+. **20 tests passed locally:** the 12 V5 checks plus eight checks for V6 route isolation, all four real athlete identities, source/license/attribution/asset hashes, image budget, unsafe/unreviewed image fallbacks, correct mask URL resolution, source-aware design content and registry failure/retry.

Actual in-app browser checks were performed at desktop 1440×1060 and phone 390×844:

- Both authentic portrait assets loaded and their masks resolved correctly.
- Page width and main scroll width stayed within the viewport at both sizes; header did not overlap the composition.
- The prototype links to the existing Islam/Charles comparison, retaining the sidebar and normal V5 appearance; second-athlete removal retained Islam.
- Universal NFL search and Patrick Mahomes/Jalen Hurts comparison remained functional.
- Mobile sidebar scrolling moved the sidebar while the main scroll position remained unchanged.
- Mobile main scrolling moved the main content while preserving the sidebar scroll position.
- Live UFC event-card navigation still opened a normal full-page V5 matchup without the prototype theme or an overlay.
- The prototype's fight-history link reached both real last-five histories; no browser application errors were observed in these checked flows.

The final approval screenshots are actual application captures. This is an interpretation of the written face-off direction; the earlier original concept image was not available in the chat for a pixel-by-pixel comparison. The full V6 rollout, all-athlete visual coverage, Safari/Firefox, physical-device testing and a deployed Cloudflare preview are outside this approval-stage delivery. No claim of full V6 completion is made.

## Review locally or in the separate preview

Run a static HTTP server from the repository root, then open `/#/design/ufc-faceoff`. All existing V5 routes remain available. For an authorized separate preview upload, `python tools/package_preview.py` includes the new scripts, registry and image assets automatically; follow the existing V5 deployment safety instructions. This prototype has not been deployed. Approve or revise the desktop and phone direction before proceeding to the broader UFC/NFL/profile redesign.
