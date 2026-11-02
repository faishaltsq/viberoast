import type { Language, RoastReport } from '@/lib/types/report'
import { calculateScore } from '@/lib/roast/score'

function image(source: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>()
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Image could not be loaded'))
  img.src = source
  return promise
}

function lines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/)
  let line = '', row = 0
  const draw = (value: string) => {
    if (ctx.measureText(value).width > width) {
      while (value.length && ctx.measureText(`${value}…`).width > width) value = value.slice(0, -1)
      value += '…'
    }
    ctx.fillText(value, x, y + row * lineHeight)
  }
  for (let index = 0; index < words.length; index++) {
    if (row === maxLines - 1) { draw(`${line} ${words.slice(index).join(' ')}`.trim()); return }
    const next = line ? `${line} ${words[index]}` : words[index]
    if (ctx.measureText(next).width > width && line) {
      draw(line); row++; line = words[index]
    } else line = next
  }
  if (line) draw(line)
}

export async function downloadShareCard(report: RoastReport, format: 'square' | 'landscape', language: Language) {
  const canvas = document.createElement('canvas')
  canvas.width = format === 'square' ? 1080 : 1200
  canvas.height = format === 'square' ? 1080 : 630
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  const mascot = await image('/bro-code.png')
  const source = report.scan.screenshots.desktop ?? report.scan.screenshots.mobile
  let screenshot: HTMLImageElement | null = null
  if (source) screenshot = await image(source)
  const square = format === 'square'
  const width = canvas.width
  ctx.fillStyle = '#f5f1e8'; ctx.fillRect(0, 0, width, canvas.height)
  ctx.strokeStyle = '#20201e'; ctx.lineWidth = 5; ctx.strokeRect(18, 18, width - 36, canvas.height - 36)
  ctx.fillStyle = '#20201e'; ctx.font = '900 42px Arial'; ctx.fillText('VibeRoast', 48, 78)
  ctx.font = '18px monospace'; ctx.fillText(language === 'id' ? 'KARTU KOMEDI · BUKAN NILAI AUDIT' : 'COMEDY CARD · NOT AN AUDIT GRADE', 48, 112)
  ctx.font = '16px monospace'
  ctx.fillText(`${language === 'id' ? 'Panas komedi' : 'Comedy heat'}: ${calculateScore(report.scan.findings)}/100 · ${report.commentary?.verdict.reaction ?? 'suspicious'}`, 48, 140)
  ctx.font = 'bold 20px Arial'
  lines(ctx, report.scan.title || report.scan.finalUrl, 340, 78, width - 390, 26, 1)
  const shotX = square ? 48 : 760, shotY = square ? 150 : 150, shotW = square ? 610 : 390, shotH = square ? 300 : 240
  ctx.fillStyle = '#d9d1c4'; ctx.fillRect(shotX, shotY, shotW, shotH)
  if (screenshot) {
    const height = screenshot.height * shotW / screenshot.width
    ctx.save(); ctx.beginPath(); ctx.rect(shotX, shotY, shotW, shotH); ctx.clip()
    ctx.drawImage(screenshot, shotX, shotY, shotW, height); ctx.restore()
  } else {
    ctx.fillStyle = '#20201e'; ctx.font = '18px Arial'
    lines(ctx, language === 'id' ? 'Screenshot tidak tersedia dari pemindaian ini.' : 'Screenshot unavailable from this scan.', shotX + 20, shotY + 60, shotW - 40, 26, 3)
  }
  const mascotWidth = square ? 300 : 220
  ctx.drawImage(mascot, square ? 700 : 900, square ? 165 : 345, mascotWidth, mascot.height * mascotWidth / mascot.width)
  const contentY = square ? 510 : 170, contentW = square ? 970 : 665
  ctx.fillStyle = '#b33528'; ctx.font = square ? '900 42px Arial' : '900 34px Arial'
  lines(ctx, report.commentary?.verdict.headline ?? (language === 'id' ? 'Hasil pemindai saja. Roasting AI tidak tersedia.' : 'Scanner-only report. AI roast unavailable.'), 48, contentY, contentW, square ? 48 : 40, 3)
  ctx.fillStyle = '#20201e'; ctx.font = '21px Arial'
  const entries = report.commentary?.findings.length ? report.commentary.findings.slice(0, 3).map(f => f.roast) : report.scan.findings.slice(0, 3).map(f => f.title)
  entries.forEach((entry, index) => lines(ctx, `${index + 1}. ${entry}`, 48, contentY + (square ? 180 : 145) + index * (square ? 72 : 62), contentW, 25, 2))
  if (!entries.length) lines(ctx, language === 'id' ? 'Tidak ada masalah yang tercatat dalam cakupan pemindaian ini.' : 'No findings recorded within this scan’s scope.', 48, contentY + 180, contentW, 26, 2)
  ctx.font = '15px monospace'
  lines(ctx, `${report.scan.finalUrl} · ${report.scan.scannedAt}`, 48, canvas.height - 65, width - 96, 21, 2)
  const { promise, resolve, reject } = Promise.withResolvers<Blob>()
  canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png')
  const blob = await promise
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `viberoast-${format}.png`; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function shareText(report: RoastReport, language: Language) {
  return `VibeRoast: ${report.commentary?.verdict.headline ?? (language === 'id' ? 'Laporan pemindai, tanpa roasting AI.' : 'Scanner-only report, no AI roast.')}\n${language === 'id' ? 'Komentar komedi, bukan sertifikasi audit.' : 'Comedy commentary, not an audit certification.'}`
}
