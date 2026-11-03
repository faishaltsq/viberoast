import type { AnalysisContext, AnalysisFinding } from '../types'

export function checkMaintainability(ctx: AnalysisContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const { owner, repo, sha, files } = ctx

  for (const file of files) {
    if (file.path.includes('.min.') || file.path.includes('.test.') || file.path.includes('.spec.')) continue
    const lines = file.content.split('\n')
    const isTs = file.path.endsWith('.ts') || file.path.endsWith('.tsx')

    // 1. Swallowed errors (empty catch blocks)
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]
      const catchMatch = /catch\s*(\([^)]*\))?\s*\{\s*\}/.exec(line)
      // Also check 2-line empty catch: catch (...) { \n }
      const twoLineCatch = /catch\s*(\([^)]*\))?\s*\{\s*$/.test(line) && lines[idx + 1] && /^\s*\}\s*$/.test(lines[idx + 1])
      if (catchMatch || twoLineCatch) {
        const lineNum = idx + 1
        const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')
        findings.push({
          id: `maint-empty-catch-${cleanPath}-${lineNum}`.slice(0, 100),
          category: 'Code Quality',
          title: `Silent error swallowing in ${file.path}:${lineNum}`,
          description: `An empty catch block silently ignores runtime exceptions without logging, metrics, or error propagation.`,
          severity: 'high',
          confidence: 'high',
          evidence: [
            line.trim(),
            twoLineCatch ? lines[idx + 1].trim() : '',
          ].filter(Boolean),
          location: `${file.path}:${lineNum}`,
          recommendation: 'Log the caught error or explicitly re-throw it to prevent hidden failures.',
          source: 'repository',
          verification: 'verified',
          filePath: file.path,
          lineStart: lineNum,
          lineEnd: twoLineCatch ? lineNum + 1 : lineNum,
          githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`,
        })
      }
    }

    // 2. TypeScript `any` escapes
    if (isTs) {
      const anyMatches: number[] = []
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx]
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
        if (/:\s*any\b|\bas\s+any\b|<any>/.test(line)) {
          anyMatches.push(idx + 1)
        }
      }
      if (anyMatches.length >= 3) {
        const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')
        findings.push({
          id: `maint-ts-any-${cleanPath}`.slice(0, 100),
          category: 'Code Quality',
          title: `Excessive \`any\` types in ${file.path} (${anyMatches.length} occurrences)`,
          description: `Found ${anyMatches.length} uses of \`any\` in TypeScript code, bypassing compile-time safety and disabling type checking.`,
          severity: 'medium',
          confidence: 'high',
          evidence: anyMatches.slice(0, 3).map((lineNum) => `Line ${lineNum}: ${lines[lineNum - 1]?.trim().slice(0, 120)}`),
          location: `${file.path}:${anyMatches[0]}`,
          recommendation: 'Replace `any` with specific interfaces, generics, or `unknown` with type narrowing.',
          source: 'repository',
          verification: 'verified',
          filePath: file.path,
          lineStart: anyMatches[0],
          lineEnd: anyMatches[anyMatches.length - 1],
          githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${anyMatches[0]}`,
        })
      }
    }

    // 3. Stale TODO/FIXME comments
    const todoMatches: number[] = []
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]
      if (/\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
        todoMatches.push(idx + 1)
      }
    }
    if (todoMatches.length >= 2) {
      const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')
      findings.push({
        id: `maint-todos-${cleanPath}`.slice(0, 100),
        category: 'Code Quality',
        title: `Unresolved technical debt comments in ${file.path} (${todoMatches.length} items)`,
        description: `Found multiple TODO or FIXME comments in source code, indicating deferred bug fixes or incomplete implementations.`,
        severity: 'low',
        confidence: 'high',
        evidence: todoMatches.slice(0, 3).map((l) => `Line ${l}: ${lines[l - 1]?.trim().slice(0, 120)}`),
        location: `${file.path}:${todoMatches[0]}`,
        recommendation: 'Convert lingering inline TODOs into tracked GitHub issues or complete the intended changes.',
        source: 'repository',
        verification: 'verified',
        filePath: file.path,
        lineStart: todoMatches[0],
        lineEnd: todoMatches[todoMatches.length - 1],
        githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${todoMatches[0]}`,
      })
    }

    // 4. Hardcoded localhost URLs in production source
    if (!file.path.startsWith('tests/') && !file.path.startsWith('test/') && !file.path.includes('.test.')) {
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx]
        if (line.trim().startsWith('//')) continue
        const match = /(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)/i.exec(line)
        if (match) {
          const lineNum = idx + 1
          const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')
          findings.push({
            id: `maint-localhost-${cleanPath}-${lineNum}`.slice(0, 100),
            category: 'Code Quality',
            title: `Hardcoded localhost URL in ${file.path}:${lineNum}`,
            description: `Detected hardcoded local endpoint \`${match[1]}\` in application code. This will fail when deployed to production environments.`,
            severity: 'medium',
            confidence: 'high',
            evidence: [`Line ${lineNum}: ${line.trim().slice(0, 140)}`],
            location: `${file.path}:${lineNum}`,
            recommendation: 'Use environment variables (e.g. `NEXT_PUBLIC_API_URL` or `API_BASE_URL`) rather than hardcoded localhost strings.',
            source: 'repository',
            verification: 'verified',
            filePath: file.path,
            lineStart: lineNum,
            lineEnd: lineNum,
            githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`,
          })
          break // one localhost per file is enough
        }
      }
    }
  }

  return findings
}
