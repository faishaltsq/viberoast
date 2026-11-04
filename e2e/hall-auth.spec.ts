import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'
import {
  setAuthenticatedCookie,
  setExpiredCookie,
  setForgedCookie,
} from './support/auth-fixtures'
import {
  DETERMINISTIC_TOKENS,
  MOCK_GITHUB_USER,
  MOCK_GOOGLE_USER,
} from './support/mock-auth'

test.describe('SourceSanity Hall Authentication & Access Control', () => {
  test('anonymous visitor to /hall is redirected to /auth/login with safe next query', async ({ page }) => {
    await page.goto('/hall')
    await page.waitForURL(/\/auth\/login/)

    const url = new URL(page.url())
    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('next')).toContain('/hall')

    // Login panel is rendered with exact heading, eyebrow, buttons, and back link
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SourceSanity Hall')
    await expect(page.getByText("BRO CODE'S MEMBERS-ONLY CORNER")).toBeVisible()
    await expect(page.getByRole('link', { name: '← Back to SourceSanity' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  })

  test('anonymous visitor to /hall with collection and lang parameters preserves them in next parameter', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'sourcesanity-language',
        value: 'id',
        domain: '127.0.0.1',
        path: '/',
      },
    ])

    await page.goto('/hall?lang=id&collection=shame')
    await page.waitForURL(/\/auth\/login/)

    const url = new URL(page.url())
    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('next')).toContain('/hall')

    // Localized login view in Indonesian
    await expect(page.getByText('SUDUT KHUSUS ANGGOTA BRO CODE')).toBeVisible()
    await expect(page.getByRole('link', { name: '← Kembali ke SourceSanity' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lanjutkan dengan GitHub' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible()
  })

  test('anonymous request to /api/hall returns 401 and strict no-store headers', async ({ request }) => {
    const response = await request.get('/api/hall')
    expect(response.status()).toBe(401)

    const cacheControl = response.headers()['cache-control'] || ''
    expect(cacheControl).toContain('no-store')
    expect(cacheControl).toContain('no-cache')

    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
    expect(body.cases).toBeUndefined()
  })

  test('callback redirects to login with error when authorization code is missing', async ({ page }) => {
    await page.goto('/auth/callback')
    await page.waitForURL(/\/auth\/login/)
    expect(page.url()).toContain('/auth/login?error=missing_code')
    await expect(page.getByRole('alert').filter({ hasText: /Notice|Perhatian/i })).toBeVisible()
  })

  test('callback redirects to login with error when OAuth provider returns error parameter', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=User%20canceled')
    await page.waitForURL(/\/auth\/login/)
    expect(page.url()).toContain('/auth/login?error=oauth_provider_error')
    await expect(page.getByRole('alert').filter({ hasText: /Notice|Perhatian/i })).toBeVisible()
  })

  test('login flow rejects open-redirect destination and redirects to safe internal /hall', async ({ page }) => {
    // Start login with an external phishing URL in next parameter
    await page.goto('/auth/login?next=https%3A%2F%2Fevil-phishing.com%2Fsteal')

    const githubBtn = page.getByRole('button', { name: /Continue with GitHub|Lanjutkan dengan GitHub/ })
    await githubBtn.click()

    // Navigates through mock OAuth back to application
    await page.waitForURL(/\/hall/)

    const url = new URL(page.url())
    expect(url.origin).toBe('http://127.0.0.1:3300')
    expect(url.pathname).toBe('/hall')
    expect(url.search).toBe('')
  })

  test('login flow rejects protocol-relative destination and redirects to safe internal /hall', async ({ page }) => {
    await page.goto('/auth/login?next=%2F%2Fevil.com%2Fhack')

    const githubBtn = page.getByRole('button', { name: /Continue with GitHub|Lanjutkan dengan GitHub/ })
    await githubBtn.click()

    await page.waitForURL(/\/hall/)

    const url = new URL(page.url())
    expect(url.origin).toBe('http://127.0.0.1:3300')
    expect(url.pathname).toBe('/hall')
  })

  test('full browser GitHub OAuth PKCE flow authenticates user into /hall', async ({ page }) => {
    await page.goto('/auth/login?next=%2Fhall')

    const githubBtn = page.getByRole('button', { name: /Continue with GitHub|Lanjutkan dengan GitHub/ })
    await expect(githubBtn).toBeVisible()

    // Click GitHub provider start
    await githubBtn.click()

    // Real browser navigation: Login -> Mock Supabase Authorize -> App Callback -> /hall
    await page.waitForURL(/\/hall/)
    expect(page.url()).toContain('/hall')

    // Verified authenticated session rendered with user menu
    const userMenu = page.getByLabel(/User menu|Menu pengguna/)
    await expect(userMenu).toBeVisible()
    await expect(page.getByText('Octo Developer')).toBeVisible()
    await expect(page.getByText('github')).toBeVisible()

    // Crucial privacy rule: NO user email anywhere in page DOM or text
    const pageContent = await page.content()
    expect(pageContent).not.toContain(MOCK_GITHUB_USER.email)
    expect(pageContent).not.toContain('octo.tester@sourcesanity.test')
  })

  test('full browser Google OAuth PKCE flow authenticates user into /hall', async ({ page }) => {
    await page.goto('/auth/login?next=%2Fhall')

    const googleBtn = page.getByRole('button', { name: /Continue with Google|Lanjutkan dengan Google/ })
    await expect(googleBtn).toBeVisible()

    // Click Google provider start
    await googleBtn.click()

    // Navigates through OAuth dance to /hall
    await page.waitForURL(/\/hall/)
    expect(page.url()).toContain('/hall')

    const userMenu = page.getByLabel(/User menu|Menu pengguna/)
    await expect(userMenu).toBeVisible()
    await expect(page.getByText('Googler Person')).toBeVisible()
    await expect(page.getByText('google', { exact: true })).toBeVisible()

    // Privacy rule: NO user email exposed
    const pageContent = await page.content()
    expect(pageContent).not.toContain(MOCK_GOOGLE_USER.email)
    expect(pageContent).not.toContain('googler.tester@sourcesanity.test')
  })

  test('authenticated restore with valid session cookie displays user identity and hall cases', async ({ page, context }) => {
    await setAuthenticatedCookie(context, {
      user: MOCK_GITHUB_USER,
      token: DETERMINISTIC_TOKENS.GITHUB,
    })

    await page.goto('/hall')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hall of/i)

    // User identity displayed
    await expect(page.getByText('Octo Developer')).toBeVisible()

    // API /api/hall also works for authenticated session
    const apiRes = await page.request.get('/api/hall')
    expect(apiRes.status()).toBe(200)
    const apiData = await apiRes.json()
    expect(Array.isArray(apiData.cases)).toBe(true)
    expect(apiData.cases.length).toBeGreaterThanOrEqual(6)

    // Verify Hall payload never includes email addresses
    const rawApiPayload = JSON.stringify(apiData)
    expect(rawApiPayload).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  })

  test('POST /auth/logout clears session cookies and prevents subsequent /hall access', async ({ page, context }) => {
    await page.route('**/auth/logout', async route => {
      const response = await route.fetch({
        maxRedirects: 0,
        headers: {
          ...route.request().headers(),
          origin: 'http://127.0.0.1:3300',
        },
      })
      await route.fulfill({ response })
    })

    const logoutToken = `logout-token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const logoutUser = {
      ...MOCK_GITHUB_USER,
      id: 'd2000000-0000-4000-8000-000000000004',
      user_metadata: { full_name: 'Octo Developer', user_name: 'octodev' },
    }

    await page.request.post('http://127.0.0.1:3301/__test/issue-token', {
      data: { token: logoutToken, user: logoutUser },
    })

    await setAuthenticatedCookie(context, {
      user: logoutUser,
      token: logoutToken,
    })

    await page.goto('/hall')
    await expect(page.getByText('Octo Developer')).toBeVisible()

    // Click sign out button inside UserMenu
    const logoutBtn = page.getByRole('button', { name: /Sign out|Keluar/i })
    await expect(logoutBtn).toBeVisible()
    await logoutBtn.click()

    // Redirects to login
    await page.waitForURL(/\/auth\/login/)
    expect(page.url()).toContain('/auth/login')

    // Navigating back to /hall must redirect to login
    await page.goto('/hall')
    await page.waitForURL(/\/auth\/login/)
    expect(page.url()).toContain('/auth/login')
  })

  test('expired session cookie is rejected by server guard and redirects to login', async ({ page, context }) => {
    await setExpiredCookie(context)

    await page.goto('/hall')
    await page.waitForURL(/\/auth\/login/)
    expect(page.url()).toContain('/auth/login')
  })

  test('in-page session expiry recovery detects 401 and shows recoverable login state', async ({ page, context }) => {
    // Generate a dedicated dynamic token for this test to avoid shared state
    const dynamicToken = `dynamic-expiry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const dynamicUser = { ...MOCK_GITHUB_USER, id: 'd1000000-0000-4000-8000-000000000003', user_metadata: { full_name: 'Expiring User' } }

    // Seed dedicated token in mock server
    await page.request.post('http://127.0.0.1:3301/__test/issue-token', {
      data: {
        token: dynamicToken,
        user: dynamicUser,
      },
    })

    await setAuthenticatedCookie(context, {
      user: dynamicUser,
      token: dynamicToken,
    })

    await page.goto('/hall')
    await expect(page.getByText('Expiring User')).toBeVisible()
    await expect(page.locator('#hall-case-grid')).toBeVisible()

    // Explicitly revoke/expire this specific token on mock auth server
    await page.request.post('http://127.0.0.1:3301/__test/expire', {
      data: { token: dynamicToken },
    })

    // Calling /api/hall now returns 401
    const checkRes = await page.request.get('/api/hall')
    expect(checkRes.status()).toBe(401)

    // Trigger visibilitychange event to prompt immediate in-page session check
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Assert automatic redirect to login with reason=expired
    await page.waitForURL(/\/auth\/login\?.*reason=expired/)
    expect(page.url()).toContain('/auth/login')
    expect(page.url()).toContain('reason=expired')

    // Assert session expired alert notice is displayed to the user
    const notice = page.getByRole('main').getByRole('alert')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(/Your session has expired|Sesi Anda telah berakhir/i)

    // Assert Hall gallery and authenticated user menu are hidden
    await expect(page.locator('#hall-case-grid')).toHaveCount(0)
    await expect(page.getByText('Expiring User')).toHaveCount(0)
  })

  test('login panel handles reason=expired query parameter and displays session expired notice', async ({ page }) => {
    await page.goto('/auth/login?reason=expired&next=%2Fhall')
    const notice = page.getByRole('main').getByRole('alert')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(/Your session has expired|Sesi Anda telah berakhir/i)
  })

  test('forged or tampered cookies are strictly rejected by server guard', async ({ page, context }) => {
    await setForgedCookie(context)

    await page.goto('/hall')
    await page.waitForURL(/\/auth\/login/)
    expect(page.url()).toContain('/auth/login')

    const apiRes = await page.request.get('/api/hall')
    expect(apiRes.status()).toBe(401)
  })

  test('mock auth PKCE token response enforces S256 challenge, single-use, and returns valid session and user UUID IDs', async ({ request }) => {
    // 1. Authorize fails if PKCE code_challenge is missing
    const noChallengeRes = await request.get('http://127.0.0.1:3301/auth/v1/authorize?provider=github', {
      maxRedirects: 0,
    })
    expect(noChallengeRes.status()).toBe(400)
    const noChallengeBody = await noChallengeRes.json()
    expect(noChallengeBody.error).toBe('invalid_request')

    // 2. Authorize fails for unsupported providers
    const unsupportedRes = await request.get('http://127.0.0.1:3301/auth/v1/authorize?provider=unsupported_oauth&code_challenge=test', {
      maxRedirects: 0,
    })
    expect(unsupportedRes.status()).toBe(400)
    const unsupportedBody = await unsupportedRes.json()
    expect(unsupportedBody.error).toBe('unsupported_provider')

    // 3. Generate a known verifier and S256 challenge
    const testVerifier = 'test-verifier-abcdefghijklmnopqrstuvwxyz-0123456789'
    const testChallenge = createHash('sha256').update(testVerifier).digest('base64url')

    // 4. Obtain fresh authorization code from mock auth
    const authRes = await request.get(`http://127.0.0.1:3301/auth/v1/authorize?provider=github&code_challenge=${testChallenge}&code_challenge_method=s256&redirect_to=http://127.0.0.1:3300/auth/callback`, {
      maxRedirects: 0,
    })
    expect(authRes.status()).toBe(302)
    const location = authRes.headers().location
    expect(location).toContain('code=')
    const authCode = new URL(location!).searchParams.get('code')!
    expect(authCode).toBeTruthy()

    // 5. Prove wrong verifier rejection
    const wrongVerifierRes = await request.post('http://127.0.0.1:3301/auth/v1/token?grant_type=pkce', {
      data: {
        auth_code: authCode,
        code_verifier: 'incorrect-verifier-value',
      },
    })
    expect(wrongVerifierRes.status()).toBe(400)
    const wrongBody = await wrongVerifierRes.json()
    expect(wrongBody.error).toBe('invalid_grant')

    // 6. Since single-use is enforced, retrying with the same authCode also fails
    const consumedRetryRes = await request.post('http://127.0.0.1:3301/auth/v1/token?grant_type=pkce', {
      data: {
        auth_code: authCode,
        code_verifier: testVerifier,
      },
    })
    expect(consumedRetryRes.status()).toBe(400)

    // 7. Obtain another fresh authorization code with the same valid challenge
    const authRes2 = await request.get(`http://127.0.0.1:3301/auth/v1/authorize?provider=github&code_challenge=${testChallenge}&code_challenge_method=s256&redirect_to=http://127.0.0.1:3300/auth/callback`, {
      maxRedirects: 0,
    })
    expect(authRes2.status()).toBe(302)
    const authCode2 = new URL(authRes2.headers().location!).searchParams.get('code')!

    // 8. Correct verifier accepted and returns valid session and user UUID IDs
    const validRes = await request.post('http://127.0.0.1:3301/auth/v1/token?grant_type=pkce', {
      data: {
        auth_code: authCode2,
        code_verifier: testVerifier,
      },
    })
    expect(validRes.status()).toBe(200)
    const validBody = await validRes.json()
    expect(validBody.access_token).toBeTruthy()
    expect(validBody.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(validBody.session.user.id).toBe(validBody.user.id)
    expect(validBody.session.access_token).toBe(validBody.access_token)

    // 9. Prove replay rejected (code was consumed)
    const replayRes = await request.post('http://127.0.0.1:3301/auth/v1/token?grant_type=pkce', {
      data: {
        auth_code: authCode2,
        code_verifier: testVerifier,
      },
    })
    expect(replayRes.status()).toBe(400)
    const replayBody = await replayRes.json()
    expect(replayBody.error).toBe('invalid_grant')
  })

  test('public scanners remain accessible anonymously without authentication', async ({ page }) => {
    // Website Judge
    await page.goto('/')
    await expect(page.getByRole('textbox', { name: 'Website URL' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Roast/i }).first()).toBeVisible()

    // Repository Judge
    await page.goto('/?mode=repository')
    await expect(page.getByRole('textbox', { name: /Repository URL|GitHub/i })).toBeVisible()

    // No login redirect occurred
    expect(page.url()).not.toContain('/auth/login')
  })
})
