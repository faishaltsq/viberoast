# SourceSanity Security-First Repository Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and explain repository security observations without disclosing source credentials through SourceSanity.

**Architecture:** Extend the existing pinned-commit pipeline, with server-local source buffers and an explicitly projected public report. A shared redaction policy precedes all output truncation; deterministic security detection and independently budgeted retrieval feed separate security findings. This is one connected pipeline, not independent new products: freeze contracts first and serialize shared-file writers.

**Tech Stack:** Next.js 16.4.3, React 19, Zod 4.6.7, TypeScript 5.7.3, Vitest 4, Playwright 1.58.2, pnpm 12.3.4.

**Spec:** `docs/superpowers/specs/2026-11-03-security-first-repository-judge-design.md` (approved).

## Global Constraints

- Branch: `feat/security-first-repository-judge`, based on fetched main `666ec9f54e934cd0096a279fba6a180daa6effa3`.
- Preserve SourceSanity branding, existing design and Bro Code; selectively port branding, not unrelated commentary changes.
- Ordinary analysis: 30 files, 256 KiB total, 32 KiB per file.
- Independent security content admission: 100 files, 2 MiB total, 128 KiB per file, 30 seconds, further constrained by existing route/rate limits.
- Existing tree cap: 2,000 enumerated paths; expose truncation and unknown remaining scope.
- Source code stays request-local, never enters the public schema or report store, and is not logged.
- Sanitize before evidence/output truncation. Fail closed on unsafe evidence. Never send raw source to DeepSeek.
- Never contact credential issuers, use found credentials, execute repository contents, clone arbitrary targets or claim history inspection.
- No new dependencies for the UI correction. Prefer existing TypeScript for syntax analysis; if imported at runtime, promote its existing exact version to production dependencies and verify the production build includes it.
- Clean result: "No security findings detected in the inspected scope."
- No automatic merge, deploy, history rewrite, rotation or production smoke.

## Review Focus

1. Secrets embedded in metadata, object keys, URL paths or errors must not bypass evidence sanitization (Tasks 1, 2, 6).
2. Unknown/partial formats and multibyte truncation must not become raw public snippets (Tasks 1–3).
3. A security deadline, actual-size mismatch or GitHub failure must leave truthful scope, not a clean full-scan claim (Task 3).
4. Helper-based authorization, aliased eval and ambiguous client boundaries must not become confident vulnerability claims (Task 4).
5. Cached reports, generated Markdown and canvas text must obey the same boundary as POST responses (Tasks 1, 6, 7).

## Verified structural fit and exclusions

- `app/api/repository/roast/route.ts:99` currently copies raw `content` into `repoScan`; line 156 retains it and line 158 returns it. `lib/types/report.ts:72` explicitly permits that field. Change these, not the internal extractor's source buffers.
- `lib/server/store.ts` exports `retainReport(report, now?)`, `getReport(id, now?)`; both report kinds share the store. Preserve Website Judge behavior.
- `lib/analysis/types.ts` has `AnalysisContext` with `files: ExtractedFile[]`; keep it internal. Current `AnalysisFinding` location fields are not preserved by the public finding schema; add explicit security metadata rather than assuming they survive Zod parsing.
- Public fixture consumers: `tests/fixtures/report.ts`, `tests/repo-judge.test.ts`, `tests/prompts.test.ts`; remove raw content only there. `tests/github-extract.test.ts` assertions on internal raw extraction remain valid unless retrieval behavior deliberately changes.
- Vitest auto-discovers `tests/**/*.test.ts` with node environment and `@` alias; Playwright discovers `e2e/` with two workers and localhost:3000.
- Prior `docs/superpowers/plans/2026-11-02-results-evidence-uiux-judge.md` is Website UI/UX evidence, not this plan. Do not implement or overwrite its instructions. `tasks/plan.md` describes the already-merged original Repository Judge, not new work.
- No database or deployed-state claims: report retention is an in-memory TTL store. Do not inspect `.env.local` values.
- Do not implement unrelated AI reconciliation from `8e17e91`, a general permalink refactor, a global animation cleanup, dependency modernization or Website Judge redesign.
- Reconnaissance reported baseline typecheck/unit success and a lint error at `RepoResults.tsx:47`; these are not final verification evidence. Record actual final command output separately.

