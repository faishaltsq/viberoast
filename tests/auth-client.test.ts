import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('Auth Client and Provider Constraints', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    vi.stubEnv('AUTH_SITE_URL', 'http://localhost:3000')
  })

  it('restricts identity scopes to minimal non-repo permissions', async () => {
    const { PROVIDER_SCOPES, ALLOWED_PROVIDERS } = await import('../lib/auth/client')

    expect(ALLOWED_PROVIDERS).toEqual(['github', 'google'])
    expect(PROVIDER_SCOPES.github).toBe('read:user user:email')
    expect(PROVIDER_SCOPES.github).not.toContain('repo')
    expect(PROVIDER_SCOPES.google).toBe('openid email profile')
    expect(PROVIDER_SCOPES.google).not.toContain('drive')
  })

  it('creates browser client with Supabase URL and publishable key', async () => {
    const { createClient } = await import('../lib/auth/client')
    const client = createClient()
    expect(client).toBeDefined()
    expect(client.auth).toBeDefined()
  })

  it('builds safe redirectTo callback with sanitized next path', async () => {
    const { getOAuthRedirectUrl } = await import('../lib/auth/client')

    const safeUrl = getOAuthRedirectUrl('http://localhost:3000', '/hall?lang=id')
    expect(safeUrl).toBe('http://localhost:3000/auth/callback?next=%2Fhall%3Flang%3Did')

    const untrustedUrl = getOAuthRedirectUrl('http://localhost:3000', 'https://evil.com')
    expect(untrustedUrl).toBe('http://localhost:3000/auth/callback?next=%2Fhall')
  })

  it('computes browser cookie options based on protocol and maintains browser-readable cookies', async () => {
    const { getBrowserCookieOptions } = await import('../lib/auth/client')

    // SSR / undefined window
    const ssrOptions = getBrowserCookieOptions()
    expect(ssrOptions).toEqual({
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: false,
    })

    // Browser HTTPS
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    const httpsOptions = getBrowserCookieOptions()
    expect(httpsOptions).toEqual({
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: true,
    })

    // Browser HTTP (local dev / mock)
    vi.stubGlobal('window', { location: { protocol: 'http:' } })
    const httpOptions = getBrowserCookieOptions()
    expect(httpOptions).toEqual({
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: false,
    })

    vi.unstubAllGlobals()
  })
})
