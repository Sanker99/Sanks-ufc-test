# Command Center deployment audit — 2026-10-26

## Confirmed repository and source
- Correct complete Lab: `Sanker99/Sanks-ufc-test`.
- Current test refresh workflow: `.github/workflows/deploy-cloudflare-test.yml`.
- Scheduled test deploy runs at minutes 17 and 47 each hour, checks out `codex/11-task-improvements-2026-10-20`, stages `work/site`, and deploys with Wrangler to `sanksresearchlab-test` on `main`.
- Consequently a manual deployment to the same test project's main deployment can be overwritten at the next scheduled refresh. Do not deploy this feature to that target until integrated with its automated pipeline.
- This feature branch contains `command-center/`, a generated root `_worker.js`, `_routes.json`, and `sanks-tracker.js`, with automated validation and no deployment job.
- The older private `Sanker99/-sanks-research-lab` repository is a starter and its Command Center ZIP must NOT replace the current site.

## Database and configuration compatibility
- The verified existing D1 tables `meta, visitors, days, events, sessions, limits, admin_sessions, admin_login_limits` correspond to `command-center/migrations/0001_analytics.sql` and `0002_password_auth.sql`.
- Existing test Pages binding `COMMAND_CENTER_DB` is NOT the name required by this feature. This feature uses `env.ANALYTICS`. Add an `ANALYTICS` binding to the existing test D1 database in the isolated preview environment; do not remove `COMMAND_CENTER_DB` until no deployed code depends on it.
- Previously configured `ADMIN_USERNAME`, `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` belong to a DIFFERENT login implementation. This feature expects `ADMIN_PASSWORD_HASH` in `sanks-v1$100000$...` format, `ADMIN_SESSION_SECRET`, `AUTH_MODE=password`, `ADMIN_ENABLED=true`, and an exact HTTPS `ADMIN_ORIGIN`. **Do not enable this login with the old hash; do not paste secrets into chat.**
- The feature also requires a separate `ANALYTICS_SECRET` for collection, and `PUBLIC_ORIGIN` matching the collector's exact HTTPS origin. Keep collection disabled until tested.
- Check host-specific bindings and settings: the previous notes reference a separate `sanks-ufc-preview` project, while the user configured `sanksresearchlab-test`. Never assume settings are shared between projects or between Production and Preview environments.

## Safe next steps (not yet executed)
1. Validate the current feature branch with its `command-center.yml` CI.
2. Use an isolated preview hostname and its own explicitly verified bindings/secrets. Do not replace the scheduled test site's main deployment.
3. Test anonymous /admin and /api/admin denial, correct and incorrect password, sign out, admin data read, site passthrough, and noncollection on unrelated origins.
4. After preview passes, incorporate Worker/tracker build into the existing scheduled test deployment pipeline on a dedicated integration branch and review the change before changing the scheduled job.
5. Do not merge to main or deploy to the public site without approval.

## Status
This audit is repository-only. Cloudflare environment values, live password authentication, and real analytics ingestion have not been verified. No deployment or D1 migration was performed.
