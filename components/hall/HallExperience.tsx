'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { HallCase, HallLanguage, HallUser } from '@/lib/hall/types'
import { UserMenu } from '@/components/auth/UserMenu'
import { Hall } from '@/components/roast/hall'
import styles from './hall-experience.module.css'

export function HallExperience({
  cases,
  user,
  initialLanguage,
  initialCollection,
  initialCase,
}: {
  cases: HallCase[]
  user: HallUser
  initialLanguage: HallLanguage
  initialCollection?: 'shame' | 'vibes'
  initialCase?: string
}) {
  const router = useRouter()
  const [language, setLanguage] = useState<HallLanguage>(initialLanguage)
  const [isExpired, setIsExpired] = useState(false)

  const isId = language === 'id'

  const updateLanguage = useCallback((nextLang: HallLanguage) => {
    setLanguage(nextLang)

    if (typeof document !== 'undefined') {
      document.cookie = `sourcesanity-language=${nextLang}; SameSite=Lax; Path=/; Max-Age=31536000`
      document.documentElement.lang = nextLang
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('lang', nextLang)
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
  }, [language])

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      try {
        const response = await fetch('/api/hall', {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })

        if (!active) return

        if (response.status === 401) {
          setIsExpired(true)
          if (typeof window !== 'undefined') {
            const nextParam = encodeURIComponent(
              window.location.pathname + window.location.search
            )
            router.replace(`/auth/login?reason=expired&error=expired&next=${nextParam}`)
          }
        }
      } catch {
        // Network fluctuation; do not trigger false positive expiry
      }
    }

    const pollInterval = window.setInterval(checkSession, 60_000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSession()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      window.clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])

  if (isExpired) {
    return (
      <div className={styles.hallShell}>
        <div className={styles.expiredScreen}>
          <div className={styles.expiredCard} role="alert">
            <h2>{isId ? 'Sesi Telah Kedaluwarsa' : 'Session Expired'}</h2>
            <p>
              {isId
                ? 'Sesi autentikasi Anda telah berakhir. Mengarahkan ke halaman masuk...'
                : 'Your authenticated session has ended. Redirecting to sign in...'}
            </p>
            <a
              href={`/auth/login?reason=expired&error=expired&next=${encodeURIComponent(
                typeof window !== 'undefined'
                  ? window.location.pathname + window.location.search
                  : '/hall'
              )}`}
              className="dark-btn"
            >
              {isId ? 'Masuk Kembali' : 'Sign In Again'}
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.hallShell}>
      <header className={`container ${styles.hallNav}`}>
        <Link href={`/?lang=${language}`} className={styles.brandLink}>
          <span className={styles.brandFlame}>🔥</span>
          <span>SourceSanity</span>
          <span className={styles.brandTag}>Bro Code</span>
        </Link>

        <div className={styles.navControls}>
          <button
            type="button"
            className={styles.langToggle}
            onClick={() => updateLanguage(language === 'en' ? 'id' : 'en')}
            aria-label={
              isId ? 'Ganti bahasa ke Bahasa Inggris' : 'Switch language to Indonesian'
            }
          >
            <span className={language === 'en' ? styles.langActive : ''}>EN</span>
            <span>/</span>
            <span className={language === 'id' ? styles.langActive : ''}>ID</span>
          </button>

          <UserMenu user={user} language={language} />
        </div>
      </header>

      <main>
        <Hall
          cases={cases}
          language={language}
          initialCollection={initialCollection}
          initialCase={initialCase}
          onLanguageChange={updateLanguage}
        />
      </main>
    </div>
  )
}
