# SourceSanity Hall delivery and verification

## Delivery state

Implemented on `feat/hall-auth-anonymous-case-files`, isolated from Agent 1's working tree and based on main `666ec9f54e934cd0096a279fba6a180daa6effa3`. Application implementation checkpoint: `5f640bc` (the later QA/documentation commit completes the delivery).

**Not deployed, not merged, and not live-OAuth verified.** External Supabase/GitHub/Google setup remains required. Full-repository lint has a confirmed baseline blocker. No real submitted reports were published; V1 contains six curated fictional educational cases only.

## Architecture and changed-file map

| Area | Files |
| --- | --- |
| Auth configuration/clients/authorization | `lib/auth/client.ts`, `config.ts`, `guards.ts`, `redirects.ts`, `server.ts`; `proxy.ts` |
| Server routes | `app/auth/login/page.tsx`, `app/auth/callback/route.ts`, `app/auth/logout/route.ts`, `app/hall/page.tsx`, `app/api/hall/route.ts` |
| Auth/account UI | `components/auth/AuthGate.tsx`, `LoginPanel.tsx`, `UserMenu.tsx`, `auth.module.css` |
| Protected community UI | `components/hall/HallExperience.tsx`, `hall-experience.module.css`; `components/roast/hall.tsx`, `HallCaseFileModal.tsx`, `hall.module.css`; backwards-compatible `components/shared/primitives.tsx` extensions |
| Separate fictional records | `lib/hall/types.ts`, `examples.ts`, `sanitize.ts`, `validate.ts`, `server.ts` |
| Narrow homepage integration | `app/page.tsx`, `lib/hall-navigation.ts` |
| Dependencies/setup | `package.json`, `pnpm-lock.yaml`, `.env.example` |
| Unit/integration tests | `tests/auth-client.test.ts`, `auth-config.test.ts`, `auth-guards.test.ts`, `auth-hall-page.test.ts`, `auth-redirects.test.ts`, `auth-routes.test.ts`, `hall-data.test.ts`, `hall-navigation.test.ts` |
| Browser tests | `e2e/hall-auth.spec.ts`, `hall-ui.spec.ts`, `support/auth-fixtures.ts`, `support/mock-auth.ts`, `support/mock-auth-server.ts`; migrated Hall expectations in `e2e/landing-polish.spec.ts`, `product.spec.ts`, `results-polish.spec.ts`; `playwright.config.ts` |
| Documentation | This document; [OAuth setup](oauth-setup.md); [future publishing design](anonymous-publishing-design.md); design/plan under `docs/superpowers/`; screenshots below |

Supabase SSR manages PKCE and session cookies. The request proxy refreshes sessions; both the Hall server page and Hall API independently call server-validated `getUser()`. Missing credentials/expired sessions fail closed. Return destinations are allowlisted internal Hall URLs; callback/logout origins require trusted `AUTH_SITE_URL`. HTTPS deployments use Secure, SameSite=Lax cookies. Logout is same-origin POST with local cookie invalidation and honest recovery if remote revocation cannot be confirmed. Auth responses are private/no-store.

The public homepage never imports the protected case fixtures: its existing fictional teaser is independent. Both scanning modes and their APIs remain public. Returning from the case file selects an allowlisted scan mode but never starts a scan.

## Commands and observed results

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Exit 0, including final browser-test changes. |
| `pnpm lint` | Exit 1: one baseline error at `components/roast/RepoResults.tsx:47` (`react-hooks/set-state-in-effect`) and 10 warnings in existing unrelated files. No new Hall/auth/e2e lint errors or warnings. |
| `pnpm test` | Exit 0: 23 files, 371 tests passed. Untouched baseline measured before implementation: 15 files, 275 passed. |
| `pnpm test:e2e` | Exit 0: 157 passed, 1 skipped, 1.9 minutes. Both desktop/mobile projects ran. The sole skip prevents duplicate screenshot writers in the mobile project; the desktop screenshot test captures both widths. No functional test was skipped. |
| `pnpm build` | Exit 0 after final application/CSS changes. All Hall/auth/API routes dynamic; public homepage still static. |
| Focused ESLint on changed auth/Hall/navigation/tests | Exit 0, no warnings. |
| `git diff --check` | Passed. |
| `pnpm audit --prod` | Exit 1: 82 advisories (1 critical, 32 high, 40 moderate, 9 low). Baseline dependency graph produced the same severity counts; baseline manifest/lockfile equal main. No unrelated dependency upgrades attempted. |

