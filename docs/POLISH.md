# Final product polish

## Baseline, branch and source provenance

- Starting HEAD: `64c0b5b2a3af1b2cfcf8603cb069844fc30dec6d`, originally on `feat/evidence-backed-mvp`.
- Dedicated branch: `polish/final-product-refinement`. No merge, push or deployment performed.
- Fetched origin. Remote `main`: `0fa0a499f10c433373429d2b39cbc8729052f254`; remote `feat/evidence-backed-mvp`: `7b550a8e939381f977454ac8d453cd992e830c31`. These were the two remote branches present.
- Existing working changes predate this task: scanner readiness, viewport screenshot privacy, homepage ticker, related tests and documentation. They were preserved, not counted as new polish work. The shared page/CSS carry the existing ticker forward; unrelated scanner/worker and documentation changes are not silently attributed to this task.
- Architecture verified: one Next.js client page with home/results/fixes/Hall views, three API handlers, an isolated scanner HTTP worker, server-only provider integration, temporary private reports, deterministic agent prompts and browser canvas PNG exports. No dependencies added.
- Real: scans, evidence, provider commentary when available, selected fixes, Markdown and PNG downloads. Illustrative: landing examples and Hall. Unavailable: GitHub analysis, public report links and community publishing. No fictional community data was promoted to real submissions.

## Focused checklist and completed changes

1. Preserve the existing paper/ink/muted-red/green palette, original Bro Code artwork, editorial typography, section compositions, borders and offset shadows. ENERGY 3 / RHYTHM 3 / MOTION 2.
2. Landing: visible field/card focus, accessible invalid state, malformed/custom-port feedback, unchanged typed input after submission/failure, Enter submission, duplicate-request prevention, concise intensity descriptions and distinct anticipation copy.
3. Loading/errors: honest request-wide status, a long-running message after 30 seconds, no invented progress, readable recovery for invalid destinations, busy/unavailable service, cooldown, unreadable responses, time limits and connection failure. Scanner-only reports stay visibly distinct from AI completion.
4. Bro Code: the canonical artwork remains unchanged. Local curious/confused modes supplement the existing states. Small event reactions, honest mood captions, hero breathing/blink and scanning CRT overlay provide feedback; reduced motion disables animations. No fabricated expression artwork or hardcoded contextual accusations.
5. Navigation/dialogs: current-destination indication, mobile Escape/outside-click dismissal, useful disabled feature labels, centered native dialogs, keyboard containment and opener-focus restoration. Removed React autofocus that captured the close button instead of the opener.
6. Results: final/requested URL and timestamp, screenshot loading/decode/error states and viewport controls, early limitations, confidence and verification metadata. Solid/dashed/double badges distinguish verified/heuristic/inconclusive findings without relying only on color. Provider-written positive verdicts are preserved. Empty/partial/scanner-only reactions do not imply an audit pass. Expired snapshots offer rescanning while retaining local evidence/downloads, without claiming that a serverless report was stored.
7. Fix mode: severity groups, included counts, persistent custom selections, readable evidence/acceptance checks, live agent/count/detail/language metadata and prompt preview. Clipboard completion is invalidated when content changes, including A→B→A races. Manual text selection, clipboard-denial fallback, empty selection and honest Markdown download-start/failure feedback are covered. Deselecting findings never means resolving them.
8. Sharing: separate fixed layout zones for square/landscape PNGs, bounded Unicode-aware wrapping, severity-prioritized evidence-linked findings, contained original mascot/screenshot, truthful missing/broken screenshot fallback, explicit comedy metric and website watermark. Privacy warning precedes export/share controls. Canvas backing pixels are released after encoding.
9. Hall: trimmed search, visible result counts, clear/reset recovery, sort and grouped collection controls; original illustrative cards and honest publishing labels remain.
10. Responsive/accessibility: all four screens exercised at 360/390/430/768/1024/1440px. Fixed 360px screenshot clipping caused by an auto-width aspect-ratio box with a minimum height. Input targets are at least 44px; mobile search/select text is 16px. Keyboard focus, alert/status associations, native dialogs and reduced motion exercised.
11. Performance: enabled built-in Next image optimization for the large local mascot while keeping scanner data-URL captures explicitly unoptimized. Prompt computation is memoized across feedback-only updates; no speculative framework or scanner rewrites.

## Fresh verification evidence

