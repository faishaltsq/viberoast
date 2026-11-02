import type { Language, RoastReport } from '@/lib/types/report'
import { calculateScore } from '@/lib/roast/score'

function image(source: string, label: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>()
  const img = new Image()
  img.onload = () => img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error(`${label} has no image dimensions.`))
  img.onerror = () => reject(new Error(`${label} could not be loaded.`))
  img.src = source
  return promise
}

function lines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  // Reports already bound text length; also bound work here for direct callers.
  let remaining = Array.from(text.slice(0, 4096).replace(/\s+/g, ' ').trim())
  const fit = (suffix = '') => {
    let low = 0, high = remaining.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (ctx.measureText(remaining.slice(0, middle).join('') + suffix).width <= width) low = middle
      else high = middle - 1
    }
    return low
  }
  for (let row = 0; row < maxLines && remaining.length; row++) {
    let count = fit()
    const truncated = count < remaining.length
    const last = row === maxLines - 1
    if (last && truncated) count = fit('…')
    else if (truncated) {
      const space = remaining.lastIndexOf(' ', count)
      if (space > 0) count = space
    }
    if (!count) return
    ctx.fillText(remaining.slice(0, count).join('') + (last && truncated ? '…' : ''), x, y + row * lineHeight)
    remaining = remaining.slice(count)
    while (remaining[0] === ' ') remaining.shift()
  }
}

function contain(ctx: CanvasRenderingContext2D, asset: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / asset.naturalWidth, height / asset.naturalHeight)
  const drawnWidth = asset.naturalWidth * scale, drawnHeight = asset.naturalHeight * scale
  ctx.drawImage(asset, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight)
}

