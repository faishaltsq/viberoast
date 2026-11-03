export function sanitizeHallRedirect(target?: string | null): string {
  if (!target || typeof target !== 'string') {
    return '/hall'
  }

  // Reject control characters, CR, LF, null bytes, backslashes
  if (/[\r\n\0\\]/.test(target)) {
    return '/hall'
  }

  // Reject protocol-relative or scheme-relative attempts
  if (target.startsWith('//') || target.includes('://')) {
    return '/hall'
  }

  try {
    const dummyBase = 'http://localhost'
    const parsed = new URL(target, dummyBase)

    // Ensure origin was not spoofed
    if (parsed.origin !== dummyBase) {
      return '/hall'
    }

    // Must strictly be the /hall path, not subpaths or traversal
    if (parsed.pathname !== '/hall') {
      return '/hall'
    }

    const cleanParams = new URLSearchParams()

    const lang = parsed.searchParams.get('lang')
    if (lang === 'en' || lang === 'id') {
      cleanParams.set('lang', lang)
    }

    const collection = parsed.searchParams.get('collection')
    if (collection === 'shame' || collection === 'vibes') {
      cleanParams.set('collection', collection)
    }

    const caseId = parsed.searchParams.get('case')
    if (caseId && /^[a-zA-Z0-9_-]{1,64}$/.test(caseId)) {
      cleanParams.set('case', caseId)
    }

    const query = cleanParams.toString()
    return query ? `/hall?${query}` : '/hall'
  } catch {
    return '/hall'
  }
}
