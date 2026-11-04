import { validateHallCase } from './validate'
import type { HallCase } from './types'

const URL_PATTERN = /https?:\/\/|ftp:\/\/|git@|www\.[a-z0-9-]+/i
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const COMMIT_SHA_PATTERN = /\b[0-9a-fA-F]{40}\b|\b[0-9a-fA-F]{64}\b/
const SECRET_TOKEN_PATTERNS = [
  /ghp_[a-zA-Z0-9]{20,}/,
  /gho_[a-zA-Z0-9]{20,}/,
  /github_pat_[a-zA-Z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}/,
  /\b(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{10,}\b/,
  /\bsk-[a-zA-Z0-9_-]{15,}\b/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
]
const FILESYSTEM_PATH_PATTERNS = [
  /[a-zA-Z]:\\[^ \t\r\n]+/,
  /(?:^|[\s"'])(\/(?:Users|home|etc|var|tmp|opt|root|usr|private)\/[^\s"']+)/,
]

function scanString(value: string, path: string): void {
  if (URL_PATTERN.test(value)) {
    throw new Error(`Disallowed content in Hall case: URL pattern detected in ${path}`)
  }
  if (EMAIL_PATTERN.test(value)) {
    throw new Error(`Disallowed content in Hall case: Email address detected in ${path}`)
  }
  if (COMMIT_SHA_PATTERN.test(value)) {
    throw new Error(`Disallowed content in Hall case: Git commit SHA detected in ${path}`)
  }
  for (const pattern of SECRET_TOKEN_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`Disallowed content in Hall case: Secret or token detected in ${path}`)
    }
  }
  for (const pattern of FILESYSTEM_PATH_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`Disallowed content in Hall case: Filesystem path detected in ${path}`)
    }
  }
}

function deepScanValues(obj: unknown, path = ''): void {
  if (typeof obj === 'string') {
    scanString(obj, path)
    return
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => deepScanValues(item, `${path}[${index}]`))
    return
  }
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      deepScanValues(value, path ? `${path}.${key}` : key)
    }
  }
}

export function sanitizeHallCase(input: unknown): HallCase {
  const validated = validateHallCase(input)
  deepScanValues(validated)
  return validated
}
