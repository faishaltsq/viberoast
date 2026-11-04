# SourceSanity repository-analysis threat model

## Assets and trust boundaries

Protected assets are credentials in an inspected repository, SourceSanity's own provider credentials, repository source, and the integrity of evidence presented to users. A public repository is still untrusted input; public availability is not permission to amplify a committed secret.

The flow is GitHub API -> request-local decoding/extraction -> deterministic analysis -> explicit public-report projection -> DeepSeek commentary -> public-report projection -> temporary report store -> POST/GET -> browser, remediation prompts and share cards. Repository text, filenames, metadata and provider output are data, never instructions to the scanning process.

## Threats and controls

| Threat | Control |
| --- | --- |
| Entire source files accidentally serialized | Internal source buffers are separate from allowlisted public inspected-file metadata; `selectedFiles` has no `content` field. |
| Credential cut before pattern recognition | Harvest matched values at the earliest admitted decoded-content boundary; propagate the private request-local set by direct union. Sanitize complete output strings before clipping. Truncated source excerpts are withheld. |
| Unknown literal copied with a security observation | Security evidence is a structured rule/usage observation, not a copied source line or argument. |
| Provider repeats sensitive input or introduces a credential-shaped value | Project and sanitize before the model request, then validate and sanitize commentary before retention and response. Invalid output must not replace scanner evidence. |
| Stored/GET reports bypass POST protection | Repository report retention and retrieval independently enforce the safe projection. |
| Credential embedded in paths, links or metadata | Sanitize all public string fields, including nested evidence. Preserve safe pinned references; do not construct a usable link from a redacted path. |
| Prompt injection in README/source | Do not execute repository contents; analysis data is passive evidence. Commentary and agent instructions must not elevate repository text into system instructions. |
| Large or adversarial repository exhausts resources | Separate content/file/time budgets, bounded response bodies, request cancellation, rate/concurrency admission, UTF-8-safe byte clipping and explicit skipped/unknown scope. |
| Regex input blocks cancellation | Avoid overlapping repeated alternatives and identifier backtracking; retain adversarial regression inputs. A deadline cannot interrupt synchronous JavaScript, so pattern complexity matters independently. |
| False assurance or inflated vulnerability claims | Distinguish observed syntax/credential formats from heuristic conclusions. No active credential verification, fabricated CVEs, certification or security grade. |
| Remediation mutates live accounts or production | Generated instructions require human control of rotation, provider changes, history rewriting and deployment. |

## Coverage model

Analysis is pinned to one commit, not Git history. Tree enumeration is capped at 2,000 entries; truncation means the remaining scope is unknown. Quality sampling remains 30 files / 256 KiB / 32 KiB per file. Independent security content admission is at most 100 attempts / 2 MiB / 128 KiB per file / 30 seconds. Complete cached buffers may be reused; clipped quality buffers are not treated as complete security inspection.

Filename observations run over enumerated paths independently of content admission. Reports distinguish inspected, policy-skipped, budget-skipped, oversized and unavailable content and disclose omitted findings. Syntax-analysis coverage is separate from secret-content coverage: reading a file does not establish that its language or complete program behavior was analyzed.

## Residual risks and explicit non-goals

- Pattern recognition cannot identify every arbitrary or novel credential format. Tests establish behavior for synthetic supported fixtures, not universal secret recognition.
- Publishable keys are not private merely because they contain `KEY`; their deployment privileges and access policies still matter. Decoding a JWT payload does not authenticate its issuer or claims.
- Credential format recognition does not establish validity, current privileges, revocation status or exploitability. SourceSanity never tests detected credentials against issuers.
- Static analysis is bounded and local. Middleware, cross-file data flow, external authorization, build transforms and runtime configuration may change the interpretation of an observation.
- JavaScript strings cannot be reliably zeroized. Private buffers and matched values are request-local and not retained as reports, but garbage collection is not a secure-erasure guarantee.
- Existing deployed instances and already-open browser reports are not retroactively repaired by a source change. Manual rollout must replace all instances and discard old temporary report caches.
- No repository cloning, execution, history scanning, external scanning service, live rotation, deployment or automatic merge is authorized by this change.

## Evidence and rollout status

Exact command outcomes and final commit provenance belong in the validation/release record, not assumptions in this model. A clean report must say: **"No security findings detected in the inspected scope."** It must never promise that a repository is secure. Production smoke testing requires separate approval after synthetic secret-safe validation.
