import { chromium, type BrowserContext, type Page } from 'playwright'
import sharp from 'sharp'
import { normalizePublicUrl } from '../lib/security/url'
import { redactSecrets, redactUrl, SENSITIVE_TEXT_PATTERN } from '../lib/security/redact'
import { scanSchema, type ScanResult } from '../lib/types/report'
import { buildFindings, extractPage, isChallengePage, type PageEvidence } from './extract'

export interface ScannerConfig { proxyUrl: string }

export class SensitiveScreenshotError extends Error {}

export async function captureScreenshot(page: Page): Promise<string> {
  // Pixel redaction is not reliable for credentials: omit images instead.
  const unsafe = await page.evaluate((sensitivePattern) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode(), count = 0
    const sensitive = new RegExp(sensitivePattern, 'i')
    while (node && count++ < 10_000) {
      if (sensitive.test(node.textContent ?? '')) return true
      node = walker.nextNode()
    }
    return Boolean(node)
  }, SENSITIVE_TEXT_PATTERN.source)
  if (unsafe) throw new SensitiveScreenshotError('Sensitive or incomplete screenshot content')
  const raw = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false, timeout: 4_000, animations: 'disabled', mask: [page.locator('input, textarea, select, [contenteditable], [autocomplete]')], maskColor: '#111111' })
  for (const quality of [65, 45, 25]) {
    const image = await sharp(raw).resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer()
    const data = `data:image/jpeg;base64,${image.toString('base64')}`
    if (data.length < 600_000) return data
  }
  throw new Error('Screenshot exceeds limit')
}

