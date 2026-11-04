'use client'

import { useState } from 'react'
import styles from './auth.module.css'

export type HallUser = {
  displayName: string
  avatarUrl: string | null
  provider: string
}

function isSafeAvatarUrl(url: string | null): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    return host === 'avatars.githubusercontent.com' || host === 'lh3.googleusercontent.com'
  } catch {
    return false
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (!parts[0]) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function UserMenu({
  user,
  language,
}: {
  user: HallUser
  language: 'en' | 'id'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const isSafeAvatar = isSafeAvatarUrl(user.avatarUrl) && !imageFailed
  const safeName = user.displayName?.trim() || (language === 'id' ? 'Rekayasawan' : 'Engineer')
  const initials = getInitials(safeName)

  return (
    <div className={styles.userMenu} aria-label={language === 'id' ? 'Menu pengguna' : 'User menu'}>
      <div className={styles.userBadge}>
        {isSafeAvatar && user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            aria-hidden="true"
            className={styles.userAvatar}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className={styles.userAvatarFallback} aria-hidden="true">
            {initials}
          </span>
        )}
        <div className={styles.userMeta}>
          <span className={styles.userName} title={safeName}>
            {safeName}
          </span>
          <span className={styles.userProvider}>{user.provider}</span>
        </div>
      </div>
      <form method="POST" action="/auth/logout" className={styles.logoutForm}>
        <button
          type="submit"
          className={styles.logoutBtn}
          aria-label={language === 'id' ? 'Keluar dari sesi akun' : 'Sign out of account session'}
        >
          {language === 'id' ? 'Keluar' : 'Sign out'}
        </button>
      </form>
    </div>
  )
}
