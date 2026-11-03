# Public-site scanning and antislop assessment

## Status and approved intent

Design specification for user review, not an implementation-completion report.

The owner requested assessment beyond the submitted homepage, including the website's menus, and an antislop-based assessment. The owner selected public pages only and approved a worker background job with a transparent ceiling of 30 pages and 10 minutes. Login, form submission, and auditing an undeclared backend API are excluded.

Success means that results identify the pages actually examined, provide per-page desktop/mobile evidence and useful antislop observations, and disclose every coverage limit. No claim of complete-site inspection is permitted when discoverable pages remain unexamined.

## Existing constraints and why the flow changes

- The current scanner visits only one submitted URL at desktop and mobile sizes. It does not crawl links or sitemaps.
- The current worker child has a 44-second termination deadline, and its browser has a 38-second deadline. These remain per-page limits, not limits for an entire site.
- The current synchronous web route permits 160 seconds. This is not a viable container for a 30-page scan plus AI requests.
- The web deployment is Vercel; the isolated scanner and validating egress proxy run on one Instabox Linux host. Provider credentials belong only to the web service.
- Screenshot payloads must not be combined into one large site-wide response. Browser result retrieval and AI work are page-sized requests.
- The worker has a read-only root, RAM-backed temporary storage, a Chromium sandbox, a DNS-pinning validating proxy, and denied direct egress. These boundaries must remain.
- Screenshots currently use memory buffers, not image files. The viewport-sensitive privacy correction must remain.

## Scope and non-goals

### Included

1. Discover public same-origin HTML pages through rendered navigation, other internal anchors, the conventional sitemap, and sitemap locations declared by robots.txt.
2. Visit admitted pages sequentially, with fresh unauthenticated desktop and mobile contexts for each page.
3. Return factual coverage, technical findings, screenshots, and antislop assessments per page.
4. Display a site overview, page selection, and page-scoped fix prompts and image exports.
5. Inventory same-origin API-like GET requests actually observed during rendering, with status/failure information where available.

### Excluded

- Login, imported cookies, authenticated/private pages, button-driven transactions, form submissions, arbitrary clicks, and state-changing requests.
- Endpoint guessing, brute-force enumeration, mutation requests, vulnerability probing, bot-protection bypass, and validating an API's business semantics.
- Visiting other origins or following external navigation redirects after the initial site's canonical origin is established.
- Treating in-page anchors as separate HTML documents. JavaScript-only states that cannot be reached through an admitted public URL are explicitly outside the inspected coverage.
- Persistent reports, disk-backed screenshot storage, Redis, a database, a distributed queue, or additional VPS accounts.
- Claiming that the presence of a visual pattern proves AI authorship.

## Ownership and processing architecture

The worker owns discovery, the admitted page queue, page execution, authoritative scan evidence, bounded result caching, job-wide admission, and expiry. One worker job runs at a time. A broker is unnecessary on the existing single host.

The web service owns same-origin request validation, provider configuration, AI/antislop generation, response validation, and the proxy between browser and worker. The browser never receives the scanner bearer token or a provider key.

The browser owns the current private site report after page results arrive. It polls only while a user-created job is active and requests page analyses sequentially. There is no permanent heartbeat, idle keep-alive, or unattended polling after a scan ends.

### Processing order

1. A user submits a URL, language, and roast intensity.
2. The web service performs the existing authenticated readiness/auto-wake check, then creates a worker job and returns HTTP 202 with an unguessable capability job ID and effective limits.
3. The worker admits the root page, establishes its canonical origin, gathers discoveries, and renders queued pages sequentially.
4. The browser polls compact job status. For each ready page it requests that page's analysis through the web service.
5. The web service obtains authoritative page evidence from the worker, performs one bounded AI analysis containing both the roast commentary and antislop assessment, validates the result, and publishes the validated page report back to the worker's temporary cache.
6. The web service returns that single page report, including its screenshots, to the browser.
7. Only after parsing and retaining the complete page report in browser memory does the browser acknowledge delivery through the web service. The worker then deletes the page's screenshots, raw DOM evidence, and full cached report.
8. Small coverage metadata and bounded observation summaries remain until job expiry. The browser assembles the site overview from received page reports and worker coverage metadata.