## Shared contracts and file ownership

All paths below are relative to `viberoast/`. New exports listed here are created by their owning task, not assumed to exist already.

| Owner/task | Files created or changed | Responsibility |
| --- | --- | --- |
| Backend 1 | `lib/security/public-report.ts`, `lib/security/redact.ts`, `lib/types/report.ts`, repository POST/GET routes, `lib/server/store.ts`; public fixture consumers | Projection, sanitation and storage boundary |
| Backend 2 | `lib/security/secrets/{types,patterns,classify,detect,redact}.ts`, `lib/analysis/checks/security.ts`, compatibility redactor | Secret classifications and deterministic evidence |
| Backend 3 | `lib/github/security-scan.ts`, `lib/github/{client,extract}.ts`, POST route, report security coverage schema | Independent bounded retrieval and accounting |
| Backend 4 | `lib/security/static.ts`, `lib/analysis/{types,repository}.ts`, report finding schema, `package.json`, `pnpm-lock.yaml` only if runtime promotion needed | Context-aware syntax checks and integration |
| Designer 5 | `components/roast/{RepoResults,RepoEvidence,RepoFindingCard}.tsx`, new `RepoSecurity.tsx`, `components/roast/results-hall.module.css`, new focused E2E specs | Security Focus and local straightening |
| Backend 6 | `lib/ai/skills/repo.ts`, new commentary/boundary tests | Sanitized model payload and evidence-qualified commentary |
| Backend 7 | `lib/prompts/generate.ts`, `components/fixes/RepositoryFix.tsx`, `lib/share/card.ts`, prompt/share tests | Remediation and output safeguards |
| Orchestrator 8 | Branding-only paths below, existing E2E expectations, release/security documentation | Selective brand preservation, reconciliation, verification, PR |

Tasks 1–4 serialize on shared contracts. Task 5 can run alongside Task 6 after Task 4 freezes report types. Task 7 follows Task 6; it does not overlap a writer in prompt/share files. Orchestrator never edits designer-owned visuals. Each specialist runs only focused checks; orchestrator runs the final full suite once after reconciliation.

### Task 1: Close the public source boundary

**Interfaces:** Create `toPublicRepositoryScan(scan: unknown, sensitiveValues?: readonly string[]): RepoScanResult` and `toPublicRepositoryReport(report: unknown, sensitiveValues?: readonly string[]): RepositoryReport` in `lib/security/public-report.ts`. Public types omit `content`; internal `ExtractedFile` remains unchanged. Compatibility `redactSecrets(text: string): string` remains available.

**Tests:** Create `tests/repository-boundary.test.ts` and `tests/repository-api.test.ts`; update `tests/fixtures/report.ts`, `tests/repo-judge.test.ts`, `tests/prompts.test.ts` for content-free metadata. Follow `tests/api.test.ts` cold-start idiom: `vi.resetModules()`, clear the actual store global, stub test environment, mock external retrieval/model modules, dynamically import POST and GET. Spy on console without printing fixture content.

- [ ] Add the projection regression below (the new export must make RED fail before implementation). Use constructed synthetic credentials only.

