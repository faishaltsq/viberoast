import type { Page, Request } from 'playwright'
import { redactSecrets, redactUrl } from '../lib/security/redact'
import type { Finding, ScanResult } from '../lib/types/report'

type Viewport = 'desktop' | 'mobile'
type Kind = 'console-error' | 'page-error' | 'failed-request'
type Disposition = 'observed' | 'scanner-policy' | 'scanner-linked-noise' | 'scan-budget' | 'scan-teardown' | 'cancelled' | 'proxy-uncertain'
type BlockReason = 'request-budget' | 'redirect-limit' | 'read-only-policy' | 'unsafe-destination' | 'websocket-policy'
interface BrowserEvent {
  viewport: Viewport
  kind: Kind
  message: string
  source: string
  reason: string
  method: string
  resourceType: string
  disposition: Disposition
  occurrences: number
}

const NETWORK_NOISE = /failed to fetch|fetch failed|load failed|networkerror|network error|failed to load resource|err_(?:failed|aborted|blocked|tunnel|proxy)|websocket.*(?:error|failed)|loading (?:chunk|css chunk).*failed|chunkloaderror/i
const PROXY_FAILURE = /ERR_(?:TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|NO_SUPPORTED_PROXIES|BLOCKED_BY_CLIENT|BLOCKED_BY_ADMINISTRATOR)/i
const CANCELLED = /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i
const clean = (text: string, limit: number) => redactSecrets(text).slice(0, limit)

export class BrowserEvidenceCollector {
  private readonly entries: BrowserEvent[] = []
  private readonly blockedUrls = new Set<string>()
  private readonly blockedRequests = new WeakSet<Request>()
  private readonly blocks: Partial<Record<BlockReason, number>> = {}
  private ended: 'scan-budget' | 'scan-teardown' | undefined
  private omitted = 0
  private proxyUncertain = false
  private websocketBlocks = 0

  constructor(private readonly viewport: Viewport) {}

  blockUrl(url: string, reason: BlockReason) {
    // Request limits cap this set in production; keep the collector bounded independently too.
    if (this.blockedUrls.size < 160) this.blockedUrls.add(clean(redactUrl(url), 200))
    if (reason === 'websocket-policy') this.websocketBlocks = Math.min(this.websocketBlocks + 1, 1000)
    this.blocks[reason] = Math.min((this.blocks[reason] ?? 0) + 1, 1000)
  }

  blockRequest(request: Request, reason: BlockReason) {
    this.blockedRequests.add(request)
    this.blockUrl(request.url(), reason)
  }

  stop(reason: 'scan-budget' | 'scan-teardown') { this.ended ??= reason }

