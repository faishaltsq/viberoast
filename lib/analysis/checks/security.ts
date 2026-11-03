import type { AnalysisContext, AnalysisFinding } from '../types'
import { redactUrl, safeSnippet, detectSecrets, getRulePriority, type SecretCandidate } from '../../security/redact'

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

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

  for (const envFile of envFiles) {
    const extracted = files.find((f) => f.path === envFile.path)
    let hasVerifiedSecrets = false
    if (extracted && extracted.content) {
      const detected = detectSecrets(extracted.content, extracted.path)
      // AWS key ID alone is a qualified identifier observation, not a confirmed private secret compromise
      if (
        detected.some(
          (c) =>
            (c.classification === 'recognized' || c.classification === 'suspicious') &&
            c.ruleId !== 'aws-access-key-id'
        )
      ) {
        hasVerifiedSecrets = true
      }
    }

    const cleanPath = envFile.path.replace(/[^A-Za-z0-9]/g, '-')
    const severity: 'high' | 'medium' = hasVerifiedSecrets ? 'high' : 'medium'
    const description = hasVerifiedSecrets
      ? `Discovered tracked environment file \`${envFile.path}\` containing plaintext credentials.`
      : `Discovered environment file \`${envFile.path}\` tracked in git tree. Environment files are typically intended for local runtime configuration. While no unmasked high-confidence secrets were verified in tracked content, committing configuration templates or local presets poses credential leakage risks upon subsequent edits.`
    const recommendation = hasVerifiedSecrets
      ? 'Rotate compromised credentials immediately under owner-controlled procedures, remove this file from git tracking (`git rm --cached`), and review git history.'
      : 'Review file contents and git history under owner control. If sensitive values were previously committed, rotate them and remove the file from git tracking (`git rm --cached`).'

    const id = envFile.path === '.env' ? 'sec-committed-env-file' : `sec-committed-env-file-${cleanPath}`

    findings.push({
      id,
      category: 'Security',
      title: `Committed environment file: ${envFile.path}`,
      description,
      severity,
      confidence: 'high',
      evidence: [`Tracked in git tree: ${envFile.path}`],
      location: envFile.path,
      recommendation,
      source: 'repository',
      verification: 'verified',
      filePath: envFile.path,
      githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${envFile.path}`, sensitiveValues),
    })
  }

  // 2. Secret and Token Patterns in Extracted Content (NEVER skip .test or .example wholesale)
  for (const file of files) {
    const candidates = detectSecrets(file.content, file.path)
    if (candidates.length === 0) continue

    const lines = file.content.split('\n')
    const cleanPath = file.path.replace(/[^A-Za-z0-9]/g, '-')

    // Filter to deterministic findings only: omit placeholders, publishable keys, and uncertain tokens
    const eligible = candidates.filter(
      (c) => c.classification === 'recognized' || c.classification === 'suspicious'
    )
    if (eligible.length === 0) continue

    // Sort by start offset ascending, then by rule priority descending
    eligible.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start
      return getRulePriority(b.ruleId) - getRulePriority(a.ruleId)
    })

    // Precedence resolution for overlapping findings while preserving distinct same-line findings
    const chosen: SecretCandidate[] = []
    for (const cand of eligible) {
      const prev = chosen[chosen.length - 1]
      if (!prev) {
        chosen.push(cand)
        continue
      }
      const overlaps = cand.start < prev.end && cand.end > prev.start
      if (!overlaps) {
        chosen.push(cand)
        continue
      }
      const prevPriority = getRulePriority(prev.ruleId)
      const currPriority = getRulePriority(cand.ruleId)
      if (currPriority > prevPriority) {
        chosen[chosen.length - 1] = cand
      } else if (currPriority === prevPriority) {
        if (cand.end - cand.start > prev.end - prev.start) {
          chosen[chosen.length - 1] = cand
        }
      }
    }

    for (const candidate of chosen) {
      const lineNum = candidate.lineStart
      const lineText = lines[lineNum - 1] ?? ''

      let title = `Potential hardcoded secret in ${file.path}:${lineNum}`
      let description = `recognized credential format observed; validity not tested. Found potential plaintext credential in source code.`
      let recommendation = 'Audit and rotate observed credentials under owner-controlled procedures. Load secrets securely from runtime environment variables.'

      if (candidate.ruleId.startsWith('aws-access-key-id')) {
        title = `Observed AWS Access Key Identifier in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. AWS access key identifier found in source code. Access key identifiers specify an account identity but do not alone confirm private credential compromise. Verify whether associated secret access keys are exposed.`
        recommendation = 'Audit associated AWS secret access keys and permissions under owner-controlled procedures. Ensure keys are not committed to source control.'
      } else if (candidate.ruleId.startsWith('aws-secret') || candidate.ruleId.startsWith('aws-bedrock')) {
        title = `Potential hardcoded AWS credential in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. AWS credential pattern found in source code.`
      } else if (candidate.ruleId.startsWith('github-')) {
        title = `Potential hardcoded GitHub Token in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. GitHub access token pattern found in source code.`
      } else if (candidate.ruleId.startsWith('stripe-')) {
        title = `Potential hardcoded Stripe Secret Key in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. Stripe secret key pattern found in source code.`
      } else if (candidate.ruleId.startsWith('slack-')) {
        title = `Potential hardcoded Slack Token in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. Slack token pattern found in source code.`
      } else if (candidate.ruleId.startsWith('private-key')) {
        title = `Potential hardcoded Private Key Block in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. Private cryptographic key block found in source code.`
      } else if (candidate.ruleId.startsWith('google-')) {
        title = `Potential hardcoded Google Service Account Key in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. Google service account private key found in source code. Cloud IAM permissions vary by role configuration.`
      } else if (candidate.ruleId.startsWith('gcp-')) {
        title = `Potential hardcoded GCP API Key in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. GCP API key found in source code. GCP API keys identify projects and restrict API usage but do not inherently convey administrative access. Ensure appropriate API and IP/HTTP restrictions are configured.`
      } else if (candidate.ruleId.startsWith('openai-')) {
        title = `Potential hardcoded OpenAI API Key in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. OpenAI API key pattern found in source code.`
      } else if (candidate.ruleId.startsWith('anthropic-')) {
        title = `Potential hardcoded Anthropic API Key in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. Anthropic API key pattern found in source code.`
      } else if (candidate.ruleId.startsWith('database-')) {
        title = `Potential hardcoded Database Password in ${file.path}:${lineNum}`
        description = `recognized credential format observed; validity not tested. Plaintext database credential found in connection URL.`
      }

      // AWS identifier alone is a qualified observation (medium severity)
      const severity: 'high' | 'medium' = candidate.ruleId === 'aws-access-key-id'
        ? 'medium'
        : (candidate.classification === 'recognized' ? 'high' : 'medium')

      const pathHash = fnv1a32(file.path)
      const suffix = `-${candidate.ruleId}-${candidate.start}-${candidate.lineStart}`
      const prefix = 'sec-hardcoded-secret-'
      const maxSlugLen = Math.max(0, 100 - prefix.length - suffix.length - (pathHash.length + 1))
      const slug = cleanPath.slice(0, maxSlugLen).replace(/-+$/, '')
      const id = slug
        ? `${prefix}${slug}-${pathHash}${suffix}`
        : `${prefix}${pathHash}${suffix}`

      findings.push({
        id,
        category: 'Security',
        title,
        description,
        severity,
        confidence: candidate.confidence,
        evidence: [safeSnippet(lineText.trim(), 120, sensitiveValues, file.truncated)],
        location: `${file.path}:${lineNum}`,
        recommendation,
        source: 'repository',
        verification: 'verified',
        filePath: file.path,
        lineStart: candidate.lineStart,
        lineEnd: candidate.lineEnd,
        githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`, sensitiveValues),
      })
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
