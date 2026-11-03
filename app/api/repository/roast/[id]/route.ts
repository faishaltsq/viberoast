import { z } from 'zod'
import { errorResponse, HttpError, json } from '../../../../../lib/server/http'
import { getReport, isServerless } from '../../../../../lib/server/store'
import { isRepositoryReport } from '../../../../../lib/types/report'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    if (isServerless()) {
      throw new HttpError(
        501,
        'REPORT_STORE_UNAVAILABLE',
        'Private report retrieval needs a single-instance deployment. The scan result stays in your browser.'
      )
    }
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) {
      throw new HttpError(404, 'REPORT_EXPIRED', 'This private report is unavailable.')
    }
    const report = getReport(id)
    if (!isRepositoryReport(report)) {
      throw new HttpError(404, 'REPORT_EXPIRED', 'This private report is unavailable.')
    }
    return json(report)
  } catch (error) {
    return errorResponse(error)
  }
}
