import { test, expect, type Page } from '@playwright/test'
import { makeReport } from '../tests/fixtures/report'

async function openFixes(page: Page, empty = false) {
  const report = makeReport()
  report.expiresAt = new Date(Date.now() + 900_000).toISOString()
  if (empty) {
    report.scan.findings = []
    report.commentary = null
    report.aiStatus = 'unavailable'
    report.aiMessage = 'Controlled scanner-only fixture.'
  }
  await page.route('**/api/roast', route => route.fulfill({ json: report }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Website URL' }).fill(report.scan.url)
  await page.getByRole('button', { name: 'Roast My App', exact: true }).first().click()
  await expect(page.getByTestId('roast-results')).toBeVisible()
  await page.getByRole('button', { name: 'Fix my shame', exact: true }).click()
  await expect(page.getByTestId('fixes-view')).toBeVisible()
}

test('keeps custom selections through every agent preset, fix scope and report navigation', async ({ page }) => {
  await openFixes(page)
  const image = page.getByRole('checkbox', { name: 'Select: Image has no alt attribute', exact: true })
  const meta = page.getByRole('checkbox', { name: 'Select: Missing meta description', exact: true })
  const prompt = page.getByLabel('Generated agent prompt')
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click()
  await image.check()
  await expect(page.getByRole('region', { name: 'Medium severity', exact: true })).toContainText('1/1 in prompt')
  await expect(page.getByRole('region', { name: 'Low severity', exact: true })).toContainText('0/1 in prompt')
  for (const preset of ['Claude Code', 'Cursor', 'Windsurf', 'Generic Agent', 'Codex']) {
    await page.getByLabel('Agent preset').selectOption(preset)
    await expect(image).toBeChecked()
    await expect(meta).not.toBeChecked()
    await expect(prompt).toContainText(preset)
    await expect(prompt).not.toContainText('Missing meta description')
  }
  for (const scope of ['Quick Fix', 'Full Rehab']) {
    await page.getByRole('button', { name: new RegExp(scope) }).click()
    await expect(prompt).toContainText('Missing meta description')
    await page.getByRole('button', { name: /Selected Issues/ }).click()
    await expect(image).toBeChecked()
    await expect(meta).not.toBeChecked()
    await expect(prompt).not.toContainText('Missing meta description')
  }
  await page.getByRole('region', { name: 'Medium severity', exact: true }).getByText('Evidence & acceptance', { exact: true }).click()
  await expect(page.getByText('img#product has no alt attribute.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acceptance criteria', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '← Back to your roast', exact: true }).click()
  await page.getByRole('button', { name: 'Fix my shame', exact: true }).click()
  await expect(image).toBeChecked()
  await expect(meta).not.toBeChecked()
  await expect(prompt).not.toContainText('Missing meta description')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('updates the preview immediately and removes stale generated and copied feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.lastCopiedPrompt = text } } })
  })
  await openFixes(page)
  const prompt = page.getByLabel('Generated agent prompt')
  await page.getByRole('button', { name: 'Regenerate prompt', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Prompt regenerated' })).toBeVisible()
  await page.getByLabel('Agent preset').selectOption('Claude Code')
  await expect(page.getByRole('status').filter({ hasText: 'Prompt regenerated' })).toHaveCount(0)
  await expect(prompt).toContainText('Claude Code')
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.dataset.lastCopiedPrompt)).toBe(await prompt.textContent())
  await page.getByLabel('Prompt detail').selectOption('short')
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Prompt copied' })).toHaveCount(0)
  await expect(prompt).not.toContainText('"description":')
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Prompt copied' })).toBeVisible()
  await page.getByLabel('Prompt language').selectOption('id')
  await expect(prompt).toContainText('Kriteria penerimaan')
  await expect(page.getByRole('status').filter({ hasText: 'Prompt copied' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Prompt copied' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select: Missing meta description', exact: true }).uncheck()
  await expect(page.getByRole('status').filter({ hasText: 'Prompt copied' })).toHaveCount(0)
  await expect(prompt).not.toContainText('Missing meta description')
})

test('does not approve a new prompt when an older clipboard request finishes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {
      document.documentElement.dataset.copyState = 'pending'
      const { promise, resolve } = Promise.withResolvers<void>()
      window.addEventListener('finish-fixture-copy', () => resolve(), { once: true })
      await promise
      document.documentElement.dataset.copyState = 'finished'
    } } })
  })
  await openFixes(page)
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copying…', exact: true })).toBeDisabled()
  await page.getByLabel('Agent preset').selectOption('Cursor')
  await page.getByRole('checkbox', { name: 'Select: Missing meta description', exact: true }).uncheck()
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('finish-fixture-copy'))
    await Promise.resolve()
    await Promise.resolve()
  })
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.copyState)).toBe('finished')
  await expect(page.getByLabel('Generated agent prompt')).toContainText('Cursor')
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Prompt copied' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copying…', exact: true })).toBeDisabled()
  await page.getByLabel('Agent preset').selectOption('Codex')
  await page.getByLabel('Agent preset').selectOption('Cursor')
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('finish-fixture-copy'))
    await Promise.resolve()
    await Promise.resolve()
  })
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.copyState)).toBe('finished')
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0)
})

test('offers real manual selection when clipboard access is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied by controlled fixture', 'NotAllowedError') } } })
  })
  await openFixes(page)
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Clipboard access was unavailable' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Select prompt text', exact: true }).click()
  await expect(page.getByLabel('Generated agent prompt')).toBeFocused()
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(await page.getByLabel('Generated agent prompt').textContent())
})

test('empty selection disables exports without treating deselected findings as resolved', async ({ page }) => {
  await openFixes(page)
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No issues selected', exact: true })).toBeVisible()
  await expect(page.getByText('Choose a finding below or select all to build your prompt.', { exact: false })).toContainText('does not resolve it')
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Regenerate prompt', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Download Markdown', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Generated agent prompt')).toContainText('Select at least one issue')
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No issues selected', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download Markdown', exact: true })).toBeEnabled()
})

test('downloads only current selected evidence and reports download-start failures honestly', async ({ page }) => {
  await openFixes(page)
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select: Image has no alt attribute', exact: true }).check()
  await page.getByLabel('Agent preset').selectOption('Windsurf')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Markdown', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('sourcesanity-windsurf.md')
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const markdown = Buffer.concat(chunks).toString('utf8')
  expect(markdown).toBe(await page.getByLabel('Generated agent prompt').textContent())
  expect(markdown).toContain('img#product')
  expect(markdown).not.toContain('Missing meta description')
  await expect(page.getByRole('status').filter({ hasText: 'Markdown download started' })).toBeVisible()
  await page.getByLabel('Prompt detail').selectOption('short')
  await expect(page.getByRole('status').filter({ hasText: 'Markdown download started' })).toHaveCount(0)
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Controlled download failure') } })
  await page.getByRole('button', { name: 'Download Markdown', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Markdown download could not start' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Markdown download started' })).toHaveCount(0)
})

test('keeps a scanner-only report with no findings distinct from an empty selection', async ({ page }) => {
  await openFixes(page, true)
  await expect(page.getByText('There are no findings to turn into fixes.', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No issues selected', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download Markdown', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
})
