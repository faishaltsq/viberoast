import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepoScanResult } from '../lib/types/report'

vi.mock('../lib/github/client', () => ({
  fetchRepoMeta: vi.fn(),
  fetchFileContent: vi.fn(),
  GitHubError: class GitHubError extends Error {},
}))

vi.mock('../lib/github/tree', () => ({
  fetchTree: vi.fn(),
}))

vi.mock('../lib/ai/deepseek', () => ({
  generateRepoRoast: vi.fn(),
  AiError: class AiError extends Error {},
}))

async function loadModules() {
  const api = await import('../app/api/repository/roast/route')
  const githubClient = await import('../lib/github/client')
  const githubTree = await import('../lib/github/tree')
  const ai = await import('../lib/ai/deepseek')
  const store = await import('../lib/server/store')
  return {
    POST: api.POST,
    meta: vi.mocked(githubClient.fetchRepoMeta),
    fetchFileContent: vi.mocked(githubClient.fetchFileContent),
    tree: vi.mocked(githubTree.fetchTree),
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
  vi.resetModules()
  delete (globalThis as typeof globalThis & { vibeRoastState?: unknown; sourceSanityState?: unknown }).vibeRoastState
  delete (globalThis as typeof globalThis & { vibeRoastState?: unknown; sourceSanityState?: unknown }).sourceSanityState
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('TRUST_PROXY', 'false')
})

