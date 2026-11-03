import type { Commentary, RepositoryReport, RepoScanResult, ScanResult, WebsiteReport } from '../../lib/types/report'

export const fixtureScan: ScanResult = {
  url: 'https://fixture.example.com/', finalUrl: 'https://fixture.example.com/', scannedAt: '2026-11-02T12:00:00.000Z', status: 'completed', title: 'Fixture storefront', description: '',
  screenshots: { desktop: null, mobile: null },
  findings: [
    { id: 'meta-description', category: 'SEO', title: 'Missing meta description', description: 'The document has no meta description.', severity: 'low', confidence: 'high', evidence: ['No meta[name="description"] element exists.'], location: 'head', recommendation: 'Add a concise description that accurately summarizes the page.', source: 'metadata', verification: 'verified' },
    { id: 'image-alt', category: 'Accessibility', title: 'Image has no alt attribute', description: 'An image has no accessible text alternative.', severity: 'medium', confidence: 'high', evidence: ['img#product has no alt attribute.'], location: 'img#product', recommendation: 'Provide meaningful alt text or mark a decorative image with an empty alt.', source: 'dom', verification: 'verified' },
  ],
  strengths: ['The document has exactly one main heading.'], warnings: [],
  metrics: { navigationMs: 132, requestCount: 4, failedRequests: 0, consoleErrors: 0 },
  evidenceSummary: 'One h1, one product image without alt, no meta description. No button interaction performed.',
}
export const fixtureCommentary: Commentary = {
  verdict: { headline: 'Bro, your product image is on mute.', summary: 'A missing alt attribute and description leave useful context behind.', developerNickname: 'The Context Evader', reaction: 'disappointed' },
  findings: fixtureScan.findings.map(f => ({ id: f.id, evidenceIds: [f.id], roast: f.id === 'image-alt' ? 'Bro gave the product a photo and forgot its voice.' : 'Your search snippet is freelancing.', explanation: f.description, recommendation: f.recommendation, reaction: 'helpful' })),
  strengths: fixtureScan.strengths, overallSummary: 'Fix the text alternatives without changing the branding.',
}
export function makeReport(): WebsiteReport {
  return structuredClone({ id: '55555555-5555-4555-8555-555555555555', expiresAt: '2026-11-02T12:15:00.000Z', language: 'en', intensity: 'No Mercy', scan: fixtureScan, commentary: fixtureCommentary, aiStatus: 'completed', aiMessage: null, visualAnalysis: false })
}

export const fixtureRepoScan: RepoScanResult = {
  owner: 'acme-corp',
  repo: 'cool-app',
  sha: 'aabbccddeeff00112233445566778899aabbccdd',
  defaultBranch: 'main',
  description: 'Cool test application',
  language: 'TypeScript',
  stargazerCount: 42,
  forkCount: 7,
  commitDate: '2026-11-02T12:00:00.000Z',
  commitMessage: 'feat: initial release',
  tree: [
    { path: 'src/index.ts', type: 'file', size: 120 },
    { path: 'package.json', type: 'file', size: 350 },
  ],
  selectedFiles: [
    { path: 'src/index.ts', size: 120, truncated: false },
  ],
  coverage: {
    filesDiscovered: 2,
    filesInspected: 1,
    bytesInspected: 120,
    treeTruncated: false,
    contentTruncated: false,
  },
  findings: [
    {
      id: 'repo-empty-catch-1',
      category: 'Code Quality',
      title: 'Silent error swallowing in src/index.ts',
      description: 'Empty catch block suppresses exceptions without logging.',
      severity: 'high',
      confidence: 'high',
      evidence: ['catch (err) {}'],
      location: 'src/index.ts:15',
      recommendation: 'Log or rethrow error.',
      source: 'repository',
      verification: 'verified',
    },
    {
      id: 'repo-missing-ci',
      category: 'Tests',
      title: 'No automated CI/CD workflow configured',
      description: 'No CI pipeline found in .github/workflows.',
      severity: 'medium',
      confidence: 'high',
      evidence: ['No workflow configuration found in .github/workflows/'],
      location: '.github/workflows',
      recommendation: 'Add GitHub Actions workflow.',
      source: 'repository',
      verification: 'verified',
    },
  ],
  securityFindings: [],
  strengths: ['TypeScript configured for static type safety.'],
  warnings: [],
  evidenceSummary: 'Repository scan for acme-corp/cool-app at commit aabbccd.',
}

export const fixtureRepoCommentary: Commentary = {
  verdict: {
    headline: 'Bro swallowed the error and prayed to the compiler.',
    summary: 'Silent catches and missing CI make for an eventful on-call shift.',
    developerNickname: 'The Catch-Block Magician',
    reaction: 'suspicious',
  },
  findings: [
    {
      id: 'repo-empty-catch-1',
      evidenceIds: ['repo-empty-catch-1'],
      roast: 'Swallowing errors like they are free mints at a diner.',
      explanation: 'Empty catch block suppresses exceptions without logging.',
      recommendation: 'Log or rethrow error.',
      reaction: 'laughing',
    },
    {
      id: 'repo-missing-ci',
      evidenceIds: ['repo-missing-ci'],
      roast: 'Your CI pipeline is running on pure vibes and developer optimism.',
      explanation: 'No CI pipeline found in .github/workflows.',
      recommendation: 'Add GitHub Actions workflow.',
      reaction: 'disappointed',
    },
  ],
  strengths: fixtureRepoScan.strengths,
  overallSummary: 'Fix the empty catch blocks and add a CI check before merging.',
}

export function makeRepoReport(): RepositoryReport {
  return structuredClone({
    scanKind: 'repository',
    id: '66666666-6666-4666-8666-666666666666',
    expiresAt: '2026-11-02T12:15:00.000Z',
    language: 'en',
    intensity: 'No Mercy',
    repoScan: fixtureRepoScan,
    commentary: fixtureRepoCommentary,
    aiStatus: 'completed',
    aiMessage: null,
    visualAnalysis: false,
  })
}
