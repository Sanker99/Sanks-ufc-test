# Password login - no Cloudflare Access signup

This is the selected authentication method. It uses the existing Pages/Worker and D1 services; no Zero Trust account, payment method, external identity provider, or paid subscription is required by this implementation.

## Already prepared

- The test database `sanks-command-center-test` exists and is bound as `ANALYTICS` in the `sanks-ufc-preview` project's Preview environment.
- The analytics schema is applied. The password migration `migrations/0002_password_auth.sql` has also been applied and its two tables/expiry index verified in the test D1 console.
- The separate test project is set to fail closed. The prepared feature-branch Worker still denies admin by default; login needs explicit environment configuration.
- The two earlier previews have been deleted through the Cloudflare dashboard.
- No owner password or real authentication secret has been created by the agent.

## Owner credential setup

1. Open the downloaded local `SANKS-Password-Setup.html` file in your browser. This file makes no network requests and does not save populated password files. Its cryptographic generation runs in your browser. Do not enter the passphrase into this chat.
2. Choose and confirm a unique password-manager-generated passphrase of 20-256 characters, then select Generate. Keep the passphrase in your password manager.
3. In the test Pages project's **Preview** environment, add `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` with type **Secret**, using the two matching outputs. Copy them directly from the local setup page. Do not paste them into chat or commit them.
4. Close the local helper when finished. Tell the agent that both encrypted secrets have been added; never send their values.

This is a credential-creation step, so the owner enters and saves the secret values personally. The helper clears the passphrase inputs after generating the values. It never submits a password to a service. Losing the helper outputs before saving requires regenerating and replacing both values.

## Remaining test configuration and deployment

Set `AUTH_MODE=password`, `ADMIN_ORIGIN` to the single exact HTTPS test origin, and keep `ADMIN_ENABLED=false` until the prepared build, schema and secrets are ready. `ANALYTICS_SECRET` is a separate encrypted random collection secret. `PUBLIC_ORIGIN` is the exact collection origin; preview collection remains disabled unless explicitly configured as an isolated collection test.

Only the generated integration build contains the functional login: run the existing static packaging step, then `node command-center/build.mjs work/v5-preview/site <clean-project-local-output>`. Deploy the generated output to an isolated test project/branch. Do not change build settings globally across unrelated preview branches. For this feature branch, `node command-center/prepare-preview.mjs` generates the same reviewed Worker and tracker at the repository root for the existing automatic Git integration. The new bundle test checks generated code exactly matches the reviewed sources. Default denial and exact-host checks remain active.

After deployment with complete settings, enable admin **only in that test environment** and check the criteria below. New variables and bindings take effect on redeployment. No production deployment is approved by this document.

## Security model

- `AUTH_MODE=password` is explicit. Unrecognized modes, missing database/settings, disabled admin, HTTP origins and host aliases fail closed. Access JWT mode remains available as an optional future choice; no fallback between modes occurs.
- The public `/admin/login` form is the only public admin UI when password mode is fully configured. Protected HTML/JS/map assets and report APIs still require a server-verified session. An unauthorized `/admin` navigation redirects to login; report/asset requests return 403.
- The server verifies a salted PBKDF2-HMAC-SHA256 derived verifier with a separate random secret pepper. The verifier and pepper are encrypted Cloudflare secrets; neither is stored in D1 or embedded in client JavaScript. Actual password verification always occurs on the server. The local helper only creates the configuration pair.
- Workers currently limits PBKDF2 to 100,000 iterations. This is below OWASP's general 600,000-iteration SHA256 recommendation. A unique long random owner passphrase, separate secret pepper, encrypted verifier storage and strict online attempt limits are required compensating controls; no claim of meeting that higher work factor is made. Native crypto behavior and free-tier CPU allowance still require real-edge login testing before activation. References: https://github.com/cloudflare/workerd/issues/1346 and https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html.
- Successful authentication creates a random 256-bit session token. The Secure, HttpOnly, SameSite=Strict, host-only cookie expires after eight hours. D1 stores only a credential-version-keyed HMAC of the token and its expiry.
- Login attempts are limited to ten per network source and sixty globally per fifteen-minute window using atomic D1 counters before expensive password work. Only a daily keyed HMAC of the source IP is stored, strictly for abuse prevention; raw IPs are never stored. Counters are cleaned after a day on subsequent attempts. Limits can temporarily deny the owner during deliberate abuse; there is no email/password reset endpoint.
- Login and logout require same-origin POST, the exact configured Origin, and same-origin fetch metadata. Login bodies are bounded to 4 KB. Password comparison uses native Web Crypto verification. Error responses do not echo passwords or expose internals.
- Logout deletes the server session; expired sessions cannot be reused. Replacing either encrypted credential value invalidates existing sessions. Changing the session secret requires generating a new matching password verifier.
- Password mode is a single-owner login without MFA, account recovery or multiuser roles. Only Cloudflare account owners who can replace the encrypted credentials can recover access. Use a password manager and protect the Cloudflare account itself.

## Acceptance checks before enabling production

Verify correct and incorrect passwords, secure cookie persistence, logout revocation, expiration, host isolation, API/asset denial, cross-site rejection, login throttling, and missing/failed D1 behavior. Check native PBKDF2 performance on a real test deployment, plus desktop/mobile sign-in and the existing dashboard views. All admin routes must remain inaccessible on unrelated previews. Keep fail-closed mode configured in the actual deployed environment so exhausted Worker quota cannot expose static source.

Production remains disabled until these checks pass and deployment is approved. Once activated, the owner visits `/admin`, enters the passphrase on the secure login page, and can sign out from the dashboard.

Preview preparation: the owner saved the two credential secrets. AUTH_MODE=password, ADMIN_ORIGIN and PUBLIC_ORIGIN are limited to the feature-sanks-command-center preview hostname; ADMIN_ENABLED remains false pending explicit test activation. A separate random ANALYTICS_SECRET was encrypted in that Preview environment. No production settings or login credentials were read.
