'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { Language } from '@/lib/types/report'

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>
}

export function Dialog({ title, children, close, language }: { title: string; children: ReactNode; close: () => void; language: Language }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => { previous?.focus() }
  }, [])
  return <dialog ref={ref} className="brand-dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); close() }}><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="outline-btn" onClick={close} autoFocus aria-label={language === 'id' ? 'Tutup dialog' : 'Close dialog'}>×</button></div>{children}</dialog>
}

export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
