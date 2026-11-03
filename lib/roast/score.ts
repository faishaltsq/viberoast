import type { Finding } from '../types/report'

const severityWeight = { high: 12, medium: 6, low: 2 } as const
const verificationWeight = { verified: 1, heuristic: 0.5, inconclusive: 0 } as const

export const SCORE_RULES = {
  en: 'Roast heat is a comedy issue-density indicator, not a quality, performance, or security score. Count each stable finding ID once. Sum severity weights (high 12, medium 6, low 2) multiplied by verification (verified 1, heuristic 0.5, inconclusive 0), round, and cap at 100. Zero means no scored findings, not a clean audit. Partial scans and warnings still apply.',
  id: 'Panas roast adalah indikator komedi kepadatan temuan, bukan skor kualitas, performa, atau keamanan. Hitung setiap ID temuan stabil sekali. Jumlahkan bobot keparahan (tinggi 12, sedang 6, rendah 2) dikali verifikasi (terverifikasi 1, heuristik 0,5, belum pasti 0), bulatkan, lalu batasi hingga 100. Nol berarti tidak ada temuan yang dihitung, bukan audit bersih. Batasan pemindaian parsial dan peringatan tetap berlaku.',
} as const
export const SCORE_RULE = SCORE_RULES.en

export function calculateScore(findings: readonly Finding[]): number {
  const seen = new Set<string>()
  let heat = 0
  for (const finding of findings) {
    if (seen.has(finding.id)) continue
    seen.add(finding.id)
    heat += severityWeight[finding.severity] * verificationWeight[finding.verification]
  }
  return Math.min(100, Math.round(heat))
}
