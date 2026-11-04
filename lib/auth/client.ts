import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from './config'
import { sanitizeHallRedirect } from './redirects'

export const ALLOWED_PROVIDERS = ['github', 'google'] as const
export type SupportedProvider = (typeof ALLOWED_PROVIDERS)[number]

export const PROVIDER_SCOPES: Record<SupportedProvider, string> = {
  github: 'read:user user:email',
  google: 'openid email profile',
}

export function getBrowserCookieOptions(): {
  path: string
  sameSite: 'lax'
  httpOnly: false
  secure: boolean
} {
  const isHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
  return {
    path: '/',
    sameSite: 'lax',
    // Tradeoff: Supabase SSR browser client requires readable access to session tokens
    // for client-side event listeners and token refreshes via document.cookie.
    // Setting httpOnly: true breaks standard browser SDK integration.
    httpOnly: false,
    secure: isHttps,
  }
}

let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  const config = getSupabaseConfig()
  if (!config) {
    throw new Error('Supabase authentication is not configured.')
  }

  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  const client = createBrowserClient(config.url, config.publishableKey, {
    cookieOptions: getBrowserCookieOptions(),
  })

  if (typeof window !== 'undefined') {
    browserClient = client
  }

  return client
}

export function getOAuthRedirectUrl(origin: string, next?: string): string {
  const safeNext = sanitizeHallRedirect(next)
  const base = origin.replace(/\/+$/, '')
  return `${base}/auth/callback?next=${encodeURIComponent(safeNext)}`
}
