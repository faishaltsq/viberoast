import 'server-only'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig, getServerCookieOptions } from './config'

export async function createServerClient(): Promise<SupabaseClient> {
  const config = getSupabaseConfig()
  if (!config) {
    throw new Error('Supabase authentication is not configured.')
  }

  const cookieStore = await cookies()

  return createSupabaseServerClient(config.url, config.publishableKey, {
    cookieOptions: getServerCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // In Server Components, response headers are already committed.
          // Session refreshes are handled by proxy.ts.
        }
      },
    },
  })
}
