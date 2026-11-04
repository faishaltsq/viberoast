import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { isAuthConfigured, getTrustedServerOrigin } from '@/lib/auth/config'
import { sanitizeHallRedirect } from '@/lib/auth/redirects'
import type { HallLanguage } from '@/lib/hall/types'
import { LoginPanel } from '@/components/auth/LoginPanel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Sign in | SourceSanity',
  robots: {
    index: false,
    follow: false,
  },
}

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const cookieStore = await cookies()

  const rawNext = typeof params.next === 'string' ? params.next : undefined
  const next = sanitizeHallRedirect(rawNext)

  // Derive next's embedded lang if present
  let nextLang: HallLanguage | null = null
  try {
    const parsedNext = new URL(next, 'http://localhost')
    const extracted = parsedNext.searchParams.get('lang')
    if (extracted === 'id' || extracted === 'en') {
      nextLang = extracted
    }
  } catch {
    // Ignore URL parse errors
  }

  const rawLang = typeof params.lang === 'string' ? params.lang : null
  const cookieLang = cookieStore.get('sourcesanity-language')?.value

  // Priority: explicit login query -> next query -> cookie preference -> default 'en'
  const language: HallLanguage =
    rawLang === 'id' || rawLang === 'en'
      ? rawLang
      : nextLang
        ? nextLang
        : cookieLang === 'id' || cookieLang === 'en'
          ? cookieLang
          : 'en'

  const rawError = typeof params.error === 'string' ? params.error : undefined
  const rawReason = typeof params.reason === 'string' ? params.reason : undefined
  const error = rawError || (rawReason === 'expired' ? 'expired' : undefined)
  const configured = isAuthConfigured() && getTrustedServerOrigin() !== null

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#f5f1e8]">
      <LoginPanel
        language={language}
        next={next}
        error={error}
        configured={configured}
      />
    </main>
  )
}
