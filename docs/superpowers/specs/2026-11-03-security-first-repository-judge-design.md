# SourceSanity security-first Repository Judge

Status: design approved in conversation; written specification awaiting review.

## Intent and baseline

Improve the existing Repository Judge without making SourceSanity a new secret-disclosure channel. Security evidence is serious; roast intensity does not alter evidence or imply exploitability. Preserve Website Judge, code-quality findings, existing visual identity and Bro Code.

Fetched origin/main: `666ec9f54e934cd0096a279fba6a180daa6effa3`. Work starts on `feat/security-first-repository-judge` from that commit, as requested. Selectively port SourceSanity branding from the existing rebrand work; do not merge its unrelated commentary changes. No automatic merge, deploy, production smoke, live credential verification or account mutation.

## Threat model

Repository owners and repository contents are untrusted. Secrets can appear in source, comments, filenames, metadata, README instructions and credential-bearing URLs. Provider commentary can repeat supplied strings or introduce unsafe output. Every public string is a potential disclosure channel, including object keys, paths, links, warnings and error messages.

Protected boundaries: GitHub retrieval -> source extraction -> analysis -> report construction -> DeepSeek -> report retention -> POST/GET JSON -> browser -> agent prompts -> canvas/PNG exports -> logs. Source code stays request-local, never enters the public schema or report store, and is not logged. No new external scanner or upload service is introduced.

Synthetic tests prove the supported fixture values do not escape these boundaries. They do not establish that arbitrary unknown secret formats are universally recognizable. This limitation must be documented rather than disguised as a security guarantee.

## Architecture

### 1. Secret-safe report boundary: prerequisite release gate

- Separate internal retrieved-source types from public inspected-file metadata. Remove `selectedFiles[].content` from the public schema and all retained reports. Keep path, advertised/inspected byte sizes, truncation and inspection status.
- Build public reports through an explicit allowlisted projection; never spread internal retrieval objects into them. Report GET uses the same validated public representation as POST.
- Before extracting an evidence snippet or truncating an output string, detect and redact on the complete admitted source/string. Known sensitive values collected during this request form an ephemeral additional denylist for downstream checks. Do not persist that denylist.
- Treat uncertain credential-like assignments conservatively for redaction even when they do not merit a high-severity finding. Prefer structured observations and masked excerpts to arbitrary source excerpts. Sensitive-file observations need no source content.
- Recursively sanitize and validate all public strings and keys, including model output and repository metadata. Reject unsafe structures; omit unsafe evidence or use a fixed safe fallback if a value cannot safely be represented. Validate serialized JSON as a final boundary check. A failure must not log the rejected content or exception payload.
- Apply this policy before model requests and retention; share cards and generated prompts consume only safe public data and sanitize final output defensively. Fixed operational metric fields remain free of repository content.
- Redacted paths must not be used to fabricate working links. Preserve pinned source references where safe; otherwise omit the link and explain its omission without reproducing the value.
- Update legacy redaction entry points so unrelated quality findings cannot leak source credentials. No raw source upload to DeepSeek.

### 2. Deterministic secret detector

Use `lib/security/secrets/{types,patterns,classify,detect,redact}.ts` where separation is useful, retaining compatibility with existing redaction callers. Rules have stable IDs, versions, source provenance and tests. Research maintained public provider definitions before selecting patterns; vendor small reviewed definitions with attribution instead of adding a scanner service.

Support GitHub tokens; AWS identifiers and associated secret assignments; Stripe private keys; Slack tokens; OpenAI/Anthropic formats; Google service-account and PEM private keys; credential-bearing database URLs; JWT configuration secrets; webhook secrets; contextual high-entropy candidates. Do not treat a name such as API_KEY alone as proof.

Classifications: recognized private-format candidate, suspicious assignment, placeholder/sample, public/publishable value, uncertain candidate. Stripe publishable and appropriately scoped Supabase publishable/anon values must not be classified as private solely by name. Privileged Supabase service-role context is different. A filename such as `.env` is a configuration observation, not proof that it contains a credential. `.env.example` may still contain a real-shaped private credential.

Offsets and line ranges come from original admitted source. Mask values completely; do not expose token suffixes. Never contact issuers or use detected credentials. Verified means a pattern/usage was observed, not that a credential is active.

### 3. Independent bounded security coverage

Keep ordinary analysis limits: 30 files, 256 KiB total, 32 KiB per file. Security has a separate admission policy: at most 100 content files, 2 MiB decoded total, 128 KiB per file and 30 seconds, constrained further by existing route/GitHub rate limits. Reuse already fetched buffers without extra network requests, while reporting the security scope independently.

Inspect sensitive filenames across every enumerated path. Prioritize environment/configuration, deployment, CI, routes and server files, then admit lower-priority files deterministically so non-priority content can be checked. Security can inspect files exceeding the quality sampler's size limit. Oversized files are skipped rather than fetched in full and falsely described as scanned. Enforce advertised-size and actual decoded-size limits; streamed response limits must bound network bodies as well as retained memory.

Do not cut raw text to the quality snippet budget before security detection/redaction. Retrieval-incomplete data is never called complete; omit unsafe partial evidence and record unavailable/truncated status. A credential cut by an unavailable retrieval boundary cannot be guaranteed detectable, which is a coverage limitation.

Record enumerated files, inspected files/bytes, filename-only checks, skipped-by-policy, budget-excluded, oversized, unavailable, truncated tree/content, elapsed budget stop and configured caps. Aggregate counts and per-file statuses must reconcile. Preserve the GitHub commit SHA for every observation. Existing tree enumeration is capped at 2,000 paths; a truncated tree means unknown remaining scope, not all-repository coverage. No Git history is checked.

### 4. Static security observations

