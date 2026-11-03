import { EventEmitter } from 'node:events'
import { chromium, type Browser, type Page, type Request } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findingSchema, type ScanResult } from '../lib/types/report'
import { BrowserEvidenceCollector } from '../worker/browser-evidence'
import * as extraction from '../worker/extract'
import { runScan } from '../worker/scan'

afterEach(() => vi.restoreAllMocks())

function sample(viewport: 'desktop' | 'mobile' = 'desktop') {
  const page = new EventEmitter()
  const metrics: ScanResult['metrics'] = { navigationMs: null, requestCount: 0, failedRequests: 0, consoleErrors: 0 }
  const collector = new BrowserEvidenceCollector(viewport)
  collector.attach(page as unknown as Page, metrics)
  return { page, metrics, collector }
}

function request(url: string, reason = 'net::ERR_CONNECTION_REFUSED') {
  return { url: () => url, failure: () => ({ errorText: reason }), method: () => 'GET', resourceType: () => 'script' } as Request
}

function consoleError(text: string, url = 'https://example.org/app.js?token=source-secret') {
  return { type: () => 'error', text: () => text, location: () => ({ url, lineNumber: 4, columnNumber: 2 }) }
}

describe('bounded actual browser observations', () => {
  it('turns actual event details into stable, evidence-linked observations without inventing flow failures', () => {
    const { page, metrics, collector } = sample()
    const error = new Error('Cannot read properties of undefined (reading settings)')
    error.stack = `TypeError: ${error.message}\n    at initialize (https://example.org/app.js?token=stack-secret:10:2)`
    page.emit('pageerror', error)
    page.emit('console', consoleError('Widget initialization reported an error'))
    page.emit('requestfailed', request('https://cdn.example.org/widget.js?token=request-secret'))
    const findings = collector.findings(true)
    expect(findings.map(({ id }) => id)).toEqual(['browser-page-error-desktop', 'browser-console-error-desktop', 'browser-failed-request-desktop'])
    findings.forEach((finding) => expect(findingSchema.safeParse(finding).success).toBe(true))
    expect(findings[0]).toMatchObject({ source: 'browser', verification: 'verified', confidence: 'high' })
    expect(findings[0].evidence[0]).toContain(error.message)
    expect(findings[0].description).toContain('not proof that a user flow is broken')
    expect(findings[1]).toMatchObject({ verification: 'heuristic', severity: 'low' })
    expect(findings[2]).toMatchObject({ verification: 'heuristic', severity: 'low' })
    expect(findings[2].evidence[0]).toContain('https://cdn.example.org/widget.js')
    expect(findings[2].evidence[0]).toContain('net::ERR_CONNECTION_REFUSED')
    expect(findings[2].evidence[0]).toContain('GET script')
    expect(findings[2].recommendation).toContain('normal browser')
    expect(metrics).toMatchObject({ consoleErrors: 2, failedRequests: 1 })
    expect(JSON.stringify({ findings, summary: collector.summary(true) })).not.toMatch(/stack-secret|request-secret|source-secret/)
  })

  it('redacts before deduplicating, bounds distinct entries, and retains honest aggregate counts', () => {
    const { page, metrics, collector } = sample('mobile')
    for (let index = 0; index < 20; index++) {
      page.emit('console', consoleError(`password="secret number ${index}" person@example.org https://user:pass@example.org/log?value=${index}#private`))
    }
    for (let index = 0; index < 20; index++) page.emit('console', consoleError(`Distinct controlled error ${index} ${'x'.repeat(600)}`))
    const summary = collector.summary(true)
    expect(summary.events).toHaveLength(8)
    expect(summary.events[0].occurrences).toBe(20)
    expect(summary.omitted).toBe(13)
    expect(summary.events.every(({ message, source }) => message.length <= 280 && source.length <= 200)).toBe(true)
    expect(metrics.consoleErrors).toBe(40)
    const findings = collector.findings(true)
    expect(findings[0].id).toBe('browser-console-error-mobile')
    expect(findings[0].evidence).toHaveLength(4)
    expect(JSON.stringify({ summary, findings })).not.toMatch(/secret number|person@example.org|user:pass|value=|#private|source-secret/)
    expect(findings).toEqual(collector.findings(true))
  })

  it.each(['request-budget', 'redirect-limit', 'read-only-policy', 'unsafe-destination'] as const)('withholds %s aborts and downstream fetch noise without losing independent exceptions', (reason) => {
    const { page, metrics, collector } = sample()
    const blocked = request('https://example.org/api/private?token=blocked-secret', 'net::ERR_FAILED')
    collector.blockRequest(blocked, reason)
    page.emit('requestfailed', blocked)
    page.emit('console', consoleError('Failed to load resource: net::ERR_FAILED', blocked.url()))
    page.emit('pageerror', new Error('Failed to fetch'))
    page.emit('pageerror', new Error('Independent initialization invariant failed'))
    const findings = collector.findings(true)
    expect(findings).toHaveLength(1)
    expect(findings[0].evidence).toHaveLength(1)
    expect(findings[0].evidence[0]).toContain('Independent initialization invariant failed')
    expect(collector.summary(true).events.map(({ disposition }) => disposition)).toEqual(['scanner-policy', 'scanner-linked-noise', 'scanner-linked-noise', 'observed'])
    expect(metrics).toMatchObject({ consoleErrors: 3, failedRequests: 1 })
    expect(JSON.stringify(collector.summary(true))).not.toContain('blocked-secret')
  })

  it('withholds websocket-policy noise and proxy failures without calling them website defects', () => {
    const { page, collector } = sample()
    collector.blockUrl('wss://example.org/socket?token=websocket-secret', 'websocket-policy')
    page.emit('console', consoleError('WebSocket connection failed'))
    page.emit('requestfailed', request('https://example.org/app.js', 'net::ERR_TUNNEL_CONNECTION_FAILED'))
    expect(collector.findings(true)).toEqual([])
    expect(collector.summary(true).events.map(({ disposition }) => disposition)).toEqual(['scanner-linked-noise', 'proxy-uncertain'])
    expect(JSON.stringify(collector.summary(true))).not.toContain('websocket-secret')
  })

  it.each(['scan-budget', 'scan-teardown'] as const)('preserves earlier observations while excluding %s cancellations and late errors', (reason) => {
    const { page, metrics, collector } = sample()
    page.emit('console', consoleError('Earlier application message'))
    page.emit('requestfailed', request('https://example.org/replaced.js', 'net::ERR_ABORTED'))
    collector.stop(reason)
    page.emit('requestfailed', request('https://example.org/pending.js'))
    page.emit('pageerror', new Error('Late context shutdown message'))
    expect(collector.findings(true)).toHaveLength(1)
    expect(collector.findings(true)[0].evidence[0]).toContain('Earlier application message')
    expect(collector.summary(true).events.map(({ disposition }) => disposition)).toEqual(['observed', 'cancelled', reason, reason])
    expect(metrics).toMatchObject({ consoleErrors: 2, failedRequests: 2 })
  })

  it('withholds all target findings for unassessable viewports while retaining labeled diagnostic context', () => {
    const { page, collector } = sample('mobile')
    page.emit('pageerror', new Error('Challenge widget failed'))
    page.emit('requestfailed', request('https://example.org/challenge.js'))
    expect(collector.findings(false)).toEqual([])
    expect(collector.summary(false)).toMatchObject({ viewport: 'mobile', assessable: false, events: expect.any(Array) })
    expect(collector.summary(false).events).toHaveLength(2)
  })
})

it('withholds generic fetch exceptions linked to ambiguous proxy failures and explicit cancellation console noise', () => {
  const { page, collector } = sample()
  page.emit('requestfailed', request('https://example.org/app.js', 'net::ERR_PROXY_CONNECTION_FAILED'))
  page.emit('pageerror', new Error('Failed to fetch'))
  page.emit('console', consoleError('Failed to load resource: net::ERR_ABORTED'))
  expect(collector.findings(true)).toEqual([])
  expect(collector.summary(true).events.map(({ disposition }) => disposition)).toEqual(['proxy-uncertain', 'proxy-uncertain', 'cancelled'])
})

describe('scan report browser evidence integration', () => {
  it.each([
    { title: 'Application fixture', status: 200, eligible: true },
    { title: 'Just a moment...', status: 200, eligible: false },
    { title: 'Application fixture', status: 503, eligible: false },
  ])('uses the same DOM assessment gate for browser findings ($title, HTTP $status)', async ({ title, status, eligible }) => {
    vi.spyOn(extraction, 'extractPage').mockResolvedValue({
      title, description: 'Controlled integration document', language: 'en', viewportMeta: 'width=device-width',
      viewport: { width: 390, height: 844, documentWidth: 390 }, headings: [{ level: 1, text: 'Application fixture' }],
      links: [], buttons: [], forms: [], images: [], inputs: [], styles: [], text: 'Application fixture', truncated: false,
    })
    vi.spyOn(chromium, 'launch').mockResolvedValue({
      newContext: async () => ({
        setDefaultTimeout: () => {}, on: () => {}, route: async () => {}, routeWebSocket: async () => {}, close: async () => {},
        newPage: async () => {
          const page = new EventEmitter()
          return Object.assign(page, {
            goto: async () => {
              page.emit('pageerror', new Error('Controlled report integration exception token=integration-secret'))
              page.emit('requestfailed', request('https://example.org/widget.js?token=resource-secret'))
              return { status: () => status, headers: () => ({ 'content-type': 'text/html' }) }
            },
            url: () => 'https://example.org/',
            waitForTimeout: async () => {}, waitForFunction: async () => {},
            evaluate: async () => false,
            screenshot: async () => { throw new Error('Controlled screenshot unavailable') },
          })
        },
      }),
      close: async () => {},
    } as unknown as Browser)
    const result = await runScan('https://example.org/', { proxyUrl: 'http://proxy.example.org:8080' })
    expect(result.metrics).toMatchObject({ consoleErrors: 2, failedRequests: 2 })
    expect(result.findings.filter(({ source }) => source === 'browser').map(({ id }) => id)).toEqual(eligible
      ? ['browser-page-error-desktop', 'browser-failed-request-desktop', 'browser-page-error-mobile', 'browser-failed-request-mobile']
      : [])
    expect(result.evidenceSummary).toContain(`"assessable":${eligible}`)
    expect(result.evidenceSummary).toContain('Controlled report integration exception')
    expect(JSON.stringify(result)).not.toMatch(/integration-secret|resource-secret/)
  })
})