The acknowledgement makes cleanup safe if an HTTP response is interrupted: the web service must not destroy the only result merely because it started sending a response. A validated cached result is returned on a retry without charging for a second AI analysis. Duplicate concurrent analysis requests receive a busy response rather than launching duplicate provider work.

## Job lifecycle and resource bounds

| Resource | Required bound |
| --- | --- |
| Active site jobs | 1 per worker |
| Total retained jobs | At most 2, including terminal jobs |
| Admitted HTML pages | At most 30 per job |
| Overall active-job deadline | 600 seconds after admission, excluding the preceding wake check |
| Per-page browser / subprocess | Existing 38-second / 44-second deadlines |
| Discovery candidates | At most 1,000 canonical URLs retained |
| Sitemap documents | At most 10, nested to depth 2 |
| Sitemap / robots response body | At most 1 MB each; robots.txt at most 64 KB |
| Sitemap URL entries inspected | At most 2,000 across the job |
| Rendered page document budget | Existing 5,000 elements and 10,000 screenshot text nodes |
| Ready or unacknowledged full page payloads | At most 4 across a job |
| Retained worker report/evidence payloads | At most 32 MB across all jobs; reject further admission rather than evict undelivered evidence silently |
| Single page report response | At most 2 MB serialized JSON |
| Each JPEG | Existing less-than-600,000 data-URL-character limit |
| Observed API request inventory | At most 100 deduplicated entries per job |
| Active browser poll interval | 2 seconds; bounded backoff to 10 seconds on retryable transport responses |
| Client activity lease | 90 seconds since the last valid active-job status/analysis request |
| Terminal-job retention | 5 minutes; absolute maximum lifetime 15 minutes from admission |
| Analysis invocation | At most 45 seconds, also capped by remaining active-job time |
| AI analysis lease | At most 60 seconds and never beyond the job deadline |

The four-payload limit applies backpressure to the crawler while the browser consumes results. Paused-for-consumption time still counts toward the 600-second deadline. Browser closure or prolonged loss of contact cancels the active job after the 90-second lease; there is no promise of unattended completion when nobody can receive results.

Cancellation, deadline, client-lease expiry, and worker shutdown abort the current subprocess, reap browser descendants, clear queued work, and bound memory retention. Completed page reports already held by the browser remain usable. Pages not assessed by the deadline remain visibly unassessed; they do not receive invented AI results.

Job states: discovering, scanning, waiting_for_consumption, completed, partially_completed, cancelled, failed, expired. Page states: queued, scanning, ready, analyzing, analyzed, delivered, failed, skipped, unassessed. Transitions and counters must be generated from real events, not timers pretending that work completed.

A restarted worker loses RAM-only jobs. The API returns JOB_EXPIRED and the UI offers a fresh scan; no disk persistence is introduced to hide this limitation.

## Discovery and URL admission

- Start with the submitted URL after the existing public-destination validation.
- The first successful root navigation may establish a canonical origin after public HTTP-to-HTTPS or hostname redirects. Freeze that origin for the rest of the job.
- Discoveries use breadth-first ordering: navigation/header/menu links first, then other internal links, then sitemap entries. The submitted page always consumes the first page slot.
- Resolve relative URLs, remove ordinary fragments, remove known tracking parameters, and deduplicate canonical URLs. Preserve other query parameters only when they pass the public navigation policy; never store query values in report evidence or logs.
- Do not reorder path segments, collapse distinct paths, or assume that case variants or trailing slashes are equivalent unless a redirect demonstrates equivalence.
- Skip logout, signout, unsubscribe, deletion, reset, verification/action-token links, credential-bearing URLs, unsupported protocols, nonstandard ports, obvious non-HTML downloads/assets, and API routes as crawl destinations. Give each omission a reason in the bounded coverage inventory.
- Skip external origins and URLs that cannot pass the existing public URL policy. Every actual network connection still passes the validating proxy, including redirects and page subresources.
- Record hash-only navigation as in-page navigation, not an additional inspected page. Record unsupported query/JavaScript-only route states as skipped rather than collapsing them into a successful page silently.
- Fetch robots.txt and sitemaps through the same isolated browser/proxy boundary. Do not add a direct host-side fetch path. Respect applicable robots disallow rules and record policy-skipped pages.
- Reject XML with DOCTYPE/entity declarations. Parse without external entity resolution or execution; malformed or oversized discovery documents produce warnings, not unbounded parsing.
- Report sitemap failures separately from page-render failures. A failed sitemap does not erase successful link discovery.
- Budget exhaustion records both the effective limits and the bounded candidate remainder. If candidate discovery itself is truncated, state that the total number of site pages is unknown.