```ts
import { expect, it } from 'vitest'
import { makeRepoReport } from './fixtures/report'
import { toPublicRepositoryReport } from '../lib/security/public-report'

it('projects metadata without retaining source or synthetic credentials', () => {
  const secret = 'ghp_' + 'Q7n4'.repeat(9)
  const report = makeRepoReport()
  const unsafe = {
    ...report,
    repoScan: {
      ...report.repoScan,
      description: secret,
      selectedFiles: [{ path: 'src/index.ts', size: 100,
        content: `// ${secret}`, truncated: false }],
    },
  }
  const safe = toPublicRepositoryReport(unsafe, [secret])
  expect(safe.repoScan.selectedFiles[0]).not.toHaveProperty('content')
  expect(JSON.stringify(safe)).not.toContain(secret)
})
```

- [ ] Run `pnpm exec vitest run tests/repository-boundary.test.ts`; confirm failure at the missing boundary, not an unrelated harness error.
- [ ] Implement explicit metadata projection, recursive string/key sanitization and schema validation. Preserve original internal buffers only for analysis. Redact complete evidence before clipping; suppress snippets that cannot safely be represented. Reject unsupported structures instead of coercing them into logs.
- [ ] Route construction uses the safe scan before calling the provider; sanitize provider output and the final report again before retention/return. Store independently validates repository reports. GET cannot recover raw buffers. Retain existing generic error responses and fixed metric fields.
- [ ] Add POST/GET integration tests inserting the synthetic value into source, comments, descriptions, branch/path strings, finding title/evidence, model echo and failures. Assert public objects contain no content fields; capture model arguments, retained objects and logs. Include fragment sentinels spanning output clipping and a non-ASCII prefix. Assert original code-quality observations remain.
- [ ] Run `pnpm exec vitest run tests/repository-boundary.test.ts tests/repository-api.test.ts tests/repo-judge.test.ts tests/store.test.ts tests/prompts.test.ts`. Inspect route/storage diff. Commit only this scope: `fix: keep repository source behind a safe report boundary`.

### Task 2: Dedicated deterministic detector

**Interfaces:** In `secrets/types.ts`, define `SecretClassification = 'recognized' | 'suspicious' | 'placeholder' | 'publishable' | 'uncertain'` and `SecretCandidate` containing rule ID/version, classification, confidence, original start/end offsets and lines, and private matched value. Matched values never belong to public types. Export `detectSecrets(content: string, path?: string): SecretCandidate[]`, `classifySecret(value: string, context: string, ruleId: string): SecretClassification`, and `redactSecretText(text: string, sensitiveValues?: readonly string[]): string`. Findings map private candidates to public masked observations in `checks/security.ts`.

**Tests:** Create `tests/security-secrets.test.ts`, `tests/fixtures/security.ts` (synthetic constructors and fixtures); extend Task 1 boundary tests.

- [ ] Research maintained provider rules with the explorer, recording source URL/revision/license next to vendored definitions. Do not run provider verification scripts or online credential checks.
- [ ] Add this initial RED table, then extend with every family in the approved spec. Generic high entropy needs context; publishable controls must not become high-severity private-key findings.

```ts
import { expect, it } from 'vitest'
import { detectSecrets } from '../lib/security/secrets/detect'
import { redactSecretText } from '../lib/security/secrets/redact'

it('detects a private-format observation without claiming validity', () => {
  const value = 'ghp_' + 'Q7n4'.repeat(9)
  const source = `// example header\nconst token = '${value}'`
  const found = detectSecrets(source, 'src/server.ts')
  expect(found.some(f => f.classification === 'recognized' && f.lineStart === 2)).toBe(true)
  expect(redactSecretText(source)).not.toContain(value)
})

