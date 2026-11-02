# Evidence-backed MVP implementation

## Baseline and reconnaissance

- Starting/default branch: main, latest origin/main verified by fetch.
- Starting commit: 0fa0a499f10c433373429d2b39cbc8729052f254.
- Feature branch: feat/evidence-backed-mvp.
- Next 16.4.3, React 19, Tailwind 4.3.3, TypeScript 5.7.3, pnpm 12.3.4.
- Tracked source: app/page.tsx (all views), app/globals.css (approved design), app/layout.tsx, components/ui/button.tsx, lib/utils.ts. Assets include the original public/bro-code.png and placeholder/icons.
- No existing tests, API routes, GitHub Actions, scanner, provider integration, or deployment configuration.
- Confirmed simulated analysis timer, hardcoded findings/prompt/screenshots/scores and community entries, inert controls, and ignoreBuildErrors.
- Working tree clean before edits; parent workspace is a separate repository and is not modified.

## Architecture decision

Keep Next.js and the approved page composition. Use synchronous bounded scanning through an authenticated HTTP worker; no fake job timers or queues. A shared Zod contract defines scan evidence, commentary, report, and prompt options. The web server owns AI credentials and private temporary reports. The scanner must run behind a validating, DNS-pinning egress proxy with OS/network restrictions that prevent direct browser access to internal services. Missing isolation configuration fails closed. Reports use unguessable capabilities, expire, and are not publicly published. Image and text sharing need no public storage. A community backend and repository analysis remain separate optional milestones.

## Shared interfaces and ownership

- lib/types/report.ts: canonical shared contract, owned by integration.
- Scanner exports scanWebsite(url): Promise<ScanResult> from lib/scanner/client.ts; worker and network policy live in worker/ and deployment files. URL validators in lib/security/url.ts; secret redactor in lib/security/redact.ts.
- AI exports generateRoast(scan, { language, intensity }): Promise<{ commentary: Commentary; visualAnalysis: boolean }> from lib/ai/deepseek.ts. Provider failures throw sanitized errors.
- Prompt exports generatePrompt(report, options): string from lib/prompts/generate.ts. Score exports calculateScore(findings): number from lib/roast/score.ts, a disclosed issue-density comedy indicator, not an audit percentage.
- Web API POST /api/roast accepts {url, language, intensity}; returns RoastReport synchronously. GET /api/roast/:id returns retained private capability report. POST /api/prompts/generate accepts {reportId, ...PromptOptions}; returns {prompt}. Errors return {error, code}, never raw internals.
- UI owns app/page.tsx, view components, globals.css additions and browser-only image exports. It consumes shared types and pure prompt/score functions. Report stays in React memory; no automatic URL publishing.
- Integration owns route handlers, temporary store, abuse controls, dependency/configuration changes, tests, CI and deployment docs.

## Ordered implementation checklist

1. Foundation: install locked dependencies, remove TypeScript suppression, shared schemas, feature branch, baseline screen capture, add test/lint scripts.
2. Scanner: public URL/IP validation, DNS pinning, redirect/subresource validation, network isolation, screenshots, bounded DOM extraction, deterministic evidence and partial failures.
3. AI: verify official capabilities, configurable model/base URL/key/vision, bounded structured JSON calls, evidence-ID checking, bilingual intensity prompts, untrusted-content separation and secret redaction.
4. Product flow: real request/report/errors, evidence expansion, stable finding IDs, quick/full/selected fixes, deterministic localized agent prompts, clipboard and Markdown export.
5. Polish: preserve hero/artwork/tokens; implement meaningful navigation, language control, reactions, image card formats/X text, honest searchable/sortable community examples.
6. QA: unit/security/integration tests with deterministic external mocks; browser end-to-end using controlled server fixtures; typecheck/lint/production build; desktop/mobile visual and interaction smoke; document exact limitations.
7. Optional GitHub: assess only once core works; never execute repository contents, invent files, or expose credentials.

## Design rationale

Warm paper, ink, muted red and terminal green stay because they are the approved brand. Editorial typography and uneven section composition stay because they carry the comic voice. Existing hard borders and offset shadows mark action/report surfaces. Existing mascot is the identity, not a replaceable illustration. New controls reuse native elements and existing classes. ENERGY 3 / RHYTHM 3 / MOTION 1; brief event reactions only, reduced-motion respected. Existing illustrative marketing content must be explicitly labeled, not passed off as scan evidence.

## Verification constraints discovered

Docker CLI exists but Docker Desktop Linux daemon is unavailable. No credentials have been read or exposed; live provider verification requires DEEPSEEK_API_KEY and an explicitly selected available model. Do not replace either missing integration with a production mock. Ordinary CI uses isolated fixtures and mocked provider responses only.