export async function downloadShareCard(report: RoastReport, format: 'square' | 'landscape', language: Language) {
  const square = format === 'square'
  const canvas = document.createElement('canvas')
  canvas.width = square ? 1080 : 1200
  canvas.height = square ? 1080 : 630
  const t = (en: string, id: string) => language === 'id' ? id : en
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('PNG export requires an available 2D canvas.')
    const mascot = await image('/bro-code.png', 'The canonical Bro Code mascot')
    let screenshot: HTMLImageElement | null = null
    let captureFailed = false
    for (const source of [report.scan.screenshots.desktop, report.scan.screenshots.mobile]) {
      if (!source) continue
      try { screenshot = await image(source, 'The captured screenshot'); break }
      catch { captureFailed = true }
    }

    const width = canvas.width
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#f5f1e8'; ctx.fillRect(0, 0, width, canvas.height)
    ctx.strokeStyle = '#20201e'; ctx.lineWidth = 4; ctx.strokeRect(18, 18, width - 36, canvas.height - 36)
    ctx.fillStyle = '#20201e'; ctx.font = '900 42px Arial'
    ctx.fillText('VibeRoast', 48, 44)
    ctx.font = '16px monospace'
    lines(ctx, t('COMEDY CARD · NOT AN AUDIT GRADE', 'KARTU KOMEDI · BUKAN NILAI AUDIT'), 48, 102, square ? 984 : 320, 21, 2)

    // The header's site identity never shares a row with the brand in square exports.
    const siteX = square ? 48 : 400, siteWidth = square ? 984 : 752
    ctx.font = `bold ${square ? 28 : 24}px Arial`
    lines(ctx, report.scan.title.trim() || t('Untitled page', 'Halaman tanpa judul'), siteX, square ? 190 : 46, siteWidth, square ? 32 : 29, 2)
    ctx.font = `${square ? 18 : 16}px monospace`
    lines(ctx, report.scan.finalUrl, siteX, square ? 266 : 112, siteWidth, square ? 22 : 20, 2)
    ctx.fillStyle = '#29533b'; ctx.font = 'bold 18px monospace'
    lines(ctx, `${t('Comedy heat', 'Panas komedi')}: ${calculateScore(report.scan.findings)}/100`, 48, square ? 146 : 168, square ? 984 : 682, 23, 1)

    const shotX = square ? 48 : 780, shotY = square ? 338 : 184
    const shotWidth = square ? 620 : 372, shotHeight = square ? 240 : 210
    ctx.fillStyle = '#e4ddd1'; ctx.fillRect(shotX, shotY, shotWidth, shotHeight)
    if (screenshot) contain(ctx, screenshot, shotX, shotY, shotWidth, shotHeight)
    else {
      ctx.fillStyle = '#20201e'; ctx.font = 'bold 20px Arial'
      lines(ctx, t('Screenshot unavailable', 'Screenshot tidak tersedia'), shotX + 24, shotY + 44, shotWidth - 48, 26, 2)
      ctx.font = '18px Arial'
      lines(ctx, captureFailed
        ? t('The captured image could not be loaded. No replacement was invented.', 'Gambar tangkapan gagal dimuat. Tidak ada gambar pengganti buatan.')
        : t('This scan did not return a screenshot. No replacement was invented.', 'Pemindaian ini tidak menghasilkan screenshot. Tidak ada gambar pengganti buatan.'),
      shotX + 24, shotY + 106, shotWidth - 48, 24, 4)
    }
    contain(ctx, mascot, square ? 700 : 780, square ? 338 : 410, square ? 332 : 372, square ? 240 : 136)

    const contentWidth = square ? 984 : 682
    ctx.fillStyle = '#b33528'; ctx.font = square ? '900 38px Arial' : '900 32px Arial'
    lines(ctx, report.commentary?.verdict.headline ?? t('Scanner-only report. AI roast unavailable.', 'Laporan pemindai saja. Roasting AI tidak tersedia.'),
      48, square ? 614 : 218, contentWidth, square ? 44 : 38, 3)
    ctx.fillStyle = '#20201e'; ctx.font = '15px monospace'
    ctx.fillText(t('FINDINGS FROM THIS SCAN', 'TEMUAN DARI PEMINDAIAN INI'), 48, square ? 766 : 352)
    const priority = { high: 3, medium: 2, low: 1 }
    const findings = [...new Map(report.scan.findings.map(finding => [finding.id, finding])).values()]
      .sort((a, b) => priority[b.severity] - priority[a.severity]).slice(0, 3)
    ctx.font = square ? '21px Arial' : '20px Arial'
    findings.forEach((finding, index) => {
      const commentary = report.commentary?.findings.find(entry => entry.evidenceIds.includes(finding.id))
      lines(ctx, `${index + 1}. ${commentary?.roast.trim() || finding.title}`, 48, (square ? 798 : 380) + index * (square ? 64 : 60), contentWidth, square ? 26 : 25, 2)
    })
    if (!findings.length) lines(ctx, t('No findings recorded within this scan’s scope. This is not a clean audit.', 'Tidak ada temuan dalam cakupan pemindaian ini. Ini bukan jaminan audit bersih.'), 48, square ? 798 : 380, contentWidth, 26, 3)

    const footerY = canvas.height - 60
    ctx.strokeStyle = '#20201e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(48, footerY - 16); ctx.lineTo(width - 48, footerY - 16); ctx.stroke()
    ctx.font = '15px monospace'
    lines(ctx, report.scan.status === 'partially_completed' ? t('Partial scan · limits apply', 'Scan parsial · ada batasan') : t('Scan scope and limits apply', 'Cakupan dan batasan berlaku'), 48, footerY, width - 450, 20, 1)
    ctx.textAlign = 'right'
    ctx.fillText('viberoast-app.vercel.app', width - 48, footerY)

    const { promise, resolve, reject } = Promise.withResolvers<Blob>()
    try { canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed: the canvas could not be encoded.')), 'image/png') }
    catch { reject(new Error('PNG export failed: the canvas could not be encoded.')) }
    const blob = await promise
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `viberoast-${format}.png`; anchor.click()
    } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
  } finally {
    // Release the backing pixels after encoding, including failed exports.
    canvas.width = 0; canvas.height = 0
  }
}

export function shareText(report: RoastReport, language: Language) {
  return `VibeRoast: ${report.commentary?.verdict.headline ?? (language === 'id' ? 'Laporan pemindai, tanpa roasting AI.' : 'Scanner-only report, no AI roast.')}\n${language === 'id' ? 'Komentar komedi, bukan sertifikasi audit.' : 'Comedy commentary, not an audit certification.'}`
}
