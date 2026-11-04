import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { HallUser } from '@/lib/hall/types'
import { getSupabaseConfig } from './config'
import { createServerClient } from './server'

export type { HallUser }

export const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
} as const

const EXACT_TRUSTED_AVATAR_HOSTS = new Set([
  'avatars.githubusercontent.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
])

export function sanitizeAvatarUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      return null
    }

    const hostname = parsed.hostname.toLowerCase()
    return EXACT_TRUSTED_AVATAR_HOSTS.has(hostname) ? parsed.toString() : null
  } catch {
    return null
  }
}

export function sanitizeProvider(rawProvider?: string | null): 'github' | 'google' | 'oauth' {
  if (rawProvider === 'github' || rawProvider === 'google') {
    return rawProvider
  }
  return 'oauth'
}

export function toHallUser(rawUser?: User | null): HallUser | null {
  if (!rawUser || !rawUser.id || typeof rawUser.id !== 'string') {
    return null
  }

  const metadata = rawUser.user_metadata || {}

  // Resolve candidate name from metadata
  const candidateName =
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    metadata.preferred_username

  let displayName = 'Member'

  if (typeof candidateName === 'string') {
    const trimmed = candidateName.trim()
    // Reject any candidate containing '@' (never expose emails as display names)
    if (trimmed.length > 0 && !trimmed.includes('@')) {
      displayName = trimmed.slice(0, 50)
    }
  }

  const rawAvatarUrl = metadata.avatar_url || metadata.picture
  const avatarUrl = sanitizeAvatarUrl(rawAvatarUrl)

  const candidateProvider =
    (rawUser.app_metadata && typeof rawUser.app_metadata.provider === 'string'
      ? rawUser.app_metadata.provider
      : undefined) ||
    rawUser.identities?.[0]?.provider ||
    'oauth'

  const provider = sanitizeProvider(candidateProvider)

  return {
    displayName,
    avatarUrl,
    provider,
  }
}

export async function getAuthenticatedUser(
  client?: SupabaseClient
): Promise<HallUser | null> {
  const config = getSupabaseConfig()
  if (!config) {
    return null
  }

  try {
    const supabase = client || (await createServerClient())
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user || !user.id || typeof user.id !== 'string') {
      return null
    }

    return toHallUser(user)
  } catch {
    return null
  }
}
