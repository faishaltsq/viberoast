import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Supabase Auth Configuration and Trusted Origin', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reports unconfigured when environment variables are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')

    const { getSupabaseConfig, isAuthConfigured } = await import('@/lib/auth/config')
    expect(isAuthConfigured()).toBe(false)
    expect(getSupabaseConfig()).toBeNull()
  })

  it('rejects invalid Supabase URLs', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not-a-valid-url')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_key')

    const { getSupabaseConfig, isAuthConfigured } = await import('@/lib/auth/config')
    expect(isAuthConfigured()).toBe(false)
    expect(getSupabaseConfig()).toBeNull()
  })

  it('parses valid public Supabase configuration independently of AUTH_SITE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyzcompany.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_valid_123')
    vi.stubEnv('AUTH_SITE_URL', '')

    const { getSupabaseConfig, isAuthConfigured } = await import('@/lib/auth/config')
    expect(isAuthConfigured()).toBe(true)
    const config = getSupabaseConfig()
    expect(config).toEqual({
      url: 'https://xyzcompany.supabase.co',
      publishableKey: 'sb_publishable_valid_123',
    })
  })

  it('validates server trusted origin strictly', async () => {
    const { getTrustedServerOrigin } = await import('@/lib/auth/config')

    // Valid HTTPS origin
    vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev')
    expect(getTrustedServerOrigin()).toBe('https://sourcesanity.dev')

    // Trailing slash normalized
    vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev/')
    expect(getTrustedServerOrigin()).toBe('https://sourcesanity.dev')

    // Valid loopback HTTP
    vi.stubEnv('AUTH_SITE_URL', 'http://localhost:3000')
    expect(getTrustedServerOrigin()).toBe('http://localhost:3000')
    vi.stubEnv('AUTH_SITE_URL', 'http://127.0.0.1:3000')
    expect(getTrustedServerOrigin()).toBe('http://127.0.0.1:3000')
    vi.stubEnv('AUTH_SITE_URL', 'http://[::1]:3000')
    expect(getTrustedServerOrigin()).toBe('http://[::1]:3000')

    // Reject non-localhost HTTP
    vi.stubEnv('AUTH_SITE_URL', 'http://attacker.com')
    expect(getTrustedServerOrigin()).toBeNull()

    // Reject credentials
    vi.stubEnv('AUTH_SITE_URL', 'https://user:pass@sourcesanity.dev')
    expect(getTrustedServerOrigin()).toBeNull()

    // Reject paths
    vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev/some/path')
    expect(getTrustedServerOrigin()).toBeNull()

    // Reject search query and hash
    vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev?query=1')
    expect(getTrustedServerOrigin()).toBeNull()
    vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev#hash')
    expect(getTrustedServerOrigin()).toBeNull()

    // Missing AUTH_SITE_URL returns null
    vi.stubEnv('AUTH_SITE_URL', '')
    expect(getTrustedServerOrigin()).toBeNull()
  })

  it('computes server cookie options matching deployment protocol', async () => {
    const { isServerSecure, getServerCookieOptions } = await import('@/lib/auth/config')

    // HTTPS deployment: secure: true
    vi.stubEnv('AUTH_SITE_URL', 'https://sourcesanity.dev')
    expect(isServerSecure()).toBe(true)
    expect(getServerCookieOptions()).toEqual({
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: true,
    })

    // Local HTTP mock: secure: false
    vi.stubEnv('AUTH_SITE_URL', 'http://localhost:3000')
    expect(isServerSecure()).toBe(false)
    expect(getServerCookieOptions()).toEqual({
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: false,
    })

    // Unconfigured: secure: false
    vi.stubEnv('AUTH_SITE_URL', '')
    expect(isServerSecure()).toBe(false)
    expect(getServerCookieOptions()).toEqual({
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: false,
    })
  })

  it('createClient throws a sanitized error when unconfigured without leaking secrets', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')

    const { createClient } = await import('../lib/auth/client')
    expect(() => createClient()).toThrow(/not configured/i)
  })
})
