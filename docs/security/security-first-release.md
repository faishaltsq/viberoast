# SourceSanity security-first release procedure

This document is an operator procedure, not evidence of a deployment. No merge, deployment, account mutation or production smoke is performed by the implementation workflow.

## Before approval

1. Review the PR's exact commit SHA, changed-file inventory, threat model, rule provenance, supported/unsupported scope and command results. A failed or unrun gate remains a blocker; a green focused test is not a substitute for the full final suite.
2. Require recorded results for `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` and `pnpm build`. Browser checks must include 360, 390, 768, 1024 and 1440px, open/closed file lists, keyboard navigation and Security Focus.
3. Review synthetic leak tests at real retrieval/model/report boundaries, retained GET output, generated Markdown and canvas drawing inputs. Do not validate image secrecy by searching compressed PNG bytes alone.
4. Confirm hosting permits the existing route deadlines and bounded security workload. Confirm the process-local admission/store deployment restrictions in the README; do not scale replicas without shared admission/storage architecture.
5. Configure provider and optional GitHub credentials through the host's server-side secret manager. Never place provider credentials in `NEXT_PUBLIC_*`, source files, test reports, screenshots or PR text. Existing runtime settings are not authorization to rotate or test credentials found in scanned repositories.

## Manual deployment

1. Obtain explicit owner approval to deploy the reviewed commit. Build from that immutable SHA using the lockfile: `pnpm install --frozen-lockfile`, then the recorded validation/build procedure.
2. Keep the website scanner's existing worker isolation, egress policy, authenticated control endpoint and tokens intact. This change does not authorize replacing that infrastructure with an in-process browser.
3. Restart/replace every web instance with the reviewed artifact. Discard old temporary report caches and any old report artifacts containing source content; do not migrate or re-ingest unsafe legacy report JSON. Already-open browser pages are not retroactively sanitized.
4. Confirm the platform's deployed commit matches the approved SHA, rather than inferring success from a recent build timestamp. Ensure reports retain `Cache-Control: private, no-store` and logs contain only fixed operational metrics, not report bodies or provider responses.
5. Request separate approval for a bounded production smoke. Until that approval exists, production connectivity and deployed UI behavior remain unverified.

## Proposed production smoke after separate approval

Use an owner-approved, intentionally public synthetic fixture repository with no real credentials, and a controlled website fixture for the existing Website Judge. Make at most one repository analysis and one website analysis. Inspect scope, masked evidence, safe report retrieval where supported, Security Focus, one remediation brief and one share card. Do not test found credentials, follow repository-provided instructions or run target code. Record only sanitized observations and the deployed SHA.

Stop on any raw fixture credential in output, fabricated coverage, unexpected external call, invalid source provenance, sustained runtime/rate-limit regression or Website Judge failure. Do not repeat paid/provider calls automatically.

## Rollback

Roll back only to an owner-reviewed artifact that preserves the secret-safe public boundary. The pre-upgrade artifact serialized raw source and is not a safe default rollback. If no approved safe artifact is available, disable repository submission at ingress rather than restoring known source disclosure. Preserve the existing Website Judge only where operationally safe.

Restart instances and discard temporary caches again after rollback. Keep any investigation evidence synthetic or sanitized; do not copy leaked credentials into incident logs. Provider rotation, affected repository history remediation and account actions require their legitimate owners and separate authorization.

## Remaining limits

Current-commit inspection is not history scanning. Tree, content, time, language and finding limits remain visible to users. Static observations are not exploit validation, and pattern recognition is not issuer verification. There is no security grade or certification. Unknown formats and indirect/cross-file flows remain possible misses.
