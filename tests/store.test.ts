import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  delete (globalThis as typeof globalThis & { vibeRoastState?: unknown }).vibeRoastState
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('TRUST_PROXY', 'true')
})

// Cold-start imports intentionally isolate the long-lived process state per scenario.
it('limits concurrent scans and releases each slot exactly once', async () => {
  const { acquireScan } = await import('../lib/server/store')
  const req = (ip: string) => new Request('http://localhost', { headers: { 'x-real-ip': ip } })
  const releaseA = acquireScan(req('a'), 1000)
  const releaseB = acquireScan(req('b'), 1000)
  expect(() => acquireScan(req('c'), 1000)).toThrow(/slots/)
  releaseA(); releaseA()
  const releaseC = acquireScan(req('c'), 1000)
  expect(() => acquireScan(req('d'), 1000)).toThrow(/slots/)
  releaseB(); releaseC()
  const releaseD = acquireScan(req('d'), 1000)
  releaseD()
})

it('bounds retained reports and evicts the oldest capability', async () => {
  const { retainReport, getReport } = await import('../lib/server/store')
  const { makeReport } = await import('./fixtures/report')
  const report = makeReport()
  const now = Date.parse(report.expiresAt) - 1000
  for (let i = 0; i < 21; i++) retainReport({ ...report, id: `report-${i}` }, now)
  expect(() => getReport('report-0', now)).toThrow(/expired/)
  expect(getReport('report-1', now).id).toBe('report-1')
  expect(getReport('report-20', now).id).toBe('report-20')
})
