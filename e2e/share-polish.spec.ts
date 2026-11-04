import { test, expect, type Page } from '@playwright/test'
import { makeReport } from '../tests/fixtures/report'
import type { Language } from '../lib/types/report'

type CardTrace = {
  width: number
  height: number
  measures: number
  texts: { text: string; x: number; y: number; width: number; height: number }[]
  images: { source: string; x: number; y: number; width: number; height: number; naturalWidth: number; naturalHeight: number }[]
}

declare global {
  interface Window { shareCardTraces: CardTrace[] }
}

async function traceExports(page: Page) {
  await page.addInitScript(() => {
    window.shareCardTraces = []
    const traces = new WeakMap<HTMLCanvasElement, CardTrace>()
    const nativeMeasure = CanvasRenderingContext2D.prototype.measureText
    const nativeFill = CanvasRenderingContext2D.prototype.fillText
    const nativeDraw = CanvasRenderingContext2D.prototype.drawImage
    function trace(ctx: CanvasRenderingContext2D) {
      const canvas = ctx.canvas
      if (!((canvas.width === 1080 && canvas.height === 1080) || (canvas.width === 1200 && canvas.height === 630))) return
      let current = traces.get(canvas)
      if (!current) {
        current = { width: canvas.width, height: canvas.height, measures: 0, texts: [], images: [] }
        traces.set(canvas, current)
        window.shareCardTraces.push(current)
      }
      return current
    }
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      const current = trace(this)
      if (current) current.measures++
      return nativeMeasure.call(this, text)
    }
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      const current = trace(this)
      if (current) {
        const metrics = nativeMeasure.call(this, text)
        current.texts.push({ text, x: this.textAlign === 'right' ? x - metrics.width : x, y, width: metrics.width, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent })
      }
      if (maxWidth === undefined) nativeFill.call(this, text, x, y)
      else nativeFill.call(this, text, x, y, maxWidth)
    }
    CanvasRenderingContext2D.prototype.drawImage = function (image: CanvasImageSource, ...args: number[]) {
      const current = trace(this)
      if (current && image instanceof HTMLImageElement) {
        const [x, y, width, height] = args
        current.images.push({ source: image.src.startsWith('data:') ? 'scan-capture' : new URL(image.src).pathname, x, y, width, height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })
      }
      Reflect.apply(nativeDraw, this, [image, ...args])
    }
  })
}