The lint blocker was reproduced against the baseline file; both main's Git blob and the baseline working file hash are `5f47cee4084a2fd04fe31f7bd4b18f077e1ad591`. It was intentionally not fixed in Agent 2's community/auth assignment. The initial full E2E attempt was interrupted by the command's 120-second limit after test 134 without failures; the final unrestricted run above completed.

Runtime warnings observed: Node's `module.register()` deprecation and Next's existing smooth-scroll HTML annotation warning during expiry navigation. Neither is reported as a clean-console claim or silently fixed outside scope.

## Privacy, interaction and browser evidence

- Strict schema/privacy tests: 26 passed. Unknown metadata, raw reports, URLs, email addresses, SHAs, secret-like values, identifying absolute paths, invalid IDs/dates and out-of-bound fields are rejected. All fixtures are fictional/anonymous with complete EN/ID fields.
- Auth/navigation tests: 54 auth and 16 navigation tests passed within the 371-test run. Negative cases include forged/expired sessions, unsupported data, malicious destinations, provider errors, missing trusted origin, logout CSRF and failed remote signout. No token logging was added.
- Browser OAuth tests use a separate loopback-only mock Supabase service, not an application authorization bypass. It checks recognized tokens, S256 verifier/challenge matching, code expiry and single-use codes. The actual app guards and callback/cookie exchange execute. Mock tests are not proof of live provider configuration.
- Anonymous Hall requests redirect to login; anonymous Hall API requests return 401 with no cases. Authenticated sessions restore; logout blocks subsequent Hall access. In-page expiry clears Hall UI and returns to the localized recoverable login view.
- Cards open the matching modal. Keyboard disclosures expand/collapse, background focus is blocked, Escape closes and restores the exact trigger. Search/category filters survive locale changes while the modal is open. Sorting assertions check actual ordered titles/heat, not merely visible controls.
- Gallery and modal overflow checked at 360, 390, 430, 768, 1024 and 1440px. Close targets are at least 44px, remain usable after internal scrolling, and reduced-motion asserts no card transform/transition.
- Existing anonymous scanner, results, evidence, fixes, share/download and dialog browser regressions passed. The Hall data layer has no dependency on `RoastReport` or the temporary store.
- Cross-user publication/draft access tests are not applicable: V1 has no user-owned publication/draft endpoint or persistence. Their authorization/RLS tests are explicitly required by the future design before publication can be enabled.

### Screenshots (fictional cases and mocked session)

These show local browser output, not a deployed site or a real community member. Test account avatars use initials rather than fetching real people's photos.

- [Desktop gallery](screenshots/desktop.png)
- [Mobile gallery](screenshots/mobile.png)
- [Desktop Bro Code Case File](screenshots/desktop-case-file.png)
- [Mobile Bro Code Case File](screenshots/mobile-case-file.png)

## Remaining external work and Agent 1 integration

Follow [OAuth setup](oauth-setup.md) to configure Supabase, GitHub and Google with placeholder-based environment instructions. Verify identity-only consent, exact local/current Vercel/future verified-domain callbacks, live refresh/expiry/logout and deployment behavior manually. No live credentials or production secrets were supplied or changed.

No changes to security scanner rules, repository extraction, secret detection/redaction, DeepSeek/provider behavior, security API contracts, shared report types or temporary report store. Agent 1 can integrate this branch independently; the only shared landing seam is Hall navigation plus safe locale/mode initialization in `app/page.tsx`. The existing global branding/rebrand track is deliberately not pulled into this feature branch.

Publication remains absent and disabled. [The future publishing specification](anonymous-publishing-design.md) requires exact-resource ownership verification, owner preview, explicit consent, sanitization, moderation, durable snapshots/RLS, withdrawal and takedown. It cannot be enabled until Agent 1 redaction work is integrated and independently reviewed.