it('does not classify frontend Stripe keys or placeholders as private', () => {
  for (const value of ['pk_test_' + 'a7Z2'.repeat(6), 'YOUR_API_KEY_HERE']) {
    const found = detectSecrets(`const API_KEY = '${value}'`, '.env.example')
    expect(found.filter(f => f.classification === 'recognized')).toEqual([])
  }
})
```

- [ ] Run `pnpm exec vitest run tests/security-secrets.test.ts` and observe RED.
- [ ] Implement offset-preserving matching, contextual classification, complete value masking, conservative uncertain redaction and private candidate handling. Cover multiline PEM, AWS pairs, database user/password URLs, code comments and service-role vs anon/publishable context. Do not label a clean tracked `.env` as credential exposure.
- [ ] Connect the compatibility redactor and public sanitizer to this policy. Use full original source to detect before snippets or truncation; avoid retaining matched values outside the request.
- [ ] Run `pnpm exec vitest run tests/security-secrets.test.ts tests/repository-boundary.test.ts tests/analysis.test.ts`; commit `feat: detect and classify repository credential patterns`.

### Task 3: Wider security admission and transparent coverage

**Interfaces:** Create `scanSecurityFiles(owner: string, repo: string, sha: string, tree: RepoFile[], signal: AbortSignal, cachedFiles?: ExtractedFile[]): Promise<SecurityScan>` in `lib/github/security-scan.ts`. `SecurityScan` is an internal type holding admitted raw files and public coverage; define public `SecurityCoverage` in report schemas. Statuses: `inspected`, `filename-only`, `skipped-policy`, `skipped-budget`, `oversized`, `unavailable`. Include inspected byte count and truncation separately; known statuses reconcile to enumerated file count. Do not encode unenumerated remainder as zero skipped.

**Tests:** Create `tests/security-coverage.test.ts`; extend `tests/github-client.test.ts`, `tests/github-extract.test.ts`, `tests/repository-api.test.ts`.

- [ ] Add RED tests using `vi.spyOn(client, 'fetchFileContent')`, as existing extraction tests do. Admit a 40 KiB server fixture and a low-priority text fixture containing synthetic credentials. Assert both can be inspected under security policy even when quality sampling omits them. Assert the original quality sampler caps are unchanged.
- [ ] Include the cap test below. The implementation must not request a file advertised over 128 KiB; also test actual decoded size larger than advertised, stalled body, cancellation and fake timers for the 30-second deadline.

```ts
import { expect, it, vi } from 'vitest'
import * as client from '../lib/github/client'
import { scanSecurityFiles } from '../lib/github/security-scan'

it('accounts for oversized content without fetching it', async () => {
  const fetchFile = vi.spyOn(client, 'fetchFileContent')
  const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40),
    [{ path: 'large.ts', type: 'file', size: 131073 }], new AbortController().signal)
  expect(fetchFile).not.toHaveBeenCalled()
  expect(JSON.stringify(result.coverage)).toContain('oversized')
})
```

- [ ] Run `pnpm exec vitest run tests/security-coverage.test.ts` and observe RED.
- [ ] Implement deterministic priorities, independent counters, cached-content reuse and bounded request bodies/decoding in the GitHub client. Bound base64/JSON transport overhead explicitly, abort oversize streams and never return partial unsafe evidence. Use remaining total byte budget before admitting requests. Keep existing rate-limit admission and pinned SHA.
- [ ] Integrate into POST with separate quality/security source sets. All enumerated paths receive filename checks even when content is skipped. Pass full security buffers to detector before producing public excerpts. Record tree truncation, missing files and deadline exhaustion in scope warnings.
- [ ] Run `pnpm exec vitest run tests/security-coverage.test.ts tests/github-client.test.ts tests/github-extract.test.ts tests/repository-api.test.ts`; commit `feat: add independently bounded repository security coverage`.

### Task 4: Versioned static observations and evidence contract

**Interfaces:** Extend `findingSchema` with an optional `security` object (existing Website findings remain valid), containing `category`, `ruleId`, `ruleVersion`, `commitSha`, optional original path/line range, `observation`, `possibleImpact`, `coverageLimitations`. Existing finding `id`, `severity`, `confidence`, `verification`, `evidence` and `recommendation` satisfy the other required fields. Add `repoScan.securityFindings` and `repoScan.securityCoverage`; keep existing quality findings and score inputs unchanged. Export `analyzeStaticSecurity(ctx: AnalysisContext): AnalysisFinding[]` from new `lib/security/static.ts`; orchestrator function in `analysis/repository.ts` connects observations and deterministic secrets without top-12 security loss.

**Tests:** Create `tests/security-static.test.ts`; extend `tests/analysis.test.ts`, public fixtures and `tests/repository-api.test.ts` to cover schema wiring.

- [ ] Read relevant installed Next.js guides before Next route/client-boundary edits. Inspect actual TypeScript import availability; move existing exact `typescript` version to production dependencies if used at runtime, update lockfile metadata without upgrading packages.
- [ ] Add syntax-aware paired tests. Initial context is fully specified below; add a literal-only eval control and assert the finding describes observed usage, not a confirmed exploit.

```ts
import { expect, it } from 'vitest'
import { analyzeStaticSecurity } from '../lib/security/static'

