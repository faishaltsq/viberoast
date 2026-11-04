import { createHash } from 'node:crypto'
import http from 'node:http'
import { URL } from 'node:url'

export interface MockUser {
  id: string
  aud: string
  role: string
  email: string
  app_metadata: {
    provider: string
    providers?: string[]
  }
  user_metadata: {
    full_name?: string
    name?: string
    user_name?: string
    avatar_url?: string
    picture?: string
    [key: string]: unknown
  }
  created_at: string
}

export const MOCK_GITHUB_USER: MockUser = {
  id: 'a1000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'octo.tester@sourcesanity.test',
  app_metadata: { provider: 'github', providers: ['github'] },
  user_metadata: {
    full_name: 'Octo Developer',
  },
  created_at: '2026-11-01T00:00:00.000Z',
}

export const MOCK_GOOGLE_USER: MockUser = {
  id: 'a2000000-0000-4000-8000-000000000002',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'googler.tester@sourcesanity.test',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: {
    name: 'Googler Person',
  },
  created_at: '2026-11-01T00:00:00.000Z',
}

export const DETERMINISTIC_TOKENS = {
  GITHUB: 'mock-access-token-github-octo',
  GOOGLE: 'mock-access-token-google-dev',
  EXPIRED: 'mock-access-token-expired',
} as const

interface AuthCodeEntry {
  code: string
  provider: string
  user: MockUser
  codeChallenge: string
  codeChallengeMethod: string
  createdAt: number
  expiresAt: number
}

interface TokenEntry {
  token: string
  refreshToken: string
  user: MockUser
  expiresAt: number
}

export interface MockAuthServerState {
  codes: Map<string, AuthCodeEntry>
  tokens: Map<string, TokenEntry>
  revokedTokens: Set<string>
  authorizeRequests: Array<{
    provider: string
    redirect_to: string
    scopes?: string
    code_challenge?: string
  }>
}

export function computeS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function createMockState(): MockAuthServerState {
  const state: MockAuthServerState = {
    codes: new Map(),
    tokens: new Map(),
    revokedTokens: new Set(),
    authorizeRequests: [],
  }

  // Pre-seed deterministic valid tokens for authenticated cookie testing
  state.tokens.set(DETERMINISTIC_TOKENS.GITHUB, {
    token: DETERMINISTIC_TOKENS.GITHUB,
    refreshToken: `refresh-${DETERMINISTIC_TOKENS.GITHUB}`,
    user: MOCK_GITHUB_USER,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  })

  state.tokens.set(DETERMINISTIC_TOKENS.GOOGLE, {
    token: DETERMINISTIC_TOKENS.GOOGLE,
    refreshToken: `refresh-${DETERMINISTIC_TOKENS.GOOGLE}`,
    user: MOCK_GOOGLE_USER,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  })

  return state
}

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      if (!body.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  })
  res.end(JSON.stringify(data))
}

