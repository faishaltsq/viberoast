# Future anonymous publication — design only

**Publication is disabled in V1.** The Hall contains curated fictional examples only. A scan never creates a publication, and the temporary report store is not a community database.

> Identity is optional for the story. Consent is mandatory for publication.

## State machine and actors

Private report → Publish request → Ownership verification → Sanitization → Owner preview → Explicit confirmation → Moderation → Anonymous public snapshot.

The signed-in requester must separately prove current authority over the scanned resource. GitHub or Google login alone is not proof of repository/domain ownership. Submitting someone else's URL is never publication authorization.

1. **Request:** Create a private draft bound to requester ID and a server-recorded resource fingerprint. Rate-limit by authenticated user and IP. The action is separate from scanning and must not be preselected.
2. **Verify:** For repositories, require a narrowly permissioned GitHub App installation and server-verified owner/admin authorization for that exact repository; recheck before confirmation. Do not expand the identity-login OAuth scopes. For domains, use a fresh expiring DNS TXT or well-known HTTP challenge bound to the exact canonical host, requester and request ID. Server-side challenge fetching uses the scanner's separately reviewed SSRF controls. Subdomains and redirected hosts are not implicitly authorized. Record verification method, authority scope and expiry privately. Manual organizational authorization requires documented moderator review.
3. **Sanitize:** A separate reviewed server process derives an educational narrative, never copies the report wholesale. Agent 1's secret-redaction boundary must first be integrated and independently audited. If any check fails, stop publication; do not fall back to the raw report.
4. **Preview:** Show the authorized owner the exact complete proposed public snapshot, including rendered images/metadata if any. State residual re-identification risk. Link to withdrawal and sensitive-data reporting.
5. **Confirm:** Require an unchecked explicit consent control and a separate submit action. Submit the previously displayed snapshot version/hash and server-issued one-time confirmation token. Lock the draft; compare submitted version/hash with the stored version, recheck authority, and reject stale previews. The server must not compare a stored value with itself. Record consent text/version/time privately.
6. **Moderate:** Independent moderator accepts/rejects the same immutable confirmed version. Author cannot approve their own submission. Moderation cannot silently change a confirmed snapshot: any content change returns it to owner preview/consent.
7. **Publish:** Atomically create a new random public case ID/slug and approved immutable version. Never expose a private report/request ID. Only this transition makes data visible to Hall readers.

Invalid/out-of-order transitions fail closed with an audit event. Expired verification, revoked repository authority, expired report or withdrawn consent prevent publication. Report expiry does not authorize retaining raw source: durable drafts retain only necessary sanitized content under explicit retention policy.

## Sanitization and anonymity

Anonymous snapshots contain no original owner/repository names, URLs, domains, commit hashes, permalinks, identifying paths, authors/emails, project descriptions, copied source, private screenshots, credential/token values, or identifying image/EXIF metadata. Do not publish source maps, raw tool responses, prompt traces, scanner logs, or searchable verbatim excerpts. Prefer authored paraphrases and clearly labeled synthetic demonstration snippets. Strip unseen fields as well as visible text; validate recursively with a strict allowlist schema.

Automated detectors and human moderation are complementary, not proof of perfect anonymity. Unique circumstances can still identify a project. Owner preview must explain that limitation without a perfect-anonymity promise. Unresolved sensitive content blocks publication.

Publication snapshots carry provenance `approved-publication`, evidence classifications and analysis limitations. Fictional examples remain `fictional-example` and are never reclassified as real submissions. Attributed publication requires a separate preview and explicit attribution consent; never infer it from an account profile.

## Durable storage and RLS design

Use Postgres independent of the existing process-local TTL report map. These tables are proposed, not migrations shipped in V1:

