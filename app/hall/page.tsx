import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { getAuthenticatedUser } from '@/lib/auth/guards'
import { sanitizeHallRedirect } from '@/lib/auth/redirects'
import type { HallCase, HallLanguage } from '@/lib/hall/types'
import { HallExperience } from '@/components/hall/HallExperience'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Hall of Shame & Vibes | SourceSanity',
  robots: {
    index: false,
    follow: false,
  },
}

interface HallPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function HallPage({ searchParams }: HallPageProps) {
  const params = await searchParams
  const cookieStore = await cookies()

  // 1. Authoritative server session validation BEFORE data import or read
  const user = await getAuthenticatedUser()

  // Resolve language: explicit query parameter overrides cookie preference
  const rawLang = typeof params.lang === 'string' ? params.lang : null
  const cookieLang = cookieStore.get('sourcesanity-language')?.value
  const language: HallLanguage =
    rawLang === 'id' || rawLang === 'en'
      ? rawLang
      : cookieLang === 'id' || cookieLang === 'en'
        ? cookieLang
        : 'en'

  if (!user) {
    const rawCollection =
      typeof params.collection === 'string' ? params.collection : undefined
    const rawCase = typeof params.case === 'string' ? params.case : undefined

    const query = new URLSearchParams()
    query.set('lang', language)
    if (rawCollection) query.set('collection', rawCollection)
    if (rawCase) query.set('case', rawCase)

    const rawTarget = `/hall?${query.toString()}`
    const safeNext = sanitizeHallRedirect(rawTarget)

    redirect(`/auth/login?lang=${language}&next=${encodeURIComponent(safeNext)}`)
  }

  // 2. Load Hall data only AFTER session validation succeeds
  const { loadHallCases } = await import('@/lib/hall/server')
  const cases: HallCase[] = loadHallCases()

  const collection =
    typeof params.collection === 'string' &&
    (params.collection === 'shame' || params.collection === 'vibes')
      ? params.collection
      : undefined

  const initialCase = typeof params.case === 'string' ? params.case : undefined

  return (
    <HallExperience
      cases={cases}
      user={user}
      initialLanguage={language}
      initialCollection={collection}
      initialCase={initialCase}
    />
  )
}
