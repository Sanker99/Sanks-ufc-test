# Production Command Center release

The public Research Lab remains the existing `sanksresearchlab` Pages project. The admin dashboard has its own Pages project, `sanks-command-center-production`, with production D1 database `sanks-command-center-production`. The TEST project and its D1 database remain separate.

## Why production is a separate Pages project

The verified Research Lab production deployment has no Pages Functions or bindings. Adding a Worker to that project would change how the public site is served. The TEST Command Center already runs on a separate host with its own configuration, so promoting that TEST project would risk mixing preview hosts, credentials, and analytics data. Deploy a separate production Command Center project and keep the Lab's static assets and sports routes out of that deployment.

The production Command Center package contains only its Worker, protected dashboard assets embedded in the Worker, and a small public landing page. Its health panel reads the published JSON snapshots from the exact `PUBLIC_ORIGIN`; it does not publish a reconstructed copy of sports data.

## Production Pages configuration

Create or verify the Pages project `sanks-command-center-production` with production branch `main`. Configure the following in **Production** environment only:

| Setting | Value |
| --- | --- |
| D1 binding | `ANALYTICS` → existing `sanks-command-center-production` database |
| `PUBLIC_ORIGIN` | `https://sanksresearchlab.pages.dev` |
| `ADMIN_ORIGIN` | `https://sanks-command-center-production.pages.dev` |
| `AUTH_MODE` | `password` |
| `ADMIN_ENABLED` | `true` |
| encrypted secret | `ADMIN_PASSWORD_HASH` in `sanks-v1$100000$…` format |
| encrypted secret | `ADMIN_SESSION_SECRET` (64–128 lowercase hex characters) |
| encrypted secret | `ANALYTICS_SECRET` (at least 32 characters) |

The three secrets stay in Cloudflare's encrypted Pages secret store. Never put their values in GitHub, a build variable, the repository, client JavaScript, or this document. The public collector accepts only the exact Lab origin and the Command Center endpoint origin, uses a non-cookie anonymous visitor identifier, and does not enable credentialed CORS.

Confirm the production D1 database already has migrations `0001_analytics.sql` and `0002_password_auth.sql`. The branch includes both migrations. Apply only a migration that is actually missing; do not recreate or clear existing tables. Check that the production database is distinct from the TEST database.

The GitHub Actions environment `command-center-production` needs the existing deployment credentials `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Use a Pages-scoped token with only the permissions needed to deploy the named project. The manual workflow is `.github/workflows/deploy-command-center-production.yml`.

## Release sequence

1. Verify the Pages project and production D1 binding/secrets above. These values are not inherited from TEST.
2. Build and validate on the feature branch with the manual workflow. It deploys only to the independent Command Center Pages project.
3. Verify anonymous `/admin` is denied or redirected to sign-in; verify wrong and correct passphrases, session persistence, logout, and private report APIs on the production host. Use the existing owner credential entry flow; never log a passphrase.
4. Send one page view from the live Research Lab after the public tracker integration is deployed. Confirm the visitor, page, section/sport, device, returning visitor, and 30-minute session records appear in the production D1-backed dashboard. Verify NFL, NCAA, and UFC route changes.
5. Confirm any older records already present in production D1 remain available. The dashboard uses its stored daily visitor rollups and retained activity tables; it does not fabricate or import Cloudflare Web Analytics history.

## Public-site patch and rollback

The feature branch change to `index.html` adds one compact `ADMIN ↗` header link that opens the production Command Center in a new tab. The tracker change sends existing event taxonomy to the independent collector using a random browser ID in local storage; it stops when DNT or Global Privacy Control is enabled and sends no cookies or credentials cross-origin. Search contents, IP addresses, and user account data are not sent.

The public-site production source must be patched against the currently deployed entry file, because this GitHub branch is not byte-for-byte identical to the live site's assets. Apply only the ADMIN anchor/style and tracker endpoint/visitor-ID changes to the archived live files, verify the site navigation and styles, and keep the original deployment artifact for rollback. Do not publish this branch as a wholesale replacement for the current Lab. Roll back by restoring the archived live HTML and tracker files; the Command Center and its analytics database remain independent.

No production deployment is performed by this workflow automatically. Public-site release remains a separate, narrow change after the exact live deployment artifact and rollback archive are recorded.
