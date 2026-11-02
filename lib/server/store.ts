import { createHash } from 'node:crypto'
import type { RoastReport } from '../types/report'
import { HttpError } from './http'

const TTL = 15 * 60_000
const MAX_REPORTS = 20
const WINDOW = 10 * 60_000

type State = { reports: Map<string, RoastReport>; requests: Map<string, number[]>; active: number; globalRequests: number[] }
const globalState = globalThis as typeof globalThis & { vibeRoastState?: State }
const state: State = globalState.vibeRoastState ??= { reports: new Map<string, RoastReport>(), requests: new Map<string, number[]>(), active: 0, globalRequests: [] }

export function assertDeployment(): void {
  if (process.env.NODE_ENV === 'production' && (process.env.DEPLOYMENT_MODE !== 'single-instance' || !process.env.APP_ORIGIN)) {
    throw new HttpError(503, 'DEPLOYMENT_NOT_CONFIGURED', 'Scanning requires the configured single-instance deployment and isolated worker.')
  }
}

export function acquireScan(request: Request, now = Date.now()): () => void {
  assertDeployment()
  state.globalRequests = state.globalRequests.filter(time => time > now - WINDOW)
  for (const [key, times] of state.requests) if (!times.some(time => time > now - WINDOW)) state.requests.delete(key)
  // Only an operator-controlled ingress may supply the overwritten client-IP header.
  const identity = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-real-ip') || 'anonymous' : 'anonymous'
  const key = createHash('sha256').update(identity.slice(0, 200)).digest('hex')
  const previous = (state.requests.get(key) || []).filter(time => time > now - WINDOW)
  if (previous.length >= 3 || state.globalRequests.length >= 20 || state.requests.size >= 1000) throw new HttpError(429, 'RATE_LIMITED', 'Bro Code needs a breather. Try again in ten minutes.')
  if (state.active >= 2) throw new HttpError(429, 'SCANNER_BUSY', 'Both scan slots are busy. Please try again shortly.')
  state.requests.set(key, [...previous, now])
  state.globalRequests.push(now)
  state.active++
  let released = false
  return () => { if (!released) { state.active--; released = true } }
}

export function retainReport(report: RoastReport, now = Date.now()): RoastReport {
  for (const [id, item] of state.reports) if (Date.parse(item.expiresAt) <= now) state.reports.delete(id)
  while (state.reports.size >= MAX_REPORTS) state.reports.delete(state.reports.keys().next().value!)
  state.reports.set(report.id, report)
  const { id, expiresAt } = report
  setTimeout(() => {
    if (state.reports.get(id)?.expiresAt === expiresAt) state.reports.delete(id)
  }, Math.max(0, Date.parse(expiresAt) - now)).unref()
  return report
}

export function getReport(id: string, now = Date.now()): RoastReport {
  const report = state.reports.get(id)
  if (!report || Date.parse(report.expiresAt) <= now) {
    state.reports.delete(id)
    throw new HttpError(404, 'REPORT_EXPIRED', 'This private report expired or the server restarted. Run a new scan.')
  }
  return report
}

export function reportExpiry(now = Date.now()): string { return new Date(now + TTL).toISOString() }
