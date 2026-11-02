# Verification report

Branch `feat/evidence-backed-mvp`, baseline `0fa0a499f10c433373429d2b39cbc8729052f254`.

## Implemented and verified

| Check | Result |
| --- | --- |
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

- Live DeepSeek commentary and vision. No `DEEPSEEK_API_KEY`/model is configured; `pnpm provider:verify` correctly fails with a configuration error. Adapter behavior is covered by mocked-boundary tests only.
- Full end-to-end live path (real site → provider → report) cannot be exercised without those credentials.
- Horizontal scaling is deliberately unsupported; process-local retention/rate limiting is documented and must be replaced before replicas.

## Not implemented

- Public community publishing/leaderboard backend. The Hall is explicitly labeled fictional, searchable, and sortable.
- Permanent public report links.
- GitHub repository analysis. The control is disabled and visibly labeled "Coming soon".
- Active security/accessibility audits, authenticated scans, form submissions, crawling, or bot-protection bypass.
- Screenshot OCR/pixel redaction beyond form masking and omission on recognized text credentials.

## Required environment variables

`DEPLOYMENT_MODE=single-instance`, `APP_ORIGIN`, `SCANNER_URL`, `SCANNER_TOKEN` (≥32 chars), `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, optional `DEEPSEEK_SUPPORTS_VISION=true`, optional `TRUST_PROXY=false`.

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

## Next priorities

1. Configure provider credentials and run a live scan smoke; record model/vision capability output.
2. Add a durable shared store/rate limiter before any horizontal scaling.
3. Add opt-in community publishing with moderation, consent, retention, and abuse controls.
4. Add GitHub analysis as a separate bounded subsystem with explicit permissions and no code execution.
5. Expand deterministic findings (contrast, tap targets, overflow culprits) with fixtures that prove each rule.
