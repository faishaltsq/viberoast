# Verification report

Branch `feat/evidence-backed-mvp`, baseline `0fa0a499f10c433373429d2b39cbc8729052f254`.

## Browser evidence, screenshot preview, and UI/UX judge (2026-11-02)

Three requested refinements were implemented on the existing working tree. The approved paper/ink/red identity, Bro Code artwork, scanner isolation, and privacy boundary were preserved. No dependency, provider, or second AI call was added.

- **Preview scrollbar:** the screenshot region keeps native scrolling but hides its scrollbar locally; it is focusable, labeled, and shows the existing frame focus outline. Page and prompt scrollbars are unchanged.
- **Browser evidence:** console errors, uncaught exceptions, and failed requests now produce bounded, redacted, deduplicated findings instead of counters only. Scanner-caused aborts and ambiguous proxy/network noise are withheld from website findings and retained as labeled diagnostic context. Uncaught exceptions are verified as observed exceptions, not proof of broken flows; console and failed-request findings remain heuristic.
- **UI/UX judge:** a versioned typed rubric (`lib/ai/skills/uiux.ts`) is trusted system instruction. The existing completion returns required `visualFindings` only for supplied viewports, with server-reserved IDs, UI/UX categories, low/medium severity and confidence, and `source: browser` / `verification: heuristic` provenance. Unknown viewports, spoofed verification, measurements, duplicates, and over-capacity output are rejected. Validated findings are appended to the report before retention, so Results, Fix My Shame, prompts, and exports share one report.

| Check | Observed result |
| --- | --- |
| `pnpm test` | 207 passed across 8 files |
| `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` | 98 passed across desktop/mobile projects |
| `pnpm typecheck` | Exit 0 |
| `pnpm lint` | Exit 0 |
| `pnpm build` | Exit 0 |
| Preview scrollbar regression | Tall captured JPEG: `scrollHeight > clientHeight`, `scrollbar-width: none`, zero scrollbar gutter; PageDown and wheel both moved `scrollTop`; mobile preview also scrollable |
| Browser evidence regression | Real console error, uncaught exception, and failed resource produced three findings with redacted evidence; scanner-aborted POST and its console noise produced zero findings and labeled diagnostics |
| Visual judge regressions | Grounded observation accepted with heuristic provenance; no-vision, unsupplied viewport, forbidden category/severity/confidence, extra fields, spoofed verification, measurements, duplicates, unknown/duplicate/over-capacity IDs, and secret redaction rejected or sanitized; empty visual review accepted |
| Report integration | Visual finding retained in `scan.findings`, rendered as `HEURISTIC · REVIEW` with screenshot location/evidence/source, and carried into the generated implementation prompt |
| Existing behavior | Scanner-only reports, empty reports, expiry, PNG export, ticker, dialogs, and share flows still pass |

### Antislop Delivery Gate: changed surface only

- R-02 PASS: no em dash added to static copy; new labels are plain descriptions.
- R-03 PASS: 390px mobile project passed; no horizontal document overflow introduced.
- R-12/R-13/R-14 PASS: no new shadow, glow, or card structure; existing finding card reused.
- R-17 PASS: no new numerical quality, performance, or WCAG claim; the judge rejects measurements and the comedy heat remains issue density.
- R-19 PASS: no new motion; the preview scrollbar change is static.
- R-20/R-23/R-29/R-34 PASS: existing palette, typography, artwork, and single theme retained; no new asset.
- R-25 PASS: focus outline reuses `var(--ink)` on the existing paper surface.
- R-26/R-32 PASS: wheel and keyboard scrolling exercised; the preview is focusable and labeled.
- R-37 PASS: targeted change only; no redesign or template critique added.

Rollout: browser-evidence changes require redeploying the isolated scanner worker and running a new scan. Frontend/provider changes require deploying the web app. Existing reports are not retroactively regenerated. No deployment, merge, or push was performed.

## Homepage ticker restoration (2026-11-02)

