import { describe, expect, it } from 'vitest'
import { sanitizeHallRedirect } from '@/lib/auth/redirects'

describe('Auth Redirect Allowlist and Sanitization', () => {
  it('permits default /hall when target is empty or null', () => {
    expect(sanitizeHallRedirect(null)).toBe('/hall')
    expect(sanitizeHallRedirect(undefined)).toBe('/hall')
    expect(sanitizeHallRedirect('')).toBe('/hall')
  })

  it('permits valid /hall with supported parameters', () => {
    expect(sanitizeHallRedirect('/hall')).toBe('/hall')
    expect(sanitizeHallRedirect('/hall?lang=en')).toBe('/hall?lang=en')
    expect(sanitizeHallRedirect('/hall?lang=id')).toBe('/hall?lang=id')
    expect(sanitizeHallRedirect('/hall?collection=shame')).toBe('/hall?collection=shame')
    expect(sanitizeHallRedirect('/hall?collection=vibes')).toBe('/hall?collection=vibes')
    expect(sanitizeHallRedirect('/hall?collection=shame&case=case-mock-01')).toBe(
      '/hall?collection=shame&case=case-mock-01'
    )
    expect(sanitizeHallRedirect('/hall?lang=id&collection=vibes&case=case-mock-02')).toBe(
      '/hall?lang=id&collection=vibes&case=case-mock-02'
    )
  })

  it('strips unapproved query parameters while keeping valid ones', () => {
    expect(sanitizeHallRedirect('/hall?token=secret123&lang=en')).toBe('/hall?lang=en')
    expect(sanitizeHallRedirect('/hall?evil=true&admin=1')).toBe('/hall')
    expect(sanitizeHallRedirect('/hall?collection=invalid')).toBe('/hall')
    expect(sanitizeHallRedirect('/hall?lang=fr')).toBe('/hall')
  })

  it('rejects external URLs, protocol-relative URLs, and open redirect attempts', () => {
    expect(sanitizeHallRedirect('https://evil.com')).toBe('/hall')
    expect(sanitizeHallRedirect('http://evil.com/hall')).toBe('/hall')
    expect(sanitizeHallRedirect('//evil.com/hall')).toBe('/hall')
    expect(sanitizeHallRedirect('///evil.com')).toBe('/hall')
    expect(sanitizeHallRedirect('/\\evil.com')).toBe('/hall')
    expect(sanitizeHallRedirect('\\evil.com')).toBe('/hall')
    expect(sanitizeHallRedirect('javascript:alert(1)')).toBe('/hall')
  })

  it('rejects path traversal and unauthorized internal paths', () => {
    expect(sanitizeHallRedirect('/hall/../../evil')).toBe('/hall')
    expect(sanitizeHallRedirect('/admin')).toBe('/hall')
    expect(sanitizeHallRedirect('/api/hall')).toBe('/hall')
    expect(sanitizeHallRedirect('/')).toBe('/hall')
    expect(sanitizeHallRedirect('/hall/subpath')).toBe('/hall')
  })

  it('rejects control characters, CR, LF, and null bytes', () => {
    expect(sanitizeHallRedirect('/hall\r\nSet-Cookie:bad=true')).toBe('/hall')
    expect(sanitizeHallRedirect('/hall\0evil')).toBe('/hall')
  })
})
