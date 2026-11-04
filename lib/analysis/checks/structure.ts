import type { AnalysisContext, AnalysisFinding } from '../types'
import { redactUrl, safeSnippet } from '../../security/redact'

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.cs', '.php', '.vue', '.svelte'])

function isSourceFile(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot !== -1 && SOURCE_EXTS.has(path.slice(dot))
}

export function checkStructure(ctx: AnalysisContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const { owner, repo, sha, files, tree } = ctx

  // 1. Monolithic / Overly Large Files (> 500 lines)
  for (const file of files) {
    if (!isSourceFile(file.path) || file.path.includes('.min.') || file.path.includes('bundle')) continue
    const lines = file.content.split('\n')
    if (lines.length > 500) {
      const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')
      findings.push({
        id: `struct-large-file-${cleanPath}`.slice(0, 100),
        category: 'Architecture',
        title: `Monolithic file: ${file.path} (${lines.length} lines)`,
        description: `This file contains ${lines.length} lines of code, exceeding the 500-line recommended threshold for single-responsibility modules.`,
        severity: lines.length > 1000 ? 'high' : 'medium',
        confidence: 'high',
        evidence: file.truncated
          ? [
              `File has ${lines.length} lines and ${(file.size / 1024).toFixed(1)} KiB in size.`,
              '[source evidence omitted: file content truncated]',
            ]
          : [
              `File has ${lines.length} lines and ${(file.size / 1024).toFixed(1)} KiB in size.`,
              `First line: ${safeSnippet(lines[0] || '(empty)', 80, ctx.sensitiveValues)}`,
            ],
        location: `${file.path}:1-${lines.length}`,
        recommendation: `Refactor ${file.path} into smaller, focused modules or separate domain logic from rendering.`,
        source: 'repository',
        verification: 'verified',
        filePath: file.path,
        lineStart: 1,
        lineEnd: lines.length,
        githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L1-L${lines.length}`, ctx.sensitiveValues),
      })
    }
  }

  // 2. Excessive Directory Nesting (depth >= 6)
  const deeplyNested = tree.filter((entry) => entry.type === 'file' && entry.path.split('/').length >= 7)
  if (deeplyNested.length > 0) {
    const sample = deeplyNested[0]
    const depth = sample.path.split('/').length - 1
    findings.push({
      id: 'struct-deep-nesting',
      category: 'Architecture',
      title: `Excessive directory nesting (${depth} levels)`,
      description: `Discovered files nested ${depth} or more folders deep (e.g. ${sample.path}). Deep folder hierarchies impair discoverability and create brittle import paths.`,
      severity: 'low',
      confidence: 'high',
      evidence: deeplyNested.slice(0, 3).map((e) => `Nested path: ${safeSnippet(e.path, 120, ctx.sensitiveValues)}`),
      location: sample.path,
      recommendation: 'Flatten the directory architecture by organizing by feature or bounded context rather than deeply nested technical layers.',
      source: 'repository',
      verification: 'verified',
      filePath: sample.path,
      githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${sample.path}`, ctx.sensitiveValues),
    })
  }

  // 3. Root directory sprawl (> 20 top-level files)
  const rootFiles = tree.filter((entry) => entry.type === 'file' && !entry.path.includes('/'))
  if (rootFiles.length > 20) {
    findings.push({
      id: 'struct-root-sprawl',
      category: 'Architecture',
      title: `Root directory clutter (${rootFiles.length} top-level files)`,
      description: `The repository root has ${rootFiles.length} files. Having dozens of unorganized files in the root obscures core configuration and documentation.`,
      severity: 'low',
      confidence: 'medium',
      evidence: [
        `Root contains ${rootFiles.length} files.`,
        `Samples: ${rootFiles.slice(0, 5).map((f) => f.path).join(', ')}`,
      ],
      location: 'root',
      recommendation: 'Move utility scripts, build configs, or standalone docs into designated directories like `scripts/`, `config/`, or `docs/`.',
      source: 'repository',
      verification: 'verified',
    })
  }

  return findings
}