The owner requested that the red homepage strip move left and re-enter from the right. A later unconditional `.ticker-inner { animation:none; }` rule had disabled the original animation. The replacement removes that override and moves two identical, viewport-covering groups through exactly half the track width, so the next copy meets the first without a jump.

Design read: the existing VibeRoast homepage for developers, preserving its paper/ink/red editorial-comic identity. ENERGY 3 / RHYTHM 2 / MOTION 2. The owner-requested ticker is the only restored continuous motion; Pause/Resume and reduced-motion support keep it optional. Existing colors, typography, spacing character, and assets remain in use rather than adding decoration.

| Check | Observed result |
| --- | --- |
| Movement regression before correction | Desktop and mobile failed because no scrolling animation existed |
| Ticker regressions after correction | Seamless EN/ID loop, keyboard pause/resume, and reduced-motion reflow passed on desktop and mobile |
| Browser suite | 26 passed |
| Unit/integration suite | 137 passed |
| Lint, build, typecheck | All exited 0 |
| Production deployment | `dpl_AdT544YdSmC9DwBnVBFNWeqiBHBi`, Ready, aliased to `https://viberoast-app.vercel.app` |
| Production desktop motion | Track position moved from -14.93px to -16.00px at 1920px width |
| Production keyboard controls | Enter paused at a stationary position with visible focus; Space resumed running |
| Production mobile motion | Indonesian track moved from -20.76px to -21.95px; document and viewport both 390px |
| Reduced motion | No track animations; primary message fit between x=12px and x=378px within 390px; unnecessary pause control hidden |
| Contrast and targets | Text/focus on red 5.97:1; decorative separator 3.99:1 non-text contrast; control 80px by 44px |
| Production diagnostics | Browser error list empty after motion, keyboard, language, mobile, and reduced-motion checks |

The local smoke encountered an unavailable `/_vercel/insights/script.js` endpoint on the native Next server. This was not treated as a ticker JavaScript failure or suppressed; the deployed Production check above had no recorded browser errors.

### Antislop Delivery Gate: ticker change only

This gate covers the changed strip and its control, not a new audit or redesign of the entire site.

#### Hard Gate

- R-02 PASS: no em dash added to ticker or control copy.
- R-03 PASS: 390px viewport has 390px document width; control is 80px by 44px; reduced-motion text reflows.
- R-17 PASS: no usage, performance, or other numerical claim added to the strip.
- R-18 PASS: no testimonial or person added.
- R-23 PASS: reused existing wording, separator, palette, and type; no new visual asset.
- R-24 PASS: no navigation link added or changed.
- R-25 PASS: normal control/text contrast is 5.97:1; the aria-hidden decorative separator meets 3:1 non-text contrast at 3.99:1.
- R-26 PASS: Pause/Resume actually stopped and restarted the track in Production.
- R-27 PASS: this static-content strip adds no data-fetching state; paused, running, and reduced-motion modes are exercised.
- R-28 PASS: no FAQ added or changed.
- R-32 PASS: Enter/Space operate the control; visible inset focus was observed.
- R-33 PASS: feature implemented directly in the TSX/CSS source, without a rewrite script.
- R-34 PASS: existing single-theme identity retained; no unverified alternate theme added.
- R-35 PASS: production build, 26 browser checks, and recorded live desktop/mobile control checks completed.
- R-36 PASS: no security, compliance, customer, or performance claim added.
- R-37 PASS: existing approved visual direction retained; targeted design read and dials recorded above.
- R-38 PASS: existing product principles remain text, with no invented product data or realistic placeholders.

#### Purpose-Gate

- R-01 PASS: existing solid brand red retained; no gradient or glow added.
- R-04 PASS: existing decorative separator retained and hidden from assistive technology; no icon library or feature icon added.
- R-06 PASS: existing compact monospace strip styling retained to preserve the homepage's editorial rhythm.
- R-07 PASS: no background texture or grid added.
- R-08 PASS: no decorative button arrow added.
- R-09 PASS: no badge added.
- R-10 PASS: no glass or blur added.
- R-12 PASS: no shadow added.
- R-13 PASS: no glow added.
- R-14 PASS: no card structure added.
- R-19 PASS: continuous leftward motion explicitly requested by the owner; pause control and reduced-motion preference prevent mandatory motion.
- R-22 PASS: no illustration added.