The approved phrase 'all public pages found' means discovered, admitted public URLs within the published limits. It does not mean that hidden routes, an infinite pagination space, or an entire backend have been exhaustively enumerated.

## Evidence and screenshot privacy

Each page gets a stable opaque page ID and its own requested/final URL, status, warnings, metrics, desktop/mobile screenshots, technical findings, and AI status. IDs distinguish the same technical rule occurring on different pages.

Text extraction and metadata are credential-redacted across the sampled document. Screenshot checks continue to consider rendered text rectangles in the captured viewport. Visible recognized sensitive content or incomplete inspection withholds the affected page's two screenshots. A sensitive page must not discard safe screenshots from other pages in the job.

Form fields remain masked. Fresh browser contexts are closed after each page. No screenshot path, browser trace, HAR, response body, or target-page HTML is written to persistent storage. Logs include outcome codes, durations, counts, and opaque correlation IDs only, never screenshots, capability IDs, query values, tokens, or provider bodies.

The existing per-page resource budgets and proxy fixed-window budgets remain enforced. The job deadline and page-count cap are additional bounds, not reasons to disable the sandbox, firewall, DNS pinning, request-method policy, screenshot privacy, or response-size checks.

### Observed endpoint inventory

For same-origin GET requests actually seen during page rendering, retain redacted URL/path, observed HTTP status or network failure, referring page ID, and an 'observed only' label. Do not retain headers, bodies, query values, cookies, credentials, or private destination addresses.

Do not infer that a 200 response proves an endpoint's business behavior, that a failed request is a security flaw, or that this inventory contains every API. External service requests may contribute bounded aggregate counts but are not added as audited endpoints for the target site.

## Antislop evaluator

Implement a versioned trusted server-side rubric, for example antislop-3.2.23-public-v1, derived from the supplied 38-rule skill. It is application data/instructions reviewed with the code, not a runtime download or an executable instruction from the target website. The assistant's own antislop usage mode is independent of the evaluated website's assessment.

Every assessed page returns all 38 rule IDs exactly once. Rule titles, groups, tiers, and applicability definitions come from the canonical rubric, not from model-generated replacements. Missing, duplicated, invented, or malformed rule IDs invalidate the AI assessment.

A rule observation contains: rule ID, status, confidence, verification basis, evidence references, explanation, and recommendation. Evidence references identify real page/viewport DOM observations, screenshots supplied to the model, or observed browser/network results. Free-form invented source files and unsupported evidence references are rejected.

Statuses are pass, issue, unverified, and not_applicable. Subjective issues are explicitly heuristic. A pass is limited to the sampled evidence and is never a full-site compliance claim. Unverified rules must not be converted to passes or improve a score. not_applicable requires evidence that the relevant UI feature is absent from the sampled scope, not merely that the model did not notice it.

### Assessment groups

Eight groups organize the observations: visual identity; composition and hierarchy; copy and evidence; functionality and navigation; mobile; accessibility; motion and themes; authoring/process evidence. Show assessed-rule coverage, issues, unknowns, and short evidence-grounded conclusions per group. Do not invent a single AI-authorship percentage or a general quality grade. The existing technical roast-heat formula stays separate and must not be inflated with subjective style observations.

### Complete rule register and public-evidence limits

