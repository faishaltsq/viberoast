# SourceSanity authenticated Hall design

Status: approved for implementation by user instruction to continue through completion.

## Intent and constraints

Build Bro Code's authenticated educational community corner: GitHub/Google login, Hall of Shame and Hall of Vibes, and detailed anonymous fictional case files. We roast mistakes, not makers. Website Judge and Repository Judge remain available without authentication. No submitted report becomes a Hall record.

Base: origin/main `666ec9f54e934cd0096a279fba6a180daa6effa3`.
Branch: `feat/hall-auth-anonymous-case-files`, isolated worktree `hall-auth`.
Main still contains VibeRoast branding. Use SourceSanity in new interfaces while preserving existing artwork, typography, palette, borders, and offset shadows. Do not pull unrelated rebrand or Agent 1 changes into this branch.

## Architecture

### Authentication boundary

Use current supported Supabase Auth SSR integration with Next.js 16. Verify official guidance and the installed Next.js local guides before implementation. Add only Supabase SSR/client packages needed by this integration; use existing Zod for runtime validation.

Separate browser and server clients. The browser receives only the Supabase project URL and publishable key, never service-role credentials. Server authorization validates the user with Supabase; cookie presence or client state alone never authorizes access. Follow supported cookie refresh and PKCE exchange handling, without a custom OAuth state implementation.

Routes:
- `/auth/login`: branded login/recovery UI, with GitHub and Google actions and a home link.
- `/auth/callback`: exchanges a single-use authorization code using the PKCE cookie, rejects failed/missing exchanges, and redirects only to an approved internal Hall destination.
- POST `/auth/logout`: validates same-origin requests, signs out, clears application auth cookies, and returns to login or home. Never mutate sessions with GET.
- `/hall`: dynamic, uncached server component validates the user before loading Hall data; anonymous visitors return through login to their requested Hall destination.
- `/api/hall`: independently validates the user and returns validated fictional cases, or an uncached 401. No user-specific report lookup or publication endpoint exists.

A request proxy handles supported session refresh and preserves refreshed cookies on redirects. It is not the sole authorization check. Scope it to Hall/auth routes as appropriate; do not gate scanner routes. Auth-related page, API, redirect, and error responses must not enter public caches.

Redirect handling uses a central allowlist, not a startsWith('/') check. Permit `/hall` with validated locale/collection/case query values; reject external URLs, protocol-relative URLs, encoded escape attempts, and arbitrary paths. Callback origin comes from validated deployment configuration, not untrusted forwarded headers. Provider keys are allowlisted to GitHub/Google. Use minimal identity scopes, never repository access or unrelated Google APIs.

Missing configuration produces a localized setup-unavailable message, not an application crash. Failed authorization, refresh failure, and expiry return a recoverable login state. Do not log codes, tokens, session cookies, or provider responses. Render only safe display name/avatar/provider in the account menu, never user identity in case files. Avoid arbitrary external avatar URLs unless restricted to trusted provider hosts.

### Navigation and locale

Replace homepage Hall SPA entry points with real `/hall` navigation. Remove the public SPA rendering path so it cannot bypass protection. Keep all scanner state/handlers and public scanner APIs unchanged.

Use validated `lang=en|id` navigation values and a non-sensitive same-site locale cookie shared by homepage and Hall; an explicit valid query overrides the cookie, otherwise default to English. `/hall` exposes a locale switch; changing it updates the open modal without remounting its trigger or losing gallery state. Preserve collection, search, sorting, and scroll while opening/closing cases. Modal footer links return to `/?mode=website` or `/?mode=repository` with locale retained; homepage reads the allowlisted mode, selects the form, and does not submit it.

### Hall data privacy

Create independent Hall types, validation, sanitization, and fictional fixtures under `lib/hall/`. Do not import `RoastReport`, the report store, scanner extraction, or AI provider code. Keep the fixture loading module server-only and pass approved validated records only after authorization. The API shares the same guard and fixture loader.

Strict schemas reject unknown properties and constrain identifiers, strings, collections, target kinds, heat (0–100), and finding shapes. Localized authored content covers titles, summaries, roasts, findings, strengths, limitations, and remediation. A finding has severity, category, evidence classification, technical explanation, commentary, and remediation. V1 evidence is fictional/synthetic only.

Model source type can represent a future approved publication, but the V1 loader accepts only `fictional-example` and `anonymous`. No implementation can enable publication through a fixture flag. Use neutral aliases, synthetic IDs/slugs, and paraphrased explanations. Do not include repository owners/names/URLs, source URLs, SHAs, file paths, emails, copied code, tokens, or report IDs. Avoid code snippets in initial fixtures; this minimizes searchable and secret-like content. Sanitization rejects disallowed content rather than claiming to make arbitrary raw reports safe.

