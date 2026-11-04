import { startMockAuthServer } from './mock-auth'

const port = Number(process.env.MOCK_AUTH_PORT || 3301)

startMockAuthServer(port)
  .then(({ url }) => {
    // Process stdout used by tools / logs
    process.stdout.write(`Mock Supabase Auth Server running at ${url}\n`)
  })
  .catch(err => {
    process.stderr.write(`Failed to start mock auth server: ${err.message}\n`)
    process.exit(1)
  })
