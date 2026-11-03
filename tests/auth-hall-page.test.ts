import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockRedirect = vi.fn((url: string) => {
  const error = new Error(`NEXT_REDIRECT: ${url}`) as Error & { digest?: string }
  error.digest = `NEXT_REDIRECT;replace;${url};307;;`
  throw error
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}))

let mockCookieStore = {
  get: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}))

let mockAuthenticatedUser: { displayName: string; avatarUrl: string | null; provider: string } | null = null

vi.mock('@/lib/auth/guards', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/guards')>()
  return {
    ...actual,
    getAuthenticatedUser: vi.fn(async () => mockAuthenticatedUser),
  }
})

vi.mock('@/lib/hall/server', () => ({
  loadHallCases: vi.fn(() => [
    {
      id: 'case-01',
      slug: 'case-01',
      title: { en: 'Mock Case', id: 'Kasus Tiruan' },
    },
  ]),
}))

describe('Hall Server Page Guard and Login Locale Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedUser = null
    mockCookieStore = {
      get: vi.fn(),
    }
  })

  it('redirects anonymous visitors to login with locale in both query and next destination', async () => {
    mockAuthenticatedUser = null

    const { default: HallPage } = await import('@/app/hall/page')

    await expect(
      HallPage({
        searchParams: Promise.resolve({
          lang: 'id',
          collection: 'shame',
          case: 'mock-01',
        }),
      })
    ).rejects.toThrow(/NEXT_REDIRECT/)

    expect(mockRedirect).toHaveBeenCalledWith(
      '/auth/login?lang=id&next=%2Fhall%3Flang%3Did%26collection%3Dshame%26case%3Dmock-01'
    )
  })

  it('sanitizes open-redirect attempts in next destination before redirecting to login', async () => {
    mockAuthenticatedUser = null

    const { default: HallPage } = await import('@/app/hall/page')

    await expect(
      HallPage({
        searchParams: Promise.resolve({
          collection: 'evil<script>',
          case: '../../traversal',
        }),
      })
    ).rejects.toThrow(/NEXT_REDIRECT/)

    expect(mockRedirect).toHaveBeenCalledWith(
      '/auth/login?lang=en&next=%2Fhall%3Flang%3Den'
    )
  })

  it('renders HallExperience with loaded cases and user when session is valid', async () => {
    mockAuthenticatedUser = {
      displayName: 'Alice Engineer',
      avatarUrl: 'https://avatars.githubusercontent.com/u/999',
      provider: 'github',
    }

    const { default: HallPage } = await import('@/app/hall/page')

    const result = await HallPage({
      searchParams: Promise.resolve({
        lang: 'id',
        collection: 'vibes',
      }),
    })

    expect(result).toBeDefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('respects sourcesanity-language cookie when query parameter is omitted', async () => {
    mockAuthenticatedUser = {
      displayName: 'Bob Builder',
      avatarUrl: null,
      provider: 'google',
    }

    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === 'sourcesanity-language') {
        return { name: 'sourcesanity-language', value: 'id' }
      }
      return undefined
    })

    const { default: HallPage } = await import('@/app/hall/page')

    const result = await HallPage({
      searchParams: Promise.resolve({}),
    })

    expect(result).toBeDefined()
    expect(result.props.initialLanguage).toBe('id')
  })

  it('LoginPage derives language from next destination when explicit lang query is omitted', async () => {
    const { default: LoginPage } = await import('@/app/auth/login/page')

    const result = await LoginPage({
      searchParams: Promise.resolve({
        next: '/hall?lang=id&collection=shame',
      }),
    })

    expect(result).toBeDefined()
    expect(result.props.children.props.language).toBe('id')
  })

  it('LoginPage maps validated reason=expired to error=expired while preserving next and locale', async () => {
    const { default: LoginPage } = await import('@/app/auth/login/page')

    const result = await LoginPage({
      searchParams: Promise.resolve({
        reason: 'expired',
        next: '/hall?lang=id&case=case-01',
      }),
    })

    expect(result).toBeDefined()
    expect(result.props.children.props.error).toBe('expired')
    expect(result.props.children.props.language).toBe('id')
    expect(result.props.children.props.next).toBe('/hall?lang=id&case=case-01')
  })

  it('exports privacy-focused metadata with titles and noindex robots for Hall and Login pages', async () => {
    const { metadata: hallMetadata } = await import('@/app/hall/page')
    expect(hallMetadata.title).toBe('Hall of Shame & Vibes | SourceSanity')
    expect(hallMetadata.robots).toEqual({ index: false, follow: false })

    const { metadata: loginMetadata } = await import('@/app/auth/login/page')
    expect(loginMetadata.title).toBe('Sign in | SourceSanity')
    expect(loginMetadata.robots).toEqual({ index: false, follow: false })
  })

  it('disables OAuth on LoginPage when AUTH_SITE_URL is missing or invalid, avoiding raw 503 journey', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')

    // Missing AUTH_SITE_URL
    vi.stubEnv('AUTH_SITE_URL', '')
    const { default: LoginPage } = await import('@/app/auth/login/page')

    const resultMissing = await LoginPage({
      searchParams: Promise.resolve({}),
    })
    expect(resultMissing).toBeDefined()
    expect(resultMissing.props.children.props.configured).toBe(false)

    // Valid AUTH_SITE_URL enables OAuth
    vi.stubEnv('AUTH_SITE_URL', 'http://localhost:3000')
    const resultConfigured = await LoginPage({
      searchParams: Promise.resolve({}),
    })
    expect(resultConfigured.props.children.props.configured).toBe(true)

    // Invalid AUTH_SITE_URL (non-loopback HTTP) disables OAuth
    vi.stubEnv('AUTH_SITE_URL', 'http://attacker.com')
    const resultInvalid = await LoginPage({
      searchParams: Promise.resolve({}),
    })
    expect(resultInvalid.props.children.props.configured).toBe(false)
  })
})