| Check | Observed result |
| --- | --- |
| `pnpm test` | 137 passed across 7 files, including API/security/scanner/provider/prompt integration boundaries |
| `pnpm lint` | Exit 0 |
| `pnpm build` | Exit 0; home, not-found and three API handlers emitted |
| `pnpm typecheck` | Exit 0 |
| `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` | 90 passed across desktop/mobile projects |
| Dialog focused regression | Failed before opener-lifecycle correction; focused 12-test dialog/product run passed afterward; final full suite passed |
| Browser surface smoke | Home/results/fixes/Hall at all six requested widths; no horizontal document overflow; corrected screenshot right edge 343px within a 360px viewport |
| Reduced motion | Zero running animations observed after emulating reduced motion |
| PNG exports | Both exact PNG dimensions/signatures, EN/ID short/long strings, missing/broken screenshots, layout bounds, uncropped mascot and failure paths passed; actual output images visually inspected |
| Provider catalog | Configured model available; text and image input catalog-verified; no paid completion requested by catalog check |
| Client credential boundary | 12 production JavaScript files checked against configured `DEEPSEEK_API_KEY` and `SCANNER_TOKEN`; zero exact-value matches |
| Built product smoke | `pnpm start --port 3001`: language and all four fixture-backed views exercised; no uncaught application exception observed |

Browser setup issue encountered and resolved: Next dev was started as `localhost` while tests visited `127.0.0.1`. Development logs showed blocked cross-origin dev resources and the page remained unhydrated. Starting `pnpm dev --hostname 127.0.0.1` restored interaction. No `allowedDevOrigins` wildcard or safety bypass was added. A generated dev-cache directory was renamed during diagnosis and retained under ignored `.next/`; it was not the fix.

The local production smoke recorded an unavailable `/_vercel/insights/script.js` request because a native Next server does not serve Vercel's analytics endpoint. This was not suppressed or represented as a successful analytics check. Browser-runner output also includes Node deprecation/color-environment warnings; they did not fail the checks.

A brittle duplicate clipboard-error wording test was removed. The replacement coverage exercises actual manual selection, current prompt content, denied clipboard access and Markdown behavior rather than pinning incidental error prose.

### Performance measurements

| Measurement | Bytes |
| --- | ---: |
| Original canonical mascot PNG | 1,401,868 |
| Observed 640px optimized WebP body | 13,574 |
| Final home first-load JS, uncompressed (Next diagnostics) | 666,968 |
| Same first-load chunks, summed local gzip encoding | 201,961 |

The image numbers compare the actual source file with an observed responsive rendition, not a measured page-speed improvement. The gzip sum is a local calculation, not a production transfer measurement. No before/after JS-bundle reduction is claimed.

## Deployment-aware verification

Current production deployment inspected without changing it:

- Vercel ID `dpl_AdT544YdSmC9DwBnVBFNWeqiBHBi`, Ready, production alias `https://viberoast-app.vercel.app/`.
- CLI deployment metadata identifies `feat/evidence-backed-mvp`, commit `64c0b5b2a3af1b2cfcf8603cb069844fc30dec6d`, **`gitDirty: 1`**. The SHA alone cannot reproduce its uploaded source exactly.
- Runtime is Vercel Node lambdas. Environment metadata includes scanner/provider configuration names, not their secret values. GET report retrieval returned `501 REPORT_STORE_UNAVAILABLE`, confirming the explicit serverless behavior rather than pretending process-local storage is durable.
- One authorized production browser scan of the supplied VibeRoast website completed. The browser displayed captured time `11/2/2026, 6:31:12 PM` and verdict “Zero findings, maximum swagger”. Actual 1280px JPEG loaded; DOM evidence plus AI image review was reported; navigation 1131ms, 22 requests, 0 failed requests/console errors, 0 findings. Passive limits remained disclosed. This is connectivity/evidence proof, not a quality certificate.
- A production request for `http://127.0.0.1/` returned `400 INVALID_URL`. No isolation rule, credential, remote configuration or deployment flag was changed.
- The polished branch has **not** been deployed. The live scan proves the existing deployed integration, not a rollout of these UI changes.

## Screenshots and output samples

Before/after comparison is available for the desktop landing page. Other local result/fix screenshots use visibly labeled deterministic fixtures, not purported real scan findings.