  attach(page: Page, metrics: ScanResult['metrics']) {
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      metrics.consoleErrors = Math.min(metrics.consoleErrors + 1, 1000)
      const location = message.location()
      const source = location.url ? `${redactUrl(location.url)}:${location.lineNumber + 1}:${location.columnNumber + 1}` : ''
      this.record('console-error', message.text(), source, 'Browser console.error event')
    })
    page.on('pageerror', (error) => {
      metrics.consoleErrors = Math.min(metrics.consoleErrors + 1, 1000)
      this.record('page-error', error.message, error.stack?.split('\n').slice(1, 3).join(' ') ?? '', 'Uncaught browser exception')
    })
    page.on('requestfailed', (request) => {
      metrics.failedRequests = Math.min(metrics.failedRequests + 1, 1000)
      const reason = request.failure()?.errorText ?? 'Browser did not supply a failure reason'
      const disposition = this.ended ?? (this.blockedRequests.has(request) ? 'scanner-policy'
        : CANCELLED.test(reason) ? 'cancelled'
        : PROXY_FAILURE.test(reason) ? 'proxy-uncertain' : 'observed')
      if (disposition === 'proxy-uncertain') this.proxyUncertain = true
      this.record('failed-request', 'Resource request failed during the passive sample', redactUrl(request.url()), reason, disposition, request.method(), request.resourceType())
    })
  }

  private record(kind: Kind, message: string, source: string, reason: string, disposition: Disposition = this.ended ?? 'observed', method = '', resourceType = '') {
    const entry: BrowserEvent = { viewport: this.viewport, kind, message: clean(message, 280), source: clean(source, 200), reason: clean(reason, 100), method: clean(method, 10), resourceType: clean(resourceType, 30), disposition, occurrences: 1 }
    const duplicate = this.entries.find((item) => item.kind === entry.kind && item.message === entry.message && item.source === entry.source && item.reason === entry.reason && item.disposition === entry.disposition && item.method === entry.method && item.resourceType === entry.resourceType)
    if (duplicate) { duplicate.occurrences = Math.min(duplicate.occurrences + 1, 1000); return }
    if (this.entries.length < 8) this.entries.push(entry)
    else this.omitted = Math.min(this.omitted + 1, 1000)
  }

  summary(assessable: boolean) {
    const events = this.entries.map((entry) => {
      if (entry.disposition !== 'observed' || entry.kind === 'failed-request') return { ...entry }
      const detail = `${entry.message} ${entry.source}`
      // A rejected fetch may have no request URL in its exception. Withhold such
      // ambiguous network noise when this viewport encountered scanner restrictions.
      const disposition: Disposition = CANCELLED.test(detail) ? 'cancelled'
        : /websocket/i.test(detail) && this.websocketBlocks > 0 ? 'scanner-linked-noise'
        : PROXY_FAILURE.test(detail) || (NETWORK_NOISE.test(detail) && this.proxyUncertain) ? 'proxy-uncertain'
        : NETWORK_NOISE.test(detail) && this.blockedUrls.size > 0 ? 'scanner-linked-noise' : entry.disposition
      return { ...entry, disposition }
    })
    return { viewport: this.viewport, assessable, events, omitted: this.omitted, scannerBlocks: { ...this.blocks }, blockedSources: [...this.blockedUrls].slice(0, 8) }
  }

  findings(assessable: boolean): Finding[] {
    if (!assessable) return []
    const events = this.summary(true).events.filter(({ disposition }) => disposition === 'observed')
    return (['page-error', 'console-error', 'failed-request'] as const).flatMap((kind): Finding[] => {
      const matching = events.filter((entry) => entry.kind === kind)
      if (!matching.length) return []
      const runtime = kind === 'page-error'
      const network = kind === 'failed-request'
      return [{
        id: `browser-${kind}-${this.viewport}`, category: 'Functionality',
        title: runtime ? 'An uncaught browser exception was observed' : network ? 'A resource request failed during the browser sample' : 'The page emitted browser console errors',
        description: runtime ? 'The browser reported an uncaught JavaScript exception in this viewport. The exception is observed evidence, not proof that a user flow is broken.' : 'The browser reported the events below during a passive, isolated sample. User impact and root cause remain uncertain; network conditions, missing consent, or scanner restrictions can differ from a normal session.',
        severity: runtime ? 'medium' : 'low', confidence: runtime ? 'high' : 'medium',
        evidence: matching.slice(0, 4).map((entry) => `${entry.viewport} | ${entry.kind} | ${entry.message} | source: ${entry.source || 'not provided'} | reason: ${entry.reason}${entry.method ? ` | ${entry.method} ${entry.resourceType}` : ''} | observed ${entry.occurrences} time(s)`),
        location: `${this.viewport} passive browser sample`, source: 'browser', verification: runtime ? 'verified' : 'heuristic',
        recommendation: network ? 'Reproduce this resource URL in a normal browser and inspect the Network panel, server logs, and its initiator. Confirm user-visible impact and distinguish deployment, network, consent, and scanner-policy causes before changing application behavior.' : 'Reproduce the recorded message and source in a normal browser with DevTools open. Inspect its stack or initiator and test the affected flow before concluding that functionality is broken; distinguish application errors from third-party and restricted-scan noise.',
      }]
    })
  }
}
