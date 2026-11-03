import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { generateRoast } from '../../../lib/ai/deepseek'
import { scanWebsite, ScannerError } from '../../../lib/scanner/client'
import { normalizePublicUrl } from '../../../lib/security/url'
import { intensitySchema, languageSchema, type RoastReport } from '../../../lib/types/report'
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '../../../lib/server/http'
import { acquireScan, assertDeployment, reportExpiry, retainReport } from '../../../lib/server/store'

export const runtime = 'nodejs'
export const maxDuration = 160
const requestSchema = z.object({ url: z.string().trim().min(1).max(2048), language: languageSchema, intensity: intensitySchema }).strict()

export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined
  const startedAt = Date.now()
  let outcome = 'failed'
  try {
    assertDeployment()
    assertSameOrigin(request)
    const input = await readJson(request, requestSchema)
    let url: string
    try { url = normalizePublicUrl(input.url) } catch { throw new HttpError(400, 'INVALID_URL', 'Enter a public HTTP or HTTPS website on a standard port, without credentials.') }
    request.signal.throwIfAborted()
    release = acquireScan(request)
    let scan = await scanWebsite(url, request.signal)
    request.signal.throwIfAborted()
    let commentary: RoastReport['commentary'] = null
    let visualAnalysis = false
    let aiMessage: string | null = null
    try {
      const generated = await generateRoast(scan, input, request.signal)
      commentary = generated.commentary
      visualAnalysis = generated.visualAnalysis
      if (generated.visualFindings.length) scan = { ...scan, findings: [...scan.findings, ...generated.visualFindings] }
    } catch (error) {
      if (request.signal.aborted) throw error
      aiMessage = input.language === 'id'
        ? 'Bukti pemindaian tersedia, tapi komentar AI sedang tidak tersedia. Tidak ada roast palsu yang ditampilkan.'
        : 'Scanner evidence is available, but AI commentary is unavailable. No roast has been fabricated.'
    }
    request.signal.throwIfAborted()
    const report = retainReport({ id: randomUUID(), expiresAt: reportExpiry(), language: input.language, intensity: input.intensity, scan, commentary, aiStatus: commentary ? 'completed' : 'unavailable', aiMessage, visualAnalysis })
    outcome = report.aiStatus === 'unavailable' ? 'scanner_only' : scan.status
    return json(report)
  } catch (error) {
    outcome = request.signal.aborted ? 'cancelled' : error instanceof HttpError ? error.code : error instanceof ScannerError ? 'SCANNER_UNAVAILABLE' : 'ANALYSIS_UNAVAILABLE'
    if (request.signal.aborted) return json({ error: 'The request was cancelled.', code: 'REQUEST_CANCELLED' }, 499)
    if (error instanceof ScannerError) return errorResponse(new HttpError(503, 'SCANNER_UNAVAILABLE', error.message))
    return errorResponse(error)
  }
  finally {
    release?.()
    console.info(JSON.stringify({ event: 'roast_request', outcome, durationMs: Date.now() - startedAt }))
  }
}