- [Before landing, desktop](screenshots/polish/before-home-1440.webp)
- [After landing, desktop](screenshots/polish/after-home-1440.webp) · [mobile](screenshots/polish/after-home-390.webp)
- [Results, desktop](screenshots/polish/after-results-1440.webp) · [mobile](screenshots/polish/after-results-390.webp) · [360px](screenshots/polish/after-results-360.webp)
- [Fix mode, desktop](screenshots/polish/after-fixes-1440.webp) · [mobile](screenshots/polish/after-fixes-390.webp)
- [Hall, desktop](screenshots/polish/after-hall-1440.webp) · [mobile](screenshots/polish/after-hall-390.webp)
- [English landscape PNG fixture](screenshots/polish/export-en-landscape.png) · [Indonesian square PNG fixture](screenshots/polish/export-id-square.png)
- [Authorized live production scan](screenshots/polish/production-live-scan.webp)

## Known limitations and remaining priorities

1. No deployment/merge approval was given. Review the local commits before any rollout.
2. Reproducible production provenance needs a clean committed deployment rather than a dirty CLI upload.
3. Shared durable retention/rate limiting remains absent. Serverless retrieval is intentionally unavailable; process-local abuse limits do not coordinate across replicas. Do not describe this as solved or generally production-ready.
4. No current-host network-isolation penetration test was repeated. Scanner connectivity was verified through the authorized live scan; existing scanner isolation constraints and historical worker verification were preserved.
5. Chrome desktop and emulated mobile widths were exercised, not physical iOS/Android devices, Safari or actual on-screen keyboards. Automated contrast checks cover the retained/changed UI palette, not arbitrary scanned-site screenshot pixels or a formal WCAG certification.
6. The original mascot has one artwork, not twelve newly drawn expressions. States are communicated through subtle effects, captions and contextual behavior.
7. Passive sampling, screenshot privacy/redaction limits, expiring browser-held reports, no community publishing and no GitHub analysis remain as documented in the existing implementation notes.

## UI quality delivery gate

### Hard gates

- R-02 PASS: new UI prose avoids em dashes; existing owner-approved editorial voice is retained.
- R-03 PASS: four screens checked at six widths; 360px screenshot clipping corrected and regression-covered.
- R-17 PASS: no fabricated engagement/quality statistics; comedy heat remains disclosed.
- R-18 PASS: no testimonials or fictional customer identities added.
- R-23 PASS: original mascot reused; screenshot/output artifacts are requested verification evidence, not invented visual assets.
- R-24 PASS: home/Hall/how navigation and return actions exercised; unavailable GitHub/public-link controls labeled.
- R-25 PASS: contrast tool verified paper/ink 14.48:1, muted/paper 5.42:1, retained muted/paper 4.62:1, light/red 5.97:1, green/light 6.80:1, medium severity/paper 6.11:1 and export green/paper 7.78:1.
- R-26 PASS: visible controls exercised by browser suite and remaining-control smoke; unavailable features explicitly disabled/labeled.
- R-27 PASS: pending, empty, partial, scanner-only, invalid, denied-copy, image failure and service recovery states exercised.
- R-28 PASS: no generic FAQ added.
- R-32 PASS: field Enter, menu Escape, focus indication, native dialog containment/return and keyboard controls exercised.
- R-33 PASS: changes made in source, no external source-rewrite script.
- R-34 PASS: approved fixed paper theme retained; no broken alternate theme introduced.
- R-35 PASS: production build, 90 browser checks and actual surface smoke executed.
- R-36 PASS: no invented vulnerabilities, audit certifications or performance guarantees; scanner/provider trust boundaries preserved.
- R-37 PASS: supplied visual direction followed; explicit ENERGY 3 / RHYTHM 3 / MOTION 2.
- R-38 PASS: Hall/landing fiction remains labeled; result-path content remains report-backed.

### Purpose gates

- R-01 PASS: no new decorative gradient/glow; existing Hall artwork remains approved example styling.
- R-04 PASS: file/copy/evidence icons describe real actions; existing brand marks retained.
- R-06 PASS: existing editorial type retained; monospace confined to developer controls/evidence/prompts and state captions.
- R-07 PASS: no new background grid; original mascot image texture unchanged.
- R-08 PASS: retained arrows identify existing navigation/actions, not a new universal ornament.
- R-09 PASS: new badges communicate actual verification status, not marketing claims.
- R-10 PASS: no glass/backdrop blur introduced.
- R-12 PASS: approved offset shadows mark existing action/report surfaces.
- R-13 PASS: no decorative glow added.
- R-14 PASS: existing content compositions retained; severity grouping reflects real priority.
- R-19 PASS: motion signals focus/request/reaction; explicitly requested idle/ticker motion respects reduced motion, and ticker pause remains functional.
- R-22 PASS: canonical Bro Code illustration only, with no unrelated replacement.

