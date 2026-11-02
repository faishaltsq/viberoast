import { z } from 'zod'
import { errorResponse, HttpError, json } from '../../../../lib/server/http'
import { getReport } from '../../../../lib/server/store'

export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'REPORT_EXPIRED', 'This private report is unavailable.')
    return json(getReport(id))
  } catch (error) { return errorResponse(error) }
}