async function installFixture(page: Page, language: Language, variant: 'short' | 'long' | 'missing' | 'broken') {
  const report = makeReport()
  report.language = language
  report.expiresAt = new Date(Date.now() + 900_000).toISOString()
  report.scan.title = language === 'id' ? 'Etalase pengujian' : 'Controlled storefront'
  if (report.commentary && language === 'id') {
    report.commentary.verdict.headline = 'Bro, foto produkmu kehilangan suaranya.'
    report.commentary.findings[0].roast = 'Cuplikan pencarianmu sedang bekerja tanpa deskripsi.'
    report.commentary.findings[1].roast = 'Bro memberi foto produk tanpa alternatif teks.'
  }
  if (variant === 'long') {
    report.scan.title = `${language === 'id' ? 'Etalase dengan judul panjang\n' : 'Storefront with a long title\n'}${'VeryLongUnbrokenStorefrontName'.repeat(12)}`.slice(0, 300)
    report.scan.finalUrl = `https://fixture.example.com/${'long-unbroken-path'.repeat(100)}?view=receipt`
    report.scan.findings.push({ ...report.scan.findings[0], id: 'navigation-failure', title: language === 'id' ? 'Permintaan navigasi gagal dalam fixture' : 'Navigation request failed in the fixture', severity: 'high', source: 'browser', evidence: ['Controlled fixture: a navigation request returned an error.'] })
    if (report.commentary) {
      report.commentary.verdict.headline = (language === 'id'
        ? 'Bro, halaman ini punya banyak cerita.\nAlternatif teks dan deskripsi masih belum ikut tampil. '
        : 'Bro, this storefront has a lot to say.\nThe text alternatives and search description still missed their invitation. ').repeat(3).slice(0, 240)
      report.commentary.findings[0].roast = (language === 'id' ? 'Deskripsi pencarian belum tersedia.\n' : 'The search description is still missing.\n').repeat(20).slice(0, 700)
      report.commentary.findings[1].roast = `${language === 'id' ? 'Alternatif teks: ' : 'Text alternative: '}${'UnbrokenFindingText'.repeat(35)}`.slice(0, 700)
    }
  }
  if (variant === 'short' || variant === 'long') {
    const target = await page.context().newPage()
    await target.setViewportSize({ width: 1280, height: 800 })
    await target.setContent('<!doctype html><html lang="en"><title>Controlled storefront</title><body style="margin:0;background:#f5f1e8;color:#20201e;font:28px Arial;padding:64px"><h1>Actual controlled capture</h1><p>This local fixture is photographed by Playwright, not invented by the exporter.</p><section style="border:4px solid #b33528;padding:36px;margin-top:60px">Deterministic storefront screenshot</section></body></html>')
    report.scan.screenshots.desktop = `data:image/jpeg;base64,${(await target.screenshot({ type: 'jpeg' })).toString('base64')}`
    await target.close()
  } else if (variant === 'broken') {
    report.scan.screenshots.desktop = 'data:image/jpeg;base64,YnJva2Vu'
  } else {
    report.scan.findings = []
    report.commentary = null
    report.aiStatus = 'unavailable'
    report.aiMessage = 'Controlled scanner-only fixture; no provider request is made.'
  }
  await page.route('**/api/roast', route => route.fulfill({ json: report }))
  await traceExports(page)
  await page.goto('/')
  if (language === 'id') await page.getByRole('button', { name: 'Switch to Bahasa Indonesia' }).click()
  await page.getByRole('textbox', { name: language === 'id' ? 'URL website' : 'Website URL', exact: true }).fill('https://fixture.example.com/')
  await page.getByRole('button', { name: language === 'id' ? 'Roast Aplikasiku' : 'Roast My App', exact: true }).first().click()
  await expect(page.getByTestId('roast-results')).toBeVisible()
  return report
}