describe('repository roast API boundary', () => {
  it('strips source content and redacts synthetic credentials from model, response, and store', async () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const { POST, meta, fetchFileContent, tree, ai, store } = await loadModules()

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: 'main',
      description: 'A friendly test repo',
      language: 'TypeScript',
      stargazerCount: 42,
      forkCount: 5,
    })

    tree.mockResolvedValue({
      files: [
        { path: 'src/index.ts', type: 'file', size: 120 },
        { path: 'package.json', type: 'file', size: 200 },
      ],
      truncated: false,
    })

    const rawFileContent = `// comment with secret: ${secret}\nconst token = "${secret}"\ntry { doThing(); } catch (err) {}`
    fetchFileContent.mockImplementation(async (_owner, _repo, path) => {
      if (path === 'src/index.ts') {
        return {
          content: rawFileContent,
          size: rawFileContent.length,
          truncated: false,
        }
      }
      return {
        content: JSON.stringify({ name: 'hello-world', dependencies: {} }),
        size: 50,
        truncated: false,
      }
    })

    ai.mockImplementation(async (scan) => {
      expect(scan.selectedFiles[0]).not.toHaveProperty('content')
      expect(JSON.stringify(scan)).not.toContain(secret)
      return {
        commentary: {
          verdict: {
            headline: 'Code review complete',
            summary: 'Clean boundary verification.',
            developerNickname: 'Inspector',
            reaction: 'suspicious',
          },
          findings: scan.findings.map((f) => ({
            id: f.id,
            evidenceIds: [f.id],
            roast: 'A roast on your code structure.',
            explanation: f.description,
            recommendation: f.recommendation,
            reaction: 'laughing',
          })),
          strengths: scan.strengths,
          overallSummary: 'Safe audit.',
        },
        visualAnalysis: false,
      }
    })

    const response = await POST(postRequest(validTarget))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')

    const report = await response.json()
    expect(report.repoScan.selectedFiles[0]).not.toHaveProperty('content')
    expect(report.repoScan.selectedFiles[0].path).toBe('src/index.ts')
    expect(JSON.stringify(report)).not.toContain(secret)

    // Verify original code-quality findings from analyzeRepository remain intact
    expect(report.repoScan.findings.length).toBeGreaterThan(0)
    expect(report.repoScan.findings.some((f: { id: string }) => f.id.startsWith('maint-empty-catch-'))).toBe(true)

    // Verify retained store report
    const stored = store.getReport(report.id)
    expect(stored.id).toBe(report.id)
    expect(JSON.stringify(stored)).not.toContain(secret)
    if ('repoScan' in stored && stored.repoScan) {
      expect(stored.repoScan.selectedFiles[0]).not.toHaveProperty('content')
    }

    // Verify GET route
    const { GET } = await import('../app/api/repository/roast/[id]/route')
    const getRes = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: report.id }) })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.repoScan.selectedFiles[0]).not.toHaveProperty('content')
    expect(JSON.stringify(getBody)).not.toContain(secret)

    // Verify console never emitted the raw synthetic credential
    for (const spy of [logSpy, infoSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret)
      }
    }
  })

  it('sanitizes metadata, paths, and branch strings containing synthetic secrets', async () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const { POST, meta, fetchFileContent, tree, ai } = await loadModules()

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: `feature/${secret}`,
      description: `Description with ${secret}`,
      language: 'TypeScript',
      stargazerCount: 1,
      forkCount: 0,
    })

    tree.mockResolvedValue({
      files: [{ path: `config/${secret}.json`, type: 'file', size: 50 }],
      truncated: false,
    })

    fetchFileContent.mockResolvedValue({
      content: '{}',
      size: 2,
      truncated: false,
    })

    ai.mockImplementation(async (scan) => {
      expect(JSON.stringify(scan)).not.toContain(secret)
      return {
        commentary: {
          verdict: {
            headline: 'No issues',
            summary: 'Summary',
            developerNickname: 'Dev',
            reaction: 'helpful',
          },
          findings: [],
          strengths: [],
          overallSummary: 'Done',
        },
        visualAnalysis: false,
      }
    })

    const res = await POST(postRequest(validTarget))
    expect(res.status).toBe(200)
    const report = await res.json()
    expect(JSON.stringify(report)).not.toContain(secret)
    expect(report.repoScan.defaultBranch).toContain('[redacted]')
    expect(report.repoScan.description).toContain('[redacted]')
    expect(report.repoScan.selectedFiles[0].path).toContain('[redacted]')
  })

  it('sanitizes unsafe model echoes in commentary before retention and return', async () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const { POST, meta, fetchFileContent, tree, ai, store } = await loadModules()

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: 'main',
      description: 'Repo',
      language: 'TypeScript',
      stargazerCount: 1,
      forkCount: 0,
    })

    tree.mockResolvedValue({
      files: [{ path: 'index.ts', type: 'file', size: 30 }],
      truncated: false,
    })

    const sourceWithSecret = `const key = "${secret}";`
    fetchFileContent.mockResolvedValue({
      content: sourceWithSecret,
      size: 30,
      truncated: false,
    })

    ai.mockImplementation(async (scan) => ({
      commentary: {
        verdict: {
          headline: `Leaked in commentary headline: ${secret}`,
          summary: `Leaked in summary: ${secret}`,
          developerNickname: 'Echoer',
          reaction: 'shocked',
        },
        findings: scan.findings.map((f) => ({
          id: f.id,
          evidenceIds: [f.id],
          roast: `Leaked in roast: ${secret}`,
          explanation: f.description,
          recommendation: f.recommendation,
          reaction: 'laughing',
        })),
        strengths: [`Strength with ${secret}`],
        overallSummary: `Overall with ${secret}`,
      },
      visualAnalysis: false,
    }))

    const res = await POST(postRequest(validTarget))
    expect(res.status).toBe(200)
    const report = await res.json()
    expect(JSON.stringify(report)).not.toContain(secret)
    expect(report.commentary.verdict.headline).toContain('[redacted]')
    expect(report.commentary.verdict.summary).toContain('[redacted]')
    expect(report.commentary.overallSummary).toContain('[redacted]')

    const stored = store.getReport(report.id)
    expect(JSON.stringify(stored)).not.toContain(secret)
  })

  it('redacts before truncation on multibyte non-ASCII prefixes without leaking fragments', async () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const { POST, meta, fetchFileContent, tree, ai } = await loadModules()

    const emojiPrefix = '🚀'.repeat(240)
    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: 'main',
      description: `${emojiPrefix}${secret}`,
      language: 'TypeScript',
      stargazerCount: 1,
      forkCount: 0,
    })

    tree.mockResolvedValue({
      files: [{ path: 'src/main.ts', type: 'file', size: 10 }],
      truncated: false,
    })

    fetchFileContent.mockResolvedValue({
      content: 'export {}',
      size: 9,
      truncated: false,
    })

    ai.mockImplementation(async () => ({
      commentary: {
        verdict: { headline: 'Safe', summary: 'Safe', developerNickname: 'Dev', reaction: 'helpful' },
        findings: [],
        strengths: [],
        overallSummary: 'Safe',
      },
      visualAnalysis: false,
    }))

    const res = await POST(postRequest(validTarget))
    expect(res.status).toBe(200)
    const report = await res.json()
    expect(JSON.stringify(report)).not.toContain(secret)
    expect(report.repoScan.description.length).toBeLessThanOrEqual(500)
    // Multibyte string check: valid JSON serialization, no broken surrogates
    expect(() => JSON.parse(JSON.stringify(report))).not.toThrow()
  })

  it('fails safely and sanitizes error responses when extraction throws with credentials in error', async () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const { POST, meta, fetchFileContent, tree } = await loadModules()

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: 'main',
      description: 'Safe',
      language: 'TypeScript',
      stargazerCount: 1,
      forkCount: 0,
    })

    tree.mockResolvedValue({
      files: [{ path: 'src/file.ts', type: 'file', size: 10 }],
      truncated: false,
    })

    fetchFileContent.mockRejectedValue(new Error(`Extraction failed at token ${secret}`))

    const res = await POST(postRequest(validTarget))
    expect(res.status).toBe(503)
    const bodyText = await res.text()
    expect(bodyText).not.toContain(secret)
  })

  it('asserts 120-char split tokens and sensitive fragments are absent in model args, retained store, POST, and GET', async () => {
    const { POST, meta, fetchFileContent, tree, ai, store } = await loadModules()

    const secretToken = 'ghp_' + 'A9x8'.repeat(9) // 40 chars
    const prefixFragment = secretToken.slice(0, 12) // first 12 chars: 'ghp_A9x8A9x8'
    const suffixFragment = secretToken.slice(12)

    // Position the secret in a line so it crosses the 120-char boundary:
    // 110 characters of code, then the 40-char secret
    const codePrefix = 'const authHeaderCredentialConfigurationValue = "' + 'x'.repeat(61) + '" + "'
    expect(codePrefix.length).toBe(114)
    const longSourceLine = `${codePrefix}${secretToken}"`

    const permalinkSha = '1111222233334444555566667777888899990000'

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: permalinkSha,
      defaultBranch: 'main',
      description: 'Repository with boundary test',
      language: 'TypeScript',
      stargazerCount: 10,
      forkCount: 2,
    })

    tree.mockResolvedValue({
      files: [{ path: 'src/credentials.ts', type: 'file', size: 300 }],
      truncated: false,
    })

    fetchFileContent.mockResolvedValue({
      content: `${longSourceLine}\n`,
      size: longSourceLine.length + 1,
      truncated: false,
    })

    let capturedModelArg: RepoScanResult | null = null
    ai.mockImplementation(async (scan) => {
      capturedModelArg = scan
      return {
        commentary: {
          verdict: {
            headline: 'Review with safe boundary',
            summary: 'Summary without leaks.',
            developerNickname: 'Dev',
            reaction: 'suspicious',
          },
          findings: scan.findings.map((f) => ({
            id: f.id,
            evidenceIds: [f.id],
            roast: 'Safe roast.',
            explanation: f.description,
            recommendation: f.recommendation,
            reaction: 'laughing',
          })),
          strengths: ['Good isolation'],
          overallSummary: 'Safe overall.',
        },
        visualAnalysis: false,
      }
    })

    const postRes = await POST(postRequest(validTarget))
    expect(postRes.status).toBe(200)
    const postBody = await postRes.json()

    // 1. Check Model Call Arguments: neither secretToken nor prefixFragment can be present
    expect(capturedModelArg).not.toBeNull()
    const serializedModelArg = JSON.stringify(capturedModelArg)
    expect(serializedModelArg).not.toContain(secretToken)
    expect(serializedModelArg).not.toContain(prefixFragment)
    expect(serializedModelArg).not.toContain(suffixFragment)

    // Verify findings in model args: secret and prefix fragment absent from evidence
    const modelFinding = capturedModelArg!.findings.find((f: { location: string }) => f.location.startsWith('src/credentials.ts'))
    expect(modelFinding).toBeDefined()
    expect(modelFinding!.evidence[0]).toContain('[redac')
    expect(modelFinding!.evidence[0]).not.toContain(secretToken)
    expect(modelFinding!.evidence[0]).not.toContain(prefixFragment)
    expect(modelFinding!.evidence[0].length).toBeLessThanOrEqual(120)

    // Verify pinned commit SHA is preserved in scan
    expect(capturedModelArg!.sha).toBe(permalinkSha)

    // 2. Check POST response: neither secretToken nor fragments present
    const serializedPostBody = JSON.stringify(postBody)
    expect(serializedPostBody).not.toContain(secretToken)
    expect(serializedPostBody).not.toContain(prefixFragment)
    expect(serializedPostBody).not.toContain(suffixFragment)
    expect(postBody.repoScan.selectedFiles[0]).not.toHaveProperty('content')

    // 3. Check Retained Store: neither secretToken nor fragments present
    const stored = store.getReport(postBody.id)
    const serializedStored = JSON.stringify(stored)
    expect(serializedStored).not.toContain(secretToken)
    expect(serializedStored).not.toContain(prefixFragment)
    expect(serializedStored).not.toContain(suffixFragment)

    // 4. Check GET response: neither secretToken nor fragments present
    const { GET } = await import('../app/api/repository/roast/[id]/route')
    const getRes = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: postBody.id }) })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    const serializedGetBody = JSON.stringify(getBody)
    expect(serializedGetBody).not.toContain(secretToken)
    expect(serializedGetBody).not.toContain(prefixFragment)
    expect(serializedGetBody).not.toContain(suffixFragment)
    expect(getBody.repoScan.selectedFiles[0]).not.toHaveProperty('content')
  })

  it('prevents leaks across model args, store, POST, and GET on >32,768 truncated files with eval and split credentials', async () => {
    const { POST, meta, fetchFileContent, tree, ai, store } = await loadModules()

    const pemKeyFragment = 'MIIEowIBAAKCAQEA0Y3wAAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ'
    const pemBlock = `-----BEGIN RSA PRIVATE KEY-----\n${pemKeyFragment}\n-----END RSA PRIVATE KEY-----`
    const splitPasswordPart1 = 'TOPSECRET_SPLIT_HEAD_'
    const splitPasswordPart2 = '_TOPSECRET_SPLIT_TAIL_'
    const fullSecretPassword = `${splitPasswordPart1}${splitPasswordPart2}`

    // Construct truncated source file (> 32,768 bytes) with PEM block, multibyte non-ASCII UTF-8,
    // and an eval() statement followed by a split password crossing the 32,768-byte truncation boundary.
    const nonAsciiComment = '// Non-ASCII UTF-8 characters: 🚀🔥✨\n'
    const pemComment = `/*\n${pemBlock}\n*/\n`
    const header = `${nonAsciiComment}${pemComment}`
    const headerBytes = Buffer.byteLength(header, 'utf8')

    // Line with eval and password assignment:
    const evalStatement = 'eval("arbitrary dynamic execution"); const superSecretPass = "'
    const evalBytes = Buffer.byteLength(evalStatement, 'utf8')

    // Desired byte offset for start of eval line so byte 32,768 falls inside splitPasswordPart1
    const targetOffset = 32_768 - 10 - evalBytes
    const paddingNeeded = targetOffset - headerBytes
    const padding = '// ' + 'x'.repeat(Math.max(0, paddingNeeded - 4)) + '\n'

    const crossingLine = `${evalStatement}${fullSecretPassword}";\n`
    const trailingContent = '// trailing content beyond truncation cutoff\n'.repeat(30)
    const bigFileContent = `${header}${padding}${crossingLine}${trailingContent}`

    const bigFileBytes = Buffer.byteLength(bigFileContent, 'utf8')
    expect(bigFileBytes).toBeGreaterThan(32_768)

    // Verify the exact cutoff: byte 32,768 falls inside splitPasswordPart1
    const rawBuffer = Buffer.from(bigFileContent, 'utf8')
    const clippedBufferStr = rawBuffer.subarray(0, 32_768).toString('utf8')
    expect(clippedBufferStr).toContain('eval("arbitrary dynamic execution")')
    expect(clippedBufferStr).toContain(splitPasswordPart1.slice(0, 8))
    // Clipped content does NOT contain splitPasswordPart2 or closing quote
    expect(clippedBufferStr).not.toContain(splitPasswordPart2)
    expect(clippedBufferStr).not.toContain(`${fullSecretPassword}"`)

    // Normal non-truncated file to assert normal quality workflows are preserved
    const normalFileContent = `export function calc() {\n  try {\n    compute();\n  } catch (err) {}\n}\n`

    const permalinkSha = '1111222233334444555566667777888899990000'

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: permalinkSha,
      defaultBranch: 'main',
      description: 'Repository with truncation regression',
      language: 'TypeScript',
      stargazerCount: 15,
      forkCount: 3,
    })

    tree.mockResolvedValue({
      files: [
        { path: 'src/big-module.ts', type: 'file', size: bigFileBytes },
        { path: 'src/normal-module.ts', type: 'file', size: Buffer.byteLength(normalFileContent, 'utf8') },
      ],
      truncated: false,
    })

    fetchFileContent.mockImplementation(async (_owner, _repo, path) => {
      if (path === 'src/big-module.ts') {
        return {
          content: bigFileContent,
          size: bigFileBytes,
          truncated: false,
        }
      }
      if (path === 'src/normal-module.ts') {
        return {
          content: normalFileContent,
          size: Buffer.byteLength(normalFileContent, 'utf8'),
          truncated: false,
        }
      }
      return { content: '{}', size: 2, truncated: false }
    })

    let capturedModelArg: RepoScanResult | null = null
    ai.mockImplementation(async (scan) => {
      capturedModelArg = scan
      return {
        commentary: {
          verdict: {
            headline: 'Safe boundary evaluation',
            summary: 'Truncated evidence omitted safely.',
            developerNickname: 'Inspector',
            reaction: 'suspicious',
          },
          findings: scan.findings.map((f) => ({
            id: f.id,
            evidenceIds: [f.id],
            roast: 'Safe roast on finding.',
            explanation: f.description,
            recommendation: f.recommendation,
            reaction: 'laughing',
          })),
          strengths: ['Safe architecture'],
          overallSummary: 'Safe summary.',
        },
        visualAnalysis: false,
      }
    })

    const postRes = await POST(postRequest(validTarget))
    expect(postRes.status).toBe(200)
    const postBody = await postRes.json()

    // 1. Model call arguments check
    expect(capturedModelArg).not.toBeNull()
    const serializedModel = JSON.stringify(capturedModelArg)
    expect(serializedModel).not.toContain(splitPasswordPart1)
    expect(serializedModel).not.toContain(splitPasswordPart2)
    expect(serializedModel).not.toContain(pemKeyFragment)
    expect(capturedModelArg!.selectedFiles[0]).not.toHaveProperty('content')
    expect(capturedModelArg!.coverage.contentTruncated).toBe(true)

    // Check findings in model args:
    // Dynamic eval finding for big-module.ts MUST be present (detector fact preserved)
    const evalFinding = capturedModelArg!.findings.find((f: { id: string }) => f.id.startsWith('sec-dynamic-eval-'))
    expect(evalFinding).toBeDefined()
    expect(evalFinding!.verification).toBe('verified')
    // Evidence MUST be suppressed with fixed string, not raw source line
    expect(evalFinding!.evidence).toEqual(['[source evidence omitted: file content truncated]'])
    expect(evalFinding!.evidence[0]).not.toContain(splitPasswordPart1)
    expect(evalFinding!.evidence[0]).not.toContain(evalStatement)

    // Normal non-truncated workflow preserved: empty-catch finding has intact raw snippet
    const normalFinding = capturedModelArg!.findings.find((f: { id: string }) => f.id.startsWith('maint-empty-catch-'))
    expect(normalFinding).toBeDefined()
    expect(normalFinding!.verification).toBe('verified')
    expect(normalFinding!.evidence[0]).toContain('catch (err) {}')

    // 2. Retained store check
    const stored = store.getReport(postBody.id)
    const serializedStored = JSON.stringify(stored)
    expect(serializedStored).not.toContain(splitPasswordPart1)
    expect(serializedStored).not.toContain(splitPasswordPart2)
    expect(serializedStored).not.toContain(pemKeyFragment)
    if ('repoScan' in stored && stored.repoScan) {
      expect(stored.repoScan.selectedFiles[0]).not.toHaveProperty('content')
      expect(stored.repoScan.coverage.contentTruncated).toBe(true)
    }

    // 3. POST response check
    const serializedPost = JSON.stringify(postBody)
    expect(serializedPost).not.toContain(splitPasswordPart1)
    expect(serializedPost).not.toContain(splitPasswordPart2)
    expect(serializedPost).not.toContain(pemKeyFragment)
    expect(postBody.repoScan.selectedFiles[0]).not.toHaveProperty('content')
    expect(postBody.repoScan.coverage.contentTruncated).toBe(true)
    expect(postBody.repoScan.findings.some((f: { id: string }) => f.id.startsWith('sec-dynamic-eval-'))).toBe(true)
    expect(postBody.repoScan.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('budget limits')])
    )

    // 4. GET response check
    const { GET } = await import('../app/api/repository/roast/[id]/route')
    const getRes = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: postBody.id }) })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    const serializedGet = JSON.stringify(getBody)
    expect(serializedGet).not.toContain(splitPasswordPart1)
    expect(serializedGet).not.toContain(splitPasswordPart2)
    expect(serializedGet).not.toContain(pemKeyFragment)
    expect(getBody.repoScan.selectedFiles[0]).not.toHaveProperty('content')
    expect(getBody.repoScan.coverage.contentTruncated).toBe(true)
  })

  it('redacts bare opaque echoes in metadata and provider commentary for passwords spanning cutoff and PEM line echoes', async () => {
    const { POST, meta, fetchFileContent, tree, ai, store } = await loadModules()

    const pemLineEcho = 'MIIEowIBAAKCAQEA0Y3wAAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ'
    const pemBlock = `-----BEGIN RSA PRIVATE KEY-----\n${pemLineEcho}\n-----END RSA PRIVATE KEY-----`
    const passHead = 'SPAN_PASS_HEAD_'
    const passTail = '_SPAN_PASS_TAIL_9999'
    const fullPassword = `${passHead}${passTail}`

    // Construct file > 32,768 bytes where fullPassword spans the 32,768 cutoff
    const pemComment = `/*\n${pemBlock}\n*/\n`
    const headerBytes = Buffer.byteLength(pemComment, 'utf8')
    const assignPrefix = 'const password = "'
    const assignPrefixBytes = Buffer.byteLength(assignPrefix, 'utf8')

    // Position cutoff inside passHead
    const targetOffset = 32_768 - 8 - assignPrefixBytes
    const padLen = targetOffset - headerBytes
    const padding = '// ' + 'z'.repeat(Math.max(0, padLen - 4)) + '\n'
    const crossingLine = `${assignPrefix}${fullPassword}";\n`
    const trailing = '// tail beyond cutoff\n'.repeat(30)
    const bigFileContent = `${pemComment}${padding}${crossingLine}${trailing}`
    const bigFileBytes = Buffer.byteLength(bigFileContent, 'utf8')

    // Confirm that byte 32,768 cuts off inside fullPassword
    const clipped = Buffer.from(bigFileContent, 'utf8').subarray(0, 32_768).toString('utf8')
    expect(clipped).not.toContain(passTail)
    expect(clipped).not.toContain(`${fullPassword}"`)

    // Metadata and provider commentary echoing the bare password and bare PEM line
    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: 'main',
      description: `Echo in repo description: ${fullPassword} and pem: ${pemLineEcho}`,
      language: 'TypeScript',
      stargazerCount: 1,
      forkCount: 0,
    })

    tree.mockResolvedValue({
      files: [{ path: 'src/config.ts', type: 'file', size: bigFileBytes }],
      truncated: false,
    })

    fetchFileContent.mockResolvedValue({
      content: bigFileContent,
      size: bigFileBytes,
      truncated: false,
    })

    ai.mockImplementation(async (scan) => {
      // Model arguments must not leak the raw password
      expect(JSON.stringify(scan)).not.toContain(fullPassword)
      return {
        commentary: {
          verdict: {
            headline: `Echoing in headline: ${fullPassword}`,
            summary: `Echoing in summary: ${pemLineEcho}`,
            developerNickname: 'EchoJudge',
            reaction: 'suspicious',
          },
          findings: [],
          strengths: [`Strength echoing: ${fullPassword}`],
          overallSummary: `Echo in overall summary: ${fullPassword} and ${pemLineEcho}`,
        },
        visualAnalysis: false,
      }
    })

    const postRes = await POST(postRequest(validTarget))
    expect(postRes.status).toBe(200)
    const postBody = await postRes.json()

    // POST response must have redacted the bare password and PEM line echoes in metadata and commentary
    expect(postBody.repoScan.description).not.toContain(fullPassword)
    expect(postBody.repoScan.description).not.toContain(pemLineEcho)
    expect(postBody.commentary.verdict.headline).not.toContain(fullPassword)
    expect(postBody.commentary.verdict.summary).not.toContain(pemLineEcho)
    expect(postBody.commentary.overallSummary).not.toContain(fullPassword)
    expect(postBody.commentary.overallSummary).not.toContain(pemLineEcho)
    expect(JSON.stringify(postBody)).not.toContain(fullPassword)
    expect(JSON.stringify(postBody)).not.toContain(pemLineEcho)

    // Store must also be redacted
    const stored = store.getReport(postBody.id)
    expect(JSON.stringify(stored)).not.toContain(fullPassword)
    expect(JSON.stringify(stored)).not.toContain(pemLineEcho)

    // GET response must also be redacted
    const { GET } = await import('../app/api/repository/roast/[id]/route')
    const getRes = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: postBody.id }) })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(JSON.stringify(getBody)).not.toContain(fullPassword)
    expect(JSON.stringify(getBody)).not.toContain(pemLineEcho)
  })

  it('guarantees new securityFindings and securityCoverage fields are secret-free across model args, store, POST, and GET', async () => {
    const rawSecret = 'ghp_' + 'Secr'.repeat(9)
    const { POST, meta, fetchFileContent, tree, ai, store } = await loadModules()

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: 'main',
      description: 'Test repository',
      language: 'TypeScript',
      stargazerCount: 10,
      forkCount: 1,
    })

    tree.mockResolvedValue({
      files: [
        { path: 'src/index.ts', type: 'file', size: 50 },
        { path: 'server/credentials.ts', type: 'file', size: 100 },
      ],
      truncated: false,
    })

    fetchFileContent.mockImplementation(async (_owner, _repo, path) => {
      if (path === 'server/credentials.ts') {
        const content = `const secret = "${rawSecret}";\n`
        return {
          content,
          size: content.length,
          truncated: false,
          unclippedSensitiveValues: [rawSecret],
        }
      }
      return {
        content: 'console.log("clean");\n',
        size: 22,
        truncated: false,
      }
    })

    let modelArgsScan: RepoScanResult | null = null
    ai.mockImplementation(async (scan) => {
      modelArgsScan = scan
      return {
        commentary: {
          verdict: {
            headline: 'Safe headline',
            summary: 'Safe summary',
            developerNickname: 'Safe Dev',
            reaction: 'suspicious',
          },
          findings: [],
          strengths: [],
          overallSummary: 'Safe summary',
        },
        visualAnalysis: false,
      }
    })

    const response = await POST(postRequest(validTarget))
    expect(response.status).toBe(200)
    const postBody = await response.json()

    // 1. Model arguments verification
    expect(modelArgsScan).not.toBeNull()
    expect(modelArgsScan!.securityCoverage).toBeDefined()
    expect(modelArgsScan!.securityFindings).toBeDefined()
    expect(JSON.stringify(modelArgsScan!.securityFindings)).not.toContain(rawSecret)
    expect(JSON.stringify(modelArgsScan!.securityCoverage)).not.toContain(rawSecret)

    // 2. POST response verification
    expect(postBody.repoScan.securityCoverage).toBeDefined()
    expect(postBody.repoScan.securityFindings).toBeDefined()
    expect(JSON.stringify(postBody.repoScan.securityFindings)).not.toContain(rawSecret)
    expect(JSON.stringify(postBody.repoScan.securityCoverage)).not.toContain(rawSecret)
    expect(postBody.repoScan.securityCoverage.filesDiscovered).toBe(2)
    expect(postBody.repoScan.securityCoverage.statusCounts.inspected).toBeGreaterThanOrEqual(1)

    // 3. Store verification
    const stored = store.getReport(postBody.id)
    expect(stored).toBeDefined()
    expect(stored && 'repoScan' in stored && stored.repoScan).toBeTruthy()
    if (stored && 'repoScan' in stored && stored.repoScan) {
      expect(stored.repoScan.securityCoverage).toBeDefined()
      expect(stored.repoScan.securityFindings).toBeDefined()
      expect(JSON.stringify(stored.repoScan.securityFindings)).not.toContain(rawSecret)
      expect(JSON.stringify(stored.repoScan.securityCoverage)).not.toContain(rawSecret)
    }

    // 4. GET response verification
    const { GET } = await import('../app/api/repository/roast/[id]/route')
    const getRes = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: postBody.id }) })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.repoScan.securityCoverage).toBeDefined()
    expect(getBody.repoScan.securityFindings).toBeDefined()
    expect(JSON.stringify(getBody.repoScan.securityFindings)).not.toContain(rawSecret)
    expect(JSON.stringify(getBody.repoScan.securityCoverage)).not.toContain(rawSecret)
  })

  it('exposes explicit total and omitted security findings counts with deterministic priority when findings exceed 100 without losing scope', async () => {
    const { POST, meta, fetchFileContent, tree, ai } = await loadModules()

    meta.mockResolvedValue({
      owner: 'octocat',
      repo: 'hello-world',
      sha: '1111222233334444555566667777888899990000',
      defaultBranch: 'main',
      description: 'Many secrets repo',
      language: 'TypeScript',
      stargazerCount: 1,
      forkCount: 0,
    })

    // 105 files that will each trigger a filename security finding across tree entries
    const treeFiles = Array.from({ length: 105 }, (_, i) => ({
      path: `packages/pkg-${String(i).padStart(3, '0')}/.env`,
      type: 'file' as const,
      size: 50,
    }))
    tree.mockResolvedValue({
      files: treeFiles,
      truncated: false,
    })

    fetchFileContent.mockImplementation(async () => ({
      content: `PORT=3000\n`,
      size: 10,
      truncated: false,
    }))

    ai.mockResolvedValue({
      commentary: {
        verdict: {
          headline: 'Safe headline',
          summary: 'Safe summary',
          developerNickname: 'Safe Dev',
          reaction: 'suspicious',
        },
        findings: [],
        strengths: [],
        overallSummary: 'Safe summary',
      },
      visualAnalysis: false,
    })

    const response = await POST(postRequest(validTarget))
    expect(response.status).toBe(200)
    const postBody = await response.json()

    // Deterministic priority and cap
    expect(postBody.repoScan.securityFindings).toHaveLength(100)
    expect(postBody.repoScan.totalSecurityFindings).toBe(105)
    expect(postBody.repoScan.omittedSecurityFindings).toBe(5)
    expect(postBody.repoScan.securityCoverage?.totalSecurityFindings).toBe(105)
    expect(postBody.repoScan.securityCoverage?.omittedSecurityFindings).toBe(5)

    // No misleading lost security scope warning
    const warningsText = JSON.stringify(postBody.repoScan.warnings || [])
    expect(warningsText.toLowerCase()).not.toContain('lost security scope')

    // GET response verification
    const { GET } = await import('../app/api/repository/roast/[id]/route')
    const getRes = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: postBody.id }) })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.repoScan.totalSecurityFindings).toBe(105)
    expect(getBody.repoScan.omittedSecurityFindings).toBe(5)
  })
})