#### Liveliness

- Dials PASS: ENERGY 3 / RHYTHM 2 / MOTION 2 describe the retained identity and requested motion.
- Consistency PASS: only the requested strip's motion is restored; existing section hierarchy remains unchanged.
- Focal point PASS: no new competing hero, card, or headline introduced.
- Whitespace PASS: repeated groups cover the viewport instead of leaving a vacant trailing strip.
- Accent PASS: existing red band remains the accent; no additional accent color introduced.
- Identity PASS: existing VibeRoast principles and editorial-comic styling retained.
- Design read PASS: direction and the reason for the targeted motion are documented above.

#### Craftsmanship and Quality Locks

- C-1 PASS: loop geometry, retained styling, and pause/reduced-motion behavior have explicit purposes above.
- C-2 PASS: the one added interactive control was exercised in both directions.
- C-3 PASS: no filler section or content introduced.
- C-4 PASS: desktop/mobile, EN/ID, keyboard, paused/running, and reduced-motion modes exercised.
- C-5 PASS: no factual claim or social proof introduced.
- R-05 PASS: no template layout or section restructure introduced.
- R-11 PASS: control uses the existing squared visual language rather than a new pill treatment.
- R-15 PASS: Pause/Resume and Jeda/Lanjutkan name the actual actions.
- R-16 PASS: no marketing buzzword added.
- R-20 PASS: existing VibeRoast visual identity preserved.
- R-21 PASS: existing approved paper theme retained, not replaced with a default dark treatment.
- R-29 PASS: existing palette reused.
- R-30 PASS: no external product design cloned.
- R-31 PASS: red/type preserve identity, matched groups provide continuity, clipping is intentional for the moving strip, and the control makes motion optional.

## Lolosin screenshot privacy correction (2026-11-02)

The Production scan of `https://lolosin.com/` returned no screenshots because the screenshot guard inspected all document text, including an offscreen footer contact email. The document-wide `sensitive` flag also discarded otherwise safe viewport captures. The correction checks rendered text rectangles against the captured viewport and leaves document-wide text redaction intact. Visible recognized sensitive text, bounded-inspection exhaustion, and truncated DOM inspection still withhold screenshots. No URL-specific exception or sensitive-pattern exemption was introduced.

| Check | Observed result |
| --- | --- |
| Before correction, Production | HTTP 200; both screenshots null; AI completed in text-only mode; no deterministic findings |
| New viewport-privacy regression before correction | Failed on desktop and mobile when offscreen sensitive text incorrectly prevented capture |
| Browser regressions after correction | 20 passed, including screenshot rejection after scrolling sensitive content into view and all existing visible-credential formats |
| Unit/integration suite | 137 passed |
| Lint, production build, typecheck | All exited 0 |
| Instabox rollout | Scanner rebuilt and recreated using existing Compose isolation; container healthy |
| Production scan after rollout | HTTP 200 in 19.1 seconds; desktop JPEG 72,823 data-URL characters; mobile JPEG 40,723 characters; AI completed with `visualAnalysis: true` |
| Production result surface | Both images loaded; Indonesian AI headline/summary visible; 390px layout has 390px document width |

The report remains partial because the passive scanner blocks a non-read-only request; that warning is preserved. Its deterministic finding list is empty, so the issue-density meter is not a general website-quality grade. The new visual AI verdict was “Halaman rapi, tapi statistik soalnya perlu diaudit.”

Operational observation: after the image rebuild, `df -h / /data` reported root storage at 97% with 536 MiB available and `/data` at 39% with 12 GiB available. The Instabox CLI also emitted a full-root warning. No user files, images, volumes, or caches were deleted.

## On-demand worker readiness (2026-11-02)