export function createMockAuthHandler(state: MockAuthServerState): http.RequestListener {
  return async (req, res) => {
    // Loopback-only enforcement
    const remote = req.socket.remoteAddress
    if (remote && !remote.includes('127.0.0.1') && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden: Mock auth server is loopback-only')
      return
    }

    // CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const host = req.headers.host || '127.0.0.1:3301'
    const reqUrl = new URL(req.url || '/', `http://${host}`)
    const pathname = reqUrl.pathname

    // Health check
    if (pathname === '/health' || pathname === '/') {
      sendJson(res, 200, { status: 'ok', mock: 'supabase-auth-ssr' })
      return
    }

    // Test control: Reset dynamic state
    if (pathname === '/__test/reset' && req.method === 'POST') {
      const fresh = createMockState()
      state.codes = fresh.codes
      state.tokens = fresh.tokens
      state.revokedTokens = fresh.revokedTokens
      state.authorizeRequests = []
      sendJson(res, 200, { reset: true })
      return
    }

    // Test control: Issue a unique token for test isolation
    if (pathname === '/__test/issue-token' && req.method === 'POST') {
      const body = await parseJsonBody(req)
      const token = (body.token as string) || `dynamic-token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const user = (body.user as MockUser) || MOCK_GITHUB_USER
      state.tokens.set(token, {
        token,
        refreshToken: `refresh-${token}`,
        user,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })
      sendJson(res, 200, { token, user })
      return
    }

    // Test control: Expire a token
    if (pathname === '/__test/expire' && req.method === 'POST') {
      const body = await parseJsonBody(req)
      const tokenToExpire = (body.token as string) || reqUrl.searchParams.get('token')
      if (tokenToExpire) {
        state.revokedTokens.add(tokenToExpire)
        state.tokens.delete(tokenToExpire)
      }
      sendJson(res, 200, { expired: tokenToExpire })
      return
    }

    // GET /auth/v1/settings
    if (pathname === '/auth/v1/settings') {
      sendJson(res, 200, {
        external: { github: true, google: true },
        disable_signup: false,
        mailer_autoconfirm: true,
        phone_autoconfirm: false,
        sms_provider: '',
        saml: false,
      })
      return
    }

    // GET /auth/v1/authorize
    if (pathname === '/auth/v1/authorize') {
      const provider = reqUrl.searchParams.get('provider')
      const redirectTo = reqUrl.searchParams.get('redirect_to') || 'http://127.0.0.1:3300/auth/callback'
      const scopes = reqUrl.searchParams.get('scopes') || undefined
      const codeChallenge = reqUrl.searchParams.get('code_challenge')
      const codeChallengeMethod = (reqUrl.searchParams.get('code_challenge_method') || 's256').toLowerCase()
      const simulateError = reqUrl.searchParams.get('simulate_error')

      if (!provider || (provider !== 'github' && provider !== 'google')) {
        sendJson(res, 400, {
          error: 'unsupported_provider',
          error_description: `Unsupported OAuth provider: ${provider || 'none'}`,
        })
        return
      }

      if (!codeChallenge) {
        sendJson(res, 400, {
          error: 'invalid_request',
          error_description: 'PKCE code_challenge is required for authorization',
        })
        return
      }

      state.authorizeRequests.push({
        provider,
        redirect_to: redirectTo,
        scopes,
        code_challenge: codeChallenge,
      })

      if (simulateError) {
        const errorTarget = new URL(redirectTo)
        errorTarget.searchParams.set('error', 'access_denied')
        errorTarget.searchParams.set('error_description', 'User denied application access')
        res.writeHead(302, { Location: errorTarget.toString() })
        res.end()
        return
      }

      const generatedCode = `mock_code_${provider}_${Math.random().toString(36).slice(2, 10)}`
      const user = provider === 'google' ? MOCK_GOOGLE_USER : MOCK_GITHUB_USER

      // Enforce 5-minute expiry and store PKCE challenge
      state.codes.set(generatedCode, {
        code: generatedCode,
        provider,
        user,
        codeChallenge,
        codeChallengeMethod,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      })

      const targetUrl = new URL(redirectTo)
      targetUrl.searchParams.set('code', generatedCode)

      res.writeHead(302, { Location: targetUrl.toString() })
      res.end()
      return
    }

    // POST /auth/v1/token
    if (pathname === '/auth/v1/token') {
      const grantType = reqUrl.searchParams.get('grant_type')
      const body = await parseJsonBody(req)

      if (grantType === 'pkce') {
        const authCode = body.auth_code as string
        const codeVerifier = (body.code_verifier as string) || ''
        const codeEntry = state.codes.get(authCode)

        if (!codeEntry) {
          sendJson(res, 400, {
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code',
          })
          return
        }

        // Single-use code consumed immediately
        state.codes.delete(authCode)

        // Check code expiration
        if (Date.now() > codeEntry.expiresAt) {
          sendJson(res, 400, {
            error: 'invalid_grant',
            error_description: 'Authorization code has expired',
          })
          return
        }

        // Verify PKCE code_verifier against stored challenge
        let verified = false
        if (codeEntry.codeChallengeMethod === 's256') {
          const computed = computeS256Challenge(codeVerifier)
          verified = computed === codeEntry.codeChallenge
        } else if (codeEntry.codeChallengeMethod === 'plain') {
          verified = codeVerifier === codeEntry.codeChallenge
        }

        if (!verified) {
          sendJson(res, 400, {
            error: 'invalid_grant',
            error_description: 'Invalid code_verifier for PKCE challenge',
          })
          return
        }

        const accessToken = `mock-token-${codeEntry.provider}-${Math.random().toString(36).slice(2, 10)}`
        const refreshToken = `mock-refresh-${accessToken}`

        state.tokens.set(accessToken, {
          token: accessToken,
          refreshToken,
          user: codeEntry.user,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        })

        const sessionPayload = {
          access_token: accessToken,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: refreshToken,
          user: codeEntry.user,
        }

        sendJson(res, 200, {
          ...sessionPayload,
          session: sessionPayload,
        })
        return
      }

      if (grantType === 'refresh_token') {
        const refreshToken = body.refresh_token as string
        const matchingEntry = Array.from(state.tokens.values()).find(t => t.refreshToken === refreshToken)

        if (!matchingEntry) {
          sendJson(res, 400, {
            error: 'invalid_grant',
            error_description: 'Invalid refresh token',
          })
          return
        }

        const newAccessToken = `mock-token-${matchingEntry.user.app_metadata.provider}-${Math.random().toString(36).slice(2, 10)}`
        const newRefreshToken = `mock-refresh-${newAccessToken}`

        state.tokens.set(newAccessToken, {
          token: newAccessToken,
          refreshToken: newRefreshToken,
          user: matchingEntry.user,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        })

        const refreshSessionPayload = {
          access_token: newAccessToken,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: newRefreshToken,
          user: matchingEntry.user,
        }

        sendJson(res, 200, {
          ...refreshSessionPayload,
          session: refreshSessionPayload,
        })
        return
      }

      sendJson(res, 400, { error: 'unsupported_grant_type' })
      return
    }

    // GET /auth/v1/user
    if (pathname === '/auth/v1/user') {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        sendJson(res, 401, { message: 'Missing authorization header', status: 401 })
        return
      }

      const token = authHeader.replace(/^Bearer\s+/, '').trim()

      if (token === DETERMINISTIC_TOKENS.EXPIRED || state.revokedTokens.has(token)) {
        sendJson(res, 401, { message: 'JWT expired', status: 401 })
        return
      }

      const entry = state.tokens.get(token)
      if (!entry) {
        // Strict whitelist rejects forged tokens
        sendJson(res, 401, { message: 'Invalid JWT: token signature invalid or unrecognized', status: 401 })
        return
      }

      sendJson(res, 200, entry.user)
      return
    }

    // POST /auth/v1/logout
    if (pathname === '/auth/v1/logout') {
      const authHeader = req.headers.authorization
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace(/^Bearer\s+/, '').trim()
        state.revokedTokens.add(token)
        state.tokens.delete(token)
      }
      sendJson(res, 200, {})
      return
    }

    // Fallback 404
    sendJson(res, 404, { error: 'not_found', path: pathname })
  }
}

export function startMockAuthServer(
  port = 3301,
  state = createMockState()
): Promise<{ server: http.Server; url: string; state: MockAuthServerState; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const handler = createMockAuthHandler(state)
    const server = http.createServer(handler)

    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`
      resolve({
        server,
        url,
        state,
        close: () => new Promise<void>((res, rej) => server.close(err => (err ? rej(err) : res()))),
      })
    })

    server.on('error', reject)
  })
}

// ponytail: single-chunk base64url storage adapter; upgrade to chunked writer if test payload exceeds 3.5kb
export function createMockSessionCookie(
  accessToken: string,
  user: MockUser,
  host = '127.0.0.1'
): { name: string; value: string; domain?: string; path: string; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None' } {
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `mock-refresh-${accessToken}`,
    user,
  }

  // Supabase SSR uses storageKey = `sb-${host.split('.')[0]}-auth-token`
  const projectRef = host.split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`
  const rawJson = JSON.stringify(session)
  const encodedValue = 'base64-' + Buffer.from(rawJson).toString('base64url')

  return {
    name: cookieName,
    value: encodedValue,
    path: '/',
    sameSite: 'Lax',
  }
}
