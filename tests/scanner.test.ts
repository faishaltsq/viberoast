import { describe, expect, it, vi, afterEach } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createScannerServer } from '../worker/server'
import { assertPublicDestination, isPublicIp, normalizePublicUrl } from '../lib/security/url'
import { redactSecrets, redactUrl } from '../lib/security/redact'
import { readBoundedResponse, scanWebsite } from '../lib/scanner/client'
import { buildFindings, isChallengePage, type PageEvidence } from '../worker/extract'
import { credentialsMatch, resolveProxyTarget } from '../worker/proxy'
import { assertIsolation } from '../worker/isolation'

export const cleanEvidence: PageEvidence = {
  title: 'Fixture page', description: 'A controlled rendered page', language: 'en', viewportMeta: 'width=device-width, initial-scale=1',
  viewport: { width: 1440, height: 900, documentWidth: 1440 }, headings: [{ level: 1, text: 'Fixture' }],
  links: [{ text: 'Details', href: 'https://example.org/details' }], buttons: [{ text: 'Save', label: '' }], forms: [],
  images: [{ alt: '', loaded: true }], inputs: [{ type: 'text', labeled: true }], styles: [], text: 'Fixture', truncated: false,
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('public destination boundary', () => {
  it.each([
    'http://127.0.0.1', 'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://0177.0.0.1',
    'http://0x08080808', 'http://8.8.2056', 'http://8.8.8.8.', 'http://10.1.2.3', 'http://172.16.0.1',
    'http://192.168.1.1', 'http://169.254.169.254', 'http://100.100.100.200', 'http://0.0.0.0', 'http://224.1.1.1',
    'http://192.0.2.1', 'http://198.51.100.1', 'http://203.0.113.1', 'http://[::1]', 'http://[::ffff:8.8.8.8]',
    'http://[fe80::1]', 'http://[fc00::1]', 'http://[2001:db8::1]', 'http://[2002:0808:0808::1]',
    'https://user:password@example.org', 'http://example.org:8080', 'file:///etc/passwd', 'ftp://example.org',
    'http://localhost', 'http://metadata.google.internal', 'http://foo.local', 'http://example.org\\@127.0.0.1',
  ])('rejects unsafe destination %s', (url) => { expect(() => normalizePublicUrl(url)).toThrow() })
  it('normalizes a public domain and removes fragments', () => {
    expect(normalizePublicUrl('example.org/path?q=hello#section')).toBe('https://example.org/path?q=hello')
    expect(normalizePublicUrl('https://8.8.8.8:443/')).toBe('https://8.8.8.8/')
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true)
  })
  it('rejects any mixed public/private DNS answer', async () => {
    const lookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }])
    await expect(assertPublicDestination('https://example.org', lookup)).rejects.toThrow()
  })
  it('returns the approved literal socket destination without a second lookup', async () => {
    const lookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }])
    const result = await assertPublicDestination('https://example.org', lookup)
    expect(result.address).toBe('8.8.8.8')
    expect(result.url.hostname).toBe('example.org')
    expect(lookup).toHaveBeenCalledOnce()
  })
  it('validates each proxy destination, including CONNECT ports', async () => {
    await expect(resolveProxyTarget('127.0.0.1:443', true)).rejects.toThrow()
    await expect(resolveProxyTarget('8.8.8.8:80', true)).rejects.toThrow()
    await expect(resolveProxyTarget('http://169.254.169.254/latest', false)).rejects.toThrow()
    await expect(resolveProxyTarget('https://8.8.8.8/', false)).rejects.toThrow()
    expect((await resolveProxyTarget('8.8.8.8:443', true)).address).toBe('8.8.8.8')
  })
})

