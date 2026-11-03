const SECRET_ASSIGNMENT = /\b(api[_-]?(?:key|secret)|access[_-]?token|refresh[_-]?token|token|authorization|auth[_-]?token|password|passwd|secret|client[_-]?secret|private[_-]?(?:key|token)|session[_-]?id|cookie|webhook[_-]?secret|aws[_-]?(?:secret[_-]?(?:access[_-]?)?key|key[_-]?id))["']?\s*[=:]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'<>,;}]+)/gi

export const SENSITIVE_TEXT_PATTERN = new RegExp([
  SECRET_ASSIGNMENT.source,
  String.raw`-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----`,
  String.raw`\b(?:Bearer|Basic)\s+\S+`,
  String.raw`\b(?:sk-[\w-]{12,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}|(?:sk|rk)_(?:test|live)_\w{24,}|xox[baprs]-[\w-]{10,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b`,
  String.raw`\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`,
].join('|'), 'i')

export function redactUrl(input: string, sensitiveValues?: readonly string[]): string {
  try {
    const url = new URL(input)
    url.username = ''
    url.password = ''
    url.search = ''

    // Preserve valid GitHub permalink line anchors like #L12 or #L12-L20, strip all other hashes
    if (!/^#L\d+(-L\d+)?$/.test(url.hash)) {
      url.hash = ''
    }

    const isGitHub = url.hostname === 'github.com' || url.hostname === 'www.github.com'
    const ghPermalinkMatch = isGitHub
      ? url.pathname.match(/^(\/[^/]+\/[^/]+\/(?:blob|tree|commit)\/)([0-9a-fA-F]{40})(\/.*)?$/)
      : null

    if (ghPermalinkMatch) {
      const prefix = ghPermalinkMatch[1]
      const sha = ghPermalinkMatch[2]
      const rest = ghPermalinkMatch[3] || ''
      const redactedRest = rest.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
      url.pathname = `${prefix}${sha}${redactedRest}`
    } else {
      url.pathname = url.pathname.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    }

    if (sensitiveValues && sensitiveValues.length > 0) {
      for (const val of sensitiveValues) {
        if (val && val.length >= 4 && url.pathname.includes(val)) {
          url.pathname = url.pathname.replaceAll(val, '[redacted]')
        }
      }
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      if (['postgres:', 'postgresql:', 'mongodb:', 'mysql:', 'redis:'].includes(url.protocol)) {
        return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 2048)
      }
      return '[non-http URL]'
    }
    return url.href.slice(0, 2048)
  } catch { return '[invalid URL]' }
}

export function collectSensitiveValues(sources: Iterable<string | undefined | null>): string[] {
  const values = new Set<string>()
  for (const source of sources) {
    if (!source || typeof source !== 'string') continue

    // 1. Known token formats
    const tokenMatches = source.matchAll(
      /\b(?:gh[pousr]_[a-zA-Z0-9_]{20,}|github_pat_[a-zA-Z0-9_]{20,}|(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}|(?:sk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}|xox[baprs]-[a-zA-Z0-9-]{10,}|sk-[a-zA-Z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g
    )
    for (const match of tokenMatches) {
      if (match[0] && match[0].length >= 8) values.add(match[0])
    }

    // 2. Secret assignments
    const assignMatches = source.matchAll(SECRET_ASSIGNMENT)
    for (const match of assignMatches) {
      const full = match[0]
      const eqIdx = full.search(/[=:]/)
      if (eqIdx !== -1) {
        const val = full.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '').trim()
        if (val.length >= 4) values.add(val)
      }
    }

    // 3. Bearer and Basic headers (capture underlying opaque tokens for bare echoes)
    const authMatches = source.matchAll(/\b(?:Bearer|Basic)\s+([^\s"'<>,;]+)/gi)
    for (const match of authMatches) {
      const token = match[1]?.trim()
      if (token && token.length >= 8) values.add(token)
    }

    // 4. URL credentials (username and password in literal, decoded, and encoded forms)
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

    // 5. PEM private keys: capture block AND individual base64 line fragments
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
  let result = text

  const valuesList = Array.isArray(sensitiveValues) ? sensitiveValues : undefined
  if (valuesList && valuesList.length > 0) {
    const sorted = [...valuesList]
      .filter((v): v is string => typeof v === 'string' && v.trim().length >= 4)
      .sort((a, b) => b.length - a.length)
    for (const val of sorted) {
      if (result.includes(val)) {
        const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        result = result.replace(new RegExp(escaped, 'g'), '[redacted]')
      }
    }
  }

  result = result
    .replace(/-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z ]+)?PRIVATE KEY-----|$)/g, '[private key redacted]')
    .replace(/\b(?:https?|postgres|postgresql|mongodb|redis|mysql):\/\/[^\s<>"']+/gi, (url) => redactUrl(url))
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi, '[authorization redacted]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9_]{20,}|github_pat_[a-zA-Z0-9_]{20,}|(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}|(?:sk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/g, '[redacted]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')

  if (valuesList && valuesList.length > 0) {
    const sorted = [...valuesList]
      .filter((v): v is string => typeof v === 'string' && v.trim().length >= 4)
      .sort((a, b) => b.length - a.length)
    for (const val of sorted) {
      if (result.includes(val)) {
        const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        result = result.replace(new RegExp(escaped, 'g'), '[redacted]')
      }
    }
  }

  return result
}
