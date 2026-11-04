/**
 * Shared credential assignment parsing and redaction helper.
 *
 * Scans identifiers and assignment delimiters BEFORE consuming values:
 * 1. Boundary-delimiter regex strictly matches identifier + [=:] at actual identifier boundary (?<![a-zA-Z0-9_$])
 * 2. If identifier contains credential context (isCredentialIdentifier), an anchored complete
 *    value parser consumes quotes/escapes or unquoted punctuation.
 * 3. Outer non-credential wrappers (e.g. `const config = {databasePassword: "..."}`) NEVER
 *    consume nested credential identifiers.
 * 4. Redaction operates descending by parsed span positions, avoiding index shifts and regex re-execution.
 */

export interface SecretAssignment {
  raw: string
  identifier: string
  openQuote: string
  delimiter: string
  value: string
  start: number
  end: number
}

export const CREDENTIAL_IDENTIFIER_PATTERN =
  /(?:api[_-]?(?:key|secret)|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|passphrase|(?:^|[_-])pass(?:[_-]|$)|[a-z]Pass(?:[A-Z0-9]|$)|secret|authorization|client[_-]?secret|private[_-]?(?:key|token)|session[_-]?id|cookie|webhook[_-]?secret|aws[_-]?(?:secret[_-]?(?:access[_-]?)?key|key[_-]?id)|(?:^|[_-])token(?:[_-]|$)|[a-z]Token(?:[A-Z0-9]|$)|^token$)/i

export function isCredentialIdentifier(identifier: string): boolean {
  if (!identifier || typeof identifier !== 'string') return false
  return CREDENTIAL_IDENTIFIER_PATTERN.test(identifier)
}

/**
 * Scans only identifier + [=:] starting strictly at actual identifier boundaries.
 * Does NOT consume the value, so outer non-credential wrappers never hide nested credentials.
 */
export const IDENTIFIER_DELIMITER_REGEX =
  /(?<![a-zA-Z0-9_$])(?:(["'])([a-zA-Z0-9_$-]+)\1|([a-zA-Z0-9_$]+))\s*([=:])/g

export const ASSIGNMENT_PARSER_REGEX = IDENTIFIER_DELIMITER_REGEX

/**
 * Anchored complete value parser from position immediately after delimiter.
 */
export const ANCHORED_VALUE_REGEX =
  /^\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`|([^\s"'<>,;}]+))/

export const SAFE_SECRET_ASSIGNMENT_PATTERN =
  /(?<![a-zA-Z0-9_$])(?:(["']?)(?:[a-zA-Z0-9_$]*?(?:api[_-]?(?:key|secret)|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|passphrase|secret|client[_-]?secret|webhook[_-]?secret|private[_-]?(?:key|token)|session[_-]?id|cookie|aws[_-]?(?:secret[_-]?(?:access[_-]?)?key|key[_-]?id))|token|authorization)\1)["']?\s*[=:]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'<>,;}]+)/i

export function parseSecretAssignments(source: string): SecretAssignment[] {
  if (!source || typeof source !== 'string') return []
  const results: SecretAssignment[] = []
  const scanner = new RegExp(IDENTIFIER_DELIMITER_REGEX.source, 'g')

  let match: RegExpExecArray | null
  while ((match = scanner.exec(source)) !== null) {
    const openQuote = match[1] ?? ''
    const identifier = match[2] ?? match[3] ?? ''
    const delimiter = match[4] ?? '='
    const start = match.index
    const delimEnd = start + match[0].length

    if (!isCredentialIdentifier(identifier)) {
      // Non-credential identifier (e.g. `config =`): do not consume value
      continue
    }

    // Credential identifier: anchored complete value parse from delimEnd
    const rest = source.slice(delimEnd)
    const valMatch = ANCHORED_VALUE_REGEX.exec(rest)
    if (!valMatch) continue

    const value = valMatch[1] ?? valMatch[2] ?? valMatch[3] ?? valMatch[4] ?? ''
    const end = delimEnd + valMatch[0].length
    const raw = source.slice(start, end)

    results.push({
      raw,
      identifier,
      openQuote,
      delimiter,
      value,
      start,
      end,
    })

    // Advance scanner past consumed value
    scanner.lastIndex = end
  }

  return results
}

export function redactSecretAssignments(text: string): string {
  if (!text || typeof text !== 'string') return ''
  const assignments = parseSecretAssignments(text)
  if (assignments.length === 0) return text

  const sorted = [...assignments].sort((a, b) => b.start - a.start)
  let result = text
  for (const span of sorted) {
    const q = span.openQuote
    const replacement = `${q}${span.identifier}${q}=[redacted]`
    result = result.slice(0, span.start) + replacement + result.slice(span.end)
  }
  return result
}