Before every scan, the web client now authenticates to worker `/health`, waits for `{"status":"ready"}`, and then starts `/scan` with a fresh deadline. Wake and scan each have a 50-second budget; the roast route allowance is 160 seconds and the browser deadline is 170 seconds. No keep-alive scheduler, management API credential, or multi-account fallback was added.

| Check | Observed result |
| --- | --- |
| Wake-budget regression | Failed before the change; passed afterward with fake time advancing through 40 seconds of readiness and 40 seconds of scanning |
| Readiness failure boundaries | No scan starts on 401, 409, non-ready JSON, HTML, oversized readiness, or cancellation during wake |
| `pnpm exec vitest run tests/scanner.test.ts` | 53 passed |
| `pnpm test` | 137 passed across 7 files |
| `pnpm lint`, `pnpm build`, `pnpm typecheck` | All exited 0 |
| Production deployment | `dpl_D9GobzcNVimWXDSi4mMYKDEKz3c2`, Ready, aliased to `https://viberoast-app.vercel.app` |
| Production browser scan of `https://example.com/` | HTTP 200 in 16.9 seconds; scan and AI completed; 2 findings; desktop and mobile screenshots present |
| Loading/error UI | Desktop EN and 390px ID notice verified; duplicate submission disabled; controlled cooldown response restores retry; mobile document width 390px |
| Notice contrast | `#20201e` on `#fffdf7`: 16.04:1, WCAG AA pass |

