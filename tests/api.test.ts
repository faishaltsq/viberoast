import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureScan, fixtureCommentary } from './fixtures/report'

vi.mock('../lib/scanner/client', () => ({ scanWebsite: vi.fn(), ScannerError: class ScannerError extends Error {} }))
vi.mock('../lib/ai/deepseek', () => ({ generateRoast: vi.fn() }))

// Re-import after resetModules to exercise each cold-start singleton and deployment boundary.
async function modules() {
  const api = await import('../app/api/roast/route')
  const scanner = await import('../lib/scanner/client')
  const ai = await import('../lib/ai/deepseek')
  return { ...api, scan: vi.mocked(scanner.scanWebsite), ai: vi.mocked(ai.generateRoast) }
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/roast', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
const input = { url: 'https://fixture.example.com/', language: 'en', intensity: 'No Mercy' }

beforeEach(() => {
  vi.resetModules()
  delete (globalThis as typeof globalThis & { vibeRoastState?: unknown }).vibeRoastState
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('TRUST_PROXY', 'false')
})

describe('roast API', () => {
  it('rejects internal targets before invoking the scanner', async () => {
    const api = await modules()
    const response = await api.POST(request({ ...input, url: 'http://127.0.0.1' }))
    expect(response.status).toBe(400)
    expect(api.scan).not.toHaveBeenCalled()
  })
  it('returns a retained real report with private cache policy', async () => {
    const api = await modules()
    api.scan.mockResolvedValue(fixtureScan)
    api.ai.mockResolvedValue({ commentary: fixtureCommentary, visualAnalysis: false })
    const response = await api.POST(request(input))
    const report = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(report.scan.findings[1].evidence).toEqual(['img#product has no alt attribute.'])
    expect(report.aiStatus).toBe('completed')
    const { GET } = await import('../app/api/roast/[id]/route')
    const retrieved = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: report.id }) })
    expect((await retrieved.json()).id).toBe(report.id)
  })
  it('labels partial scanner evidence and AI failure without inventing commentary', async () => {
    const api = await modules()
    api.scan.mockResolvedValue({ ...fixtureScan, status: 'partially_completed', warnings: ['Mobile capture unavailable.'] })
    api.ai.mockRejectedValue(new Error('Bearer secret-provider-detail'))
    const response = await api.POST(request(input))
    const report = await response.json()
    expect(report.scan.status).toBe('partially_completed')
    expect(report.commentary).toBeNull()
    expect(report.aiStatus).toBe('unavailable')
    expect(JSON.stringify(report)).not.toContain('secret-provider-detail')
  })
  it('does not start paid AI work or retain a report after the caller cancels', async () => {
    const api = await modules()
    const controller = new AbortController()
    api.scan.mockImplementation(async () => { controller.abort(); return fixtureScan })
    const cancelled = new Request(request(input), { signal: controller.signal })
    const response = await api.POST(cancelled)
    expect(response.status).toBe(499)
    expect(api.ai).not.toHaveBeenCalled()
    expect((await response.json()).code).toBe('REQUEST_CANCELLED')
  })
  it('sanitizes worker failures and releases the concurrency slot', async () => {
    const api = await modules()
    api.scan.mockRejectedValue(new Error('worker internal network secret'))
    for (let i = 0; i < 3; i++) {
      const response = await api.POST(request(input))
      expect(response.status).toBe(503)
      expect(await response.text()).not.toContain('internal network')
    }
    expect((await api.POST(request(input))).status).toBe(429)
  })
  it('does not trust spoofed IP headers by default', async () => {
    const api = await modules()
    api.scan.mockRejectedValue(new Error('offline'))
    for (let i = 0; i < 3; i++) await api.POST(request(input, { 'x-real-ip': `203.0.113.${i}` }))
    expect((await api.POST(request(input, { 'x-real-ip': '8.8.8.8' }))).status).toBe(429)
  })
  it('rejects cross-origin requests and malformed or oversized bodies', async () => {
    const api = await modules()
    expect((await api.POST(request(input, { origin: 'https://evil.example' }))).status).toBe(403)
    expect((await api.POST(request({ ...input, language: 'unsupported' }))).status).toBe(400)
    expect((await api.POST(request({ junk: 'a'.repeat(9000) }))).status).toBe(413)
    expect(api.scan).not.toHaveBeenCalled()
  })
  it('fails closed for production serverless or unconfigured deployments', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEPLOYMENT_MODE', '')
    const api = await modules()
    expect((await api.POST(request(input))).status).toBe(503)
    expect(api.scan).not.toHaveBeenCalled()
  })
})

describe('private report retention and prompts', () => {
  it('expires reports rather than returning stale scan data', async () => {
    const { retainReport, getReport } = await import('../lib/server/store')
    const { makeReport } = await import('./fixtures/report')
    const report = makeReport()
    const before = Date.parse(report.expiresAt) - 1000
    retainReport(report, before)
    expect(getReport(report.id, before).id).toBe(report.id)
    expect(() => getReport(report.id, before + 1001)).toThrow(/expired/)
  })
  it('generates only selected findings and rejects a fabricated finding ID', async () => {
    const api = await modules()
    api.scan.mockResolvedValue(fixtureScan)
    api.ai.mockResolvedValue({ commentary: fixtureCommentary, visualAnalysis: false })
    const report = await (await api.POST(request(input))).json()
    const { POST } = await import('../app/api/prompts/generate/route')
    const options = { reportId: report.id, selectedIds: ['image-alt'], preset: 'Codex', language: 'en', detail: 'detailed' }
    const response = await POST(request(options))
    const { prompt } = await response.json()
    expect(response.status).toBe(200)
    expect(prompt).toContain('img#product')
    expect(prompt).not.toContain('No meta[name=')
    expect((await POST(request({ ...options, selectedIds: ['invented'] }))).status).toBe(400)
  })
})
