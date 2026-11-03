import { scanSchema, type ScanResult } from '../types/report'
import { normalizePublicUrl } from '../security/url'

const MAX_RESPONSE_BYTES = 8_200_000

export class ScannerError extends Error {
  constructor(message = 'The isolated website scanner is unavailable. Please try again later.') { super(message); this.name = 'ScannerError' }
}

export async function readBoundedResponse(response: Response, maximum = MAX_RESPONSE_BYTES): Promise<string> {
  if (!response.body || Number(response.headers.get('content-length')) > maximum) throw new ScannerError()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new ScannerError()
      chunks.push(value)
    }
    return Buffer.concat(chunks, size).toString('utf8')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function scanWebsite(input: string, signal?: AbortSignal): Promise<ScanResult> {
  signal?.throwIfAborted()
  const url = normalizePublicUrl(input)
  const endpoint = process.env.SCANNER_URL
  const token = process.env.SCANNER_TOKEN
  if (!endpoint || !token || token.length < 32) throw new ScannerError()
  try {
    const worker = new URL(endpoint)
    if (!['http:', 'https:'].includes(worker.protocol) || worker.username || worker.password || worker.search || worker.hash) throw new ScannerError()
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
    const health = await fetch(new URL('/health', worker), {
      redirect: 'error', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(50_000)]) : AbortSignal.timeout(50_000),
      headers,
    })
    if (health.status === 409) {
      await health.body?.cancel()
      throw new ScannerError('The scanner is still waking up or cooling down. Please try again in a few minutes.')
    }
    if (!health.ok || !health.headers.get('content-type')?.includes('application/json')) { await health.body?.cancel(); throw new ScannerError() }
    const readiness: unknown = JSON.parse(await readBoundedResponse(health, 1024))
    if (!readiness || typeof readiness !== 'object' || !('status' in readiness) || readiness.status !== 'ready') throw new ScannerError()
    signal?.throwIfAborted()
    const response = await fetch(new URL('/scan', worker), {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(50_000)]) : AbortSignal.timeout(50_000),
      headers,
      body: JSON.stringify({ url }),
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new ScannerError() }
    return scanSchema.parse(JSON.parse(await readBoundedResponse(response)))
  } catch (error) { if (error instanceof ScannerError) throw error; throw new ScannerError() }
}