for (const language of ['en', 'id'] as const) {
  for (const variant of ['short', 'long', 'missing', 'broken'] as const) {
    test(`${language} ${variant}: PNG exports keep brand, evidence, mascot and watermark in separate zones`, async ({ page }, testInfo) => {
      const report = await installFixture(page, language, variant)
      for (const format of ['square', 'landscape'] as const) {
        const label = language === 'id'
          ? format === 'square' ? 'Unduh PNG persegi' : 'Unduh PNG lanskap'
          : format === 'square' ? 'Download square PNG' : 'Download landscape PNG'
        const event = page.waitForEvent('download')
        await page.getByRole('button', { name: label, exact: true }).click()
        const download = await event
        expect(download.suggestedFilename()).toBe(`sourcesanity-${format}.png`)
        const path = testInfo.outputPath(`${language}-${variant}-${format}.png`)
        await download.saveAs(path)
        await testInfo.attach(`${language}-${variant}-${format}`, { path, contentType: 'image/png' })
        const stream = await download.createReadStream()
        const chunks: Buffer[] = []
        for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
        const png = Buffer.concat(chunks)
        expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        expect(png.subarray(12, 16).toString()).toBe('IHDR')
        expect(png.readUInt32BE(16)).toBe(format === 'square' ? 1080 : 1200)
        expect(png.readUInt32BE(20)).toBe(format === 'square' ? 1080 : 630)
        const trace = await page.evaluate(() => window.shareCardTraces.at(-1)!)
        await testInfo.attach(`${format}-layout`, { body: JSON.stringify(trace, null, 2), contentType: 'application/json' })
        expect(trace.measures).toBeLessThan(800)
        const watermark = trace.texts.find(item => item.text === 'SourceSanity')
        expect(watermark).toBeDefined()
        expect(trace.texts.map(item => item.text).join(' ')).not.toContain(report.id)
        expect(trace.texts[0].text).toBe('SourceSanity')
        for (const [index, item] of trace.texts.entries()) {
          expect(item.x).toBeGreaterThanOrEqual(47)
          expect(item.x + item.width).toBeLessThanOrEqual(trace.width - 47)
          expect(item.y).toBeGreaterThanOrEqual(40)
          expect(item.y + item.height).toBeLessThan(trace.height - 30)
          for (const other of trace.texts.slice(index + 1)) {
            const overlapsText = item.x < other.x + other.width && item.x + item.width > other.x && item.y < other.y + other.height && item.y + item.height > other.y
            expect(overlapsText, `Text overlaps: ${item.text} / ${other.text}`).toBe(false)
          }
        }
        const mascot = trace.images.find(item => item.source === '/bro-code.png')!
        expect(mascot).toBeDefined()
        expect(mascot.width / mascot.height).toBeCloseTo(mascot.naturalWidth / mascot.naturalHeight, 5)
        expect(mascot.x).toBeGreaterThanOrEqual(format === 'square' ? 700 : 780)
        expect(mascot.x + mascot.width).toBeLessThanOrEqual(trace.width - 47)
        expect(mascot.y + mascot.height).toBeLessThan(format === 'square' ? 614 : trace.height - 76)
        for (const item of trace.texts) {
          for (const asset of trace.images) {
            const overlapsImage = item.x < asset.x + asset.width && item.x + item.width > asset.x && item.y < asset.y + asset.height && item.y + item.height > asset.y
            expect(overlapsImage, `Image overlaps ${item.text}`).toBe(false)
          }
        }
        expect(trace.images.filter(item => item.source === 'scan-capture')).toHaveLength(variant === 'short' || variant === 'long' ? 1 : 0)
        if (variant === 'long') {
          expect(trace.texts.some(item => item.text.includes('…'))).toBe(true)
          expect(trace.texts.filter(item => /^\d\. /.test(item.text))).toHaveLength(3)
          expect(trace.texts.some(item => item.text.startsWith('1. ') && item.text.includes(language === 'id' ? 'Permintaan navigasi' : 'Navigation request'))).toBe(true)
        }
        if (variant === 'missing' || variant === 'broken') {
          expect(trace.texts.some(item => item.text.includes(language === 'id' ? 'Screenshot tidak tersedia' : 'Screenshot unavailable'))).toBe(true)
          expect(trace.texts.some(item => item.text.includes(language === 'id' ? 'buatan' : 'invented'))).toBe(true)
        }
        if (variant === 'missing') {
          expect(trace.texts.some(item => item.text.includes(language === 'id' ? 'Laporan pemindai saja.' : 'Scanner-only report.'))).toBe(true)
          expect(trace.texts.filter(item => /^\d\. /.test(item.text))).toHaveLength(0)
          expect(trace.texts.some(item => item.text.includes(language === 'id' ? 'Tidak ada temuan' : 'No findings recorded'))).toBe(true)
        }
      }
    })
  }
}

for (const failure of ['mascot', 'canvas', 'encoding'] as const) {
  test(`fails clearly without downloading when ${failure} is unavailable`, async ({ page }) => {
    if (failure === 'mascot') await page.route('**/bro-code.png', route => route.abort('failed'))
    await installFixture(page, 'en', 'missing')
    if (failure !== 'mascot') await page.evaluate(kind => {
      if (kind === 'canvas') {
        const nativeContext = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof nativeContext>) {
          if (this.width === 1080 && this.height === 1080) return null
          return Reflect.apply(nativeContext, this, args)
        } as typeof nativeContext
      } else {
        HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null) }
      }
    }, failure)
    const downloads: string[] = []
    page.on('download', file => downloads.push(file.suggestedFilename()))
    await page.getByRole('button', { name: 'Download square PNG', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: /Could not create the PNG/i })).toBeVisible()
    expect(downloads).toEqual([])
    await expect(page.getByRole('button', { name: 'Download square PNG', exact: true })).toBeEnabled()
  })
}
