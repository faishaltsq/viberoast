import { test, expect } from '@playwright/test'
import { makeReport } from '../tests/fixtures/report'

test('validation preserves the URL and Enter submits once with the selected intensity', async ({ page }) => {
  let requests = 0
  let submitted: Record<string, string> = {}
  const pending = Promise.withResolvers<void>()
  await page.route('**/api/roast', async route => {
    requests++
    submitted = route.request().postDataJSON()
    await pending.promise
    await route.fulfill({ json: makeReport() })
  })
  await page.goto('/')
  const field = page.getByRole('textbox', { name: 'Website URL' })
  await field.focus()
  await expect(page.getByRole('img', { name: 'Bro Code: curiosity mode', exact: true })).toBeVisible()
  await field.fill('not a website')
  await field.press('Enter')
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveValue('not a website')
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  expect(requests).toBe(0)
  await field.fill('https://fixture.example.com:8080/')
  await field.press('Enter')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('standard HTTP or HTTPS port')
  expect(requests).toBe(0)
  await field.fill('fixture.example.com/path')
  await page.getByRole('button', { name: 'Career Ending', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Career Ending', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await field.press('Enter')
  await expect(page.getByRole('button', { name: 'Scanning & analyzing…', exact: true })).toBeDisabled()
  await expect(field).toHaveValue('fixture.example.com/path')
  expect(requests).toBe(1)
  expect(submitted).toMatchObject({ url: 'https://fixture.example.com/path', intensity: 'Career Ending' })
  pending.resolve()
  await expect(page.getByTestId('roast-results')).toBeVisible()
})

test('long requests remain honest, recover from rate limiting, and preserve input', async ({ page }) => {
  await page.clock.install()
  const pending = Promise.withResolvers<void>()
  await page.route('**/api/roast', async route => {
    await pending.promise
    await route.fulfill({ status: 429, json: { code: 'RATE_LIMITED', error: 'Controlled cooldown' } })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Website URL' }).fill('https://fixture.example.com/')
  await page.getByRole('button', { name: 'Roast My App', exact: true }).first().click()
  await page.clock.fastForward(30_001)
  await expect(page.getByRole('status')).toContainText('Still waiting for the service')
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  pending.resolve()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('wait ten minutes')
  await expect(page.getByRole('textbox', { name: 'Website URL' })).toHaveValue('https://fixture.example.com/')
  await expect(page.getByRole('button', { name: 'Roast My App', exact: true }).first()).toBeEnabled()
  await expect(page.getByTestId('roast-results')).toHaveCount(0)
})

test('an unreadable service response offers recovery rather than a connection accusation', async ({ page }) => {
  await page.route('**/api/roast', route => route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad gateway</h1>' }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Website URL' }).fill('https://fixture.example.com/')
  await page.getByRole('textbox', { name: 'Website URL' }).press('Enter')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('unreadable response')
  await expect(page.getByRole('textbox', { name: 'Website URL' })).toHaveValue('https://fixture.example.com/')
})

test('mobile navigation supports Escape and reports its active destination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Toggle menu' })
  await menu.click()
  await page.getByRole('navigation').getByRole('link', { name: 'Hall of Shame', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(menu).toBeFocused()
  await menu.click()
  await page.getByRole('navigation').getByRole('link', { name: 'Hall of Shame', exact: true }).click()
  await menu.click()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Hall of Shame', exact: true })).toHaveAttribute('aria-current', 'page')
})
