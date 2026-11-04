import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  getSupabaseConfig,
  getTrustedServerOrigin,
  getServerCookieOptions,
} from '@/lib/auth/config'
import { sanitizeHallRedirect } from '@/lib/auth/redirects'
import { NO_STORE_HEADERS } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function clearAuthCookies(request: NextRequest, response: NextResponse) {
  const cookieOptions = getServerCookieOptions()
  const allCookies = request.cookies.getAll()
  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-') || cookie.name.includes('auth-token')) {
      response.cookies.delete({
        name: cookie.name,
        path: cookieOptions.path,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
      })
    }
  }
}

export async function GET(request: NextRequest) {
  const origin = getTrustedServerOrigin()
  if (!origin) {
    return new NextResponse('Service Unavailable: AUTH_SITE_URL is not configured.', {
      status: 503,
      headers: NO_STORE_HEADERS,
    })
  }

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const oauthError = searchParams.get('error')

  const destination = sanitizeHallRedirect(next)

  function getRecoveryUrl(errorReason: string): URL {
    const errorUrl = new URL('/auth/login', origin!)
    errorUrl.searchParams.set('error', errorReason)
    errorUrl.searchParams.set('next', destination)
    try {
      const parsedDest = new URL(destination, 'http://localhost')
      const destLang = parsedDest.searchParams.get('lang')
      if (destLang === 'en' || destLang === 'id') {
        errorUrl.searchParams.set('lang', destLang)
      }
    } catch {
      // Ignore URL parse error
    }
    return errorUrl
  }

  if (oauthError) {
    const errorResponse = NextResponse.redirect(getRecoveryUrl('oauth_provider_error'), {
      headers: NO_STORE_HEADERS,
    })
    clearAuthCookies(request, errorResponse)
    return errorResponse
  }

  if (!code) {
    const errorResponse = NextResponse.redirect(getRecoveryUrl('missing_code'), {
      headers: NO_STORE_HEADERS,
    })
    clearAuthCookies(request, errorResponse)
    return errorResponse
  }

  const config = getSupabaseConfig()
  if (!config) {
    const errorResponse = NextResponse.redirect(getRecoveryUrl('missing_config'), {
      headers: NO_STORE_HEADERS,
    })
    clearAuthCookies(request, errorResponse)
    return errorResponse
  }

  const redirectUrl = new URL(destination, origin)
  const response = NextResponse.redirect(redirectUrl, {
    headers: NO_STORE_HEADERS,
  })

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: getServerCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
        if (headers) {
          Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v))
        }
        Object.entries(NO_STORE_HEADERS).forEach(([k, v]) => response.headers.set(k, v))
      },
    },
  })

  let exchangeFailed = false

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data || !data.session || !data.session.access_token) {
      exchangeFailed = true
    }
  } catch {
    exchangeFailed = true
  }

  if (exchangeFailed) {
    const errorResponse = NextResponse.redirect(getRecoveryUrl('auth_exchange_failed'), {
      headers: NO_STORE_HEADERS,
    })
    clearAuthCookies(request, errorResponse)
    return errorResponse
  }

  Object.entries(NO_STORE_HEADERS).forEach(([k, v]) => response.headers.set(k, v))
  return response
}
