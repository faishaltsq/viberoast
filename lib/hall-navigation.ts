import type { Language } from '@/lib/types/report'

export const LANGUAGE_COOKIE_NAME = 'sourcesanity-language'

export type ScanMode = 'website' | 'repository'

export function isValidLanguage(val: unknown): val is Language {
  return val === 'en' || val === 'id'
}

export function isValidScanMode(val: unknown): val is ScanMode {
  return val === 'website' || val === 'repository'
}

export function parseLanguageCookie(cookieString: string): Language | null {
  const match = cookieString.match(/(?:^|;\s*)sourcesanity-language=(en|id)(?:;|$)/)
  return match && isValidLanguage(match[1]) ? match[1] : null
}

export function resolveInitialLanguage(search: string, cookieString: string): Language {
  const params = new URLSearchParams(search)
  const queryLang = params.get('lang')
  if (isValidLanguage(queryLang)) {
    return queryLang
  }
  const cookieLang = parseLanguageCookie(cookieString)
  if (cookieLang) {
    return cookieLang
  }
  return 'en'
}

export function resolveScanMode(search: string): ScanMode | null {
  const params = new URLSearchParams(search)
  const mode = params.get('mode')
  return isValidScanMode(mode) ? mode : null
}
