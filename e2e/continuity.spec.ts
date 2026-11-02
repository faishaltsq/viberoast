import { test, expect } from '@playwright/test'
import { makeReport } from '../tests/fixtures/report'

test('keeps the selected subset across navigation and offers a real rescan in the new language', async ({ page }) => {
  let calls = 0
  await page.route('**/api/roast', async route => {
    calls++
    const report = makeReport()
    if (calls > 1) {
      const request = route.request().postDataJSON()
      expect(request.language).toBe('id')
      expect(request.url).toBe('https://fixture.example.com/?view=public')
      report.id = '66666666-6666-4666-8666-666666666666'
      report.language = 'id'
      report.scan.findings = report.scan.findings.slice(0, 1)
      report.commentary!.findings = report.commentary!.findings.slice(0, 1)
    }
    await route.fulfill({ json: report })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Website URL' }).fill('https://fixture.example.com/?view=public')
  await page.getByRole('button', { name: 'Roast My App', exact: true }).first().click()
  await page.getByRole('button', { name: 'Fix my shame' }).click()
  await expect(page.getByRole('button', { name: /Selected Issues/ })).toBeInViewport()
  await expect(page.getByRole('button', { name: /Selected Issues/ })).toHaveCSS('visibility', 'visible')
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select: Image has no alt attribute', exact: true }).check()
  await page.getByRole('button', { name: /Back to your roast/ }).click()
  await page.getByRole('button', { name: 'Fix my shame' }).click()
  await expect(page.getByRole('checkbox', { name: 'Select: Image has no alt attribute', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Select: Missing meta description', exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Generated agent prompt')).not.toContainText('Missing meta description')
  await page.getByRole('button', { name: /Back to your roast/ }).click()
  await page.getByRole('button', { name: 'Switch to Bahasa Indonesia' }).click()
  await expect(page.getByText('Bahasa komentar: English.', { exact: false })).toBeVisible()
  const link = page.getByRole('link', { name: 'Bagikan teks di X' })
  expect(decodeURIComponent((await link.getAttribute('href'))!)).toContain('Komentar komedi')
  await page.getByRole('button', { name: 'Pindai ulang URL ini' }).click()
  await expect(page.getByRole('img', { name: 'Bro Code: mengangguk setuju' })).toBeVisible()
  expect(calls).toBe(2)
})

