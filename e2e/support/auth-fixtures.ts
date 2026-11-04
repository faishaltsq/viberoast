import type { BrowserContext } from '@playwright/test'
import {
  createMockSessionCookie,
  DETERMINISTIC_TOKENS,
  MOCK_GITHUB_USER,
  type MockUser,
} from './mock-auth'

export async function setAuthenticatedCookie(
  context: BrowserContext,
  options?: {
    user?: MockUser
    token?: string
    domain?: string
    url?: string
  }
) {
  const user = options?.user || MOCK_GITHUB_USER
  const token = options?.token || DETERMINISTIC_TOKENS.GITHUB
  const cookie = createMockSessionCookie(token, user, '127.0.0.1')

  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: options?.domain || '127.0.0.1',
      path: cookie.path,
      sameSite: cookie.sameSite || 'Lax',
      httpOnly: false,
      secure: false,
    },
  ])
}

export async function setExpiredCookie(
  context: BrowserContext,
  options?: { domain?: string }
) {
  const cookie = createMockSessionCookie(
    DETERMINISTIC_TOKENS.EXPIRED,
    MOCK_GITHUB_USER,
    '127.0.0.1'
  )

  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: options?.domain || '127.0.0.1',
      path: cookie.path,
      sameSite: cookie.sameSite || 'Lax',
      httpOnly: false,
      secure: false,
    },
  ])
}

export async function setForgedCookie(
  context: BrowserContext,
  options?: { domain?: string }
) {
  const cookie = createMockSessionCookie(
    'forged-unauthorized-attacker-token',
    {
      ...MOCK_GITHUB_USER,
      id: 'bad00000-0000-4000-8000-000000000666',
      email: 'attacker@evil.org',
    },
    '127.0.0.1'
  )

  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: options?.domain || '127.0.0.1',
      path: cookie.path,
      sameSite: cookie.sameSite || 'Lax',
      httpOnly: false,
      secure: false,
    },
  ])
}
