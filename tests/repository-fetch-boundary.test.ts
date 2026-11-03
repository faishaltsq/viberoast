import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepoScanResult } from '../lib/types/report'

// ONLY mock deepseek AI generator, keep all GitHub client and extract logic real!
vi.mock('../lib/ai/deepseek', () => ({
  generateRepoRoast: vi.fn(),
  AiError: class AiError extends Error {},
}))

async function loadModules() {
  const api = await import('../app/api/repository/roast/route')
  const ai = await import('../lib/ai/deepseek')
  const store = await import('../lib/server/store')
  return {
    POST: api.POST,
    ai: vi.mocked(ai.generateRepoRoast),
    store,
  }
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/repository/roast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const validTarget = {
  url: 'https://github.com/octocat/hello-world',
  language: 'en' as const,
  intensity: 'No Mercy' as const,
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  delete (globalThis as typeof globalThis & { vibeRoastState?: unknown }).vibeRoastState
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('TRUST_PROXY', 'false')
})

describe('repository fetch boundary (real client + real extractor with global fetch mock)', () => {
  it('harvests sensitive credentials at client decode boundary spanning/beyond 32 KiB cutoff and redacts echoes', async () => {
    const { POST, ai, store } = await loadModules()

    const pemLineEcho = 'MIIEowIBAAKCAQEA0Y3wAAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ'
    const pemBlock = `-----BEGIN RSA PRIVATE KEY-----\n${pemLineEcho}\n-----END RSA PRIVATE KEY-----`
    const passHead = 'CLIENT_CUTOFF_PASS_HEAD_'
    const passTail = '_CLIENT_CUTOFF_PASS_TAIL_8888'
    const fullPassword = `${passHead}${passTail}`

    // 1. Construct file content > 32,768 bytes where fullPassword spans the 32,768-byte client cutoff
    const pemComment = `/*\n${pemBlock}\n*/\n`
    const headerBytes = Buffer.byteLength(pemComment, 'utf8')
    const assignPrefix = 'const password = "'
    const assignPrefixBytes = Buffer.byteLength(assignPrefix, 'utf8')

    // Position cutoff right in the middle of fullPassword (inside passHead)
    const targetOffset = 32_768 - 10 - assignPrefixBytes
    const padLen = targetOffset - headerBytes
    const padding = '// ' + 'w'.repeat(Math.max(0, padLen - 4)) + '\n'
    const crossingLine = `${assignPrefix}${fullPassword}";\n`
    const trailingContent = '// trailing data beyond client cutoff\n'.repeat(30)
    const bigFileContent = `${pemComment}${padding}${crossingLine}${trailingContent}`
    const bigFileBytes = Buffer.byteLength(bigFileContent, 'utf8')
    expect(bigFileBytes).toBeGreaterThan(32_768)

    // Base64 encode for GitHub API /contents response
    const b64Content = Buffer.from(bigFileContent, 'utf8').toString('base64')

    // Mock globalThis.fetch to route GitHub API calls
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)

      // 1. Repo metadata endpoint
      if (url.includes('/repos/octocat/hello-world') && !url.includes('/contents') && !url.includes('/git/trees')) {
        return new Response(
          JSON.stringify({
            name: 'hello-world',
            owner: { login: 'octocat' },
            default_branch: 'main',
            sha: '1111222233334444555566667777888899990000',
            description: `Repository for testing client cutoff`,
            language: 'TypeScript',
            stargazers_count: 12,
            forks_count: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      // 2. Git tree endpoint
      if (url.includes('/git/trees/')) {
        return new Response(
          JSON.stringify({
            sha: '1111222233334444555566667777888899990000',
            tree: [
              { path: 'src/secret-module.ts', type: 'blob', size: bigFileBytes },
            ],
            truncated: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      // 3. Contents endpoint (single file base64 response)
      if (url.includes('/contents/src/secret-module.ts')) {
        return new Response(
          JSON.stringify({
            type: 'file',
            encoding: 'base64',
            content: b64Content,
            size: bigFileBytes,
            name: 'secret-module.ts',
            path: 'src/secret-module.ts',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      return new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    })

    let capturedModelArg: RepoScanResult | null = null
    ai.mockImplementation(async (scan) => {
      capturedModelArg = scan
      return {
        commentary: {
          verdict: {
            headline: `Verdict echoing bare: ${fullPassword}`,
            summary: `Summary echoing pem: ${pemLineEcho}`,
            developerNickname: 'Inspector',
            reaction: 'suspicious',
          },
          findings: [],
          strengths: [`Strength echoing: ${fullPassword}`],
          overallSummary: `Echo in overall summary: ${fullPassword} and pem: ${pemLineEcho}`,
        },
        visualAnalysis: false,
      }
    })

    const postRes = await POST(postRequest(validTarget))
    expect(postRes.status).toBe(200)
    const postBody = await postRes.json()

    // Assert that real client fetch was executed for contents
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/contents/src/secret-module.ts'),
      expect.anything()
    )

    // 1. Model arguments: neither full password nor fragments present
    expect(capturedModelArg).not.toBeNull()
    const serializedModel = JSON.stringify(capturedModelArg)
    expect(serializedModel).not.toContain(fullPassword)
    expect(serializedModel).not.toContain(passHead)
    expect(serializedModel).not.toContain(passTail)
    expect(serializedModel).not.toContain(pemLineEcho)
    expect(capturedModelArg!.selectedFiles[0]).not.toHaveProperty('content')
    expect(capturedModelArg!.coverage.contentTruncated).toBe(true)

    // 2. POST response: echoes in description and commentary must be redacted
    expect(postBody.repoScan.description).not.toContain(fullPassword)
    expect(postBody.repoScan.description).not.toContain(passHead)
    expect(postBody.repoScan.description).not.toContain(passTail)
    expect(postBody.commentary.verdict.headline).not.toContain(fullPassword)
    expect(postBody.commentary.verdict.headline).not.toContain(passHead)
    expect(postBody.commentary.overallSummary).not.toContain(fullPassword)
    expect(postBody.commentary.overallSummary).not.toContain(pemLineEcho)
    const serializedPost = JSON.stringify(postBody)
    expect(serializedPost).not.toContain(fullPassword)
    expect(serializedPost).not.toContain(passHead)
    expect(serializedPost).not.toContain(passTail)
    expect(serializedPost).not.toContain(pemLineEcho)

    // 3. Store: echoes must be redacted
    const stored = store.getReport(postBody.id)
    const serializedStored = JSON.stringify(stored)
    expect(serializedStored).not.toContain(fullPassword)
    expect(serializedStored).not.toContain(passHead)
    expect(serializedStored).not.toContain(passTail)
    expect(serializedStored).not.toContain(pemLineEcho)

    // 4. GET response: echoes must be redacted
    const { GET } = await import('../app/api/repository/roast/[id]/route')
    const getRes = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: postBody.id }) })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    const serializedGet = JSON.stringify(getBody)
    expect(serializedGet).not.toContain(fullPassword)
    expect(serializedGet).not.toContain(passHead)
    expect(serializedGet).not.toContain(passTail)
    expect(serializedGet).not.toContain(pemLineEcho)
  })
})
