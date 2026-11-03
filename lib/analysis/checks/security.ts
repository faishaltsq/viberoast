import type { AnalysisContext, AnalysisFinding } from '../types'
import { redactUrl, safeSnippet } from '../../security/redact'

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; severity: 'high' | 'medium' }> = [
  { name: 'AWS Access Key', pattern: /\bAKIA[0-9A-Z]{16}\b/, severity: 'high' },
  { name: 'GitHub Personal Access Token', pattern: /\bghp_[a-zA-Z0-9]{36}\b|\bgithub_pat_[a-zA-Z0-9_]{82}\b/, severity: 'high' },
  { name: 'Stripe Secret Key', pattern: /\bsk_live_[0-9a-zA-Z]{24,}\b/, severity: 'high' },
  { name: 'Slack Token', pattern: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/, severity: 'high' },
  { name: 'Private Key Block', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/, severity: 'high' },
]

export function checkSecurity(ctx: AnalysisContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const { owner, repo, sha, tree, files, sensitiveValues } = ctx

  // 1. Committed sensitive environment files (.env, .env.local, .env.production)
  const envFiles = tree.filter((entry) =>
    entry.type === 'file' &&
    (
      entry.path === '.env' ||
      entry.path === '.env.local' ||
      entry.path === '.env.production' ||
      entry.path === '.env.development'
    )
  )
  if (envFiles.length > 0) {
    const sample = envFiles[0]
    findings.push({
      id: 'sec-committed-env-file',
      category: 'Security',
      title: `Committed environment file: ${sample.path}`,
      description: `Discovered environment file \`${sample.path}\` tracked in git. Environment files typically contain private secrets and must not be committed to source control.`,
      severity: 'high',
      confidence: 'high',
      evidence: envFiles.map((e) => `Tracked in git tree: ${e.path}`),
      location: sample.path,
      recommendation: 'Remove this file from git history (`git rm --cached`), add it to `.gitignore`, and rotate any compromised secrets.',
      source: 'repository',
      verification: 'verified',
      filePath: sample.path,
      githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${sample.path}`, sensitiveValues),
    })
  }

  // 2. Secret and Token Patterns in Extracted Content
  for (const file of files) {
    if (file.path.includes('.test.') || file.path.includes('.example')) continue
    const lines = file.content.split('\n')

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]
      for (const { name, pattern, severity } of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          const lineNum = idx + 1
          const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')
          findings.push({
            id: `sec-hardcoded-secret-${cleanPath}-${lineNum}`.slice(0, 100),
            category: 'Security',
            title: `Potential hardcoded ${name} in ${file.path}:${lineNum}`,
            description: `Found what appears to be a plaintext ${name} hardcoded directly into source code.`,
            severity,
            confidence: 'high',
            evidence: [safeSnippet(line.trim(), 120, sensitiveValues, file.truncated)],
            location: `${file.path}:${lineNum}`,
            recommendation: 'Revoke and rotate this secret immediately. Load secrets from runtime environment variables.',
            source: 'repository',
            verification: 'verified',
            filePath: file.path,
            lineStart: lineNum,
            lineEnd: lineNum,
            githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`, sensitiveValues),
          })
          break
        }
      }
    }
  }

  // 3. Dangerous dynamic evaluation (eval, Function constructor)
  for (const file of files) {
    if (file.path.includes('.test.') || file.path.includes('.min.')) continue
    const lines = file.content.split('\n')
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]
      if (line.trim().startsWith('//')) continue
      if (/\beval\s*\(/.test(line) || /\bnew\s+Function\s*\(/.test(line)) {
        const lineNum = idx + 1
        const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')
        findings.push({
          id: `sec-dynamic-eval-${cleanPath}-${lineNum}`.slice(0, 100),
          category: 'Security',
          title: `Dynamic code evaluation in ${file.path}:${lineNum}`,
          description: 'Use of `eval()` or `new Function()` allows arbitrary code execution and introduces injection vulnerabilities.',
          severity: 'high',
          confidence: 'high',
          evidence: [safeSnippet(line.trim(), 120, sensitiveValues, file.truncated)],
          location: `${file.path}:${lineNum}`,
          recommendation: 'Refactor dynamic execution to use safe parsers or structured lookup dictionaries.',
          source: 'repository',
          verification: 'verified',
          filePath: file.path,
          lineStart: lineNum,
          lineEnd: lineNum,
          githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`, sensitiveValues),
        })
        break
      }
    }
  }

  return findings
}