| Table | Contents | Client access policy |
| --- | --- | --- |
| `publication_requests` | Random private ID, requester UUID, private resource fingerprint, state, active draft version, withdrawal status | RLS: SELECT only `auth.uid() = requester_id`. No direct client INSERT/UPDATE/DELETE; authenticated server transition functions create/change rows after ownership checks. |
| `ownership_verifications` | Request ID, proof method/scope, verified timestamp, expiry/revocation | No browser table access. Server-only writes and ownership rechecks. Never store raw OAuth tokens here. |
| `publication_versions` | Request ID, immutable sanitized draft JSON, hash, consent version/time, moderator decision | Owner SELECT through request ownership join; no direct client mutations. Append-only server transition functions. Old versions remain private. |
| `hall_public_cases` | Unlinked random public ID/slug, approved sanitized snapshot, active version, published/withdrawn status | RLS SELECT only active published rows to authenticated Hall readers (matching the current members-only product). No client writes; service transition validates all prior steps. Never expose request IDs in projections. |
| `case_reports` | Reporter UUID, public case ID, reason, moderation state | Authenticated reporter can create their own report through rate-limited server API; SELECT own report via `auth.uid() = reporter_id`. Reporter cannot choose another user ID or modify moderation state. |
| `moderation_audit` | Actor, action, opaque IDs, timestamps and reason codes, not secrets/raw content | Server append-only; access only to verified moderator/admin role, not user-editable metadata. |

Enable and FORCE RLS where applicable. Revoke broad `anon`/`authenticated` table grants, then grant only required SELECT or tightly scoped function execution. Use `auth.uid()` checks with authenticated roles, never a client-supplied requester ID. If SECURITY DEFINER functions are needed, pin `search_path`, qualify table names, revoke public execution, and enforce actor capability checks inside the function. Service-role credentials remain server-only and do not replace authorization checks; the service role bypasses RLS, so test its transition code independently.

Use a server-maintained moderator membership table with no user grants; do not trust editable `user_metadata`. Authorization checks occur on every API/transition, including version history, withdrawal and owner preview. Test user A cannot read or modify user B's drafts/proofs/consent. Authenticated readers never receive private mappings. No public endpoint queries the temporary report map.

All transitions lock records in the same order: publication request → version → public case. Use version checks and idempotency keys for confirmation/moderation to prevent duplicate publication or time-of-check/time-of-use changes. Keep immutable version history private even after withdrawal; define and communicate minimum legal/abuse retention, then delete unnecessary personal data.

## Withdrawal, reporting and incident response

- **Owner withdrawal:** Authorized requester can unpublish immediately without waiting for moderation; revalidate identity/ownership or route lost-access claims to manual review. Public readers receive no withdrawn snapshot. Previously exported copies cannot be recalled; disclose this before consent.
- **User reports:** Authenticated readers can report privacy, abuse or inaccurate evidence. Rate-limit and deduplicate reports without allowing mass reports to automatically punish a person. Return a report receipt without exposing other reporters.
- **Sensitive-data takedown:** Prominent contact/report route, immediate moderator quarantine for credible secret/private-data reports, restricted review queue, cache purge and notification to affected authorized owner. Do not put the secret in audit logs or notifications. If credentials leaked, advise revocation through a private channel.
- **Moderation:** Role-separated review, human-readable reason, appeal queue, conflict-of-interest checks and immutable event audit. Harassment, personal identifiers and unsupported accusations are rejection criteria.
- **Spam/abuse:** Per-user/IP submission budgets, bounded draft sizes, proof expiry, cooldowns, duplicate resource fingerprints kept privately, escalating limits and account suspension by authorized staff. Never rely on a fabricated community score.

## Required release gates before implementation can be enabled

1. Agent 1 secret-redaction integration and independent security review completed.
2. Ownership challenges, role segregation and consent-version binding tested, including revoked authority and stale preview races.
3. RLS negative tests run with actual anon/user-A/user-B/moderator DB roles, not only service role.
4. Privacy schema, moderation, takedown, withdrawal and cache invalidation verified end-to-end.
5. Data retention, incident ownership and moderation operations approved.

Until all gates pass, no publish action, endpoint, transition function, or scheduled publisher is exposed. V1 login and scanning do not grant publication rights.
