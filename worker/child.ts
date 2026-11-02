import { assertIsolation } from './isolation'
import { runScan } from './scan'

const config = assertIsolation()
let body = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  body += chunk
  if (body.length > 4096) process.exit(1)
})
process.stdin.on('end', () => {
  void runScan(JSON.parse(body).url, config).then((result) => {
    process.stdout.write(JSON.stringify(result), () => process.exit(0))
  }).catch(() => process.exit(1))
})
