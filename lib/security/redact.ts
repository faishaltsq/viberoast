import {
  detectSecrets,
  classifySecret,
  redactSecretText,
  redactUrl,
  getRulePriority,
  type SecretCandidate,
  type SecretClassification,
  type SecretConfidence,
  type SecretRule,
} from './secrets'

export {
  detectSecrets,
  classifySecret,
  redactSecretText,
  redactUrl,
  getRulePriority,
  type SecretCandidate,
  type SecretClassification,
  type SecretConfidence,
  type SecretRule,
}

const SECRET_ASSIGNMENT = /\b(api[_-]?(?:key|secret)|access[_-]?token|refresh[_-]?token|token|authorization|auth[_-]?token|password|passwd|secret|client[_-]?secret|private[_-]?(?:key|token)|session[_-]?id|cookie|webhook[_-]?secret|aws[_-]?(?:secret[_-]?(?:access[_-]?)?key|key[_-]?id))["']?\s*[=:]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'<>,;}]+)/gi

export const SENSITIVE_TEXT_PATTERN = new RegExp([
  SECRET_ASSIGNMENT.source,
  String.raw`-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----`,
  String.raw`\b(?:Bearer|Basic)\s+\S+`,
  String.raw`\b(?:sk-[\w-]{12,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}|(?:sk|rk)_(?:test|live)_\w{24,}|xox[baprs]-[\w-]{10,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b`,
  String.raw`\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`,
].join('|'), 'i')

export function collectSensitiveValues(sources: Iterable<string | undefined | null>): string[] {
  const values = new Set<string>()
  for (const source of sources) {
    if (!source || typeof source !== 'string') continue

    // 1. Detector pass: collect recognized, suspicious, and uncertain candidate values
    const detected = detectSecrets(source)
    for (const candidate of detected) {
      if (
        candidate.classification === 'recognized' ||
        candidate.classification === 'suspicious' ||
        candidate.classification === 'uncertain'
      ) {
        if (candidate.value && candidate.value.length >= 4) {
          values.add(candidate.value)
        }
      }
    }

    // 2. Known token formats fallback
    const tokenMatches = source.matchAll(
      /\b(?:gh[pousr]_[a-zA-Z0-9_]{20,}|github_pat_[a-zA-Z0-9_]{20,}|(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}|(?:sk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}|xox[baprs]-[a-zA-Z0-9-]{10,}|sk-[a-zA-Z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g
    )
    for (const match of tokenMatches) {
      if (match[0] && match[0].length >= 8) values.add(match[0])
    }

    // 3. Secret assignments
    const assignMatches = source.matchAll(SECRET_ASSIGNMENT)
    for (const match of assignMatches) {
      const full = match[0]
      const eqIdx = full.search(/[=:]/)
      if (eqIdx !== -1) {
        const val = full.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '').trim()
        if (val.length >= 4) values.add(val)
      }
    }

    // 4. Bearer and Basic headers (capture underlying opaque tokens for bare echoes)
    const authMatches = source.matchAll(/\b(?:Bearer|Basic)\s+([^\s"'<>,;]+)/gi)
    for (const match of authMatches) {
      const token = match[1]?.trim()
      if (token && token.length >= 8) values.add(token)
    }

    // 5. URL credentials (username and password in literal, decoded, and encoded forms)
    const urlMatches = source.matchAll(/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s<>"'`)]+/g)
    for (const match of urlMatches) {
      try {
        const parsed = new URL(match[0])
        if (parsed.username) {
          const user = parsed.username
          if (user.length >= 3) {
            values.add(user)
            try { values.add(decodeURIComponent(user)) } catch {}
            values.add(encodeURIComponent(user))
          }
        }
        if (parsed.password) {
          const pass = parsed.password
          if (pass.length >= 4) {
            values.add(pass)
            try { values.add(decodeURIComponent(pass)) } catch {}
            values.add(encodeURIComponent(pass))
          }
        }
        for (const [key, qVal] of parsed.searchParams.entries()) {
          if (/(?:key|token|secret|password|auth)/i.test(key) && qVal && qVal.length >= 4) {
            values.add(qVal)
          }
        }
      } catch {}
    }

    // 6. PEM private keys: capture block AND individual base64 line fragments
    const pkMatches = source.matchAll(
      /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z ]+)?PRIVATE KEY-----|$)/g
    )
    for (const match of pkMatches) {
      if (match[0]) {
        values.add(match[0])
        const pemLines = match[0].split('\n')
        for (const line of pemLines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('-----') && trimmed.length >= 16) {
            values.add(trimmed)
          }
        }
      }
    }
  }
  return Array.from(values)
}

export function safeSnippet(
  text: string,
  maxLength: number,
  sensitiveValues?: readonly string[],
  isTruncated?: boolean
): string {
  if (isTruncated) {
    return '[source evidence omitted: file content truncated]'
  }
  if (typeof text !== 'string') return ''
  const redacted = redactSecrets(text, sensitiveValues)
  if (redacted.length <= maxLength) return redacted
  let sliced = redacted.slice(0, maxLength)
  if (/[\uD800-\uDBFF]$/.test(sliced)) {
    sliced = sliced.slice(0, -1)
  }
  return sliced
}

export function redactSecrets(text: string): string
export function redactSecrets(text: string, sensitiveValues?: readonly string[]): string
export function redactSecrets(text: string, sensitiveValues?: unknown): string {
  if (typeof text !== 'string') return ''
  const valuesList = Array.isArray(sensitiveValues) ? sensitiveValues : undefined
  return redactSecretText(text, valuesList)
}
