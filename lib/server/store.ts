import { createHash } from 'node:crypto'
import { isRepositoryReport, type RoastReport } from '../types/report'
import { toPublicRepositoryReport } from '../security/public-report'
import { HttpError } from './http'

const TTL = 15 * 60_000
const MAX_REPORTS = 20
const WINDOW = 10 * 60_000

type State = {
  reports: Map<string, RoastReport>
  requests: Map<string, number[]>
  active: number
  globalRequests: number[]
  gitHubRateLimit?: { remaining: number; reset: number }
}
const globalState = globalThis as typeof globalThis & { vibeRoastState?: State; sourceSanityState?: State }
const state: State = globalState.sourceSanityState ??= globalState.vibeRoastState ??= { reports: new Map<string, RoastReport>(), requests: new Map<string, number[]>(), active: 0, globalRequests: [] }

export function recordGitHubRateLimit(remaining: number, resetSeconds: number): void {
  state.gitHubRateLimit = { remaining, reset: resetSeconds * 1000 }
}

export function checkGitHubRateLimit(now = Date.now()): void {
  if (state.gitHubRateLimit && state.gitHubRateLimit.remaining <= 0 && state.gitHubRateLimit.reset > now) {
    const waitSec = Math.ceil((state.gitHubRateLimit.reset - now) / 1000)
    throw new HttpError(429, 'RATE_LIMITED', `GitHub API rate limit reached. Reset in ${waitSec}s.`)
  }
}

export function assertDeployment(kind: 'website' | 'repository' = 'website'): void {
  if (process.env.NODE_ENV !== 'production') return
  const mode = process.env.DEPLOYMENT_MODE
  if (!mode || !process.env.APP_ORIGIN || (kind === 'website' && !process.env.SCANNER_URL)) {
    throw new HttpError(503, 'DEPLOYMENT_NOT_CONFIGURED', kind === 'website' ? 'Scanning requires a configured scanner and canonical app origin.' : 'Repository scanning requires a canonical app origin.')
  }
  if (mode !== 'single-instance' && mode !== 'serverless') {
    throw new HttpError(503, 'DEPLOYMENT_NOT_CONFIGURED', 'DEPLOYMENT_MODE must be single-instance or serverless.')
  }
}

/**
 * Serverless mode keeps only per-instance counters. Global backpressure is the
 * worker's single-flight admission, so concurrent scans still fail closed.
 */
export function isServerless(): boolean {
  return process.env.DEPLOYMENT_MODE === 'serverless'
}

export function acquireScan(request: Request, now = Date.now(), kind: 'website' | 'repository' = 'website'): () => void {
  assertDeployment(kind)
  if (kind === 'repository') {
    checkGitHubRateLimit(now)
  }
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
  const safeReport = isRepositoryReport(report) ? toPublicRepositoryReport(report) : report
  state.reports.set(safeReport.id, safeReport)
  const { id, expiresAt } = safeReport
  setTimeout(() => {
    if (state.reports.get(id)?.expiresAt === expiresAt) state.reports.delete(id)
  }, Math.max(0, Date.parse(expiresAt) - now)).unref()
  return safeReport
}

export function getReport(id: string, now = Date.now()): RoastReport {
  const report = state.reports.get(id)
  if (!report || Date.parse(report.expiresAt) <= now) {
    state.reports.delete(id)
    throw new HttpError(404, 'REPORT_EXPIRED', 'This private report expired or the server restarted. Run a new scan.')
  }
  return isRepositoryReport(report) ? toPublicRepositoryReport(report) : report
}

export function reportExpiry(now = Date.now()): string { return new Date(now + TTL).toISOString() }
