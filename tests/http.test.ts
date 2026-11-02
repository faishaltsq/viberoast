import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { assertSameOrigin, readJson } from '../lib/server/http'

describe('same-origin mutation boundary', () => {
  it('uses the actual development Host when Next internally constructs a localhost URL', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_ORIGIN', '')
    const request = new Request('http://localhost:3000/api/roast', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' } })
    expect(assertSameOrigin(request)).toBeUndefined()
    expect(() => assertSameOrigin(new Request(request.url, { headers: { host: '127.0.0.1:3000', origin: 'https://attacker.example' } }))).toThrow(/VibeRoast/)
  })
  it('uses the development request origin even when a previous local port is configured', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3102')
    for (const host of ['127.0.0.1:3000', 'localhost:3000']) {
      const request = new Request('http://localhost:3000/api/roast', { headers: { host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin' } })
      expect(assertSameOrigin(request)).toBeUndefined()
      for (const origin of ['https://attacker.example', 'http://127.0.0.1:3102']) {
        expect(() => assertSameOrigin(new Request(request.url, { headers: { host, origin, 'sec-fetch-site': 'same-origin' } }))).toThrow(/VibeRoast/)
      }
      expect(() => assertSameOrigin(new Request(request.url, { headers: { host, origin: `http://${host}`, 'sec-fetch-site': 'cross-site' } }))).toThrow(/Cross-site/)
    }
  })
  it('pins production origin to configuration rather than trusting a supplied host', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ORIGIN', 'https://viberoast.example.com')
    expect(() => assertSameOrigin(new Request('http://localhost/api/roast', { headers: { host: 'attacker.example', origin: 'https://attacker.example' } }))).toThrow(/VibeRoast/)
    expect(assertSameOrigin(new Request('http://localhost/api/roast', { headers: { origin: 'https://viberoast.example.com' } }))).toBeUndefined()
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
