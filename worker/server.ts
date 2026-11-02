import http from 'node:http'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { scanSchema, type ScanResult } from '../lib/types/report'
import { normalizePublicUrl } from '../lib/security/url'
import { assertIsolation } from './isolation'
import { credentialsMatch } from './proxy'

// Chromium starts its own process group. The dedicated PID namespace contains
// no other UID-1000 service, so reap orphaned browser groups as well as the child.
export function terminateScanProcesses() {
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue
    try {
      const status = readFileSync(`/proc/${entry}/status`, 'utf8')
      if (/^Uid:\s+1000\s/m.test(status)) process.kill(Number(entry), 'SIGKILL')
    } catch {}
  }
}

export function executeScan(url: string, signal: AbortSignal): Promise<ScanResult> {
  assertIsolation()
  const { promise, resolve, reject } = Promise.withResolvers<ScanResult>()
  if (signal.aborted) { reject(new Error('The isolated scan was cancelled')); return promise }
  const child = spawn(process.execPath, ['--import', 'tsx', 'worker/child.ts'], {
    detached: true, stdio: ['pipe', 'pipe', 'ignore'],
    // Browser children receive no web/provider credentials.
    env: {
      PATH: process.env.PATH, HOME: '/tmp', TMPDIR: '/tmp', NODE_ENV: 'production',
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
      SCANNER_ISOLATION: process.env.SCANNER_ISOLATION,
      EGRESS_PROXY_IP: process.env.EGRESS_PROXY_IP,
    },
  })
  const chunks: Buffer[] = []
  let size = 0, settled = false
  const finish = (error?: Error, result?: ScanResult) => {
    if (settled) return
    settled = true
    clearTimeout(deadline)
    signal.removeEventListener('abort', abort)
    if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
    terminateScanProcesses()
    if (error || !result) reject(new Error('The isolated scan did not complete'))
    else resolve(result)
  }
  const abort = () => finish(new Error('Cancelled'))
  const deadline = setTimeout(() => finish(new Error('Deadline exceeded')), 44_000)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) { abort(); return promise }
  child.on('error', () => finish(new Error('Child failed')))
  child.stdout!.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > 2_000_000) { finish(new Error('Output exceeds limit')); return }
    chunks.push(chunk)
  })
  child.once('close', (code) => {
    if (code !== 0) { finish(new Error('Child failed')); return }
    try { finish(undefined, scanSchema.parse(JSON.parse(Buffer.concat(chunks, size).toString('utf8')))) }
    catch { finish(new Error('Invalid child result')) }
  })
  child.stdin!.on('error', () => finish(new Error('Child input failed')))
  child.stdin!.end(JSON.stringify({ url }))
  return promise
}

export function createScannerServer(token: string, scan: typeof executeScan = executeScan) {
  if (token.length < 32) throw new Error('SCANNER_TOKEN must contain at least 32 characters')
  let busy: symbol | null = null
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 5_000, headersTimeout: 5_000 }, (request, response) => {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'application/json')
    const fail = (status: number, code: string) => { response.writeHead(status).end(JSON.stringify({ error: 'Scanner request could not be completed.', code })) }
    if (!credentialsMatch(request.headers.authorization, `Bearer ${token}`)) { fail(401, 'UNAUTHORIZED'); request.resume(); return }
    if (request.method === 'GET' && request.url === '/health') { response.end('{"status":"ready"}'); return }
    if (request.method !== 'POST' || request.url !== '/scan') { fail(404, 'NOT_FOUND'); request.resume(); return }
    if (!request.headers['content-type']?.startsWith('application/json')) { fail(415, 'CONTENT_TYPE'); request.resume(); return }
    if (busy) { fail(429, 'SCANNER_BUSY'); request.resume(); return }
    if (Number(request.headers['content-length']) > 4096) { fail(413, 'BODY_TOO_LARGE'); request.resume(); return }
    const lease = Symbol('scan')
    busy = lease
    let size = 0, ended = false
    const chunks: Buffer[] = []
    const controller = new AbortController()
    const release = () => { if (busy === lease) busy = null }
    const timeout = setTimeout(() => { controller.abort(); if (!response.headersSent) fail(504, 'SCAN_TIMEOUT'); release(); request.destroy() }, 46_000)
    request.on('aborted', () => { clearTimeout(timeout); controller.abort(); release() })
    response.on('close', () => { clearTimeout(timeout); if (!response.writableEnded) controller.abort() })
    request.on('error', () => { clearTimeout(timeout); controller.abort(); release() })
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 4096) { ended = true; clearTimeout(timeout); fail(413, 'BODY_TOO_LARGE'); release(); request.destroy(); return }
      chunks.push(chunk)
    })
    request.once('end', () => {
      if (ended) return
      let url: string
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
        if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') throw new Error('Invalid body')
        url = normalizePublicUrl(body.url)
      } catch { clearTimeout(timeout); release(); fail(400, 'INVALID_URL'); return }
      void scan(url, controller.signal).then((result) => {
        if (!controller.signal.aborted && !response.destroyed) response.end(JSON.stringify(scanSchema.parse(result)))
      }).catch(() => { if (!response.destroyed && !response.headersSent) fail(502, 'SCAN_FAILED') })
        .finally(() => { clearTimeout(timeout); release() })
    })
  })
  server.maxConnections = 32
  server.keepAliveTimeout = 1_000
  server.on('clientError', (_, socket) => socket.destroy())
  return server
}

