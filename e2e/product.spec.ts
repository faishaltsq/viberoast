import { test, expect, type Page } from '@playwright/test'
import { makeReport } from '../tests/fixtures/report'

async function installReportFixture(page: Page, options: { partial?: boolean; scannerOnly?: boolean; empty?: boolean; screenshot?: boolean } = {}) {
  const report = makeReport()
  report.expiresAt = new Date(Date.now() + 900_000).toISOString()
  if (options.partial) { report.scan.status = 'partially_completed'; report.scan.warnings = ['Mobile capture unavailable in this controlled fixture.'] }
  if (options.scannerOnly) { report.commentary = null; report.aiStatus = 'unavailable'; report.aiMessage = 'Controlled provider outage; scanner evidence is available.' }
  if (options.empty) { report.scan.findings = []; if (report.commentary) report.commentary.findings = [] }
  if (options.screenshot) {
    const target = await page.context().newPage()
    await target.setContent('<!doctype html><html lang="en"><title>Controlled storefront</title><body style="background:#f5f1e8;color:#20201e;padding:60px;font-family:Arial"><h1>Controlled storefront</h1><p>This page is a local deterministic screenshot fixture.</p></body></html>')
    report.scan.screenshots.desktop = `data:image/jpeg;base64,${(await target.screenshot({ type: 'jpeg' })).toString('base64')}`
    await target.close()
  }
  await page.route('**/api/roast', route => route.fulfill({ json: report }))
}

async function submit(page: Page) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Website URL' }).fill('https://fixture.example.com/')
  await page.getByRole('button', { name: 'Roast My App', exact: true }).first().click()
  await expect(page.getByTestId('roast-results')).toBeVisible()
}

test('real request lifecycle, evidence, selected fixes, prompt copy and Markdown download', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await installReportFixture(page)
  await submit(page)
  await expect(page.getByText('https://fixture.example.com/', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: /Bro gave the product/ }).click()
  await expect(page.getByText('img#product has no alt attribute.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mobile', exact: true }).click()
  await expect(page.getByText('The scanner did not return a mobile screenshot.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Desktop', exact: true }).click()
  await page.getByRole('button', { name: 'Fix my shame' }).click()
  await expect(page.getByTestId('fixes-view')).toBeVisible()
  await page.getByRole('button', { name: /Selected Issues/ }).click()
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Select: Image has no alt attribute', exact: true }).check()
  const prompt = page.getByLabel('Generated agent prompt')
  await expect(prompt).toContainText('img#product')
  await expect(prompt).not.toContainText('Missing meta description')
  await page.getByLabel('Agent preset').selectOption('Claude Code')
  await page.getByRole('button', { name: 'Regenerate prompt' }).click()
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Prompt copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('img#product')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Markdown' }).click()
  const downloaded = await downloadEvent
  expect(downloaded.suggestedFilename()).toMatch(/\.md$/)
  const stream = await downloaded.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const markdown = Buffer.concat(chunks).toString('utf8')
  expect(markdown).toContain('img#product')
  expect(markdown).not.toContain('Missing meta description')
  await page.getByLabel('Prompt language').selectOption('id')
  await expect(prompt).toContainText('Kriteria')
  await page.getByLabel('Prompt detail').selectOption('short')
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await expect(prompt).toContainText('meta')
})

test('shows a genuine pending request and actionable service failure', async ({ page }) => {
  const { promise: pending, resolve: finish } = Promise.withResolvers<void>()
  await page.route('**/api/roast', async route => { await pending; await route.fulfill({ status: 503, json: { error: 'The isolated scanner is unavailable.', code: 'SCANNER_UNAVAILABLE' } }) })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Website URL' }).fill('https://fixture.example.com/')
  await page.getByRole('button', { name: 'Roast My App', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Scanning & analyzing…', exact: true })).toBeDisabled()
  finish()
  await expect(page.getByRole('alert').filter({ hasText: 'isolated scanner is unavailable' })).toBeVisible()
  await expect(page.getByTestId('roast-results')).toHaveCount(0)
})

test('keeps partial and scanner-only results honest and supports empty findings', async ({ page }) => {
  await installReportFixture(page, { partial: true, scannerOnly: true, empty: true })
  await submit(page)
  await expect(page.getByText('PARTIAL SCAN', { exact: false })).toBeVisible()
  await expect(page.getByText('Scanner-only report. AI roast unavailable.', { exact: true })).toBeVisible()
  await expect(page.getByText('No findings were recorded within this scan’s scope.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Fix my shame' }).click()
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeDisabled()
})

test('navigation, language, manifesto, hall filtering and responsive layout work', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Read his manifesto' }).click()
  await expect(page.getByRole('dialog')).toContainText('Evidence before opinions')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Switch to Bahasa Indonesia' }).click()
  await expect(page.getByRole('button', { name: 'Roast Aplikasiku', exact: true }).first()).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'id')
  await page.getByRole('button', { name: 'Ganti ke English' }).click()
  if (await page.getByRole('button', { name: 'Toggle menu' }).isVisible()) await page.getByRole('button', { name: 'Toggle menu' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Hall of Shame', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search projects' }).fill('nonexistent-fixture')
  await expect(page.getByText(/No examples match/)).toBeVisible()
  await page.getByRole('textbox', { name: 'Search projects' }).fill('')
  await page.getByLabel('Sort examples').selectOption('name')
  await page.getByRole('button', { name: 'Hall of Vibes', exact: true }).click()
  await expect(page.getByRole('heading', { name: /TaskToast/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('exports square and landscape PNG cards without publishing the private report', async ({ page }) => {
  await installReportFixture(page, { screenshot: true })
  await submit(page)
  await expect(page.getByRole('img', { name: 'Actual desktop screenshot of the scanned page' })).toBeVisible()
  for (const [label, width, height] of [['Download square PNG', 1080, 1080], ['Download landscape PNG', 1200, 630]] as const) {
    const event = page.waitForEvent('download')
    await page.getByRole('button', { name: label }).click()
    const file = await event
    expect(file.suggestedFilename()).toMatch(/\.png$/)
    const stream = await file.createReadStream()
    const parts: Buffer[] = []
    for await (const part of stream!) parts.push(Buffer.from(part))
    const png = Buffer.concat(parts)
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(width)
    expect(png.readUInt32BE(20)).toBe(height)
  }
  await expect(page.getByRole('button', { name: 'Public link: unavailable' })).toBeDisabled()
  const share = page.getByRole('link', { name: 'Share text on X' })
  expect(await share.getAttribute('href')).not.toContain('55555555')
})
