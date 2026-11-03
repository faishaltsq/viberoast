import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { scanSchema } from '../lib/types/report'
import net, { type AddressInfo } from 'node:net'
import { once } from 'node:events'
import { scanWebsite } from '../lib/scanner/client'

const project = `sourcesanity-smoke-${process.pid}`
const env: NodeJS.ProcessEnv = { ...process.env, SCANNER_TOKEN: randomBytes(32).toString('hex') }
function compose(args: string[], timeout = 1_200_000) {
  const result = spawnSync('docker', ['compose', '-p', project, ...args], { env, encoding: 'utf8', timeout, maxBuffer: 16_000_000 })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error || result.status !== 0) throw new Error(`Container command failed: ${args[0]}. ${result.error?.message ?? `Exit ${result.status}`}`)
}

async function main() {
  const portProbe = net.createServer()
  portProbe.listen(0, '127.0.0.1')
  await once(portProbe, 'listening')
  const port = (portProbe.address() as AddressInfo).port
  const closing = Promise.withResolvers<void>()
  portProbe.close(error => error ? closing.reject(error) : closing.resolve())
  await closing.promise
  env.SCANNER_PORT = String(port)
  const endpoint = `http://127.0.0.1:${port}`
  try {
    compose(['config', '--quiet'])
    compose(['up', '--build', '--detach', '--wait', '--wait-timeout', '90'])
    console.log(`Worker smoke endpoint: ${endpoint}`)
    const headers = { Authorization: `Bearer ${env.SCANNER_TOKEN}`, 'Content-Type': 'application/json' }
    const health = await fetch(`${endpoint}/health`, { headers, signal: AbortSignal.timeout(5000) })
    assert.equal(health.status, 200, 'Authenticated worker health must be ready')
    const unauthorized = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(5000) })
    assert.equal(unauthorized.status, 401, 'Unauthenticated worker access must be denied')
    for (const url of ['http://127.0.0.1', 'http://169.254.169.254', 'http://[::1]', 'http://2130706433']) {
      const response = await fetch(`${endpoint}/scan`, { method: 'POST', headers, body: JSON.stringify({ url }), signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 400, 'Private and alternate-representation targets must be denied')
    }
    compose(['exec', '-T', '--user', '1000:1000', 'scanner', 'node', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      for (const target of ['http://127.0.0.1:8080/health','http://169.254.169.254','http://172.30.44.2:8080','http://1.1.1.1','https://example.com']) {
        let blocked = false;
        try { await fetch(target,{signal:AbortSignal.timeout(2000)}) } catch { blocked = true }
        assert.ok(blocked,'Direct egress must fail: '+target);
      }
      console.log('PASS: OS policy denies direct loopback, metadata, internal and public egress.');
    `], 20_000)
    process.env.SCANNER_URL = endpoint
    process.env.SCANNER_TOKEN = env.SCANNER_TOKEN
    const scan = scanSchema.parse(await scanWebsite('https://example.com/'))
    assert.match(scan.title, /Example Domain/i)
    assert.ok(scan.screenshots.desktop?.startsWith('data:image/jpeg;base64,'), 'Actual desktop screenshot required')
    assert.ok(scan.screenshots.mobile?.startsWith('data:image/jpeg;base64,'), 'Actual mobile screenshot required')
    console.log(JSON.stringify({ result: 'PASS', target: 'https://example.com/', title: scan.title, status: scan.status, findings: scan.findings.map(f => ({ id: f.id, verification: f.verification })), metrics: scan.metrics, desktopCapture: true, mobileCapture: true }))
  } catch (error) {
    compose(['logs', '--no-color'], 30_000)
    throw error
  } finally { compose(['down', '--remove-orphans'], 60_000) }
}
main().catch(error => { console.error(error instanceof Error ? `${error.message}${error.cause instanceof Error ? `: ${error.cause.message}` : ''}` : 'Scanner smoke failed'); process.exitCode = 1 })
