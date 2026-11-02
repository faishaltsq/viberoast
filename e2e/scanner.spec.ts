import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { extractPage, buildFindings } from '../worker/extract'
import { captureScreenshot, SensitiveScreenshotError } from '../worker/scan'

// Controlled in-memory documents only; this never enables arbitrary local target scanning.
test('extracts actual DOM evidence, measured overflow and a bounded JPEG', async ({ page }) => {
  await page.setContent('<!doctype html><html lang="en"><head><title>Controlled fixture</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main style="width:1600px"><h1>Fixture product</h1><h3>Details</h3><img><label for="email">Email</label><input id="email"><input id="unlabeled"><button aria-label="Save"></button><a href="https://example.com/?token=fixture-value">Documentation</a></main></body></html>')
  const evidence = await extractPage(page)
  const findings = buildFindings(evidence, evidence)
  expect(evidence.title).toBe('Controlled fixture')
  expect(evidence.headings.map(h => h.level)).toEqual([1, 3])
  expect(evidence.inputs.map(i => i.labeled)).toEqual([true, false])
  expect(evidence.links[0].href).toBe('https://example.com/')
  expect(findings.find(f => f.id === 'images-alt-missing')?.evidence[0]).toContain('1 of 1')
  expect(findings.find(f => f.id === 'form-labels-missing')?.evidence[0]).toContain('1 of 2')
  expect(evidence.viewport.documentWidth).toBeGreaterThan(evidence.viewport.width)
  expect(findings.find(f => f.id === 'mobile-horizontal-overflow')?.verification).toBe('verified')
  const jpeg = await captureScreenshot(page)
  expect(jpeg.length).toBeLessThan(600_000)
  const metadata = await sharp(Buffer.from(jpeg.split(',')[1], 'base64')).metadata()
  expect(metadata.format).toBe('jpeg')
  expect(metadata.width).toBeLessThanOrEqual(1280)
  expect(metadata.height).toBeLessThanOrEqual(1280)
})

test('omits screenshot pixels for every recognized assignment credential format', async ({ page }) => {
  for (const name of ['session_id', 'passwd', 'cookie', 'authorization', 'access_token', 'refresh_token', 'client_secret', 'private_key', 'api_key']) {
    await page.setContent(`<!doctype html><html lang="en"><title>Privacy fixture</title><body><p>${name}=controlled-secret-value</p></body></html>`)
    const evidence = await extractPage(page)
    expect(evidence.sensitive, name).toBe(true)
    expect(evidence.text, name).not.toContain('controlled-secret-value')
    await expect(captureScreenshot(page), name).rejects.toBeInstanceOf(SensitiveScreenshotError)
  }
})
