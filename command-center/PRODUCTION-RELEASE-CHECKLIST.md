# Production release gate

Status: BLOCKED. Do not deploy to live SANKS Research Lab without explicit owner approval.

1. Verify the Cloudflare Pages project currently serving sanksresearchlab.pages.dev and record its live deployment ID.
2. Export and archive the exact current live static files, Worker, routes, and bindings. Do not substitute the older TEST branch or GitHub main.
3. If production already has a Worker, manually integrate routes rather than replacing it.
4. Confirm a distinct production D1 database, apply required migrations, and configure encrypted analytics and password secrets plus exact production origins. Never commit secret values.
5. Run browser smoke tests on isolated TEST: admin login/logout, preview denial, page tracking, coarse location approve/revisit/revoke, and NFL/NCAA/UFC navigation.
6. Build from the captured live export, verify unchanged public sports assets, and run all tests.
7. Preserve the previous production deployment for rollback and rehearse restoring it without touching analytics data.
8. Obtain explicit approval for the exact release candidate and production project before deploying.
9. After deployment, check public Lab functionality and private admin security; roll back on any critical failure.

Cloudflare account settings, live deployment revision, and rollback artifact remain unverified from repository access alone. No production deployment is authorized by this file.
