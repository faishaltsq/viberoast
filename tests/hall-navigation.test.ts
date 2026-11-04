import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_COOKIE_NAME,
  isValidLanguage,
  isValidScanMode,
  parseLanguageCookie,
  resolveInitialLanguage,
  resolveScanMode,
} from '../lib/hall-navigation'

describe('hall navigation contract and source wiring', () => {
  const pagePath = resolve(__dirname, '../app/page.tsx')
  const pageSource = readFileSync(pagePath, 'utf8')

  describe('pure helpers: language and mode resolution (lib/hall-navigation.ts)', () => {
    it('defines the correct cookie name', () => {
      expect(LANGUAGE_COOKIE_NAME).toBe('sourcesanity-language')
    })

    it('validates supported languages', () => {
      expect(isValidLanguage('en')).toBe(true)
      expect(isValidLanguage('id')).toBe(true)
      expect(isValidLanguage('fr')).toBe(false)
      expect(isValidLanguage('')).toBe(false)
      expect(isValidLanguage(null)).toBe(false)
      expect(isValidLanguage(undefined)).toBe(false)
    })

    it('validates supported scan modes', () => {
      expect(isValidScanMode('website')).toBe(true)
      expect(isValidScanMode('repository')).toBe(true)
      expect(isValidScanMode('hall')).toBe(false)
      expect(isValidScanMode('auto')).toBe(false)
      expect(isValidScanMode('')).toBe(false)
    })

    it('parses language cookie correctly from various cookie strings', () => {
      expect(parseLanguageCookie('sourcesanity-language=id')).toBe('id')
      expect(parseLanguageCookie('sourcesanity-language=en')).toBe('en')
      expect(parseLanguageCookie('theme=dark; sourcesanity-language=id; session=abc')).toBe('id')
      expect(parseLanguageCookie('sourcesanity-language=id; path=/')).toBe('id')
      expect(parseLanguageCookie('sourcesanity-language=fr')).toBeNull()
      expect(parseLanguageCookie('sourcesanity-language=')).toBeNull()
      expect(parseLanguageCookie('')).toBeNull()
      expect(parseLanguageCookie('other_cookie=en')).toBeNull()
    })

    it('resolves initial language prioritizing valid ?lang over cookie', () => {
      // Query lang takes precedence over cookie
      expect(resolveInitialLanguage('?lang=en', 'sourcesanity-language=id')).toBe('en')
      expect(resolveInitialLanguage('?lang=id', 'sourcesanity-language=en')).toBe('id')
      expect(resolveInitialLanguage('lang=id', 'sourcesanity-language=en')).toBe('id')

      // Invalid query lang falls back to valid cookie
      expect(resolveInitialLanguage('?lang=de', 'sourcesanity-language=id')).toBe('id')
      expect(resolveInitialLanguage('?lang=invalid', 'sourcesanity-language=en')).toBe('en')

      // Missing query lang falls back to valid cookie
      expect(resolveInitialLanguage('', 'sourcesanity-language=id')).toBe('id')
      expect(resolveInitialLanguage('?mode=website', 'sourcesanity-language=id')).toBe('id')

      // Neither valid query nor valid cookie defaults to 'en'
      expect(resolveInitialLanguage('', '')).toBe('en')
      expect(resolveInitialLanguage('?lang=unknown', '')).toBe('en')
      expect(resolveInitialLanguage('?lang=unknown', 'sourcesanity-language=bad')).toBe('en')
    })

    it('resolves scan mode from query without triggering scan', () => {
      expect(resolveScanMode('?mode=website')).toBe('website')
      expect(resolveScanMode('?mode=repository')).toBe('repository')
      expect(resolveScanMode('mode=repository&lang=id')).toBe('repository')
      expect(resolveScanMode('?mode=unknown')).toBeNull()
      expect(resolveScanMode('?mode=')).toBeNull()
      expect(resolveScanMode('')).toBeNull()
    })
  })

  describe('source contract assertions on app/page.tsx', () => {
    it('only exports the default component to satisfy Next.js page requirements', () => {
      expect(pageSource).toMatch(/export\s+default\s+function\s+Page\b/)
      expect(pageSource).not.toMatch(/export\s+(?:const|let|var|function|type|interface)\s+[^d]/)
    })

    it('defines local unexported explicitly public preview examples matching old 3 teaser items', () => {
      expect(pageSource).toMatch(/const\s+PUBLIC_PREVIEW_EXAMPLES\s*=\s*\[/)
      expect(pageSource).not.toMatch(/export\s+const\s+PUBLIC_PREVIEW_EXAMPLES/)
      expect(pageSource).toContain('TaskToast')
      expect(pageSource).toContain('CryptoBros.app')
      expect(pageSource).toContain('SaaSStarter')

      const previewBlock = pageSource.match(/const\s+PUBLIC_PREVIEW_EXAMPLES\s*=\s*\[[\s\S]*?\]\s*as\s+const/)
      expect(previewBlock).not.toBeNull()
      const content = previewBlock![0]
      expect(content).not.toMatch(/\bnote\b/)
      expect(content).not.toMatch(/\bcaseFile\b/)
      expect(content).not.toMatch(/\bfindings\b/)
    })

    it('does not import Hall or examples from components/roast/hall or lib/hall', () => {
      expect(pageSource).not.toMatch(/from\s+['"][^'"]*components\/roast\/hall['"]/)
      expect(pageSource).not.toMatch(/from\s+['"][^'"]*lib\/hall['"]/)
      expect(pageSource).not.toMatch(/import\s+.*\{[^}]*\bHall\b[^}]*\}\s+from/)
    })

    it('does not include hall in the View type union', () => {
      expect(pageSource).toMatch(/type\s+View\s*=\s*['"]home['"]\s*\|\s*['"]results['"]\s*\|\s*['"]fixes['"]/)
      expect(pageSource).not.toMatch(/type\s+View\s*=.*['"]hall['"]/)
    })

    it('does not conditionally render the Hall component', () => {
      expect(pageSource).not.toMatch(/view\s*===?\s*['"]hall['"]/)
      expect(pageSource).not.toMatch(/<Hall\b/)
    })

    it('navigates to /hall?lang=... in header with real navigation, no client bypass', () => {
      expect(pageSource).toMatch(/href=\{`\/hall\?lang=\$\{language\}`\}/)
      expect(pageSource).not.toMatch(/navigate\(['"]hall['"]\)/)
    })

    it('links browse examples to real /hall?lang= navigation with no client bypass', () => {
      const browseSectionMatch = pageSource.match(/<section[^>]*class(?:Name)?="hall-preview[^"]*"[\s\S]*?<\/section>/)
      expect(browseSectionMatch).not.toBeNull()
      const browseSection = browseSectionMatch![0]
      expect(browseSection).toMatch(/href=\{`\/hall\?lang=\$\{language\}`\}/)
      expect(browseSection).toMatch(/\{t\('Browse examples', 'Lihat contoh'\)\}/)
      expect(browseSection).not.toMatch(/onClick=.*navigate\(['"]hall['"]\)/)
    })

    it('does not trigger automatic scan when ?mode is read', () => {
      const mountEffectMatch = pageSource.match(/resolveScanMode\(search\)[\s\S]*?\n\s*\}/)
      expect(mountEffectMatch).not.toBeNull()
      expect(mountEffectMatch![0]).not.toMatch(/runRoast|runRepoRoast/)
    })

    it('persists language changes to sourcesanity-language cookie and keeps HTML lang intact', () => {
      expect(pageSource).toContain('LANGUAGE_COOKIE_NAME')
      expect(pageSource).toMatch(/document\.documentElement\.lang\s*=\s*language/)
    })

    it('guards against overwriting persisted cookie preference during initial hydration', () => {
      expect(pageSource).toMatch(/initialSyncDone|\binitialized\b/)
    })
  })
})