| Rule | Parameter | Evidence and conservative decision boundary |
| --- | --- | --- |
| R-01 | Color and gradients | Screenshots and sampled styles can identify the treatment. A gradient alone is not an issue; absent evidence of purpose, a subjective concern is heuristic. |
| R-02 | Copy punctuation and voice | Inspect sampled visible text for agent-like copy patterns. Do not accuse the original author of violating an assistant-writing rule solely for an em dash; its presence is observable, its provenance is not. |
| R-03 | Mobile layout and targets | Measured overflow, element rectangles, clipping, and target sizes at 390px. Report the sampled viewport and use the rubric's 44px target criterion. |
| R-04 | Icon relevance | DOM accessible names and screenshots support relevance observations. A named icon library alone is not proof of slop. |
| R-05 | Composition and section rhythm | Screenshots and DOM section structure support repeated-template observations, marked heuristic unless the defect is directly measurable. |
| R-06 | Typography | Visible hierarchy and sampled font properties. Do not penalize a font name merely because it is popular. |
| R-07 | Background patterns | Visible pattern and contextual purpose. Presence alone does not fail. |
| R-08 | Decorative arrows | Sampled controls and screenshot context; distinguish navigation meaning from repeated ornament. |
| R-09 | Badges and eyebrows | Visible badges, duplicate wording, and actual status meaning. A useful status badge is not a failure. |
| R-10 | Glassmorphism dose | Visible layers and sampled backdrop-filter evidence, with contextual purpose and uncertainty stated. |
| R-11 | Radius consistency | Sampled control/card styles and screenshots; account for intentional hierarchy. |
| R-12 | Shadow hierarchy | Sampled shadows and visible elevation; subjective rationale is heuristic. |
| R-13 | Glow dose | Visible glow distribution and emphasis; no invented CSS values. |
| R-14 | Repeated feature cards | Observed repeated structures and content hierarchy; identical cards can be appropriate. |
| R-15 | Action-specific CTAs | Sampled link/button wording and destination context. |
| R-16 | Buzzwords | Actual sampled phrases and their product context; quote short redacted evidence, not invented copy. |
| R-17 | Statistics provenance | Visible numeric claims and visible source references. Unknown external provenance is unverified, not a fabricated-statistic accusation. |
| R-18 | Testimonial provenance | Visible testimonial content. Identity/authenticity generally remains unverified without authoritative evidence. |
| R-19 | Motion purpose | Bounded animation observation and reduced-motion evidence where collected. A static image cannot prove motion behavior. |
| R-20 | Visual identity | Page screenshots and site context; originality/identity observations are heuristic rather than AI-authorship verdicts. |
| R-21 | Theme choice | Observe the shipped theme. Owner intent and the justification for a fixed theme are usually unverified; do not demand an invented toggle. |
| R-22 | Illustration relevance | Actual images/screenshots and nearby product content; stock or generated provenance is not inferred from appearance alone. |
| R-23 | Asset authorization | Owner approval history cannot be established from a public render; unverified unless supplied as authoritative context. |
| R-24 | Navigation destinations | Admitted internal navigation outcomes, 404s, rejected URLs, and sample boundaries. Unvisited links remain unverified. |
| R-25 | Text contrast | Calculate WCAG ratios only for supported, correctly resolved foreground/background samples. Use 4.5:1 normally, 3:1 for at least 24px regular or 18.67px bold text. Gradients/images/unresolved alpha backgrounds remain unverified rather than guessed. |
| R-26 | Real control behavior | Link navigation can be observed. Buttons/forms requiring clicks or submissions remain unverified under this public passive policy. No 'dead' accusation from missing text alone. |
| R-27 | Empty/loading/error states | State coverage is unverified unless those states were actually observed. Do not conclude they are absent from a homepage screenshot. |
| R-28 | FAQ relevance | Rendered FAQ wording and product-specific context; relevance is heuristic. |
| R-29 | Palette consistency | Supported sampled color values and screenshots, distinguishing neutrals and semantic states from core brand colors. |
| R-30 | Originality and cloning | Visual resemblance is heuristic; intent, permission, and authorship generally remain unverified. |
| R-31 | Design rationale | Context can suggest hierarchy. The owner's rationale is not fabricated and remains unverified without supplied evidence. |
| R-32 | Keyboard and focus | Read-only Tab/Shift+Tab observation of a bounded sample is allowed; no activation/submission. Report focus order/indicator evidence and do not claim every control was tested. |
| R-33 | Source patching process | Requires source/history evidence and is unverified in public-site mode. |
| R-34 | Theme completeness | Only the currently observed theme is assessed. Other themes and toggle behavior remain unverified when not exercised. |
| R-35 | Delivery verification process | Build history and exhaustive owner click-through cannot be inferred from public pages; unverified. |
| R-36 | Security/performance claims | Quote the actual visible claim and source availability. Unsupported external claims remain unverified rather than being declared false. |
| R-37 | Owner design direction | A public screenshot cannot establish whether an owner supplied a design brief; unverified. |
| R-38 | Real content versus placeholders | Explicit placeholder labels are observable. Unlabeled content is not automatically fake; provenance may remain unverified. |

