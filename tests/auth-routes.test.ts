import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
    get: vi.fn(),
  })),
}))

const mockExchangeCodeForSession = vi.fn()
const mockSignOut = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  })),
}))

describe('Auth Route Handlers and Proxy', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    mockExchangeCodeForSession.mockReset()
    mockSignOut.mockReset()
    mockGetUser.mockReset()

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    vi.stubEnv('AUTH_SITE_URL', 'http://localhost:3000')
  })

  describe('GET /auth/callback', () => {
    it('returns 503 Service Unavailable when AUTH_SITE_URL is unconfigured', async () => {
      vi.stubEnv('AUTH_SITE_URL', '')

      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest('http://localhost:3000/auth/callback?code=123')
      const response = await GET(request)

      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('redirects to login with error when code is missing', async () => {
      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest('http://localhost:3000/auth/callback')
      const response = await GET(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/login?error=missing_code')
      expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('redirects to login with error when OAuth provider returns error parameter', async () => {
      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?error=access_denied&error_description=User%20denied'
      )
      const response = await GET(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/login?error=oauth_provider_error')
      expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('redirects to login, clears cookies, and preserves next+lang when PKCE code exchange fails', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Invalid PKCE code verifier' },
      })

      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?code=bad_code&next=%2Fhall%3Flang%3Did%26collection%3Dvibes',
        {
          headers: { cookie: 'sb-temp-token=bad; other=1' },
        }
      )
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location') || ''
      expect(location).toContain('/auth/login?error=auth_exchange_failed')
      expect(location).toContain('next=%2Fhall%3Flang%3Did%26collection%3Dvibes')
      expect(location).toContain('lang=id')
      expect(response.headers.get('cache-control')).toContain('no-store')
      const setCookies = response.headers.getSetCookie()
      const clearCookie = setCookies.find((c) => c.includes('sb-temp-token='))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Path=/')
      expect(clearCookie).toContain('SameSite=lax')
      expect(clearCookie).not.toContain('Secure')
    })

    it('deletes cookies with Secure flag on callback error when deployed to HTTPS', async () => {
      vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev')

      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest('https://sourcesanity.dev/auth/callback?error=access_denied', {
        headers: { cookie: 'sb-temp-token=bad;' },
      })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const setCookies = response.headers.getSetCookie()
      const clearCookie = setCookies.find((c) => c.includes('sb-temp-token='))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Path=/')
      expect(clearCookie).toContain('SameSite=lax')
      expect(clearCookie).toContain('Secure')
    })

    it('catches thrown external exceptions from exchangeCodeForSession gracefully', async () => {
      mockExchangeCodeForSession.mockRejectedValueOnce(new Error('Network transport crash'))

      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest('http://localhost:3000/auth/callback?code=crashed_code')
      const response = await GET(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/login?error=auth_exchange_failed')
      expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('handles missing access_token in session data as exchange failure', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: {} },
        error: null,
      })

      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest('http://localhost:3000/auth/callback?code=no_access_token')
      const response = await GET(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/login?error=auth_exchange_failed')
    })

    it('successfully exchanges code and redirects to sanitized internal destination', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: {
          session: { access_token: 'fake_jwt' },
          user: { id: 'usr_123' },
        },
        error: null,
      })

      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?code=valid_code&next=%2Fhall%3Flang%3Did%26collection%3Dshame'
      )
      const response = await GET(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/hall?lang=id&collection=shame'
      )
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid_code')
    })

    it('sanitizes open-redirect next parameter to /hall on successful exchange', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: { access_token: 'fake' }, user: { id: 'u1' } },
        error: null,
      })

      const { GET } = await import('@/app/auth/callback/route')
      const request = new NextRequest(
        'http://localhost:3000/auth/callback?code=valid_code&next=https%3A%2F%2Fevil.com'
      )
      const response = await GET(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/hall')
    })
  })

  describe('POST /auth/logout', () => {
    it('returns 503 Service Unavailable when AUTH_SITE_URL is unconfigured', async () => {
      vi.stubEnv('AUTH_SITE_URL', '')

      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('http://localhost:3000/auth/logout', { method: 'POST' })
      const response = await POST(request)

      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('rejects GET requests with 405 Method Not Allowed', async () => {
      const { GET } = await import('@/app/auth/logout/route')
      const response = await GET()
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
    })

    it('rejects cross-origin POST logout requests with 403 Forbidden', async () => {
      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.com',
          host: 'localhost:3000',
        },
      })
      const response = await POST(request)
      expect(response.status).toBe(403)
      expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('rejects immediately when Origin is present and invalid without falling back to Referer', async () => {
      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.com',
          referer: 'http://localhost:3000/hall',
        },
      })
      const response = await POST(request)
      expect(response.status).toBe(403)
      expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('accepts valid Referer only when Origin header is completely absent', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null })

      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          referer: 'http://localhost:3000/hall',
        },
      })
      const response = await POST(request)
      expect(response.status).toBe(303)
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    })

    it('signs out and clears cookies on valid same-origin POST', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null })

      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
          cookie: 'sb-access-token=xyz; other=val',
        },
      })
      const response = await POST(request)

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('http://localhost:3000/auth/login')
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })

      const setCookies = response.headers.getSetCookie()
      const clearCookie = setCookies.find((c) => c.includes('sb-access-token='))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Path=/')
      expect(clearCookie).toContain('SameSite=lax')
      expect(clearCookie).not.toContain('Secure')
    })

    it('signs out and sets Secure flag on cookie deletion when deployed to HTTPS', async () => {
      vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev')
      mockSignOut.mockResolvedValueOnce({ error: null })

      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('https://sourcesanity.dev/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://sourcesanity.dev',
          cookie: 'sb-access-token=xyz;',
        },
      })
      const response = await POST(request)

      expect(response.status).toBe(303)
      const setCookies = response.headers.getSetCookie()
      const clearCookie = setCookies.find((c) => c.includes('sb-access-token='))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Path=/')
      expect(clearCookie).toContain('SameSite=lax')
      expect(clearCookie).toContain('Secure')
    })

    it('clears cookies and redirects to login with error=logout_unconfirmed when signOut returns error', async () => {
      mockSignOut.mockResolvedValueOnce({
        error: { message: 'Failed to revoke token' },
      })

      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'sb-access-token=xyz;',
        },
      })
      const response = await POST(request)

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/auth/login?error=logout_unconfirmed'
      )
      expect(response.headers.get('cache-control')).toContain('no-store')

      const setCookies = response.headers.getSetCookie()
      const clearCookie = setCookies.find((c) => c.includes('sb-access-token='))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Path=/')
    })

    it('clears cookies and redirects to login with error=logout_unconfirmed when signOut throws exception', async () => {
      mockSignOut.mockRejectedValueOnce(new Error('Network failure'))

      const { POST } = await import('@/app/auth/logout/route')
      const request = new NextRequest('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'sb-access-token=xyz;',
        },
      })
      const response = await POST(request)

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/auth/login?error=logout_unconfirmed'
      )
      expect(response.headers.get('cache-control')).toContain('no-store')

      const setCookies = response.headers.getSetCookie()
      const clearCookie = setCookies.find((c) => c.includes('sb-access-token='))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Path=/')
    })
  })

  describe('GET /api/hall', () => {
    it('returns 401 Unauthorized with no-store headers when unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })

      const { GET } = await import('@/app/api/hall/route')
      const response = await GET()

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('returns 200 with cases when authenticated', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr_valid',
            app_metadata: { provider: 'github' },
            user_metadata: { full_name: 'Auth User' },
          },
        },
        error: null,
      })

      const { GET } = await import('@/app/api/hall/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('cases')
      expect(response.headers.get('cache-control')).toContain('no-store')
    })
  })

  describe('proxy.ts', () => {
    it('adds no-store headers and refreshes session on hall and auth routes', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      })

      const { proxy, config } = await import('@/proxy')
      expect(config.matcher).toBeDefined()

      const request = new NextRequest('http://localhost:3000/hall')
      const response = await proxy(request)

      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(mockGetUser).toHaveBeenCalled()
    })
  })
})
