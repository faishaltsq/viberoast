import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { assertSameOrigin, readJson } from '../lib/server/http'

describe('same-origin mutation boundary', () => {
  beforeEach(() => {
    for (const name of ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL']) vi.stubEnv(name, '')
  })

  it('uses the actual development Host when Next internally constructs a localhost URL', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_ORIGIN', '')
    const request = new Request('http://localhost:3000/api/roast', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' } })
    expect(assertSameOrigin(request)).toBeUndefined()
    expect(() => assertSameOrigin(new Request(request.url, { headers: { host: '127.0.0.1:3000', origin: 'https://attacker.example' } }))).toThrow(/SourceSanity/)
  })
  it('uses the development request origin even when a previous local port is configured', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3102')
    for (const host of ['127.0.0.1:3000', 'localhost:3000']) {
      const request = new Request('http://localhost:3000/api/roast', { headers: { host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin' } })
      expect(assertSameOrigin(request)).toBeUndefined()
      for (const origin of ['https://attacker.example', 'http://127.0.0.1:3102']) {
        expect(() => assertSameOrigin(new Request(request.url, { headers: { host, origin, 'sec-fetch-site': 'same-origin' } }))).toThrow(/SourceSanity/)
      }
      expect(() => assertSameOrigin(new Request(request.url, { headers: { host, origin: `http://${host}`, 'sec-fetch-site': 'cross-site' } }))).toThrow(/Cross-site/)
    }
  })
  it('pins production origin to configuration rather than trusting a supplied host', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ORIGIN', 'https://viberoast.example.com')
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('VERCEL_URL', 'viberoast-deployment.vercel.app')
    vi.stubEnv('VERCEL_BRANCH_URL', 'viberoast-git-main.vercel.app')
    expect(() => assertSameOrigin(new Request('http://localhost/api/roast', { headers: { host: 'attacker.example', origin: 'https://attacker.example' } }))).toThrow(/SourceSanity/)
    expect(assertSameOrigin(new Request('http://localhost/api/roast', { headers: { origin: 'https://viberoast.example.com' } }))).toBeUndefined()
    for (const host of ['viberoast-deployment.vercel.app', 'viberoast-git-main.vercel.app']) {
      expect(() => assertSameOrigin(new Request(`https://${host}/api/roast`, { headers: { host, origin: `https://${host}` } }))).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }))
    }
  })

  it('rejects incoming production origins when APP_ORIGIN is missing instead of trusting request headers', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ORIGIN', '')
    const headers = { host: 'attacker.example', origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https', forwarded: 'host=attacker.example;proto=https' }
    expect(() => assertSameOrigin(new Request('https://attacker.example/api/roast', { headers }))).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }))
  })

  it('requires an explicit staging origin outside Vercel preview', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ORIGIN', 'https://staging.viberoast.example.com')
    const request = new Request('http://localhost/api/roast', { headers: { origin: 'https://staging.viberoast.example.com' } })
    expect(assertSameOrigin(request)).toBeUndefined()
    expect(() => assertSameOrigin(new Request(request.url, { headers: { host: 'other-staging.example.com', origin: 'https://other-staging.example.com' } }))).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }))
  })

  describe('Vercel preview origins', () => {
    const deployment = 'viberoast-deployment.vercel.app'
    const branch = 'viberoast-git-feature-team.vercel.app'

    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('APP_ORIGIN', 'https://viberoast.example.com')
      vi.stubEnv('VERCEL', '1')
      vi.stubEnv('VERCEL_ENV', 'preview')
      vi.stubEnv('VERCEL_URL', deployment)
      vi.stubEnv('VERCEL_BRANCH_URL', branch)
    })

    it.each([deployment, branch, 'viberoast.example.com'])('allows the exact configured preview or canonical origin %s', (host) => {
      expect(assertSameOrigin(new Request('http://localhost/api/roast', { headers: { host, origin: `https://${host}`, 'sec-fetch-site': 'same-origin' } }))).toBeUndefined()
    })

    it.each([
      'https://attacker.example',
      'https://another-project.vercel.app',
      `https://${deployment}.attacker.example`,
      `https://attacker-${branch}`,
      `http://${deployment}`,
      `https://${branch}:8443`,
      'null',
    ])('rejects untrusted preview origin %s even with matching forged headers', (origin) => {
      const host = origin === 'null' ? deployment : new URL(origin).host
      const headers = { origin, host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https', forwarded: `host=${host};proto=https`, 'sec-fetch-site': 'same-origin' }
      expect(() => assertSameOrigin(new Request(`https://${deployment}/api/roast`, { headers }))).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }))
    })

    it.each([
      ['VERCEL', ''], ['VERCEL', 'true'], ['VERCEL', '0'],
      ['VERCEL_ENV', ''], ['VERCEL_ENV', 'production'], ['VERCEL_ENV', 'development'], ['VERCEL_ENV', 'Preview'],
      ['NODE_ENV', 'test'],
    ])('does not enable preview origins with %s=%s', (name, value) => {
      vi.stubEnv(name, value)
      for (const host of [deployment, branch]) {
        expect(() => assertSameOrigin(new Request(`https://${host}/api/roast`, { headers: { origin: `https://${host}`, host } }))).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }))
      }
    })

    it.each([
      '', 'https://viberoast-deployment.vercel.app', 'viberoast-deployment.vercel.app:443',
      'viberoast-deployment.vercel.app/path', 'viberoast-deployment.vercel.app?query=1',
      'viberoast-deployment.vercel.app#fragment', 'viberoast-deployment.vercel.app@attacker.example',
      '*.vercel.app', 'attacker.example', 'viberoast-deployment.vercel.app.attacker.example',
      '-invalid.vercel.app', 'invalid-.vercel.app', `${'x'.repeat(64)}.vercel.app`,
    ])('fails closed for missing or malformed platform host %s', (host) => {
      vi.stubEnv('VERCEL_URL', host)
      vi.stubEnv('VERCEL_BRANCH_URL', host)
      for (const origin of [`https://${deployment}`, `https://${branch}`, `https://${host}`]) {
        expect(() => assertSameOrigin(new Request('http://localhost/api/roast', { headers: { origin } }))).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }))
      }
      expect(assertSameOrigin(new Request('http://localhost/api/roast', { headers: { origin: 'https://viberoast.example.com' } }))).toBeUndefined()
    })

    it.each(['VERCEL_URL', 'VERCEL_BRANCH_URL'])('allows the other exact platform alias if %s is unavailable', (name) => {
      vi.stubEnv(name, '')
      const host = name === 'VERCEL_URL' ? branch : deployment
      expect(assertSameOrigin(new Request('http://localhost/api/roast', { headers: { origin: `https://${host}` } }))).toBeUndefined()
    })

    it.each([deployment, branch, 'viberoast.example.com'])('rejects cross-site requests even from allowlisted origin %s', (host) => {
      expect(() => assertSameOrigin(new Request('http://localhost/api/roast', { headers: { origin: `https://${host}`, 'sec-fetch-site': 'cross-site' } }))).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED', message: 'Cross-site requests are not allowed.' }))
    })
  })
})

describe('bounded request parser', () => {
  it('rejects chunked bodies above the byte ceiling even without a declared length', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ text: 'x'.repeat(9000) }))); controller.close() } })
    const request = new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' } as RequestInit)
    await expect(readJson(request, z.object({ text: z.string() }))).rejects.toMatchObject({ status: 413 })
  })
  it('rejects malformed JSON and inappropriate content types', async () => {
    await expect(readJson(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), z.object({}))).rejects.toMatchObject({ status: 400 })
    await expect(readJson(new Request('http://localhost', { method: 'POST', body: '{}' }), z.object({}))).rejects.toMatchObject({ status: 415 })
  })
})