### AI grounding and failure behavior

- Extend the current analysis contract rather than merely appending a vague instruction to the old prompt, which currently prohibits new visual observations.
- Technical findings remain scanner-owned. Antislop observations are a separate typed result and may identify grounded visual/copy concerns even when technical findings are empty.
- Supply the page's desktop/mobile JPEGs only when configured vision is enabled and captures exist. In text-only mode, visual-only rules are unverified; never pretend that images were reviewed.
- Treat page text, images, sitemap content, and model output as untrusted data. Keep the rubric in trusted server-side instructions and validate/redact output before rendering or caching.
- Do not invent statistics, testimonials, hidden source behavior, interactive outcomes, or numeric CSS measurements.
- If AI fails or emits an invalid rule matrix, preserve scanner evidence and screenshots, show AI unavailable, and mark unassessed rubric entries unverified. Never generate a fake assessment as fallback.
- Group repeated issues across pages in the overview using their real page/rule references. This aggregation does not constitute a new visual comparison of screenshots that have already been released.

## API contracts and clean cutover

The route names below define responsibilities; implementation must update every current caller and test rather than retain a second legacy flow.

### Worker, authenticated with the existing scanner bearer token

- GET /health: retain readiness behavior for on-demand wake.
- POST /jobs: validate and admit a public-site job. Store its language/intensity binding and return a capability ID, expiry, and effective limits.
- GET /jobs/:jobId: return compact state, coverage counters, page descriptors, warnings, endpoint inventory, and expiry. Never include full screenshot payloads in job status.
- POST /jobs/:jobId/pages/:pageId/claim: atomically obtain authoritative page evidence and an analysis lease, or return an already cached validated result. A concurrent claim cannot start another analysis.
- PUT /jobs/:jobId/pages/:pageId/result: accept a schema-validated report from the trusted web service under the matching lease and page binding. Expired/cancelled/mismatched leases cannot publish.
- POST /jobs/:jobId/pages/:pageId/ack: idempotently release that page's full evidence, screenshots, and cached result after browser receipt.
- DELETE /jobs/:jobId: cancel that user's capability job and release remaining payloads.

### Web, same-origin mutations and no-store responses

- POST /api/roast: replace the synchronous complete-report response with a 202 job descriptor after readiness and admission.
- GET /api/roast/:id: replace process-local report lookup with worker job status. Serverless operation must not depend on an in-process report map.
- POST /api/roast/:id/pages/:pageId/analyze: claim authoritative evidence, analyze or return the cached result, and return one page report.
- POST /api/roast/:id/pages/:pageId/ack: validate origin and relay delivery acknowledgement.
- DELETE /api/roast/:id: validate origin and cancel the capability job.

The new flow removes the old worker POST /scan contract and its single-page-only client path once callers have migrated. There is no compatibility alias that silently preserves homepage-only results.

All capability IDs must be cryptographically unguessable and excluded from logs. Only requests with the scanner token can reach worker job operations; browser-facing possession of the unguessable job ID grants temporary report access. No unauthenticated job-list endpoint is introduced.

Use distinct documented errors for malformed/public-policy URLs, worker busy, waking/cooldown, job expired, page not ready, page already delivered, analysis busy, and cancellation. Respect Retry-After for transient responses without unbounded retries. A 409 cooldown response is never represented as completed progress.

## Browser report, fixes, and exports