it('records attacker-influenced eval as a qualified observation', () => {
  const content = 'export function GET(request) { return eval(request.url) }'
  const findings = analyzeStaticSecurity({ owner: 'acme', repo: 'app', sha: 'a'.repeat(40),
    tree: [{ path: 'app/api/run/route.ts', type: 'file', size: content.length }],
    files: [{ path: 'app/api/run/route.ts', size: content.length, content, truncated: false }] })
  expect(findings.some(f => f.security?.ruleId === 'js.dynamic-execution')).toBe(true)
  expect(findings.every(f => f.verification === 'heuristic' || f.security?.observation)).toBe(true)
  expect(JSON.stringify(findings)).not.toMatch(/verified vulnerability|CVE-\d/)
})
```

- [ ] Run `pnpm exec vitest run tests/security-static.test.ts` and observe RED.
- [ ] Parse JS/TS/JSX/TSX with installed TypeScript APIs. Match actual calls/assignments, not comment regexes. Trace simple local request/user-input aliases to eval, command/SQL construction and unsafe HTML. Mark unresolved flows as uncertain; constant-only use is a usage observation with reduced priority.
- [ ] Add paired risky/benign fixtures for sensitive-route auth absence vs helper auth, client-controlled identity, privilege checks, client/server import boundaries, CORS wildcard with credentials, broad permissions, production dev switches and CI event interpolation. Report unsupported parsing/cross-file analysis scope. Do not call external tools or execute analyzed files.
- [ ] Add stable versioned IDs, original pinned line ranges, qualified impact/remediation and safe public serialization. Secret findings remain separate from capped quality prioritization. Update fixtures with coverage and security finding arrays.
- [ ] Run `pnpm exec vitest run tests/security-static.test.ts tests/security-secrets.test.ts tests/analysis.test.ts tests/repository-boundary.test.ts tests/repository-api.test.ts`; commit `feat: report context-aware security observations`.

### Task 5: Security Focus and straight Git Inspect

**Owner:** Designer; use the user's original UI request verbatim in the execution brief. Scope only the UI files in the ownership table and new `e2e/repo-evidence-straight.spec.ts`, `e2e/repo-security.spec.ts`. Shared fixtures are frozen before dispatch; request any contract change from backend rather than editing it concurrently.

**Interfaces:** Consume `repoScan.securityFindings/securityCoverage`. Add accessible result control named `Security Focus`, test ID `security-focus-toggle`; keep scanning on regardless of focus. New `RepoSecurity` renders structured safe data only. No raw source expansion.

- [ ] Add failing browser specs using existing route fixture setup from `e2e/repo-judge.spec.ts`: fulfill `**/api/repository/roast` with `makeRepoReport()`, navigate `/`, click `mode-repository-btn`, fill `repo-url-input`, click `repo-submit-btn`, await `repo-results`.
- [ ] For widths `[360,390,768,1024,1440]`, evaluate matrices on `.repo-evidence-panel`, its `.terminal-preview`, relevant ancestors and their `::before/::after`. Assert 2D matrix off-diagonal values are zero and diagonal values are one (translations allowed only if existing layout needs them); reject nontrivial 3D transforms. Do not reject the dropdown chevron's intended rotation. Core assertion helper:

```ts
const transforms = await page.getByTestId('repo-evidence-panel').evaluate(panel => {
  const terminal = panel.querySelector('.terminal-preview')!
  return [panel, terminal, panel.parentElement!].flatMap(el =>
    [null, '::before', '::after'].map(pseudo => getComputedStyle(el, pseudo).transform))
})
for (const value of transforms) {
  const matrix = await page.evaluate(v => {
    const m = new DOMMatrixReadOnly(v === 'none' ? undefined : v)
    return { a: m.a, b: m.b, c: m.c, d: m.d, is2D: m.is2D }
  }, value)
  expect(matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, is2D: true })
}
```

- [ ] Run `pnpm exec playwright test e2e/repo-evidence-straight.spec.ts e2e/repo-security.spec.ts`; confirm baseline failures reflect tilt/absent focus, not server startup problems.
- [ ] Locally set terminal transform to none; leave global `.terminal-preview` and other cards unchanged. Move repository grid columns from inline style to scoped responsive CSS so mobile stacks. Keep dimensions, colors, fonts, borders, shadow, dropdown state and neighboring verdict styling. Fix existing touched RepoResults lint effect minimally without altering behavior.
- [ ] Add Security Focus presentation, separate priority/scope counters, masked findings and clean-result copy. Use existing visual language; keep comedy score independent. Preserve keyboard operation and optionally add matching `aria-controls`/region IDs without changing behavior.
- [ ] Assert no horizontal overflow, desktop top alignment/mobile stacking, expanded evidence remains masked, Enter/Space toggle the file list, Security Focus is keyboard-operable. Capture local screenshots for visual inspection, no production visits.
- [ ] Run only the two focused specs and ESLint on touched UI files. Commit `feat: add security focus and align repository evidence`.

### Task 6: Secret-safe, evidence-qualified Bro Code

**Files:** `lib/ai/skills/repo.ts`, `tests/repo-judge.test.ts`, new `tests/security-commentary.test.ts`. Consume safe report helpers and separate security findings from Tasks 1–4. Do not import unrelated commentary reconciliation from the rebrand branch.

- [ ] Add failing tests by copying existing `beforeEach` environment setup in `tests/repo-judge.test.ts`; intercept `globalThis.fetch` with a synthetic DeepSeek response and inspect request body. Place hostile README-style instructions and credential sentinels in unsafe report inputs; confirm only projected data can reach fetch.
- [ ] Add tests asserting the provider instructions distinguish recognized patterns from active credentials and eval usage from exploits. Career Ending intensity must not change the underlying evidence/confidence. A provider-generated credential must be removed or cause safe commentary fallback.

```ts
import { expect, it, vi } from 'vitest'
import { generateRepoRoast } from '../lib/ai/skills/repo'
import { AiError } from '../lib/ai/deepseek'
import { makeRepoReport } from './fixtures/report'

