const SECRET_ASSIGNMENT = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|password|passwd|secret|client[_-]?secret|private[_-]?key|session[_-]?id|cookie)["']?\s*[=:]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"'<>,;}]+)/gi

export const SENSITIVE_TEXT_PATTERN = new RegExp([
  SECRET_ASSIGNMENT.source,
  String.raw`-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----`,
  String.raw`\b(?:Bearer|Basic)\s+\S+`,
  String.raw`\b(?:sk-[\w-]{12,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[A-Z0-9]{16}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b`,
  String.raw`\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`,
].join('|'), 'i')

export function redactUrl(input: string): string {
  try {
    const url = new URL(input)
    if (!['http:', 'https:'].includes(url.protocol)) return '[non-http URL]'
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    return url.href.slice(0, 2048)
  } catch { return '[invalid URL]' }
}

export function redactSecrets(text: string): string {
  return text
    .replace(/-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+)?PRIVATE KEY-----/g, '[private key redacted]')
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => redactUrl(url))
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi, '[authorization redacted]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, '[redacted]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}
