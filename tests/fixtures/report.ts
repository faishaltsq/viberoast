import type { Commentary, RoastReport, ScanResult } from '../../lib/types/report'

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
export function makeReport(): RoastReport {
  return structuredClone({ id: '55555555-5555-4555-8555-555555555555', expiresAt: '2026-11-02T12:15:00.000Z', language: 'en', intensity: 'No Mercy', scan: fixtureScan, commentary: fixtureCommentary, aiStatus: 'completed', aiMessage: null, visualAnalysis: false })
}
