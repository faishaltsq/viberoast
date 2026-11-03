import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'

export class UnsafeUrlError extends Error {
  constructor() { super('Only public HTTP and HTTPS destinations on standard ports are allowed.'); this.name = 'UnsafeUrlError' }
}

export function isPublicIp(address: string): boolean {
  try {
    if (!isIP(address) || address.includes('%')) return false
    const parsed = ipaddr.parse(address)
    if (parsed.range() !== 'unicast') return false
    if (parsed.kind() === 'ipv6') {
      const v6 = parsed as ipaddr.IPv6
      if (v6.isIPv4MappedAddress()) return false
      // Global unicast only; exclude transition, benchmarking and documentation space.
      return v6.match(ipaddr.parse('2000::') as ipaddr.IPv6, 3)
        && !v6.match(ipaddr.parse('2001::') as ipaddr.IPv6, 23)
        && !v6.match(ipaddr.parse('2001:db8::') as ipaddr.IPv6, 32)
        && !v6.match(ipaddr.parse('2002::') as ipaddr.IPv6, 16)
        && !v6.match(ipaddr.parse('3fff::') as ipaddr.IPv6, 20)
    }
    const v4 = parsed as ipaddr.IPv4
    return !['192.0.0.0/24', '192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24', '192.88.99.0/24'].some((cidr) => v4.match(ipaddr.parseCIDR(cidr) as [ipaddr.IPv4, number]))
  } catch { return false }
}

export function normalizePublicUrl(input: string): string {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(input)) throw new UnsafeUrlError()
  const supplied = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let url: URL
  try { url = new URL(supplied) } catch { throw new UnsafeUrlError() }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new UnsafeUrlError()
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const rawAuthority = supplied.slice(supplied.indexOf('://') + 3).split(/[/?#]/, 1)[0]
  if (rawAuthority.includes('@') || rawAuthority.includes('%') || hostname.endsWith('.')) throw new UnsafeUrlError()
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new UnsafeUrlError()
    if (isIP(hostname) === 4 && rawAuthority.replace(/:80$|:443$/, '') !== hostname) throw new UnsafeUrlError()
  } else {
    if (hostname.length > 253 || !hostname.includes('.') || !hostname.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))) throw new UnsafeUrlError()
    if (/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(hostname)
      || /(?:^|\.)(?:metadata|metadata\.google\.internal)$/.test(hostname)) throw new UnsafeUrlError()
  }
  url.hash = ''
  return url.href
}

export type DestinationLookup = (hostname: string) => Promise<readonly { address: string; family: number }[]>

export interface PublicDestination { url: URL; address: string; family: 4 | 6 }

export async function assertPublicDestination(input: string, resolve: DestinationLookup = (host) => lookup(host, { all: true, verbatim: true })): Promise<PublicDestination> {
  const url = new URL(normalizePublicUrl(input))
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(hostname)) return { url, address: hostname, family: isIP(hostname) as 4 | 6 }
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(() => timeout.reject(new UnsafeUrlError()), 3_000)
  try {
    const addresses = await Promise.race([resolve(hostname), timeout.promise])
    if (!addresses.length || addresses.some(({ address, family }) => ![4, 6].includes(family) || !isPublicIp(address))) throw new UnsafeUrlError()
    return { url, address: addresses[0].address, family: addresses[0].family as 4 | 6 }
  } finally { clearTimeout(timer) }
}
