import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import {
  getSupabaseConfig,
  getTrustedServerOrigin,
  getServerCookieOptions,
} from '@/lib/auth/config'
import { NO_STORE_HEADERS } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function isSameOrigin(request: NextRequest, trustedOrigin: string): boolean {
  const originHeader = request.headers.get('origin')

  if (originHeader) {
    try {
      const parsed = new URL(originHeader)
      return parsed.origin === trustedOrigin
    } catch {
      return false
    }
  }

  // Referer fallback ONLY when Origin header is completely absent
  const refererHeader = request.headers.get('referer')
  if (refererHeader) {
    try {
      const parsed = new URL(refererHeader)
      return parsed.origin === trustedOrigin
    } catch {
      return false
    }
  }

  return false
}

export async function GET() {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: {
      Allow: 'POST',
      ...NO_STORE_HEADERS,
    },
  })
}

export async function POST(request: NextRequest) {
  const trustedOrigin = getTrustedServerOrigin()
  if (!trustedOrigin) {
    return new NextResponse('Service Unavailable: AUTH_SITE_URL is not configured.', {
      status: 503,
      headers: NO_STORE_HEADERS,
    })
  }

  if (!isSameOrigin(request, trustedOrigin)) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    )
  }

  const redirectUrl = new URL('/auth/login', trustedOrigin)
  const response = NextResponse.redirect(redirectUrl, {
    status: 303,
    headers: NO_STORE_HEADERS,
  })

  const cookieOptions = getServerCookieOptions()
  let signOutFailed = false
  const config = getSupabaseConfig()
  if (config) {
    const supabase = createServerClient(config.url, config.publishableKey, {
      cookieOptions,
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

    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        signOutFailed = true
      }
    } catch {
      signOutFailed = true
    }
  }

  if (signOutFailed) {
    redirectUrl.searchParams.set('error', 'logout_unconfirmed')
    response.headers.set('location', redirectUrl.toString())
  }

  // Explicitly clear all auth cookies to prevent stale sessions
  const allCookies = request.cookies.getAll()
  for (const cookie of allCookies) {
    if (
      cookie.name.startsWith('sb-') ||
      cookie.name.includes('auth-token')
    ) {
      response.cookies.delete({
        name: cookie.name,
        path: cookieOptions.path,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
      })
    }
  }

  try {
    revalidatePath('/', 'layout')
  } catch {
    // Ignore in environments where cache is not available
  }

  Object.entries(NO_STORE_HEADERS).forEach(([k, v]) => response.headers.set(k, v))
  return response
}