Every card and modal shows a localized Fictional Example label. Explain comedy heat as entertainment, not a security or quality certification. Explain that hypothetical future anonymity cannot guarantee that unique circumstances are unrecognizable.

### Gallery and case-file UI

Designer owns Hall/auth layouts and styles, preserving existing visual identity rather than redesigning. Retain Shame/Vibes tabs, search, sorting, responsive cards, reset/empty states; add explicit category/target filters. Sorting supports heat ascending/descending and localized title. Case cards are semantic keyboard-operable controls with visible focus and restrained hover lift; reduced-motion disables movement.

`HallCaseFileModal.tsx` uses the existing native modal dialog contract, safely extending it only when needed. Include title/description associations, close control, mascot expression, verdict, comedy heat explanation, findings accordion, strengths, scope/limitations, and three footer actions. Use native keyboard-operable disclosure controls where suitable. Native `showModal()` supplies inert background and focus containment; explicitly verify Escape, initial focus, trigger restoration, and scroll preservation. Do not break existing dialogs. Near-full-screen mobile layout has internal scroll, no horizontal overflow, reachable close action and 44px minimum touch targets.

No AI request runs when a case opens. No invented statistics, testimonials, repository references, or evidence.

## Implementation ownership

- Auth lane: `lib/auth`, auth routes, request proxy, protected server wrappers and auth tests; owns auth-specific focused verification.
- Hall data lane: `lib/hall`, privacy/schema tests; owns data-specific focused verification.
- Designer lane: Hall/auth UI components and scoped CSS, mascot reuse, modal accessibility; owns focused component/browser checks after auth/data contracts exist.
- Integration coordinator: narrow homepage integration, package/config reconciliation, documentation, aggregate validation and delivery.

Writers must have disjoint files; establish interfaces before parallel implementation. Shared primitives and homepage edits have one owner at a time. Do not modify security checks, extraction, secret detection, DeepSeek, shared report contracts, or temporary report persistence.

## Verification and evidence

Use unit/integration tests with mocked external Supabase transport for OAuth start, provider allowlist, callback code/PKCE failure/success, malicious redirects, session restoration/expiry, logout, missing configuration, and sanitized errors. No production bypass header, development session shortcut, or embedded test credential. Browser tests may use an isolated mock auth service with explicit test environment configuration; never weaken production guards.

Exercise anonymous direct `/hall` denial and independent `/api/hall` denial; authenticated Hall access; user A session not authorizing user B resources where such resources exist. V1 has no per-user case resources; record that cross-user mutation tests are not applicable rather than inventing an endpoint. Verify both scanners remain anonymously reachable and no publication occurs.

Verify search, filters, sort, tabs, correct case details, finding disclosures, Escape/focus restoration, blocked background, locale changes while open, reduced motion, session expiry recovery and absence of horizontal overflow at 360, 390, 430, 768, 1024 and 1440px. Update old unauthenticated Hall tests to the new explicit authentication journey rather than retaining an unprotected duplicate.

Privacy tests reject identifying metadata, unknown fields, raw reports, URLs/SHAs/emails/secret-like values and unintended user identity in Hall payloads/rendered output. Assert no auth token logging and no dependency from Hall data to the private report store. Capture desktop/mobile screenshots using fictional data and mocked sessions, labeling them accordingly.

After reconciling all writers run once: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`. Record exact outcomes, failures and skips. Do not claim live OAuth, deployment, or production validation from mocks.

## Setup and future publication deliverables

Document placeholders for Supabase project URL, publishable key and trusted application origin; GitHub/Google secrets belong only in Supabase provider settings. Explain provider callback at Supabase, application callback allowlists for localhost/current Vercel/future custom domain, provider identity scopes, and safe configuration migration. Do not invent domains or alter live credentials/deployment names. Live OAuth remains pending until configured and manually verified.

Write `docs/hall/anonymous-publishing-design.md` as design only: private report → ownership-authorized publish request → sanitization → owner preview → explicit consent → moderation → immutable anonymous snapshot. Detail repository/domain verification (login alone is insufficient), durable Postgres storage separate from temporary reports, explicit RLS/authorization, separate public IDs, versioning, withdrawal/unpublish, reports, rate limits/spam control, sensitive-data takedown and moderation audit. Publication remains disabled until Agent 1 redaction integration and independent review.

Final delivery identifies branch/commit/PR, changed files, architecture/setup docs, screenshots, exact verification and privacy results, pending external configuration, and Agent 1 integration seams. No auto-merge/deploy; no real reports published.

## Progress checklist

- [x] Inspect fetched main and collaboration boundaries.
- [x] Obtain architecture approval.
- [x] Isolate branch/worktree and write specification.
- [x] Obtain written-spec approval.
- [x] Write implementation plan; execute supervised specialist lanes under the user's completion instruction.
- [ ] Implement auth, protected Hall, fictional case files and localization.
- [ ] Reconcile lanes, verify, document and deliver without deployment.
