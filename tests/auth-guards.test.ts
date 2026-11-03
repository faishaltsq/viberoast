import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

describe('Auth Guards and User Projection', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  })

  it('projects safe HallUser with GitHub provider and trusted avatar host', async () => {
    const { toHallUser } = await import('@/lib/auth/guards')

    const rawUser = {
      id: 'usr_123',
      email: 'secret_dev@example.com',
      app_metadata: { provider: 'github' },
      user_metadata: {
        full_name: 'Octo Developer',
        avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
      },
    }

    const projected = toHallUser(rawUser as unknown as User)
    expect(projected).toEqual({
      displayName: 'Octo Developer',
      avatarUrl: 'https://avatars.githubusercontent.com/u/123456?v=4',
      provider: 'github',
    })
    expect((projected as unknown as Record<string, unknown>).email).toBeUndefined()
  })

  it('projects safe HallUser with Google provider and trusted avatar host', async () => {
    const { toHallUser } = await import('@/lib/auth/guards')

    const rawUser = {
      id: 'usr_456',
      email: 'googler@gmail.com',
      app_metadata: { provider: 'google' },
      user_metadata: {
        name: 'Googler Person',
        picture: 'https://lh3.googleusercontent.com/a/ACg8ocI12345',
      },
    }

    const projected = toHallUser(rawUser as unknown as User)
    expect(projected).toEqual({
      displayName: 'Googler Person',
      avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocI12345',
      provider: 'google',
    })
  })

  it('rejects candidate names that look like email addresses and falls back to Member', async () => {
    const { toHallUser } = await import('@/lib/auth/guards')

    const rawUser = {
      id: 'usr_emailname',
      email: 'leaked@example.com',
      app_metadata: { provider: 'github' },
      user_metadata: {
        name: 'sneaky@evil.com',
      },
    }

    const projected = toHallUser(rawUser as unknown as User)
    expect(projected?.displayName).toBe('Member')
    expect(projected?.displayName).not.toContain('@')
  })

  it('bounds displayName length to 50 characters', async () => {
    const { toHallUser } = await import('@/lib/auth/guards')

    const longName = 'A'.repeat(100)
    const rawUser = {
      id: 'usr_longname',
      app_metadata: { provider: 'github' },
      user_metadata: {
        full_name: longName,
      },
    }

    const projected = toHallUser(rawUser as unknown as User)
    expect(projected?.displayName).toBe('A'.repeat(50))
    expect(projected?.displayName.length).toBe(50)
  })

  it('sanitizes untrusted provider strings to oauth', async () => {
    const { toHallUser } = await import('@/lib/auth/guards')

    const rawUser = {
      id: 'usr_weird_provider',
      app_metadata: { provider: 'discord_or_custom' },
      user_metadata: { name: 'Player' },
    }

    const projected = toHallUser(rawUser as unknown as User)
    expect(projected?.provider).toBe('oauth')
  })

  it('rejects avatar URLs on untrusted subdomains or non-https hosts', async () => {
    const { toHallUser } = await import('@/lib/auth/guards')

    // Subdomain on trusted host must be rejected
    const rawUserSubdomain = {
      id: 'usr_subdomain',
      app_metadata: { provider: 'github' },
      user_metadata: {
        name: 'User 1',
        avatar_url: 'https://evil.avatars.githubusercontent.com/u/1',
      },
    }
    expect(toHallUser(rawUserSubdomain as unknown as User)?.avatarUrl).toBeNull()

    // Non-https on trusted host must be rejected
    const rawUserHttp = {
      id: 'usr_http',
      app_metadata: { provider: 'github' },
      user_metadata: {
        name: 'User 2',
        avatar_url: 'http://avatars.githubusercontent.com/u/1',
      },
    }
    expect(toHallUser(rawUserHttp as unknown as User)?.avatarUrl).toBeNull()
  })

  it('never exposes email as displayName when name fields are missing', async () => {
    const { toHallUser } = await import('@/lib/auth/guards')

    const rawUser = {
      id: 'usr_noname',
      email: 'private_email@domain.com',
      app_metadata: { provider: 'github' },
      user_metadata: {},
    }

    const projected = toHallUser(rawUser as unknown as User)
    expect(projected?.displayName).toBe('Member')
    expect(projected?.displayName).not.toContain('private_email')
  })

  it('returns null when Supabase getUser() returns an error or empty session', async () => {
    const { getAuthenticatedUser } = await import('@/lib/auth/guards')

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'JWT expired', status: 401 },
        }),
      },
    }

    const user = await getAuthenticatedUser(mockSupabase as unknown as SupabaseClient)
    expect(user).toBeNull()
    expect(mockSupabase.auth.getUser).toHaveBeenCalled()
  })

  it('returns valid HallUser when Supabase getUser() succeeds', async () => {
    const { getAuthenticatedUser } = await import('@/lib/auth/guards')

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'usr_valid',
              email: 'valid@example.com',
              app_metadata: { provider: 'github' },
              user_metadata: { full_name: 'Verified User' },
            },
          },
          error: null,
        }),
      },
    }

    const user = await getAuthenticatedUser(mockSupabase as unknown as SupabaseClient)
    expect(user).toEqual({
      displayName: 'Verified User',
      avatarUrl: null,
      provider: 'github',
    })
  })
})
