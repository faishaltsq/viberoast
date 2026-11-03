import http from 'node:http'
import net from 'node:net'
import { timingSafeEqual } from 'node:crypto'
import type { Duplex } from 'node:stream'
import { assertPublicDestination } from '../lib/security/url'

export interface ProxyConfig { workerIp: string; port?: number; host?: string }

export function credentialsMatch(actual: string | undefined, expected: string): boolean {
  const received = Buffer.from(actual ?? '')
  const wanted = Buffer.from(expected)
  return received.length === wanted.length && timingSafeEqual(received, wanted)
}

export async function resolveProxyTarget(input: string, connect: boolean) {
  if (connect && !/^(?:\[[0-9a-f:]+\]|[^:/?#]+):443$/i.test(input)) throw new Error('Invalid CONNECT target')
  const destination = await assertPublicDestination(connect ? `https://${input}/` : input)
  if ((!connect && destination.url.protocol !== 'http:') || destination.url.username || destination.url.password) throw new Error('Unsupported target')
  return destination
}

export function createEgressProxy(config: ProxyConfig) {
  if (net.isIP(config.workerIp) !== 4) throw new Error('Proxy configuration is incomplete')
  const sockets = new Set<Duplex>()
  let windowStart = Date.now(), bytes = 0, connections = 0, active = 0
  function permitted(request: http.IncomingMessage) {
    const address = request.socket.remoteAddress?.replace(/^::ffff:/, '')
    if (address !== config.workerIp) return false
    if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); bytes = 0; connections = 0 }
    connections++
    return connections <= 400 && active < 32 && bytes < 48_000_000
  }
  function budget(chunk: Buffer) {
    bytes += chunk.length
    if (bytes > 48_000_000) { for (const socket of sockets) socket.destroy(); return false }
    return true
  }
  function track(socket: Duplex) {
    sockets.add(socket)
    socket.on('data', budget)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => {})
  }
  const server = http.createServer({ maxHeaderSize: 16_384, requestTimeout: 15_000, headersTimeout: 5_000 }, (request, response) => {
    if (!permitted(request)) { response.writeHead(403).end(); return }
    if (!['GET', 'HEAD'].includes(request.method ?? '') || request.headers['transfer-encoding'] || Number(request.headers['content-length'] ?? 0) !== 0 || request.headers.upgrade) { response.writeHead(405).end(); return }
    active++
    let upstream: http.ClientRequest | undefined
    const lifetime = setTimeout(() => { upstream?.destroy(); response.destroy() }, 15_000)
    response.once('close', () => { clearTimeout(lifetime); active--; upstream?.destroy() })
    void resolveProxyTarget(request.url ?? '', false).then(({ url, address, family }) => {
      if (response.destroyed) return
      const headers: http.OutgoingHttpHeaders = { ...request.headers, host: url.host, connection: 'close' }
      for (const header of ['proxy-authorization', 'proxy-connection', 'authorization', 'cookie', 'forwarded', 'x-forwarded-for', 'connection', 'upgrade', 'te', 'trailer', 'transfer-encoding']) delete headers[header]
      headers.connection = 'close'
      upstream = http.request({ host: address, family, port: 80, method: request.method, path: `${url.pathname}${url.search}`, headers, agent: false, timeout: 10_000 }, (incoming) => {
        const downstreamHeaders: http.OutgoingHttpHeaders = { ...incoming.headers }
        for (const name of ['connection', 'proxy-authenticate', 'proxy-authorization', 'upgrade', 'transfer-encoding']) delete downstreamHeaders[name]
        response.writeHead(incoming.statusCode ?? 502, downstreamHeaders)
        incoming.on('data', (chunk: Buffer) => { if (!budget(chunk)) incoming.destroy() })
        incoming.pipe(response)
        incoming.on('error', () => response.destroy())
      })
      upstream.on('socket', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
      upstream.on('timeout', () => upstream?.destroy())
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502).end(); else response.destroy() })
      upstream.end()
    }).catch(() => { if (!response.destroyed) response.writeHead(403).end() })
  })
  server.on('connect', (request, client, head) => {
    if (!permitted(request) || head.length > 16_384) { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    active++
    let upstream: net.Socket | undefined
    const lifetime = setTimeout(() => { client.destroy(); upstream?.destroy() }, 15_000)
    client.once('close', () => { clearTimeout(lifetime); active--; upstream?.destroy() })
    client.on('error', () => upstream?.destroy())
    void resolveProxyTarget(request.url ?? '', true).then(({ address, family }) => {
      if (client.destroyed) return
      // The vetted IP is passed directly to the socket. No second DNS lookup can rebind it.
      upstream = net.connect({ host: address, family, port: 443, timeout: 8_000 })
      track(upstream)
      track(client)
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length && budget(head)) upstream?.write(head)
        client.pipe(upstream!)
        upstream!.pipe(client)
      })
      upstream.on('timeout', () => { upstream?.destroy(); client.destroy() })
      upstream.on('error', () => client.destroy())
      upstream.once('close', () => client.destroy())
    }).catch(() => { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n') })
  })
  server.on('clientError', (_, socket) => socket.destroy())
  server.on('connection', (socket) => { socket.setTimeout(20_000, () => socket.destroy()) })
  server.maxConnections = 40
  server.keepAliveTimeout = 1_000
  server.on('close', () => { for (const socket of sockets) socket.destroy() })
  return server
}

