/**
 * Redaction engine for secret text and sensitive values.
 * Uses the secret detector conservatively to ensure no private credentials leak.
 * Portable and browser safe with zero node-specific dependencies.
 */

import { detectSecrets } from './detect'

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
  } catch {
    return '[invalid URL]'
  }
}

const SECRET_ASSIGNMENT = /\b(api[_-]?(?:key|secret)|access[_-]?token|refresh[_-]?token|token|authorization|auth[_-]?token|password|passwd|secret|client[_-]?secret|private[_-]?(?:key|token)|session[_-]?id|cookie|webhook[_-]?secret|aws[_-]?(?:secret[_-]?(?:access[_-]?)?key|key[_-]?id))["']?\s*[=:]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'<>,;}]+)/gi

export function redactSecretText(text: string, sensitiveValues?: readonly string[]): string {
  if (typeof text !== 'string') return ''

  let result = text

  // 1. First pass with explicitly supplied sensitive values
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

  // 2. Scan for detected secrets and build union spans
  const candidates = detectSecrets(result)
  const publishableTokens = new Set(
    candidates
      .filter((c) => c.classification === 'publishable')
      .map((c) => c.value)
  )
  const spans: { start: number; end: number; isPrivateKey: boolean }[] = []

  for (const candidate of candidates) {
    // Publishable keys (pk_..., sb_publishable_, certs) and placeholders are NOT masked
    if (candidate.classification === 'publishable' || candidate.classification === 'placeholder') {
      continue
    }
    spans.push({
      start: candidate.start,
      end: candidate.end,
      isPrivateKey: candidate.ruleId.startsWith('private-key'),
    })
  }

  // Merge overlapping or adjacent spans into union spans to prevent partial prefix/suffix leaks
  spans.sort((a, b) => a.start - b.start)
  const mergedSpans: { start: number; end: number; isPrivateKey: boolean }[] = []
  for (const span of spans) {
    const last = mergedSpans[mergedSpans.length - 1]
    if (!last) {
      mergedSpans.push({ ...span })
      continue
    }
    if (span.start <= last.end) {
      last.end = Math.max(last.end, span.end)
      if (span.isPrivateKey) last.isPrivateKey = true
    } else {
      mergedSpans.push({ ...span })
    }
  }

  // Replace union spans descending by start offset
  mergedSpans.sort((a, b) => b.start - a.start)
  for (const span of mergedSpans) {
    const replacement = span.isPrivateKey ? '[private key redacted]' : '[redacted]'
    result = result.slice(0, span.start) + replacement + result.slice(span.end)
  }

  // 3. Fallback regex passes for standard structures & broad token fallbacks
  result = result
    .replace(/-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY(?: BLOCK)?-----|$)/g, '[private key redacted]')
    .replace(/\b(?:https?|postgres|postgresql|mongodb|redis|mysql):\/\/[^\s<>"']+/gi, (url) => redactUrl(url, valuesList))
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi, '[authorization redacted]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, (token) => {
      if (publishableTokens.has(token)) {
        return token
      }
      return '[redacted]'
    })
    .replace(/\b(?:gh[pousr]_[0-9a-zA-Z]{20,}|github_pat_[0-9a-zA-Z_]{20,})\b/g, '[redacted]')
    .replace(/\b(?:xox[baprs]-[0-9a-zA-Z-]{10,}|xoxe-[0-9a-zA-Z-]{10,}|xapp-[0-9a-zA-Z-]{10,})\b/g, '[redacted]')
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, '[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')

  // 4. Final pass with explicit sensitive values to ensure any remnants are eliminated
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
