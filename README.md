# VibeRoast

Your AI built it. Our AI judges it.

The approved Next.js interface is retained. A bounded browser worker supplies evidence; a server-only DeepSeek adapter supplies commentary. The browser never receives provider credentials. Scans are passive: no form submission, authenticated browsing, repository execution, or bot-protection bypass.

## Local web development

Requirements: Node.js 24+, pnpm 12.3.4. The scanner additionally requires a Linux Docker runtime supporting Chromium's sandbox and the documented network policy.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Configure the variables below before expecting real scans. Missing scanner configuration is an error, not a demo. If scanning succeeds but the provider is unavailable, the report explicitly offers scanner evidence only; it does not manufacture a roast. Tests use isolated fixtures and do not require paid credentials.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Server-only provider credential |
| `DEEPSEEK_BASE_URL` | Explicit HTTPS OpenAI-compatible API base, e.g. `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Explicit currently available model ID; no model is assumed |
| `DEEPSEEK_SUPPORTS_VISION` | `false` by default; exact `true` opts into image input only after capability verification |
| `SCANNER_URL` | Operator-controlled internal worker address; local Compose endpoint `http://127.0.0.1:8787` |
| `SCANNER_TOKEN` | Cryptographically random secret of at least 32 bytes, shared by web and worker only |
| `APP_ORIGIN` | Canonical web origin used for same-origin mutation checks |
| `DEPLOYMENT_MODE` | Must be `single-instance` for production scans |
| `TRUST_PROXY` | Default `false`; only enable when trusted ingress strips and overwrites `x-real-ip` |

Copying `.env.example` is not sufficient: fill the credential/model/token explicitly. Do not commit `.env.local`. Use a secret manager for production.

## Provider capability preflight

```sh
pnpm provider:verify
```

The command checks `/models` availability and, when vision is enabled, confirms the selected model declares image input. It does not buy a completion. Live commentary still needs a real end-to-end scan and completion smoke before release.

Primary references checked during implementation:

- [Current model capabilities](https://api-docs.deepseek.com/quick_start/pricing)
- [Model discovery and input modalities](https://api-docs.deepseek.com/api/list-models)
- [Structured JSON output](https://api-docs.deepseek.com/guides/json_mode)
- [Vision inputs](https://api-docs.deepseek.com/guides/vision)

Capabilities differ by model and can change. Text-only mode does not send screenshots and must not be interpreted as visual analysis. Configured vision uses bounded inline screenshots, not externally fetchable private report links.

## Scanner deployment

See [worker deployment and isolation](worker/README.md). The worker is not an ordinary route handler with a headless browser bolted on. Its network policy must prevent direct browser egress, including loopback and private services, and require the validating DNS-pinning proxy. URL checks and request interception alone are not an adequate deployment.

Start the isolated worker using its Compose configuration after supplying the required token. The web server can run natively on the same host and reach the loopback-bound worker control port. Expose only the web application through HTTPS ingress. Do not publish the proxy or any browser debugging endpoint.

## Production web deployment

Vercel note: the project is linked as `viberoast`, and provider/scanner secrets are stored as
**sensitive** Vercel environment variables for Production and Preview. Vercel cannot run the
isolated scanner, and its serverless functions cannot use the process-local report store or
rate limiter. Therefore `DEPLOYMENT_MODE` and `APP_ORIGIN` are deliberately **not** set on
Vercel until the worker has a real host; the app then fails closed with
`DEPLOYMENT_NOT_CONFIGURED` instead of pretending scanning works. Never set
`DEPLOYMENT_MODE=single-instance` on Vercel to make the button appear functional.

Host the worker + proxy on a long-lived Linux Docker host, expose only its control port over a
private/TLS network, then set `SCANNER_URL`, `APP_ORIGIN`, and `DEPLOYMENT_MODE` for a
single-instance web deployment.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

Run **one long-lived web process** behind trusted HTTPS ingress. Do not use this process-local store/rate limiter across serverless functions or multiple replicas. Production scans fail closed unless `DEPLOYMENT_MODE=single-instance` is explicitly configured. Before horizontal scaling, replace report storage and admission/rate counters with a shared durable implementation; do not merely turn on replicas.

Ingress requirements: body limit 8 KiB for mutation routes, request-header/body timeouts, upstream timeout sufficient for the bounded scan and AI request, and external abuse/connection limits. When `TRUST_PROXY=true`, the application must not be directly internet-accessible and ingress must overwrite `x-real-ip` instead of forwarding caller values. Without trusted IP configuration, all callers deliberately share the conservative anonymous limit.

Private reports are process-local capabilities, retained for 15 minutes and capped at 20 reports. Restarts and eviction can remove them sooner. Reports and screenshots are returned with `Cache-Control: private, no-store`; possession of the unguessable report ID authorizes retrieval during retention. Do not log report bodies, capability IDs, target URL query strings, screenshots, or provider response content.

## Privacy and product boundaries

- Submitting a public URL sends bounded extracted evidence to the configured AI provider. Configured vision additionally sends screenshots. Review provider data policies before enabling a public service.
- Public websites can still contain sensitive information. Recognized secrets are redacted; pattern-based detection cannot guarantee that every sensitive value is recognized.
- Reports are never automatically added to a public leaderboard. Image exports and X text sharing are explicit user actions. There is no permanent public report URL or publish backend in this increment.
- Leaderboard examples are illustrative, not real engagement/history. Repository analysis is an explicitly separate optional milestone; website-only prompts never invent source files.
- The comedy meter is a disclosed finding-density judgment, not a Lighthouse, security, accessibility, or performance score. Navigation duration is a browser observation, not a Core Web Vitals audit.
- Missing captures and incomplete viewports are labeled. A clean passive scan does not prove a site has no bugs or vulnerabilities.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Browser acceptance uses controlled report fixtures at the HTTP boundary. Unit/integration suites exercise real internal validation and adapter parsing with external calls mocked. Scanner network isolation requires separate container smoke verification; passing UI fixture tests does not prove that infrastructure boundary.

See [implementation baseline and checklist](docs/IMPLEMENTATION.md). Exact executed results and limitations are recorded in the final verification report rather than inferred from this checklist.