Use the installed TypeScript syntax APIs if available for bounded JS/TS/JSX/TSX checks; inspect dependencies and local Next.js guides before implementation. No new dependencies for the UI correction. Unsupported syntax is reported as a limitation rather than silently treated as checked.

Implement focused, testable rules for hardcoded credentials; client-boundary server-secret references; tracked sensitive configuration; credential URLs; sensitive routes apparently missing authorization; client-controlled identity trust; privilege-boundary hotspots; eval/new Function; command construction; SQL construction; unsafe HTML; risky CORS; broad permissions; production-unsafe development settings; and CI interpolation of untrusted event values.

Calls/assignments are verified observations; attacker influence and missing defenses are qualified heuristic conclusions. Track simple local sources to sinks where practical; do not imply whole-program analysis or infer vulnerabilities merely from keywords. Unknown helper-based auth and indirect flows remain limitations. Unsupported or ambiguous patterns produce hotspots, not fabricated exploit claims. No CVE or certification claims.

### 5. Evidence contract

Each security finding includes stable ID, category, rule ID/version, severity, confidence, verified observation vs heuristic conclusion, pinned SHA, original path and accurate line range when available, sanitized evidence, qualified possible impact, concrete remediation and coverage limitations. Filename-only findings do not invent source lines.

Keep security findings separately prioritized so the existing top-12 comedy/quality selection cannot silently discard them. Deduplicate by stable rule/location identity. The comedy score remains issue density, not a security grade.

### 6. UI and local Git Inspect correction

Designer owns visual implementation. Add an accessible Security Focus control and separate security results using existing controls, spacing and styling. Show potential exposed secrets, hotspots, inspected/skipped scope, confidence, remediation priority and masked evidence. Focus changes presentation, not whether baseline safety scanning occurs.

Clean copy: "No security findings detected in the inspected scope." Never "This repository is secure."

Locally neutralize inherited `.terminal-preview` rotation in RepoEvidence; do not change the landing-page rule or unrelated animations. Preserve dark terminal treatment, 4px offset shadow, counters, metadata and keyboard dropdown behavior. Scope grid correction to repository results so mobile layouts stack without overflow. Preserve the dropdown chevron's intended rotation.

### 7. Commentary and Fix My Shame

Reuse DeepSeek and structured validation, with sanitized evidence as passive untrusted data. README instructions cannot override system instructions. Roast language follows confidence, not intensity pressure. With no security findings, use neutral commentary or restrained praise. Sanitize provider output before use; unsafe/invalid commentary falls back without weakening scanner results.

All five agent presets instruct: confirm without reproducing values; classify privacy/publishability/placeholder/uncertainty; locate affected references; fix root exposure; recommend provider-owner revocation/rotation; use server-side secret management; add targeted regression/static CI checks; consider Git history; report residual uncertainty. Explicitly prohibit autonomous account actions, credential rotation, history rewriting or deployment.

## Delivery sequence and ownership

1. Secret-safe public boundary and negative tests; do not call detection complete before this passes.
2. Deterministic detector and false-positive controls.
3. Independent security retrieval/coverage.
4. Context-aware static rules.
5. Designer-led Security Focus and scoped Git Inspect correction.
6. Evidence-qualified commentary.
7. Agent remediation integration.
8. Reconciled regression, security review and PR documentation.

Implementation plan assigns disjoint writer scopes and focused validation owners. Orchestrator inspects produced changes, reconciles shared contracts and runs the final full suite once. No product implementation before written-spec approval and implementation-plan approval.

## Verification and acceptance

Use synthetic fixtures only: recognizable provider formats; contextual high entropy; placeholders; `.env.example`; tracked clean `.env`; publishable frontend values; low-priority file secret; file above quality sampling size; truncation-boundary credential; PEM; database password URL; comment secret; README prompt injection; eval with/without attacker influence; missing files; truncated trees; clean repository.

Use distinctive fixture markers and check full serialized POST/GET responses, model request captures, retained report snapshots, generated prompts for every preset, share-card drawing inputs and logs. Assert neither complete credential values nor sensitive split fragments cross boundaries. Check metadata/path injection and model echo/fabricated credential output as well as evidence. Assert public schemas reject/strip raw content and raw buffers never reach persistence.

Detector tests verify format support, classification, severity restraint, stable IDs and original line positions. Coverage tests verify independent limits, bounded network decoding, non-priority admission, oversize and missing accounting, deadline/rate-limit behavior and no history claims. Static tests pair risky and benign contexts. Existing quality findings and Website/Repository workflows remain covered.

Playwright checks at 360, 390, 768, 1024 and 1440px: no rotation/skew on terminal and relevant ancestors/pseudo-elements; no horizontal overflow/clipping; expected stack/alignment; dropdown opens/closes with Enter/Space; chevron still animates; neighboring verdict retains its design. Check Security Focus keyboard operation and masked expanded evidence.

Final commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`. Record exact exit results and environmental blockers without claiming unrun gates passed. Main's existing lint failure in RepoResults must be distinguished from introduced regressions and minimally resolved if still present in touched code.

PR includes final commit SHA, threat model, changed files, coverage limits, detection/false-positive results, boundary evidence, remaining limitations, exact validation results and manual deployment/rollback steps. Production smoke requires separate explicit approval after secret-safe testing. No merge or deployment is authorized.

## Review checklist

- [x] Outcome and non-goals reflect user requirements.
- [x] Latest-main baseline and selective branding decision recorded.
- [x] Raw/public contracts, redaction ordering and fail-closed behavior specified.
- [x] Budgets, incomplete scope, provider validity and static-analysis uncertainty explicit.
- [x] Implementation order, UI scope, regression fixtures and delivery evidence specified.
- [ ] User approves this written specification.
- [ ] Implementation plan reviewed and execution method selected.
