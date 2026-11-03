import { test, expect, type Page } from '@playwright/test'
import type { WebsiteReport } from '../lib/types/report'
import { makeReport } from '../tests/fixtures/report'

function reportFixture() {
  const report = makeReport()
  report.expiresAt = new Date(Date.now() + 900_000).toISOString()
  return report
}

async function showReport(page: Page, report: WebsiteReport) {
  await page.route('**/api/roast', route => route.fulfill({ json: report }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Website URL' }).fill(report.scan.url)
  await page.getByRole('button', { name: 'Roast My App', exact: true }).first().click()
  await expect(page.getByTestId('roast-results')).toBeVisible()
}

test('findings distinguish verification without color and expose confidence before expansion', async ({ page }) => {
  const report = reportFixture()
  report.commentary = null
  report.aiStatus = 'unavailable'
  report.scan.findings[1].verification = 'heuristic'
  report.scan.findings[1].confidence = 'medium'
  report.scan.findings.push({ ...report.scan.findings[0], id: 'timing-unresolved', title: 'Navigation timing unresolved', category: 'Performance', source: 'timing', confidence: 'low', verification: 'inconclusive' })
  await showReport(page, report)
  const verified = page.getByRole('button', { name: /Missing meta description/ })
  const heuristic = page.getByRole('button', { name: /Image has no alt attribute/ })
  const inconclusive = page.getByRole('button', { name: /Navigation timing unresolved/ })
  await expect(verified).toContainText('SEO')
  await expect(verified).toContainText('Confidence: high')
  await expect(verified).toContainText('LOW')
  await expect(verified.getByText('VERIFIED', { exact: true })).toHaveCSS('border-style', 'solid')
  await expect(heuristic).toContainText('Confidence: medium')
  await expect(heuristic.getByText('HEURISTIC · REVIEW', { exact: true })).toHaveCSS('border-style', 'dashed')
  await expect(inconclusive).toContainText('Confidence: low')
  await expect(inconclusive.getByText('INCONCLUSIVE', { exact: true })).toHaveCSS('border-style', 'double')
  await heuristic.click()
  await expect(page.getByText('A signal, not a confirmed defect.', { exact: false })).toBeVisible()
  await expect(page.getByText('img#product has no alt attribute.', { exact: true })).toBeVisible()
  await inconclusive.click()
  await expect(page.getByText('The check could not establish a result.', { exact: false })).toBeVisible()
  await expect(page.getByText('Roast heat. Not a quality grade.', { exact: true })).toBeVisible()
})

test('screenshots retain an honest frame while decoding, failing, and switching viewports', async ({ page, context }) => {
  const source = await context.newPage()
  await source.setContent('<!doctype html><html lang="en"><title>Screenshot fixture</title><body><h1>Deterministic captured page</h1></body></html>')
  const jpeg = (await source.screenshot({ type: 'jpeg' })).toString('base64')
  await source.close()
  await page.addInitScript(() => {
    const nativeDecode = HTMLImageElement.prototype.decode
    const { promise: pending, resolve: release } = Promise.withResolvers<void>()
    window.addEventListener('release-screenshot-decode', () => release(), { once: true })
    HTMLImageElement.prototype.decode = function () {
      const decoded = nativeDecode.call(this)
      return this.src.startsWith('data:image/jpeg;') ? decoded.then(() => pending) : decoded
    }
  })
  const report = reportFixture()
  report.scan.screenshots = { desktop: `data:image/jpeg;base64,${jpeg}`, mobile: 'data:image/jpeg;base64,AAAA' }
  await showReport(page, report)
  await expect(page.getByRole('status').filter({ hasText: 'Loading desktop screenshot…' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Actual desktop screenshot of the scanned page' })).toBeHidden()
  await page.evaluate(() => window.dispatchEvent(new Event('release-screenshot-decode')))
  await expect(page.getByRole('img', { name: 'Actual desktop screenshot of the scanned page' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Loading desktop screenshot…' })).toHaveCount(0)
  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 360, height: 780 })
  const desktopScreenshot = page.getByRole('img', { name: 'Actual desktop screenshot of the scanned page' })
  await expect.poll(() => desktopScreenshot.evaluate(image => image.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0)
  await expect.poll(() => desktopScreenshot.evaluate(image => image.getBoundingClientRect().right)).toBeLessThanOrEqual(360)
  if (originalViewport) await page.setViewportSize(originalViewport)
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  await expect(page.getByText('The captured image could not be loaded.', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Actual mobile screenshot of the scanned page' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Desktop', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Actual desktop screenshot of the scanned page' })).toBeVisible()
})

test('Hall trims search, reports counts, and recovers from empty filters', async ({ page }) => {
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Toggle menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation').getByRole('link', { name: 'Hall of Shame', exact: true }).click()
  const search = page.getByRole('textbox', { name: 'Search projects' })
  await search.fill('  SaaSStarter  ')
  await expect(page.getByRole('heading', { name: 'SaaSStarter', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '1 example shown' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(page.getByRole('status').filter({ hasText: '2 examples shown' })).toBeVisible()
  await page.getByLabel('Sort examples').selectOption('name')
  await page.getByRole('button', { name: 'Hall of Vibes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hall of Vibes', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await search.fill('no-such-example')
  await expect(page.getByRole('heading', { name: 'No examples match.', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '0 examples shown' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(page.getByLabel('Sort examples')).toHaveValue('heat')
  await expect(page.getByRole('button', { name: 'Hall of Shame', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status').filter({ hasText: '2 examples shown' })).toBeVisible()
})

for (const empty of [false, true]) {
  test(`scanner-only ${empty ? 'empty' : 'findings'} report uses a helpful reaction without an invented roast`, async ({ page }) => {
    const report = reportFixture()
    report.commentary = null
    report.aiStatus = 'unavailable'
    report.aiMessage = 'Controlled provider outage; scanner evidence is available.'
    if (empty) report.scan.findings = []
    await showReport(page, report)
    await expect(page.getByRole('img', { name: 'Bro Code: ready to help fix it', exact: true })).toBeVisible()
    await expect(page.getByText('Scanner-only report. AI roast unavailable.', { exact: true })).toBeVisible()
    await expect(page.getByText('The Context Evader', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Bro Code: approving nod', exact: true })).toHaveCount(0)
    if (empty) await expect(page.getByText('This is not a guarantee of quality', { exact: false })).toBeVisible()
  })
}

test('an empty completed report offers restrained approval, not an overall quality guarantee', async ({ page }) => {
  const report = reportFixture()
  report.scan.findings = []
  report.commentary!.findings = []
  report.commentary!.verdict.headline = 'A quiet scan. Keep the good parts.'
  report.commentary!.verdict.summary = 'No issues were observed in the checks that ran. Passive evidence does not prove overall quality.'
  report.commentary!.overallSummary = ''
  await showReport(page, report)
  await expect(page.getByRole('img', { name: 'Bro Code: impressed by the work', exact: true }).first()).toBeVisible()
  await expect(page.getByText('A quiet scan. Keep the good parts.', { exact: true })).toBeVisible()
  await expect(page.getByText('Passive evidence does not prove overall quality.', { exact: false })).toBeVisible()
})

test('expiry offers a fresh scan without disabling local evidence and downloads', async ({ page }) => {
  const now = new Date('2026-11-02T12:00:00.000Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(new Date(now.getTime() + 1000))
  const report = reportFixture()
  report.expiresAt = new Date(now.getTime() + 2000).toISOString()
  await showReport(page, report)
  const refresh = page.getByRole('button', { name: 'Scan a fresh report', exact: true })
  await expect(refresh).toHaveCount(0)
  const fresh = structuredClone(report)
  fresh.id = '66666666-6666-4666-8666-666666666666'
  fresh.scan.scannedAt = new Date(now.getTime() + 2000).toISOString()
  fresh.expiresAt = new Date(now.getTime() + 902_000).toISOString()
  await page.route('**/api/roast', route => route.fulfill({ json: fresh }))
  await page.clock.fastForward(1000)
  await expect(page.getByRole('button', { name: 'Scan a fresh report', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Download square PNG', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Bro gave the product/ })).toBeEnabled()
  await page.getByRole('button', { name: 'Scan a fresh report', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Scan a fresh report', exact: true })).toHaveCount(0)
  await expect(page.locator('time')).toHaveAttribute('datetime', fresh.scan.scannedAt)
})

test('PNG failure is actionable and never claims publication or a successful download', async ({ page }) => {
  await page.route('**/bro-code.png', route => route.abort())
  await showReport(page, reportFixture())
  await expect(page.getByText('URLs may contain private query values', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Download square PNG', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not create the PNG.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download square PNG', exact: true })).toBeEnabled()
  await expect(page.getByText('PNG downloaded.', { exact: false })).toHaveCount(0)
})

test('partial empty evidence stays concerned and preserves limitations', async ({ page }) => {
  const report = reportFixture()
  report.scan.status = 'partially_completed'
  report.scan.findings = []
  report.scan.warnings = ['Mobile capture did not complete in this controlled fixture.']
  report.commentary!.findings = []
  report.commentary!.overallSummary = ''
  await showReport(page, report)
  await expect(page.getByText('PARTIAL SCAN', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Scan limitations', exact: true })).toBeVisible()
  await expect(page.getByText(report.scan.warnings[0], { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Bro Code: ready to help fix it', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('img', { name: 'Bro Code: impressed by the work', exact: true })).toHaveCount(0)
})

test('an idle provider reaction does not understate verified high severity', async ({ page }) => {
  const report = reportFixture()
  report.scan.findings[0].severity = 'high'
  report.commentary!.verdict.reaction = 'idle'
  await showReport(page, report)
  await expect(page.getByRole('img', { name: 'Bro Code: surprised by the findings', exact: true }).first()).toBeVisible()
})

test('hides the screenshot scrollbar while wheel and keyboard scrolling still work', async ({ page, context }) => {
  const source = await context.newPage()
  await source.setViewportSize({ width: 1280, height: 800 })
  await source.setContent('<!doctype html><html lang="en"><title>Tall screenshot fixture</title><body style="margin:0"><main style="height:3200px;background:linear-gradient(#fffdf7,#1b1a17)"><h1 style="margin:0;padding:24px">Tall captured page</h1></main></body></html>')
  const jpeg = (await source.screenshot({ type: 'jpeg', fullPage: true })).toString('base64')
  await source.close()
  const report = reportFixture()
  report.scan.screenshots = { desktop: `data:image/jpeg;base64,${jpeg}`, mobile: `data:image/jpeg;base64,${jpeg}` }
  await showReport(page, report)
  const preview = page.getByRole('region', { name: 'Desktop screenshot preview' })
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await preview.evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe('none')
  expect(await preview.evaluate(element => (element as HTMLElement).offsetWidth - element.clientWidth)).toBe(0)
  await preview.focus()
  await page.keyboard.press('PageDown')
  await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const keyboardPosition = await preview.evaluate(element => element.scrollTop)
  await preview.hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(keyboardPosition)
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  const mobile = page.getByRole('region', { name: 'Mobile screenshot preview' })
  await expect.poll(() => mobile.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await mobile.evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe('none')
})

test('renders an AI visual observation as a heuristic finding with screenshot provenance', async ({ page }) => {
  const report = reportFixture()
  report.scan.findings.push({
    id: 'visual-1', category: 'UI', title: 'Crowded hero actions',
    description: 'AI visual heuristic: The two hero actions appear crowded.',
    severity: 'low', confidence: 'medium',
    evidence: ['AI visual heuristic from supplied desktop screenshot: The labels visibly overlap.'],
    location: 'desktop screenshot: Hero action row', recommendation: 'Increase the gap between the hero actions.',
    source: 'browser', verification: 'heuristic',
  })
  report.commentary!.findings.push({
    id: 'visual-1', evidenceIds: ['visual-1'], roast: 'Give those buttons some elbow room.',
    explanation: 'AI visual heuristic: The two hero actions appear crowded.',
    recommendation: 'Increase the gap between the hero actions.', reaction: 'helpful',
  })
  await showReport(page, report)
  const card = page.getByRole('button', { name: /Give those buttons some elbow room/ })
  await expect(card).toContainText('UI')
  await expect(card.getByText('HEURISTIC · REVIEW', { exact: true })).toBeVisible()
  await card.click()
  await expect(page.getByText(/desktop screenshot: Hero action row/)).toBeVisible()
  await expect(page.getByText('AI visual heuristic from supplied desktop screenshot: The labels visibly overlap.', { exact: true })).toBeVisible()
  await expect(page.getByText('Source: browser · ID: visual-1', { exact: true })).toBeVisible()
})
