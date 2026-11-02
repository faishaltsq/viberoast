import { readFileSync, statSync } from 'node:fs'
import { isIP } from 'node:net'
import type { ScannerConfig } from './scan'

export function assertIsolation(): ScannerConfig {
  if (process.platform !== 'linux' || process.getuid?.() !== 1000 || process.env.SCANNER_ISOLATION !== 'firewall-proxy-v1') throw new Error('The scanner requires the isolated Linux deployment')
  const marker = '/run/viberoast-isolation'
  const info = statSync(marker)
  if (info.uid !== 0 || (info.mode & 0o222) !== 0 || readFileSync(marker, 'utf8').trim() !== 'firewall-proxy-v1') throw new Error('Isolation attestation is absent')
  const status = readFileSync('/proc/self/status', 'utf8')
  if (!/^CapEff:\s+0+$/m.test(status) || !/^CapBnd:\s+0+$/m.test(status) || !/^NoNewPrivs:\s+1$/m.test(status)) throw new Error('Worker privileges were not dropped')
  const proxyIp = process.env.EGRESS_PROXY_IP ?? ''
  if (isIP(proxyIp) !== 4) throw new Error('The validating egress proxy is not configured')
  return { proxyUrl: `http://${proxyIp}:3128` }
}
