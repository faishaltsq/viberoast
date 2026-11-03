import type { AnalysisContext, AnalysisResult } from './types'
import type { Finding } from '../types/report'
import { safeSnippet } from '../security/redact'
import { checkStructure } from './checks/structure'
import { checkMaintainability } from './checks/maintainability'
import { checkTestingCi } from './checks/testing-ci'
import { checkDependencies } from './checks/dependencies'
import { checkSecurity } from './checks/security'
import { checkGitDx } from './checks/git-dx'
import { deduplicateFindings } from './deduplicate'
import { prioritizeFindings, detectStrengths, detectWarnings } from './prioritize'

export function validateFinding(finding: Finding, ctx: AnalysisContext): Finding {
  const parts = finding.location.split(':')
  const filePath = parts[0]
  const linePart = parts[1]

  const inspected = ctx.files.find((f) => f.path === filePath)
  if (inspected && linePart) {
    const totalLines = inspected.content.split('\n').length
    if (/^\d+$/.test(linePart)) {
      const lineNum = parseInt(linePart, 10)
      if (lineNum > totalLines) {
        return {
          ...finding,
          location: `${filePath}:${Math.max(1, totalLines)}`,
        }
      }
    } else if (/^(\d+)-(\d+)$/.test(linePart)) {
      const match = linePart.match(/^(\d+)-(\d+)$/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = parseInt(match[2], 10)
        const validStart = Math.max(1, Math.min(start, totalLines))
        const validEnd = Math.max(validStart, Math.min(end, totalLines))
        return {
          ...finding,
          location: `${filePath}:${validStart}-${validEnd}`,
        }
      }
    }
  }

  return finding
}

export function analyzeRepository(ctx: AnalysisContext): AnalysisResult {
  const allFindings = [
    ...checkSecurity(ctx),
    ...checkTestingCi(ctx),
    ...checkDependencies(ctx),
    ...checkStructure(ctx),
    ...checkMaintainability(ctx),
    ...checkGitDx(ctx),
  ].map((f) => validateFinding(f, ctx))

  const deduplicated = deduplicateFindings(allFindings)
  const prioritized = prioritizeFindings(deduplicated, 12)
  const strengths = detectStrengths(ctx, prioritized)
  const warnings = detectWarnings(ctx)

  const evidenceSummary = [
    `Repository analysis for ${ctx.owner}/${ctx.repo} at commit ${ctx.sha.slice(0, 7)}.`,
    `Tree size: ${ctx.tree.length} files discovered.`,
    `Content analyzed: ${ctx.files.length} selected files, ${ctx.files.reduce((acc, f) => acc + f.size, 0)} bytes inspected.`,
    prioritized.length > 0
      ? `Identified ${prioritized.length} key observations across ${new Set(prioritized.map((f) => f.category)).size} categories.`
      : 'No critical architectural, security, or hygiene defects detected in inspected files.',
    warnings.length > 0 ? warnings.join(' ') : '',
  ].filter(Boolean).map((s) => safeSnippet(s, 1000, ctx.sensitiveValues)).join(' ')

  return {
    findings: prioritized,
    strengths,
    warnings,
    evidenceSummary,
  }
}