it('does not send metadata credentials to the model', async () => {
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
  vi.stubEnv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
  vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-chat')
  const value = 'ghp_' + 'Q7n4'.repeat(9)
  const requestBodies: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    requestBodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))
  })
  const scan = { ...makeRepoReport().repoScan, description: value }
  await generateRepoRoast(scan, { language: 'en', intensity: 'No Mercy' })
    .catch(error => { expect(error).toBeInstanceOf(AiError) })
  expect(requestBodies.length).toBeGreaterThan(0)
  expect(requestBodies.join('')).not.toContain(value)
})
```

- [ ] Run `pnpm exec vitest run tests/security-commentary.test.ts tests/repo-judge.test.ts` and confirm new assertions fail for the missing security behavior.
- [ ] Extend passive-data prompt with structured security observations and coverage, never raw buffers. Validate evidence-ID correspondence using existing structured response mechanism. Sanitize every model-returned string before length clipping and public report assembly. Use fixed safe unavailable state on unsafe/invalid output.
- [ ] Repeat focused tests plus `tests/repository-boundary.test.ts`; commit `feat: ground security roasts in sanitized evidence`.

### Task 7: Human-controlled remediation and safe exports

**Files:** `lib/prompts/generate.ts`, `components/fixes/RepositoryFix.tsx`, `lib/share/card.ts`; extend `tests/prompts.test.ts`, create `tests/security-exports.test.ts`. Consume safe report projection without importing server-only retrieval code into the browser bundle.

- [ ] Add a table-driven prompt regression for every existing preset (`Codex`, `Claude Code`, `Cursor`, `Windsurf`, `Generic Agent`) using the existing prompt generator signature and `repoReport()` fixture in `tests/prompts.test.ts`. Assert all nine human-controlled remediation steps and prohibitions, pinned SHA/location and masked evidence. Do not invent new preset spellings; confirm them against the schema before writing assertions.
- [ ] For share tests, spy on canvas `fillText`/`strokeText` arguments (or intercept them with Playwright before download), then assert every synthetic credential and split fragment is absent. Checking compressed PNG bytes alone is not proof of no rendered disclosure.
- [ ] Run `pnpm exec vitest run tests/prompts.test.ts tests/security-exports.test.ts`; observe new failures before editing implementation.
- [ ] Sanitize full generated Markdown and canvas input before output truncation/rendering. Include confirmation/classification/references/root cause/provider-owner rotation/server management/regression/history/uncertainty steps. Prohibit automatic rotation, provider account mutation, history rewriting and deployment.
- [ ] Keep website prompt/share behavior intact. Branding filename expectations are updated in Task 8, not by broad replacements here. Run focused tests; commit `feat: generate human-controlled security remediation briefs`.

### Task 8: Selective branding, complete integration and release review

**Owner:** Orchestrator for context-heavy docs/reconciliation; mechanical branding edits may go to a bounded fixer with exact scope. Designer retains all visual decisions.

**Branding files:** Inspect `git show 317f2e3` without blindly applying the commit. Carry only user-facing SourceSanity names into `README.md`, `app/layout.tsx`, `app/page.tsx`, `components/fixes/fixes.tsx`, `components/fixes/RepositoryFix.tsx`, `lib/ai/deepseek.ts`, `lib/prompts/generate.ts`, `lib/server/http.ts`, `lib/share/card.ts`, `package.json` and corresponding assertions. Avoid needless global store-key or infrastructure renames; historical internal names are explicitly allowed. Do not invent a production domain for watermark text; use SourceSanity branding without an unverified URL.

- [ ] Update exact existing repository E2E expectations: `VibeRoast repository implementation brief` -> `SourceSanity repository implementation brief`; `viberoast-acme-corp-cool-app-codex.md` -> `sourcesanity-acme-corp-cool-app-codex.md`; `viberoast-square.png` -> `sourcesanity-square.png`; `viberoast-landscape.png` -> `sourcesanity-landscape.png`. Inspect Website download assertions in `e2e/fixes-polish.spec.ts` and `e2e/share-polish.spec.ts` and change only matching branded strings. Update prompt assertions at `tests/prompts.test.ts` alongside the actual copy changes.
- [ ] Reconcile all writers and inspect actual diffs/artifacts. Ensure Task 1 boundary tests now exercise actual expanded security report fields, retained GET, real model serialization, generated agent output and canvas text. Add missing adversarial fixtures before claiming completion.
- [ ] Read local Next.js docs for any affected route/client rules; verify no private source or secret-match objects enter client imports or build payloads. Review serialized outputs and logs using synthetic captures, not real scanned repositories.
- [ ] Run final commands once, in sequence, record timestamp, exact exit status and summary under `docs/security/security-first-validation.md`:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

- [ ] If a gate fails, identify scope, fix with its owner, rerun only failed/affected gates and explicitly retain still-valid evidence. Do not claim passing from reconnaissance. Do not run `provider:verify` or production smoke as part of this suite.
- [ ] Obtain a focused independent security review of the complete diff and boundary-test strength; review UI screenshots at all five widths. Address concrete findings, not stylistic scope expansion.
- [ ] Write `docs/security/security-first-threat-model.md` and `docs/security/security-first-release.md`: actual implemented rules/versions, rule provenance, exact budgets, unknown formats, partial trees, skipped/unsupported files, current-commit-only coverage, static-analysis limits, deployment preconditions and rollback procedure. Explain that deployment clears old process-local report caches and requires all instances to run the new boundary; do not suggest replaying old unsafe reports.
- [ ] Commit reconciled changes with scoped messages. Record final `git rev-parse HEAD` and `git diff origin/main --stat`. Create a PR against main only after final evidence exists; include commit SHA, files changed, threat model, coverage model, detector/false-positive results, synthetic leak-proof captures, exact gate results, remaining limits and manual deploy/rollback steps. If authentication or push permissions block PR creation, provide a ready-to-submit PR body and clearly report the blocker. Never merge or deploy.

## Plan self-review

- [x] Every approved spec section maps to a task; boundary gate precedes detector completion.
- [x] Shared-file writers are serialized; independent UI/commentary work starts only after contract freeze.
- [x] New contract symbols are assigned to producing tasks; public fixtures and old assertions have owners.
- [x] Five review-focus failure classes map to concrete test additions.
- [x] Current workflows, branding, scope warnings, human-controlled actions and full command evidence are preserved.
- [x] User reviews implementation plan and selects specialist-driven execution before implementation.

## Execution ledger

- Task 1: implemented; specification and independent quality reviews clear after corrections at snippet, extraction and GitHub-client clipping boundaries. Harvested values propagate by direct union; truncated excerpts are withheld.
- Task 2: implemented; specification and quality reviews clear, including assignment-bound JWT exemptions, overlap-safe masking, stable IDs and linear Bedrock pattern. Controller verified 106 scoped tests, typecheck and scoped lint.
- Task 3: implemented; specification and quality reviews clear. Independent security scope, bounded reads, UTF-8 budgets, filename observations and omitted counts integrated. Security evidence is structured, never copied source lines. Shared assignment parser handles nested objects and hostile identifiers. Controller verification: 9 focused files / 151 tests passed, typecheck and whitespace check passed.
- Task 4: implemented; specification and quality reviews clear. Local syntax/receiver/scope checks and explicit parsing coverage are integrated. AST work is bounded to depth 128, 50,000 nodes and alias depth 64, with per-file failure isolation and scan reuse. Controller verification: 7 focused files / 193 tests passed and scoped lint clear. Final whole-branch typecheck remains pending reconciliation.
- Task 5a: Git Inspect correction committed as `5530325`; independent Playwright run passed 12 cases across all requested widths, including open long-path dropdowns, ancestor/pseudo transforms and keyboard behavior. Task 5b Security Focus corrections/review pending.
- Task 6: implemented; specification and quality reviews clear. Commentary scope preserves scanner omissions, 60-finding/48 KiB bounds, fail-closed projection and obvious unsupported-claim rejection. Controller verification: 25 AI tests passed plus scoped lint; broader branch validation remains pending.
- Task 7: remediation/share implementation in progress. Task 8: branding and operator documentation in progress; full release gates, final review and PR pending.
- Controller final Task 1 verification: 9 focused files / 91 tests passed; typecheck passed; diff whitespace check passed. Full release suite remains pending after integration.
- Planning validation: plan block checker passed; focused untouched baseline passed (3 files, 29 tests). These are not final release gates.
