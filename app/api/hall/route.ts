import { NextResponse } from 'next/server'
import { getAuthenticatedUser, NO_STORE_HEADERS } from '@/lib/auth/guards'
import { loadHallCases } from '@/lib/hall/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const cases = loadHallCases()
  return NextResponse.json(
    { cases },
    { status: 200, headers: NO_STORE_HEADERS }
  )
}