- Preserve the approved paper/ink/red VibeRoast identity and existing mascot assets. Do not introduce a redesign, new logo, decorative assets, generic trust claims, or fictional usage numbers.
- Add factual site coverage and a keyboard-operable page selector. Show discovered/admitted/scanned/analyzed/failed/skipped/unassessed counts with clear labels; do not invent a percentage when the full site size is unknown.
- Start displaying available page results before the job finishes. Show actual per-page transitions and an accessible Cancel action.
- Each selected page retains desktop/mobile screenshot tabs, scanner findings, AI commentary, antislop groups/rule evidence, limitations, and strengths.
- Keep empty, loading, partial, expired, cancelled, and provider-unavailable states. In particular, zero technical findings must not hide the antislop assessment or imply a perfect site.
- Fix selection, generated coding prompts, and image exports operate on the selected page. Combine its technical and actionable antislop issues with collision-free IDs and evidence labels. Keep technical roast heat separate.
- A page may contain up to 60 technical findings plus 38 antislop issues. Update selection/validation bounds consistently so selecting every actionable issue on that page works; do not silently truncate selection.
- Include the selected page URL, rule IDs where relevant, evidence basis, confidence, and verification limitations in generated prompts. Unverified rubric items are not fabricated fixes.
- Reuse the existing client-side prompt generation in serverless mode. Do not trust browser-provided report content as authoritative evidence for new server-side AI calls.
- Browser reports are in memory, not automatic localStorage or disk persistence. Explain that closing/reloading can lose already acknowledged reports. Export remains an explicit user action.
- Browser receipt and worker acknowledgement are separate: an acknowledgement failure must not discard the valid browser report, and repeating the acknowledgement must be safe.

## Tests and release acceptance

1. A controlled site with a homepage and at least three internal HTML pages yields distinct results/screenshots for all admitted pages, including a page found only through a sitemap.
2. A defect placed only on a subpage appears on that page and in the site overview, with the correct URL/evidence. This prevents a homepage-only implementation from passing.
3. Duplicates, cycles, ordinary anchors, tracking variants, downloads, external origins, action links, private/metadata redirects, malformed XML, entity declarations, and oversized sitemaps cannot escape admission or resource bounds.
4. Navigation, page-count, deadline, memory/backpressure, provider failure, and client-lease exhaustion preserve completed evidence and mark remaining work truthfully.
5. Actual worker sandbox/firewall/DNS-pinning rejection is smoke-tested after deployment, not inferred from unit tests.
6. The privacy regression remains red without viewport scoping and green with it: offscreen sensitive text does not invalidate a safe viewport, scrolling it into view does, and a sensitive page does not erase other pages' screenshots.
7. The rubric returns exactly R-01 through R-38 once each. Invented/missing/duplicate IDs, fabricated evidence references, numeric CSS guesses, and prompt injection are rejected or unverified as appropriate.
8. Visual/copy antislop issues can exist with zero technical findings. No-vision and absent-interaction evidence do not produce fictitious visual or functionality passes.
9. Provenance-dependent rules remain unverified without sources. Gradient/card/font presence alone does not force an issue.
10. Interrupted page delivery permits cached re-delivery without duplicate AI work. Only acknowledgement or bounded expiry removes screenshots/evidence; cancellation/restart has explicit observable semantics.
11. Status and page-report responses remain within their stated bounds; no aggregate screenshot response bypasses Vercel payload limits.
12. EN/ID UI, page selection, screenshot tabs, rule details, cancellation, retry, expired state, fix selection, prompt generation, and image export are exercised on desktop and 390px mobile, including keyboard focus and console inspection.
13. Verify text contrast with the contrast checker for changed UI colors. Preserve existing assets and record the antislop Delivery Gate for the new UI, with concrete evidence rather than a blanket PASS.
14. Run the relevant regressions, full existing suites, lint, typecheck, and production build. Update documentation and migrate every changed contract's caller/test without shims.
15. Deploy the worker and web contract cutover together. Smoke a real public site with multiple admitted pages, confirm per-page screenshots and antislop results, then inspect the worker after acknowledgement/expiry to verify that screenshots did not persist as files or retained payloads.

## Implementation boundaries

Expected affected areas are worker job/discovery ownership, worker HTTP routing, the scanner client, shared report schemas, server-side rubric/analysis validation, roast job routes, current report state, results/fixes/prompts/share consumers, and scanner/API/browser tests. Keep these responsibilities explicit rather than duplicating one-page and site-scan implementations.

Do not install antislop skill prompts from the network, reinstall removed Hermes/9Router applications, add account rotation, remove isolation, persist screenshots, or expand into authenticated/active testing under this specification.

## Approval checkpoint

The owner has approved the public-only scope and the conceptual background-job approach. This written specification still requires review before the detailed implementation plan is written. Implementation starts only after review of that plan and selection of its execution method.
