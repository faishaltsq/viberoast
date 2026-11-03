export interface SupabaseConfig {
  url: string
  publishableKey: string
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim()

  if (!url || !publishableKey) {
    return null
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
  } catch {
    return null
  }

  return {
    url,
    publishableKey,
  }
}

export function isAuthConfigured(): boolean {
  return getSupabaseConfig() !== null
}

export function getTrustedServerOrigin(): string | null {
  const raw = process.env.AUTH_SITE_URL?.trim()
  if (!raw) {
    return null
  }

  try {
    const parsed = new URL(raw)

    // Reject credentials, search query, and hash
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return null
    }

    // Path must be empty or '/'
    if (parsed.pathname !== '' && parsed.pathname !== '/') {
      return null
    }

    // Permit https origin, or http strictly for localhost / loopback
    const isLoopbackHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '[::1]' ||
        parsed.hostname === '::1')

    if (parsed.protocol !== 'https:' && !isLoopbackHttp) {
      return null
    }

    return parsed.origin
  } catch {
    return null
  }
}

export function isServerSecure(): boolean {
  const origin = getTrustedServerOrigin()
  return origin !== null && origin.startsWith('https:')
}

export function getServerCookieOptions(): {
  path: string
  sameSite: 'lax'
  httpOnly: false
  secure: boolean
} {
  return {
    path: '/',
    sameSite: 'lax',
    // Tradeoff: Supabase SSR browser client requires readable access to session tokens
    // for client-side event listeners and token refreshes via document.cookie.
    // Setting httpOnly: true breaks standard browser SDK integration.
    httpOnly: false,
    secure: isServerSecure(),
  }
}
