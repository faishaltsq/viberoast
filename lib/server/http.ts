import { z } from 'zod'

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'JSON_REQUIRED', 'Send JSON with application/json content type.')
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > 8192) throw new HttpError(413, 'REQUEST_TOO_LARGE', 'That request is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'INVALID_REQUEST', 'The request body is missing.')
  const chunks: Uint8Array[] = []
  let size = 0
  const deadline = setTimeout(() => { void reader.cancel() }, 5000)
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 8192) { await reader.cancel(); throw new HttpError(413, 'REQUEST_TOO_LARGE', 'That request is too large.') }
      chunks.push(chunk.value)
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    const result = schema.safeParse(data)
    if (!result.success) throw new HttpError(400, 'INVALID_REQUEST', 'Check the URL, language, intensity, and selected options.')
    return result.data
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'INVALID_REQUEST', 'The request must contain valid JSON.')
  } finally { clearTimeout(deadline); reader.releaseLock() }
}

function isVercelPreviewOrigin(origin: string): boolean {
  if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'preview') return false
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].some(host =>
    !!host && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(host) && origin === `https://${host}`
  )
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const url = new URL(request.url)
  const host = request.headers.get('host')
  const requestOrigin = host ? `${url.protocol}//${host}` : url.origin
  const expected = process.env.NODE_ENV === 'development' ? requestOrigin : process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? undefined : requestOrigin)
  if (origin && origin !== expected && !isVercelPreviewOrigin(origin)) throw new HttpError(403, 'ORIGIN_DENIED', 'Submit this request from VibeRoast.')
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'ORIGIN_DENIED', 'Cross-site requests are not allowed.')
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status)
  return json({ error: 'The analysis could not finish safely. Please try again later.', code: 'ANALYSIS_UNAVAILABLE' }, 503)
}