Native cold-wake remains unverified: after waiting a full 30-minute idle window, the existing Instabox still reported `running`. The live scan above therefore exercised the deployed readiness path against an already-running worker. No manual suspend was used as a substitute: Instabox documents that manual pause/stop does not auto-resume on public-port traffic. Idle auto-pause does auto-resume on public-port requests; runtime-cap cooldown does not. See [Instabox idle/wake behavior](https://instabox.sh/docs/idle-suspend.md).

## Implemented and verified

Live end-to-end verification completed after provider credentials were supplied locally (never committed):

| Check | Result |
| --- | --- |
| `pnpm provider:verify` | configured `deepseek-flash` found; image input confirmed by provider catalog |
| Live `POST /api/roast` (EN, No Mercy) | 200 in 9.6 s; `aiStatus: completed`; `visualAnalysis: true`; real scan of `https://example.com/` |
| Live `POST /api/roast` (ID, Career Ending) | 200 in 8.1 s; natural Indonesian verdict and roast |
| Live `POST /api/prompts/generate` | 200; selected-ID-only prompt; unselected finding absent |
| Live UI scan | real screenshot (1280px), verdict, nickname, comedy score 4, 2 findings, limitations shown |
| Rate limit | 4th anonymous scan in 10 min returns 429 `RATE_LIMITED` |
| `pnpm test` (Vitest) | 127 passed, 7 files |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0, no warnings |
| `pnpm test:e2e` (Chrome, desktop + 390px) | 18 passed |
| `pnpm build` | compiled, TypeScript checked, 4 routes emitted |
| `pnpm exec tsx scripts/scanner-smoke.ts` | isolated containers built; authenticated health 200; unauthenticated 401; private/alternate URLs 400; direct egress blocked; real `https://example.com/` scan 200 with desktop + mobile JPEGs |
| Production `pnpm start` | home 200 with security headers; unconfigured scan 503 `DEPLOYMENT_NOT_CONFIGURED`; cross-origin 403; configured but unreachable worker 503 `SCANNER_UNAVAILABLE` |
| Visual smoke | desktop + 390px hero, results, and fixes; mobile fix-scope tabs fit 390px, document width 390px |
| Contrast | red/paper 5.39, light/red 5.97, muted/paper 5.42, green/light 6.80, light/ink 14.48 |

Verified behavior:
- URL validation rejects loopback, private, reserved, metadata, IPv6-local, alternate IPv4 forms, credentials, nonstandard ports, and local hostnames.
- Worker egress is restricted to the validating proxy; every destination is DNS-checked and pinned; direct loopback/metadata/internal/public socket egress failed in the running container.
- Scan evidence comes from a real browser; no hardcoded findings in the result path. Screenshots are actual captures, bounded, masked, and omitted on recognized credential content.
- AI output must map exactly one entry per finding; unknown/duplicate/omitted IDs are rejected and canonical explanations/recommendations/strengths stay scanner-owned. Provider text is not executed and no repository paths are invented.
- Reports are private, unguessable, expiring, non-cached, and never auto-published. Cancellation stops scanner/AI work before retention.
- Issue selection persists across results/fixes; deselect-all disables implementation actions rather than silently including everything.
- All five agent presets, short/detailed, EN/ID prompts, regeneration, clipboard failure fallback, and Markdown download work.
- Square and landscape PNG exports were downloaded and their PNG signature and dimensions asserted (1080x1080, 1200x630). X link contains text only; public-link publishing is visibly unavailable.
- EN/ID UI, document `lang`, keyboard-operable dialogs, mobile navigation, search/sort, and honest example labeling work.

## Implemented but unverified in this environment

- No remaining provider gap on this host: live text + vision commentary was verified with a locally supplied key. Production still needs its own credential and one post-deploy smoke.
- Horizontal scaling is deliberately unsupported; process-local retention/rate limiting is documented and must be replaced before replicas.

## Not implemented

- Public community publishing/leaderboard backend. The Hall is explicitly labeled fictional, searchable, and sortable.
- Permanent public report links.
- GitHub repository analysis. The control is disabled and visibly labeled "Coming soon".
- Active security/accessibility audits, authenticated scans, form submissions, crawling, or bot-protection bypass.
- Screenshot OCR/pixel redaction beyond form masking and omission on recognized text credentials.

## Required environment variables

`DEPLOYMENT_MODE=single-instance` (or `serverless`), `APP_ORIGIN`, `SCANNER_URL`, `SCANNER_TOKEN` (≥32 chars), `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, optional `DEEPSEEK_SUPPORTS_VISION=true`, optional `TRUST_PROXY=false`.

## Deployment

1. `pnpm install --frozen-lockfile`
2. Supply secrets and run `docker compose up --build -d` for worker + proxy.
3. Set the web server variables; run `pnpm build && pnpm start` as one long-lived process behind HTTPS ingress with 8 KiB mutation body limits and timeouts.
4. Run `pnpm provider:verify`; then one real scan as a release smoke.
5. Never publish worker/proxy ports; keep `TRUST_PROXY=false` unless ingress overwrites `x-real-ip`.

## Known limitations

- Docker isolation was verified on this Windows Docker Desktop host. Re-run `pnpm exec tsx scripts/scanner-smoke.ts` on the production Linux host.
- Passive sampling only; findings are bounded observations, not a clean bill of health.
- Pattern redaction cannot detect every secret, especially secrets rendered only in images/canvas. Only submit pages you are authorized to inspect.
- Navigation timing is not Core Web Vitals.
- Comedy heat is issue density, not a quality/security/performance score.

## Optional GitHub analysis decision

Not implemented in this increment, and the UI does not pretend it exists: the control is disabled and labeled "Coming soon".

Why it stays a separate milestone:
- The user brief explicitly defines website URL roasting as the MVP; repository analysis is the optional milestone.
- A trustworthy repository review needs different boundaries from a public-page scan: explicit token scope, rate limits, branch/commit pinning, secret/PII handling, and no execution of repository content.
- The current agent prompt is deliberately website-only and cannot invent source paths. Claiming repository context without an authenticated clone would violate the evidence-first product rule.

Safe next shape: read-only public GitHub API metadata and selected file contents at a pinned commit, bounded size/rate, never execute code or install dependencies, and label every finding with its repository evidence. This is intentionally not started here.

## Next priorities

1. Configure provider credentials and run a live scan smoke; record model/vision capability output.
2. Add a durable shared store/rate limiter before any horizontal scaling.
3. Add opt-in community publishing with moderation, consent, retention, and abuse controls.
4. Add GitHub analysis as a separate bounded subsystem with explicit permissions and no code execution.
5. Expand deterministic findings (contrast, tap targets, overflow culprits) with fixtures that prove each rule.