export async function runScan(input: string, config: ScannerConfig): Promise<ScanResult> {
  const target = normalizePublicUrl(input)
  const started = Date.now()
  const warnings: string[] = []
  const warn = (message: string) => { if (warnings.length < 18 && !warnings.includes(message)) warnings.push(message) }
  const metrics: ScanResult['metrics'] = { navigationMs: null, requestCount: 0, failedRequests: 0, consoleErrors: 0 }
  let finalUrl = redactUrl(target)
  let desktop: PageEvidence | null = null, mobile: PageEvidence | null = null
  const screenshots: ScanResult['screenshots'] = { desktop: null, mobile: null }
  const unavailableContent = { desktop: false, mobile: false }
  let budgetExceeded = false, responseBytes = 0, sensitiveScreenshots = false
  const browser = await chromium.launch({
    headless: true, chromiumSandbox: true, timeout: 10_000,
    proxy: { server: config.proxyUrl, bypass: '' },
    args: ['--disable-quic', '--proxy-bypass-list=<-loopback>', '--disable-background-networking', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
  })
  const deadline = setTimeout(() => { void browser.close().catch(() => {}) }, 38_000)
  try {
    for (const mode of ['desktop', 'mobile'] as const) {
      if (Date.now() - started > 30_000 || budgetExceeded) { warn('The scan budget was exhausted before both viewports completed.'); break }
      let context: BrowserContext | undefined
      try {
        context = await browser.newContext({
          viewport: mode === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
          deviceScaleFactor: 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile',
          acceptDownloads: false, serviceWorkers: 'block', javaScriptEnabled: true, ignoreHTTPSErrors: false,
          permissions: [], extraHTTPHeaders: { 'DNT': '1' },
        })
        context.setDefaultTimeout(4_000)
        context.on('request', (request) => {
          metrics.requestCount = Math.min(metrics.requestCount + 1, 1000)
          let redirects = 0, previous = request.redirectedFrom()
          while (previous && redirects <= 8) { redirects++; previous = previous.redirectedFrom() }
          if (metrics.requestCount > 140 || redirects > 8) {
            budgetExceeded = true
            warn('The request or redirect-chain limit was reached.')
            void context?.close().catch(() => {})
          }
        })
        await context.route('**/*', async (route) => {
          const request = route.request()
          let redirects = 0, previous = request.redirectedFrom()
          while (previous) { redirects++; previous = previous.redirectedFrom(); if (redirects > 8) break }
          try {
            if (metrics.requestCount > 140 || responseBytes > 24_000_000) { budgetExceeded = true; warn('Request or transferred-byte limits were reached.'); await route.abort(); return }
            if (redirects > 8 || !['GET', 'HEAD'].includes(request.method())) { warn('A redirect chain or non-read-only request was blocked.'); await route.abort(); return }
            normalizePublicUrl(request.url())
            const headers = { ...request.headers() }
            delete headers.authorization
            delete headers.cookie
            await route.continue({ headers })
          } catch { warn('A non-public or unsupported subresource destination was blocked.'); await route.abort().catch(() => {}) }
        })
        await context.routeWebSocket('**/*', (socket) => socket.close())
        const page = await context.newPage()
        page.on('download', (download) => { warn('A download was blocked.'); void download.cancel().catch(() => {}) })
        page.on('popup', (popup) => { warn('A popup was blocked.'); void popup.close().catch(() => {}) })
        page.on('console', (message) => { if (message.type() === 'error') metrics.consoleErrors = Math.min(metrics.consoleErrors + 1, 1000) })
        page.on('pageerror', () => { metrics.consoleErrors = Math.min(metrics.consoleErrors + 1, 1000) })
        page.on('requestfailed', () => { metrics.failedRequests = Math.min(metrics.failedRequests + 1, 1000) })
        page.on('requestfinished', (request) => {
          void request.sizes().then(({ responseBodySize }) => {
            responseBytes += responseBodySize
            if (responseBytes > 24_000_000) { budgetExceeded = true; warn('Transferred-byte limits were reached.'); void context?.close().catch(() => {}) }
          }).catch(() => {})
        })
        const navigation = Date.now()
        try {
          const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 12_000 })
          if (mode === 'desktop') metrics.navigationMs = Date.now() - navigation
          if (!response || response.status() >= 400) {
            unavailableContent[mode] = true
            warn(`${mode}: the navigation returned an HTTP error or no response; target-page findings are withheld.`)
          }
          if (response && !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(response.headers()['content-type'] ?? '')) {
            warn(`${mode}: the destination did not return supported HTML content.`)
            continue
          }
        } catch { warn(`${mode}: navigation did not complete within its budget or was blocked.`) }
        if (!page.url().startsWith('http')) { warn(`${mode}: no inspectable document loaded.`); continue }
        try { finalUrl = redactUrl(normalizePublicUrl(page.url())) } catch { warn(`${mode}: final navigation destination was rejected.`); continue }
        await page.waitForTimeout(700)
        try { await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', undefined, { timeout: 1_000 }) }
        catch { warn(`${mode}: web fonts did not settle within the rendering budget.`) }
        try {
          const evidence = await extractPage(page)
          if (isChallengePage(evidence)) {
            unavailableContent[mode] = true
            warn(`${mode}: a possible bot-protection or access challenge was observed; target-page findings are withheld.`)
          }
          if (evidence.truncated) warn(`${mode}: DOM extraction was limited to the first 5,000 elements.`)
          if (evidence.sensitive || evidence.truncated) sensitiveScreenshots = true
          if (mode === 'desktop') desktop = evidence
          else mobile = evidence
        } catch { warn(`${mode}: DOM evidence could not be extracted.`) }
        try { screenshots[mode] = await captureScreenshot(page) } catch (error) {
          if (error instanceof SensitiveScreenshotError) sensitiveScreenshots = true
          warn(`${mode}: a bounded, privacy-filtered screenshot could not be captured.`)
        }
      } catch { warn(`${mode}: browser context did not complete.`) }
      finally { await context?.close().catch(() => {}) }
    }
  } finally { clearTimeout(deadline); await browser.close().catch(() => {}) }
  if (!desktop && !mobile) throw new Error('No inspectable page was returned')
  if (sensitiveScreenshots) {
    screenshots.desktop = null
    screenshots.mobile = null
    warn('Both screenshots were omitted because recognized credentials or incompletely inspected content could appear in pixels.')
  }
  const assessedDesktop = unavailableContent.desktop ? null : desktop
  const assessedMobile = unavailableContent.mobile ? null : mobile
  const findings = buildFindings(assessedDesktop, assessedMobile)
  const strengths: string[] = []
  if (assessedDesktop?.title.trim()) strengths.push('The rendered document has a non-empty page title.')
  if (assessedDesktop?.language.trim()) strengths.push('The document declares its language.')
  if (assessedMobile && assessedMobile.viewport.documentWidth <= assessedMobile.viewport.width + 2) strengths.push('No horizontal document overflow was measured in the captured mobile viewport.')
  const incomplete = warnings.length > 0 || !desktop || !mobile || !screenshots.desktop || !screenshots.mobile
  warnings.push('Passive rendered-page sample only: no clicks, sign-in, form submissions, source audit, security probing, or performance certification. Dynamic and consent-gated states may differ.', 'Screenshots mask form fields and recognized sensitive text; text and URL evidence are redacted. Public pages can still display personal information.')
  return scanSchema.parse({
    url: redactUrl(target), finalUrl, scannedAt: new Date().toISOString(), status: incomplete ? 'partially_completed' : 'completed',
    title: desktop?.title ?? mobile?.title ?? '', description: desktop?.description ?? mobile?.description ?? '',
    screenshots, findings, strengths, warnings, metrics,
    evidenceSummary: redactSecrets(JSON.stringify({ desktop, mobile, unavailableContent, observation: { transferredBytes: responseBytes, ...metrics } })).slice(0, 16_000),
  })
}