### Liveliness

- Dials PASS: 3/3/2 recorded before implementation and matched by retained bold editorial rhythm plus restrained feedback.
- Consistency PASS: original hero/section structure remains; no dashboard template introduced.
- Focal point PASS: hero submission, report verdict, fix prompt and Hall collection retain their screen-specific jobs.
- Whitespace PASS: existing spacing rhythm preserved; mobile controls reflow rather than hiding essential content.
- Accent PASS: muted brand red remains the main emphasis; green denotes constructive/evidence feedback.
- Identity PASS: original mascot, paper/ink treatment and contextual voice retained.
- Design read PASS: supplied indie-developer/editorial-comic direction explicitly adopted before edits.

### Craftsmanship and consistency

- C-1 PASS: changed effects serve focus/status/evidence clarity; no new visual system.
- C-2 PASS: all changed actions exercised, not cosmetic button shells.
- C-3 PASS: no unrelated features, template sections or card nesting added.
- C-4 PASS: six widths, keyboard, empty/error/loading, clipboard denial, PNG failures and reduced motion exercised.
- C-5 PASS: no fabricated testimonial, production usage or security/performance claim.
- R-05 PASS: existing composition preserved.
- R-11 PASS: existing squared borders retained, no universal pill treatment.
- R-15 PASS: actions name actual scans/fixes/copy/download/filter behavior.
- R-16 PASS: new copy describes concrete behavior, not AI marketing buzzwords.
- R-20 PASS: canonical visual identity remains recognizable.
- R-21 PASS: owner-approved light paper theme preserved.
- R-29 PASS: existing paper/ink/red/green/yellow palette reused for its existing semantic roles.
- R-30 PASS: no imitation of another SaaS product.
- R-31 PASS: rationale: red/type preserve identity; status captions explain unchanged artwork; verification borders encode certainty; reserved image zones prevent clipping; native controls/focus restoration improve access.

## Independent review

Independent read-only reviews of the product flows and export/evidence boundary found no blocking issues. A minor truthfulness issue was corrected: the rescan comparison now says **lower weighted roast heat**, not fewer findings, because a lower weighted score does not imply a smaller finding count. Its incidental wording assertion was removed; the rescan/selection/language and approval-state behavior remains covered.

The specialist reviewer route produced no review output, so the two independent reads were completed by general-purpose workers instead. Their verdicts are static review, not separate executions of the test suite.

## Working-tree boundary

Verification ran against the preserved working tree, including the scanner/readiness/privacy changes that were already present at the start. Those unrelated scanner/worker, README/verification and existing test changes remain uncommitted; the untouched pre-existing ticker test also remains untracked. The shared page/CSS commit carries the pre-existing ticker UI forward because those files were part of the polish. A clean checkout of only the final polish SHA does not include the separate pre-existing backend changes. Review and commit those separately before attempting a reproducible release.

## Follow-up: local ORIGIN_DENIED correction

The local `.env.local` pins `APP_ORIGIN` to `http://127.0.0.1:3102`, while the standard development server uses port 3000. The mutation guard was applying that stale canonical URL in development, rejecting legitimate local submissions before URL validation.

Development now checks the actual request origin (host, scheme and port). Production still honors the configured `APP_ORIGIN`; `Sec-Fetch-Site: cross-site` remains rejected. No environment file, secret, CORS policy or production origin allowlist was changed.

- Focused HTTP/API tests: 18 passed; full unit/integration suite: 138 passed.
- TypeScript, lint and production build: exited 0.
- Actual development browser submission on port 3000 reached private-URL validation instead of origin denial; input was retained. A same-origin empty request returned `400 INVALID_REQUEST`.
- Actual development HTTP probes rejected an attacker origin, the stale port-3102 origin and a cross-site marker with `403 ORIGIN_DENIED`.
- Built production server on its configured port 3102 accepted the canonical origin through to `400 INVALID_REQUEST`, but rejected port 3000 and an attacker origin with `403 ORIGIN_DENIED`.
- No scanner or paid AI call was needed for these boundary checks. No deployment performed.
