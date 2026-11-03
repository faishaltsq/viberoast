import type { AnalysisFinding } from './types'

export function deduplicateFindings(findings: AnalysisFinding[]): AnalysisFinding[] {
  const seenIds = new Set<string>()
  const result: AnalysisFinding[] = []

  for (const finding of findings) {
    if (seenIds.has(finding.id)) continue
    seenIds.add(finding.id)
    result.push(finding)
  }

  return result
}