describe('redacted outbound evidence', () => {
  it('removes credentials, query values, emails, tokens and authorization headers', () => {
    const secret = 'abcdefghijklmnopqrstuv'
    const text = redactSecrets(`Authorization: Bearer ${secret} Authorization=Basic dXNlcjpwYXNz api_key=hello person@example.org https://user:pw@example.org/path?token=oops#secret sk-abcdefghijklmnopqrst`)
    for (const value of [secret, 'dXNlcjpwYXNz', 'hello', 'person@example.org', 'token=oops', 'user:pw', 'sk-abcdefghijklmnopqrst']) expect(text).not.toContain(value)
    expect(redactUrl('https://example.org/path?secret=value#token')).toBe('https://example.org/path')
  })
  it('redacts entire quoted values rather than leaking a space-delimited tail', () => {
    expect(redactSecrets('{"password":"first second","token":"third fourth"}')).not.toMatch(/first|second|third|fourth/)
  })
})

describe('fail-closed worker and client', () => {
  it('refuses scanner use without isolation attestation', () => {
    vi.stubEnv('SCANNER_ISOLATION', '')
    expect(() => assertIsolation()).toThrow()
  })
  it('requires scanner configuration and never falls back to a local browser', async () => {
    vi.stubEnv('SCANNER_URL', '')
    vi.stubEnv('SCANNER_TOKEN', '')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(scanWebsite('https://example.org')).rejects.toThrow('scanner is unavailable')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('bounds streamed worker responses', async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(50)); controller.close() } }))
    await expect(readBoundedResponse(response, 20)).rejects.toThrow()
  })
  it('compares authentication tokens without accepting prefixes', () => {
    expect(credentialsMatch('Bearer token', 'Bearer token')).toBe(true)
    expect(credentialsMatch('Bearer token-extra', 'Bearer token')).toBe(false)
    expect(credentialsMatch(undefined, 'Bearer token')).toBe(false)
  })
  it('authenticates the real HTTP boundary and rejects excessive bodies', async () => {
    const scanner = vi.fn(async () => { throw new Error('Unexpected scan') })
    const token = 'a'.repeat(40)
    const server = createScannerServer(token, scanner)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const unauthorized = await fetch(`${endpoint}/scan`, { method: 'POST', body: '{}' })
      expect(unauthorized.status).toBe(401)
      await unauthorized.text()
      const invalid = await fetch(`${endpoint}/scan`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1' }) })
      expect(invalid.status).toBe(400)
      await invalid.text()
      const oversized = await fetch(`${endpoint}/scan`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ url: `https://example.org/${'x'.repeat(5000)}` }) })
      expect(oversized.status).toBe(413)
      await oversized.text()
      expect(scanner).not.toHaveBeenCalled()
    } finally {
      const closing = Promise.withResolvers<void>()
      server.closeAllConnections()
      server.close((error) => error ? closing.reject(error) : closing.resolve())
      await closing.promise
    }
  })
})

describe('grounded deterministic findings', () => {
  it('recognizes access challenges without treating ordinary text as protection', () => {
    expect(isChallengePage({ ...cleanEvidence, title: 'Just a moment...' })).toBe(true)
    expect(isChallengePage({ ...cleanEvidence, text: 'Please verify you are human before continuing.' })).toBe(true)
    expect(isChallengePage(cleanEvidence)).toBe(false)
  })
  it('does not invent failures for a clean sampled document', () => { expect(buildFindings(cleanEvidence, { ...cleanEvidence, viewport: { width: 390, height: 844, documentWidth: 390 } })).toEqual([]) })
  it('reports exact sampled facts with stable IDs and verification status', () => {
    const desktop: PageEvidence = { ...cleanEvidence, title: '', language: '', images: [{ alt: null, loaded: true }, { alt: '', loaded: true }], inputs: [{ type: 'email', labeled: false }] }
    const mobile: PageEvidence = { ...cleanEvidence, viewport: { width: 390, height: 844, documentWidth: 900 } }
    const findings = buildFindings(desktop, mobile)
    expect(findings.map(({ id }) => id)).toEqual(['meta-title-missing', 'document-language-missing', 'images-alt-missing', 'form-labels-missing', 'mobile-horizontal-overflow'])
    expect(findings.every(({ confidence, verification, evidence }) => confidence === 'high' && verification === 'verified' && evidence.length)).toBe(true)
    expect(findings.find(({ id }) => id === 'images-alt-missing')?.evidence[0]).toContain('1 of 2')
  })
})
