'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { Language } from '@/lib/types/report'

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>
}

export function Dialog({
  title,
  children,
  close,
  language,
  titleId = 'dialog-title',
  ariaDescribedby,
  className,
  headerPrefix,
  headerActions,
}: {
  title: string
  children: ReactNode
  close: () => void
  language: Language
  titleId?: string
  ariaDescribedby?: string
  className?: string
  headerPrefix?: ReactNode
  headerActions?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
      dialog?.close()
      previous?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={className ? `brand-dialog ${className}` : 'brand-dialog'}
      aria-labelledby={titleId}
      aria-describedby={ariaDescribedby}
      onCancel={event => {
        event.preventDefault()
        close()
      }}
    >
      <div className="dialog-heading">
        <div style={{ flex: 1, minWidth: 0 }}>
          {headerPrefix}
          <h2 id={titleId}>{title}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {headerActions}
          <button
            className="outline-btn"
            onClick={close}
            aria-label={language === 'id' ? 'Tutup dialog' : 'Close dialog'}
          >
            ×
          </button>
        </div>
      </div>
      {children}
    </dialog>
  )
}

export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
