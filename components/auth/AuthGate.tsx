'use client'

import type { ReactNode } from 'react'
import type { HallUser } from './UserMenu'
import { LoginPanel } from './LoginPanel'

export function AuthGate({
  user,
  language = 'en',
  next = '/hall',
  configured = true,
  children,
}: {
  user?: HallUser | null
  language?: 'en' | 'id'
  next?: string
  configured?: boolean
  children: ReactNode
}) {
  if (!user) {
    return <LoginPanel language={language} next={next} configured={configured} />
  }

  return <>{children}</>
}
