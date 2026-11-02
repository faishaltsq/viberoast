import { describe, expect, it } from 'vitest'
import { calculateScore, SCORE_RULE, SCORE_RULES } from '../lib/roast/score'
import type { Finding } from '../lib/types/report'

function finding(id: string, severity: Finding['severity'] = 'high', verification: Finding['verification'] = 'verified'): Finding {
  return { id, severity, verification, category: 'UX', title: 'Observed issue', description: 'An observed issue.', confidence: 'high', evidence: ['Observed at the page.'], location: 'main', recommendation: 'Investigate the observation.', source: 'dom' }
}

describe('comedy issue-density scoring', () => {
  it('returns zero for no observations, not a fabricated clean audit percentage', () => {
    expect(calculateScore([])).toBe(0)
    expect(SCORE_RULE).toContain('not a quality, performance, or security score')
    expect(SCORE_RULE).toContain('Zero means no scored findings, not a clean audit')
    expect(SCORE_RULE).toContain('Partial scans and warnings still apply')
    expect(SCORE_RULES.id).toContain('bukan skor kualitas, performa, atau keamanan')
  })

  it('uses disclosed severity weights', () => {
    expect(calculateScore([finding('high', 'high')])).toBe(12)
    expect(calculateScore([finding('medium', 'medium')])).toBe(6)
    expect(calculateScore([finding('low', 'low')])).toBe(2)
    expect(calculateScore([finding('a'), finding('b', 'medium'), finding('c', 'low')])).toBe(20)
  })

  it('halves heuristic weight and never scores inconclusive observations as confirmed defects', () => {
    expect(calculateScore([finding('high', 'high', 'heuristic')])).toBe(6)
    expect(calculateScore([finding('medium', 'medium', 'heuristic')])).toBe(3)
    expect(calculateScore([finding('low', 'low', 'heuristic')])).toBe(1)
    expect(calculateScore([finding('unknown', 'high', 'inconclusive')])).toBe(0)
  })

  it('caps at 100 and preserves boundary values', () => {
    expect(calculateScore(Array.from({ length: 8 }, (_, index) => finding(`f${index}`)))).toBe(96)
    expect(calculateScore(Array.from({ length: 9 }, (_, index) => finding(`f${index}`)))).toBe(100)
    expect(calculateScore(Array.from({ length: 60 }, (_, index) => finding(`f${index}`)))).toBe(100)
  })

  it('counts each stable ID once and does not mutate source findings', () => {
    const input = [finding('same'), finding('same'), finding('other', 'low')]
    const original = JSON.stringify(input)
    expect(calculateScore(input)).toBe(14)
    expect(JSON.stringify(input)).toBe(original)
  })

  it('does not use comedy intensity or model commentary to alter observed issue density', () => {
    const input = [finding('a'), finding('b', 'low', 'heuristic')]
    expect(calculateScore(input)).toBe(13)
    expect(calculateScore([...input].reverse())).toBe(13)
  })
})
