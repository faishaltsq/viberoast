import type { AnalysisContext, AnalysisFinding } from '../types'
import { redactUrl, detectSecrets, getRulePriority, type SecretCandidate } from '../../security/redact'
import { analyzeStaticSecurity } from '../../security/static'

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function buildTrackedFileId(rulePrefix: string, filePath: string): string {
  const pathHash = fnv1a32(filePath)
  const cleanPath = filePath.replace(/[^A-Za-z0-9]/g, '-')
  const overhead = rulePrefix.length + pathHash.length + 2
  const maxSlugLen = Math.max(0, 100 - overhead)
  const slug = cleanPath.slice(0, maxSlugLen).replace(/-+$/, '')
  return slug ? `${rulePrefix}-${slug}-${pathHash}` : `${rulePrefix}-${pathHash}`
}

export function checkSecurity(
  ctx: AnalysisContext,
  staticFindings?: readonly AnalysisFinding[]
): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const { owner, repo, sha, tree, files, sensitiveValues } = ctx

  // 1. Filename-only observations for tracked sensitive files across ALL tree entries
  for (const entry of tree) {
    if (entry.type !== 'file') continue

    const normalized = entry.path.replace(/\\/g, '/')
    const parts = normalized.split('/')
    const filename = parts[parts.length - 1] ?? ''

    // A. Environment file variants (root and nested, including .env.* and templates)
    const isEnvFile =
      /^\.env(\.|$)/i.test(filename) ||
      entry.path === '.env' ||
      entry.path.startsWith('.env.')

    // B. Cryptographic keys and certificates (.pem, .key, id_rsa, etc.)
    const isKeyFile =
      !isEnvFile &&
      (/\.(pem|key|p12|pfx|pkcs12|kdbx)$/i.test(filename) ||
        /^(id_rsa|id_dsa|id_ecdsa|id_ed25519|private[-_.]?key.*)$/i.test(filename))

    // C. Credential configuration paths (credentials.json, service-account.json, etc.)
    const isCredentialConfigFile =
      !isEnvFile &&
      !isKeyFile &&
      (/(credentials?|service[-_]?account|client[-_]?secret|oauth[-_]?secret)\.(json|ya?ml|toml|ini|xml)$/i.test(filename) ||
        /^secrets?\.(json|ya?ml|toml|ini|xml)$/i.test(filename))

    if (!isEnvFile && !isKeyFile && !isCredentialConfigFile) continue

    const extracted = files.find((f) => f.path === entry.path)
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

    const severity: 'high' | 'medium' = hasVerifiedSecrets ? 'high' : 'medium'

    let id: string
    let title: string
    let description: string
    let recommendation: string

    if (isEnvFile) {
      id = entry.path === '.env' ? 'sec-committed-env-file' : buildTrackedFileId('sec-committed-env-file', entry.path)
      title = `Committed environment file: ${entry.path}`
      description = hasVerifiedSecrets
        ? `Discovered tracked environment file \`${entry.path}\` containing plaintext credentials.`
        : `Discovered environment file \`${entry.path}\` tracked in git tree. Environment files are typically intended for local runtime configuration. While no unmasked high-confidence secrets were verified in tracked content, committing configuration templates or local presets poses credential leakage risks upon subsequent edits.`
      recommendation = hasVerifiedSecrets
        ? 'Rotate compromised credentials immediately under owner-controlled procedures, remove this file from git tracking (`git rm --cached`), and review git history.'
        : 'Review file contents and git history under owner control. If sensitive values were previously committed, rotate them and remove the file from git tracking (`git rm --cached`).'
    } else if (isKeyFile) {
      id = buildTrackedFileId('sec-tracked-key-file', entry.path)
      title = `Tracked cryptographic key file: ${entry.path}`
      description = hasVerifiedSecrets
        ? `Discovered tracked cryptographic key file \`${entry.path}\` containing plaintext private key or credentials.`
        : `Discovered cryptographic key or certificate file \`${entry.path}\` tracked in git tree. While no private credential was verified from filename alone, committing key material poses security and metadata leakage risks.`
      recommendation = hasVerifiedSecrets
        ? 'Rotate exposed keys immediately under owner-controlled procedures, revoke compromised certificates, remove this file from git tracking (`git rm --cached`), and review git history.'
        : 'Audit key and certificate material under owner control. Ensure private keys are never committed to source control and remove unnecessary key material from git tracking (`git rm --cached`).'
    } else {
      id = buildTrackedFileId('sec-tracked-credential-file', entry.path)
      title = `Tracked credential configuration file: ${entry.path}`
      description = hasVerifiedSecrets
        ? `Discovered tracked credential configuration file \`${entry.path}\` containing plaintext credentials.`
        : `Discovered credential configuration file \`${entry.path}\` tracked in git tree. While no unmasked high-confidence secrets were verified from filename alone, committing credential configuration files poses leakage risks upon subsequent edits.`
      recommendation = hasVerifiedSecrets
        ? 'Rotate compromised credentials immediately under owner-controlled procedures, remove this file from git tracking (`git rm --cached`), and review git history.'
        : 'Review credential configuration and git history under owner control. Ensure secrets are loaded from runtime environment variables and remove the file from git tracking (`git rm --cached`).'
    }

    findings.push({
      id,
      category: 'Security',
      title,
      description,
      severity,
      confidence: 'high',
      evidence: [`Tracked in git tree: ${entry.path}`],
      location: entry.path,
      recommendation,
      source: 'repository',
      verification: 'verified',
      filePath: entry.path,
      githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${entry.path}`, sensitiveValues),
      security: {
        category: 'Security',
        ruleId: isEnvFile
          ? 'sec.committed-env-file'
          : isKeyFile
            ? 'sec.tracked-key-file'
            : 'sec.tracked-credential-file',
        ruleVersion: '1.0.0',
        commitSha: sha,
        filePath: entry.path,
        observation: description,
        possibleImpact: hasVerifiedSecrets
          ? 'Potential credential exposure observed in tracked configuration; active/revoked status unknown and provider privileges not established.'
          : 'Potential exposure of sensitive configuration or cryptographic key metadata in git repository tree.',
        coverageLimitations:
          'Filename-only inspection from git tree; repository history and uncommitted files not inspected.',
      },
    })
  }

  // 2. Secret and Token Patterns in Extracted Content (NEVER skip .test or .example wholesale)
  for (const file of files) {
    const candidates = detectSecrets(file.content, file.path)
    if (candidates.length === 0) continue

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
        evidence: [file.truncated ? '[source evidence omitted: file content truncated]' : `${candidate.ruleId} pattern observed at lines ${candidate.lineStart}-${candidate.lineEnd}; value [redacted]. Validity not tested.`],
        location: `${file.path}:${lineNum}`,
        recommendation,
        source: 'repository',
        verification: 'verified',
        filePath: file.path,
        lineStart: candidate.lineStart,
        lineEnd: candidate.lineEnd,
        githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`, sensitiveValues),
        security: {
          category: 'Security',
          ruleId: candidate.ruleId,
          ruleVersion: '1.0.0',
          commitSha: sha,
          filePath: file.path,
          lineStart: candidate.lineStart,
          lineEnd: candidate.lineEnd,
          observation: `${candidate.ruleId} pattern observed at lines ${candidate.lineStart}-${candidate.lineEnd}; value redacted. Validity not tested.`,
          possibleImpact:
            'Potential exposure of credential pattern; validity not verified, active/revoked status unknown, and provider permissions not established.',
          coverageLimitations:
            'Pattern detection in admitted file content; credential active status or revocation not queried.',
        },
      })
    }
  }

  // 3. Dynamic evaluation (AST-backed syntax analysis)
  const resolvedStaticFindings = staticFindings ?? analyzeStaticSecurity(ctx)
  const evalFindings = resolvedStaticFindings.filter(
    (f) => f.security?.ruleId === 'js.dynamic-execution'
  )
  findings.push(...evalFindings)

  return findings
}
