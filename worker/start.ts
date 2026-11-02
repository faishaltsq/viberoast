import { createEgressProxy } from './proxy'
import { createScannerServer } from './server'
import { assertIsolation } from './isolation'

if (process.argv[2] === 'proxy') {
  createEgressProxy({ workerIp: process.env.WORKER_IP ?? '' }).listen(3128, '0.0.0.0')
} else if (process.argv[2] === 'scanner') {
  assertIsolation()
  createScannerServer(process.env.SCANNER_TOKEN ?? '').listen(8080, '0.0.0.0')
} else {
  throw new Error('Choose the scanner or proxy service explicitly')
}
