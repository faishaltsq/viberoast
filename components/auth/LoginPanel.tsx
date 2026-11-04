'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mascot } from '@/components/bro-code/mascot'
import { SectionLabel } from '@/components/shared/primitives'
import { createClient, getOAuthRedirectUrl, PROVIDER_SCOPES } from '@/lib/auth/client'
import styles from './auth.module.css'

export function LoginPanel({
  language,
  next,
  error,
  configured,
}: {
  language: 'en' | 'id'
  next: string
  error?: string
  configured: boolean
}) {
  const [submittingProvider, setSubmittingProvider] = useState<'github' | 'google' | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)

  const isId = language === 'id'

  const getErrorMessage = (errCode: string): string => {
    switch (errCode) {
      case 'logout_unconfirmed':
        return isId
          ? 'Sesi di browser ini sudah dihapus, tetapi pencabutan sesi di server belum dapat dikonfirmasi. Coba masuk kembali jika kamu perlu melanjutkan.'
          : 'This browser session was cleared, but server-side sign-out could not be confirmed. Sign in again if you need to continue.'
      case 'expired':
        return isId
          ? 'Sesi Anda telah kedaluwarsa. Silakan masuk kembali untuk melanjutkan ke Hall.'
          : 'Your session has expired. Please sign in again to access the Hall.'
      case 'auth_failed':
      case 'access_denied':
        return isId
          ? 'Autentikasi dibatalkan atau ditolak. Silakan coba lagi.'
          : 'Sign-in was canceled or denied. Please try again.'
      default:
        return isId
          ? 'Terjadi kendala saat proses autentikasi. Silakan coba lagi.'
          : 'Authentication could not be completed. Please try again.'
    }
  }

  const handleOAuthSignIn = async (provider: 'github' | 'google') => {
    if (!configured || submittingProvider) return
    setClientError(null)
    setSubmittingProvider(provider)

    try {
      const client = createClient()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const redirectTo = getOAuthRedirectUrl(origin, next)

      const { error: signInError } = await client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          scopes: PROVIDER_SCOPES[provider],
        },
      })

      if (signInError) {
        setClientError('auth_failed')
        setSubmittingProvider(null)
      }
    } catch {
      setClientError('auth_failed')
      setSubmittingProvider(null)
    }
  }

  const displayError = clientError || error

  return (
    <div className={styles.loginWrapper}>
      <div className={styles.loginCard} role="region" aria-label={isId ? 'Panel Autentikasi' : 'Authentication Panel'}>
        <div className={styles.loginHeader}>
          <div>
            <SectionLabel>{isId ? 'SUDUT KHUSUS ANGGOTA BRO CODE' : "BRO CODE'S MEMBERS-ONLY CORNER"}</SectionLabel>
            <h1>
              SourceSanity <em>Hall</em>
            </h1>
            <p className={styles.loginSubtitle}>
              {isId
                 ? 'Mau mengintip keputusan coding yang bikin geleng-geleng? Kenalan dulu, Bro.'
                 : "Want to inspect other people's questionable decisions? Identify yourself first."}
            </p>
          </div>
          <Mascot
            small
            language={language}
            state={displayError ? 'disappointed' : !configured ? 'confused' : 'idle'}
          />
        </div>

        {displayError && (
          <div className={styles.authNotice} role="alert">
            <strong>{isId ? 'Perhatian:' : 'Notice:'}</strong> {getErrorMessage(displayError)}
          </div>
        )}

        {!configured && (
          <div className={styles.unconfiguredNotice} role="status">
            <strong>{isId ? 'Konfigurasi Belum Aktif' : 'Setup Pending'}</strong>
            <p style={{ margin: '6px 0 0' }}>
              {isId
                 ? 'Login belum dikonfigurasi di lingkungan ini. Hall belum bisa diakses, tetapi kamu tetap bisa membuka Website Judge dan Repository Judge tanpa akun.'
                 : 'Sign-in is not configured in this environment yet. The Hall is unavailable, but you can still open Website Judge and Repository Judge without an account.'}
            </p>
          </div>
        )}

        <div className={styles.providerList}>
          <button
            type="button"
            className={`${styles.providerBtn} ${styles.githubBtn}`}
            onClick={() => handleOAuthSignIn('github')}
            disabled={!configured || !!submittingProvider}
            aria-busy={submittingProvider === 'github'}
          >
            <svg
              className={styles.providerIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            <span>
              {submittingProvider === 'github'
                ? isId
                  ? 'Menghubungkan ke GitHub...'
                  : 'Connecting to GitHub...'
                : isId
                  ? 'Lanjutkan dengan GitHub'
                  : 'Continue with GitHub'}
            </span>
          </button>

          <button
            type="button"
            className={`${styles.providerBtn} ${styles.googleBtn}`}
            onClick={() => handleOAuthSignIn('google')}
            disabled={!configured || !!submittingProvider}
            aria-busy={submittingProvider === 'google'}
          >
            <svg
              className={styles.providerIcon}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>
              {submittingProvider === 'google'
                ? isId
                  ? 'Menghubungkan ke Google...'
                  : 'Connecting to Google...'
                : isId
                  ? 'Lanjutkan dengan Google'
                  : 'Continue with Google'}
            </span>
          </button>
        </div>

        <div className={styles.loginFooter}>
          <p className={styles.guaranteeNote}>
            {isId
               ? 'Yang di-roast kesalahannya, bukan orangnya. Login hanya untuk identitas dasar, bukan akses repositori. Semua kasus di Hall adalah contoh fiktif.'
               : 'We roast the mistakes. Not the makers. Login requests identity only, not repository access. All Hall cases are fictional examples.'}
          </p>
          <Link href={`/?lang=${language}`} className={styles.backHomeLink}>
            {isId ? '← Kembali ke SourceSanity' : '← Back to SourceSanity'}
          </Link>
        </div>
      </div>
    </div>
  )
}
