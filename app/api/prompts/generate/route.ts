import { z } from 'zod'
import { generatePrompt } from '@/lib/prompts/generate'
import { isWebsiteReport, promptOptionsSchema } from '@/lib/types/report'
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http'
import { getReport, isServerless } from '@/lib/server/store'

export const runtime = 'nodejs'
const schema = promptOptionsSchema.extend({ reportId: z.string().uuid() }).strict()
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    if (isServerless()) throw new HttpError(501, 'REPORT_STORE_UNAVAILABLE', 'Server-side prompt generation needs a single-instance deployment. The browser generates prompts from the in-memory report instead.')
    const { reportId, ...options } = await readJson(request, schema)
    const report = getReport(reportId)
    const findings = isWebsiteReport(report) ? report.scan.findings : report.repoScan.findings
    if (!options.selectedIds.length || options.selectedIds.some(id => !findings.some(finding => finding.id === id))) throw new HttpError(400, 'INVALID_SELECTION', 'Select at least one issue from this report.')
    return json({ prompt: generatePrompt(report, options) })
  } catch (error) { return errorResponse(error) }
}
