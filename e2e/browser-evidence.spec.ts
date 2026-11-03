import { test, expect } from '@playwright/test'
import { BrowserEvidenceCollector } from '../worker/browser-evidence'
import type { ScanResult } from '../lib/types/report'

// Every URL is fulfilled or failed in-memory; no public or private target is contacted.
test('captures real runtime, console, and failed-resource browser events with redacted evidence', async ({ page }, testInfo) => {
  const viewport = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop'
  const collector = new BrowserEvidenceCollector(viewport)
  const metrics: ScanResult['metrics'] = { navigationMs: null, requestCount: 0, failedRequests: 0, consoleErrors: 0 }
  collector.attach(page, metrics)
  await page.route('**/*', async (route) => {
    if (route.request().url().includes('/widget.js')) {
      await route.abort('connectionrefused')
      return
    }
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><title>Browser evidence fixture</title><body><h1>Controlled browser evidence</h1><script src="https://cdn.example.org/widget.js?token=resource-secret"></script><script>
      console.error('Controlled console diagnostic password="console-secret" person@example.org');
      setTimeout(() => { throw new Error('Controlled initialization exception token=runtime-secret') }, 0);
    </script></body></html>` })
  })
  const exception = page.waitForEvent('pageerror', (error) => error.message.includes('Controlled initialization exception'))
  const failure = page.waitForEvent('requestfailed', (request) => request.url().includes('/widget.js'))
  await page.goto('https://browser-evidence.example/?token=document-secret')
  await Promise.all([exception, failure])
  const findings = collector.findings(true)
  expect(findings.map(({ id }) => id)).toEqual([`browser-page-error-${viewport}`, `browser-console-error-${viewport}`, `browser-failed-request-${viewport}`])
  expect(findings[0].evidence[0]).toContain('Controlled initialization exception')
  expect(findings[0].description).toContain('not proof that a user flow is broken')
  const resource = findings.find(({ id }) => id.includes('failed-request'))!
  expect(resource.verification).toBe('heuristic')
  expect(resource.evidence[0]).toContain('https://cdn.example.org/widget.js')
  expect(resource.evidence[0]).toContain('ERR_CONNECTION_REFUSED')
  expect(resource.recommendation).toContain('normal browser')
  expect(metrics.failedRequests).toBe(1)
  expect(metrics.consoleErrors).toBeGreaterThanOrEqual(2)
  expect(JSON.stringify({ findings, summary: collector.summary(true) })).not.toMatch(/console-secret|runtime-secret|resource-secret|document-secret|person@example.org/)
  expect(collector.findings(false)).toEqual([])
})

test('does not turn scanner-aborted requests and their actual console noise into website bugs', async ({ page }) => {
  const collector = new BrowserEvidenceCollector('desktop')
  const metrics: ScanResult['metrics'] = { navigationMs: null, requestCount: 0, failedRequests: 0, consoleErrors: 0 }
  collector.attach(page, metrics)
  await page.route('**/*', async (route) => {
    if (route.request().method() === 'POST') {
      collector.blockRequest(route.request(), 'read-only-policy')
      await route.abort()
      return
    }
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><title>Read-only policy fixture</title><body><h1>Read-only fixture</h1><script>
      fetch('https://browser-evidence.example/submit?token=blocked-secret', { method: 'POST' })
        .catch(error => console.error('Failed to fetch:', error.message));
    </script></body></html>` })
  })
  const failure = page.waitForEvent('requestfailed', (request) => request.method() === 'POST')
  const noise = page.waitForEvent('console', (message) => message.type() === 'error' && message.text().startsWith('Failed to fetch:'))
  await page.goto('https://browser-evidence.example/')
  await Promise.all([failure, noise])
  expect(metrics.failedRequests).toBe(1)
  expect(metrics.consoleErrors).toBeGreaterThan(0)
  expect(collector.findings(true)).toEqual([])
  const summary = collector.summary(true)
  expect(summary.scannerBlocks).toEqual({ 'read-only-policy': 1 })
  expect(summary.events.some(({ disposition }) => disposition === 'scanner-policy')).toBe(true)
  expect(summary.events.some(({ disposition }) => disposition === 'scanner-linked-noise')).toBe(true)
  expect(JSON.stringify(summary)).not.toContain('blocked-secret')
})
