import type { AnalysisContext, AnalysisFinding } from './types'

const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
const verificationOrder: Record<string, number> = { verified: 0, heuristic: 1, inconclusive: 2 }

export function prioritizeFindings(findings: AnalysisFinding[], limit = 12): AnalysisFinding[] {
  return [...findings]
    .sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
      if (sevDiff !== 0) return sevDiff
      return (verificationOrder[a.verification] ?? 1) - (verificationOrder[b.verification] ?? 1)
    })
    .slice(0, limit)
}

export function detectStrengths(ctx: AnalysisContext, findings: AnalysisFinding[]): string[] {
  const strengths: string[] = []
  const { tree, files } = ctx

  // 1. CI Workflow present
  const hasCi = tree.some((e) => e.path.startsWith('.github/workflows/') || e.path === '.gitlab-ci.yml')
  if (hasCi && !findings.some((f) => f.id === 'ci-missing-workflow')) {
    strengths.push('Automated CI/CD pipeline configured for continuous integration.')
  }

  // 2. Test suite present
  const hasTests = tree.some((e) => /\.(test|spec)\.[a-z0-9]+$/i.test(e.path) || e.path.includes('__tests__/'))
  if (hasTests && !findings.some((f) => f.id === 'test-no-test-files')) {
    strengths.push('Automated test suite detected with dedicated test files.')
  }

  // 3. Strict Lockfile committed
  const hasLock = tree.some((e) => e.path === 'package-lock.json' || e.path === 'pnpm-lock.yaml' || e.path === 'yarn.lock' || e.path === 'bun.lockb')
  if (hasLock && !findings.some((f) => f.id === 'dep-missing-lockfile')) {
    strengths.push('Reproducible dependency lockfile committed to source control.')
  }

  // 4. README documentation present
  const readme = files.find((f) => /^readme(\.[a-z0-9]+)?$/i.test(f.path))
  if (readme && readme.content.trim().length >= 100 && !findings.some((f) => f.id === 'dx-empty-readme')) {
    strengths.push('Clear and informative README documentation provided.')
  }

  // 5. TypeScript configuration present
  const hasTsConfig = tree.some((e) => e.path === 'tsconfig.json')
  if (hasTsConfig) {
    strengths.push('TypeScript configured for static type safety.')
  }

  return strengths.slice(0, 8)
}

export function detectWarnings(ctx: AnalysisContext): string[] {
  const warnings: string[] = []
  if (ctx.treeTruncated) {
    warnings.push('Repository tree exceeded 2,000 files; partial tree inspected.')
  }
  if (ctx.contentTruncated) {
    warnings.push('Inspected file content reached 256 KiB budget limit; remaining files were omitted.')
  }
  return warnings
}
