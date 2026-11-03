import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseConfig, getServerCookieOptions } from './lib/auth/config'
import { NO_STORE_HEADERS } from './lib/auth/guards'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Set no-store headers on all matched auth and hall routes
  Object.entries(NO_STORE_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  const config = getSupabaseConfig()
  if (!config) {
    return response
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: getServerCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        response = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
        }
        Object.entries(NO_STORE_HEADERS).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
      },
    },
  })

  try {
    await supabase.auth.getUser()
  } catch {
    // Session refresh errors do not crash proxy; server components/guards perform authoritative check
  }

  return response
}

export const config = {
  matcher: [
    '/hall',
    '/hall/:path*',
    '/auth/:path*',
    '/api/hall',
    '/api/hall/:path*',
  ],
}
