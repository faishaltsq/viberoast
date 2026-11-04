import { describe, expect, it } from 'vitest'
import { analyzeRepository } from '../lib/analysis/repository'
import type { AnalysisContext } from '../lib/analysis/types'
import { checkStructure } from '../lib/analysis/checks/structure'
import { checkMaintainability } from '../lib/analysis/checks/maintainability'
import { checkTestingCi } from '../lib/analysis/checks/testing-ci'
import { checkDependencies } from '../lib/analysis/checks/dependencies'
import { checkSecurity } from '../lib/analysis/checks/security'
import { checkGitDx } from '../lib/analysis/checks/git-dx'
import { deduplicateFindings } from '../lib/analysis/deduplicate'
import { prioritizeFindings } from '../lib/analysis/prioritize'

it('never copies opaque source arguments into security evidence', () => {
  const opaque = 'opaque-fixture-outside-known-credential-formats'
  const content = `eval("${opaque}"); const note = "${opaque}"`
  const findings = checkSecurity(createMockContext({
    files: [{ path: 'src/runtime.ts', size: content.length, content, truncated: false }],
  }))
  expect(findings.some(f => f.id.startsWith('sec-dynamic-eval-'))).toBe(true)
  expect(JSON.stringify(findings)).not.toContain(opaque)
  expect(findings.flatMap(f => f.evidence).join(' ')).toContain('source arguments withheld')
})

function createMockContext(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    owner: 'test-owner',
    repo: 'test-repo',
    sha: '1111222233334444555566667777888899990000',
    tree: [
      { path: 'README.md', size: 200, type: 'file' },
      { path: '.gitignore', size: 50, type: 'file' },
      { path: 'LICENSE', size: 1000, type: 'file' },
      { path: 'package.json', size: 300, type: 'file' },
      { path: 'package-lock.json', size: 1000, type: 'file' },
      { path: '.github/workflows/ci.yml', size: 400, type: 'file' },
      { path: 'src/index.ts', size: 500, type: 'file' },
      { path: 'src/index.test.ts', size: 300, type: 'file' },
    ],
    files: [
      {
        path: 'package.json',
        size: 300,
        truncated: false,
        content: JSON.stringify({
          name: 'clean-app',
          scripts: { test: 'vitest run' },
          dependencies: { react: '^19.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        }),
      },
      {
        path: 'README.md',
        size: 200,
        truncated: false,
        content: '# Clean App\n\nThis is a well-documented clean test application with clear instructions.',
      },
      {
        path: 'src/index.ts',
        size: 150,
        truncated: false,
        content: 'export function greet(name: string): string {\n  return `Hello, ${name}!`\n}\n',
      },
    ],
    meta: {
      owner: 'test-owner',
      repo: 'test-repo',
      defaultBranch: 'main',
      sha: '1111222233334444555566667777888899990000',
      description: 'A test repository',
      language: 'TypeScript',
      stargazerCount: 42,
      forkCount: 7,
      commitDate: '2026-11-01T10:00:00Z',
      commitMessage: 'feat: implement greeting module with test coverage',
    },
    ...overrides,
  }
}

describe('Repository Analysis Engine', () => {
  it('returns clean analysis with strengths for a well-structured repository', () => {
    const ctx = createMockContext()
    const result = analyzeRepository(ctx)

    expect(result.findings).toHaveLength(0)
    expect(result.strengths.length).toBeGreaterThan(0)
    expect(result.strengths).toContain('Automated CI/CD pipeline configured for continuous integration.')
    expect(result.strengths).toContain('Automated test suite detected with dedicated test files.')
    expect(result.strengths).toContain('Reproducible dependency lockfile committed to source control.')
  })

  describe('Structure Checks', () => {
    it('detects monolithic files exceeding 500 lines', () => {
      const hugeContent = Array.from({ length: 550 }, (_, i) => `// line ${i + 1}`).join('\n')
      const ctx = createMockContext({
        files: [
          { path: 'src/huge.ts', size: 12000, content: hugeContent, truncated: false },
        ],
      })
      const findings = checkStructure(ctx)
      const largeFileFinding = findings.find((f) => f.id.includes('large-file'))
      expect(largeFileFinding).toBeDefined()
      expect(largeFileFinding?.category).toBe('Architecture')
      expect(largeFileFinding?.githubPermaUrl).toContain('src/huge.ts#L1-L550')
    })

    it('detects deeply nested directories', () => {
      const ctx = createMockContext({
        tree: [
          { path: 'a/b/c/d/e/f/deep.ts', type: 'file', size: 100 },
        ],
      })
      const findings = checkStructure(ctx)
      expect(findings.some((f) => f.id === 'struct-deep-nesting')).toBe(true)
    })
  })

  describe('Maintainability Checks', () => {
    it('detects silent error swallowing in catch blocks', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'src/broken.ts',
            size: 100,
            truncated: false,
            content: 'try {\n  riskyOperation()\n} catch (err) {}\n',
          },
        ],
      })
      const findings = checkMaintainability(ctx)
      const catchFinding = findings.find((f) => f.id.includes('empty-catch'))
      expect(catchFinding).toBeDefined()
      expect(catchFinding?.severity).toBe('high')
      expect(catchFinding?.location).toBe('src/broken.ts:3')
    })

    it('detects excessive `any` types in TypeScript', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'src/any.ts',
            size: 200,
            truncated: false,
            content: 'const a: any = 1\nconst b: any = 2\nconst c: any = 3\n',
          },
        ],
      })
      const findings = checkMaintainability(ctx)
      expect(findings.some((f) => f.id.includes('ts-any'))).toBe(true)
    })

    it('detects hardcoded localhost endpoints', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'src/api.ts',
            size: 200,
            truncated: false,
            content: 'const endpoint = "http://localhost:3000/api/users"\n',
          },
        ],
      })
      const findings = checkMaintainability(ctx)
      const localFinding = findings.find((f) => f.id.includes('localhost'))
      expect(localFinding).toBeDefined()
      expect(localFinding?.evidence[0]).toContain('http://localhost:3000')
    })
  })

  describe('Testing and CI Checks', () => {
    it('detects missing CI workflow', () => {
      const ctx = createMockContext({
        tree: [
          { path: 'src/index.ts', type: 'file', size: 100 },
        ],
      })
      const findings = checkTestingCi(ctx)
      expect(findings.some((f) => f.id === 'ci-missing-workflow')).toBe(true)
    })

    it('detects zero test files', () => {
      const ctx = createMockContext({
        tree: [
          { path: 'src/index.ts', type: 'file', size: 100 },
        ],
      })
      const findings = checkTestingCi(ctx)
      expect(findings.some((f) => f.id === 'test-no-test-files')).toBe(true)
    })

    it('detects default placeholder npm test script', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'package.json',
            size: 150,
            truncated: false,
            content: JSON.stringify({
              name: 'app',
              scripts: { test: 'echo "Error: no test specified" && exit 1' },
            }),
          },
        ],
      })
      const findings = checkTestingCi(ctx)
      expect(findings.some((f) => f.id === 'test-unconfigured-test-script')).toBe(true)
    })
  })

  describe('Dependency Checks', () => {
    it('detects missing lockfile when package.json is present', () => {
      const ctx = createMockContext({
        tree: [
          { path: 'package.json', type: 'file', size: 100 },
        ],
      })
      const findings = checkDependencies(ctx)
      expect(findings.some((f) => f.id === 'dep-missing-lockfile')).toBe(true)
    })

    it('detects build tools in production dependencies', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'package.json',
            size: 200,
            truncated: false,
            content: JSON.stringify({
              dependencies: {
                typescript: '^5.0.0',
                eslint: '^9.0.0',
                express: '^4.19.0',
              },
            }),
          },
        ],
      })
      const findings = checkDependencies(ctx)
      const devFinding = findings.find((f) => f.id === 'dep-dev-in-prod')
      expect(devFinding).toBeDefined()
      expect(devFinding?.evidence.some((e) => e.includes('typescript'))).toBe(true)
    })

    it('detects wildcard dependency versions', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'package.json',
            size: 150,
            truncated: false,
            content: JSON.stringify({
              dependencies: {
                lodash: '*',
              },
            }),
          },
        ],
      })
      const findings = checkDependencies(ctx)
      expect(findings.some((f) => f.id === 'dep-wildcard-versions')).toBe(true)
    })
  })

  describe('Security Checks', () => {
    it('detects committed .env file', () => {
      const ctx = createMockContext({
        tree: [
          { path: '.env', type: 'file', size: 100 },
        ],
      })
      const findings = checkSecurity(ctx)
      expect(findings.some((f) => f.id === 'sec-committed-env-file')).toBe(true)
    })

    it('detects nested .env variants, private keys, and config credentials across all tree entries with line numbers absent', () => {
      const ctx = createMockContext({
        tree: [
          { path: '.env', type: 'file', size: 100 },
          { path: 'apps/web/.env.local', type: 'file', size: 100 },
          { path: 'services/api/.env.staging', type: 'file', size: 100 },
          { path: '.env.example', type: 'file', size: 100 },
          { path: 'certs/server.key', type: 'file', size: 100 },
          { path: 'keys/id_rsa', type: 'file', size: 100 },
          { path: 'config/public.pem', type: 'file', size: 100 },
          { path: 'config/credentials.json', type: 'file', size: 100 },
          { path: 'auth/service-account.json', type: 'file', size: 100 },
        ],
      })

      const findings = checkSecurity(ctx)

      // Nested .env
      const nestedEnv = findings.find((f) => f.filePath === 'apps/web/.env.local')
      expect(nestedEnv).toBeDefined()
      expect(nestedEnv?.severity).toBe('medium')
      expect(nestedEnv?.lineStart).toBeUndefined()
      expect(nestedEnv?.lineEnd).toBeUndefined()
      expect(nestedEnv?.description).not.toContain('containing plaintext credentials')

      // .env.example: metadata risk only, no verified private credential claim
      const envExample = findings.find((f) => f.filePath === '.env.example')
      expect(envExample).toBeDefined()
      expect(envExample?.severity).toBe('medium')
      expect(envExample?.lineStart).toBeUndefined()
      expect(envExample?.description).not.toContain('containing plaintext credentials')

      // Keys
      const serverKey = findings.find((f) => f.filePath === 'certs/server.key')
      expect(serverKey).toBeDefined()
      expect(serverKey?.severity).toBe('medium')
      expect(serverKey?.lineStart).toBeUndefined()

      // config/public.pem: metadata risk, no private credential claim
      const publicPem = findings.find((f) => f.filePath === 'config/public.pem')
      expect(publicPem).toBeDefined()
      expect(publicPem?.severity).toBe('medium')
      expect(publicPem?.lineStart).toBeUndefined()
      expect(publicPem?.description).not.toContain('containing plaintext private key')

      // Config credentials
      const creds = findings.find((f) => f.filePath === 'config/credentials.json')
      expect(creds).toBeDefined()
      expect(creds?.severity).toBe('medium')
      expect(creds?.lineStart).toBeUndefined()

      const sa = findings.find((f) => f.filePath === 'auth/service-account.json')
      expect(sa).toBeDefined()
      expect(sa?.severity).toBe('medium')
      expect(sa?.lineStart).toBeUndefined()
    })

    it('produces distinct bounded IDs for long shared-prefix paths and path punctuation collisions that deduplication retains', () => {
      const longPrefix = 'services/authentication/oauth-provider/credentials/enterprise-directory-v2/'
      const path1 = `${longPrefix}cluster-primary/service-account.json`
      const path2 = `${longPrefix}cluster-secondary/service-account.json`
      const punct1 = 'certs/server_key.pem'
      const punct2 = 'certs/server-key.pem'

      const ctx = createMockContext({
        tree: [
          { path: path1, type: 'file', size: 100 },
          { path: path2, type: 'file', size: 100 },
          { path: punct1, type: 'file', size: 100 },
          { path: punct2, type: 'file', size: 100 },
        ],
      })

      const rawFindings = checkSecurity(ctx)
      expect(rawFindings).toHaveLength(4)

      for (const finding of rawFindings) {
        expect(finding.id.length).toBeLessThanOrEqual(100)
      }

      const ids = new Set(rawFindings.map((f) => f.id))
      expect(ids.size).toBe(4)

      const deduped = deduplicateFindings(rawFindings)
      expect(deduped).toHaveLength(4)
      expect(deduped.map((f) => f.filePath)).toEqual(
        expect.arrayContaining([path1, path2, punct1, punct2])
      )
    })

    it('detects hardcoded AWS access keys and redacts evidence', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'src/aws.ts',
            size: 200,
            truncated: false,
            content: 'const accessKey = "AKIA1234567890ABCDEF"\n',
          },
        ],
      })
      const findings = checkSecurity(ctx)
      const secretFinding = findings.find((f) => f.id.includes('hardcoded-secret'))
      expect(secretFinding).toBeDefined()
      expect(secretFinding?.severity).toBe('medium')
      expect(secretFinding?.evidence[0]).toContain('[redacted]')
    })

    it('redacts tokens crossing the 120-char evidence boundary before clipping without leaving split prefix fragments', () => {
      const secretToken = 'AKIA1234567890ABCDEF' // 20 chars
      // Position secret so that character 120 falls right inside the token
      const fullLine = `${'a'.repeat(105)} = "${secretToken}" + "${'b'.repeat(30)}"`
      const prefixFragment = secretToken.slice(0, 11) // e.g. 'AKIA1234567'

      const ctx = createMockContext({
        files: [
          {
            path: 'src/config.ts',
            size: 500,
            truncated: false,
            content: `${fullLine}\n`,
          },
        ],
        sensitiveValues: [secretToken],
      })

      const findings = checkSecurity(ctx)
      const finding = findings.find((f) => f.id.includes('hardcoded-secret'))
      expect(finding).toBeDefined()
      expect(finding?.evidence[0].length).toBeLessThanOrEqual(120)
      // Evidence must NOT contain the secret or its prefix fragment
      expect(finding?.evidence[0]).not.toContain(secretToken)
      expect(finding?.evidence[0]).not.toContain(prefixFragment)
      expect(finding?.evidence[0]).toContain('[redacted]')
    })

    it('handles multibyte non-ASCII and emoji prefixes before 120-char clipping boundary safely', () => {
      const emojiPrefix = '🚀🔥🎉'.repeat(30)
      const secretToken = 'AKIA1234567890ABCDEF'
      const line = `${emojiPrefix} ${secretToken}`

      const ctx = createMockContext({
        files: [
          {
            path: 'src/emoji-secret.ts',
            size: 500,
            truncated: false,
            content: `${line}\n`,
          },
        ],
        sensitiveValues: [secretToken],
      })

      const findings = checkSecurity(ctx)
      const finding = findings.find((f) => f.id.includes('hardcoded-secret'))
      expect(finding).toBeDefined()
      expect(finding?.evidence[0].length).toBeLessThanOrEqual(120)
      expect(finding?.evidence[0]).not.toContain(secretToken)
      // Must not end with broken surrogate
      expect(/[\uD800-\uDBFF]$/.test(finding?.evidence[0] || '')).toBe(false)
    })

    it('detects dangerous eval execution', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'src/dangerous.ts',
            size: 100,
            truncated: false,
            content: 'eval(userInput)\n',
          },
        ],
      })
      const findings = checkSecurity(ctx)
      expect(findings.some((f) => f.id.includes('dynamic-eval'))).toBe(true)
    })
  })

  describe('Git & DX Checks', () => {
    it('detects missing README, .gitignore, and LICENSE', () => {
      const ctx = createMockContext({
        tree: [
          { path: 'src/main.ts', type: 'file', size: 100 },
        ],
        files: [],
      })
      const findings = checkGitDx(ctx)
      expect(findings.some((f) => f.id === 'dx-missing-readme')).toBe(true)
      expect(findings.some((f) => f.id === 'dx-missing-gitignore')).toBe(true)
      expect(findings.some((f) => f.id === 'dx-missing-license')).toBe(true)
    })

    it('detects low-effort commit messages', () => {
      const ctx = createMockContext({
        meta: {
          owner: 'o', repo: 'r', defaultBranch: 'main', sha: '1234567890123456789012345678901234567890',
          commitMessage: 'wip',
        },
      })
      const findings = checkGitDx(ctx)
      expect(findings.some((f) => f.id === 'dx-low-effort-commit')).toBe(true)
    })
  })

  describe('Deduplication & Prioritization', () => {
    it('deduplicates findings with identical IDs', () => {
      const findings = [
        { id: 'dup-1', category: 'Security' as const, title: 'T1', description: 'D1', severity: 'high' as const, confidence: 'high' as const, evidence: ['E1'], location: 'L1', recommendation: 'R1', source: 'repository' as const, verification: 'verified' as const },
        { id: 'dup-1', category: 'Security' as const, title: 'T1', description: 'D1', severity: 'high' as const, confidence: 'high' as const, evidence: ['E1'], location: 'L1', recommendation: 'R1', source: 'repository' as const, verification: 'verified' as const },
      ]
      expect(deduplicateFindings(findings)).toHaveLength(1)
    })

    it('caps prioritized findings at limit (12)', () => {
      const manyFindings = Array.from({ length: 20 }, (_, i) => ({
        id: `finding-${i}`,
        category: 'Code Quality' as const,
        title: `Title ${i}`,
        description: `Desc ${i}`,
        severity: (i % 2 === 0 ? 'high' : 'low') as 'high' | 'low',
        confidence: 'high' as const,
        evidence: [`Evidence ${i}`],
        location: `loc-${i}`,
        recommendation: `Rec ${i}`,
        source: 'repository' as const,
        verification: 'verified' as const,
      }))
      const prioritized = prioritizeFindings(manyFindings, 12)
      expect(prioritized).toHaveLength(12)
      expect(prioritized[0].severity).toBe('high')
    })

    it('validates and clamps finding line numbers to total lines of inspected file', async () => {
      const { validateFinding } = await import('../lib/analysis/repository')
      const ctx = createMockContext({
        files: [
          {
            path: 'src/main.ts',
            size: 100,
            content: 'line 1\nline 2\nline 3\nline 4\nline 5',
            truncated: false,
          },
        ],
      })
      const findingSingle = {
        id: 'test-single',
        category: 'Code Quality' as const,
        title: 'Out of range',
        description: 'Line 999',
        severity: 'high' as const,
        confidence: 'high' as const,
        evidence: [],
        location: 'src/main.ts:999',
        recommendation: '',
        source: 'repository' as const,
        verification: 'verified' as const,
      }
      expect(validateFinding(findingSingle, ctx).location).toBe('src/main.ts:5')

      const findingRange = {
        ...findingSingle,
        id: 'test-range',
        location: 'src/main.ts:1-50',
      }
      expect(validateFinding(findingRange, ctx).location).toBe('src/main.ts:1-5')
    })

    it('evidence summary uses admitted UTF-8 bytes for truncated files (not advertised size)', () => {
      const ctx = createMockContext({
        files: [
          {
            path: 'src/truncated.txt',
            size: 100000,
            content: 'x'.repeat(32768),
            truncated: true,
          },
        ],
      })
      const result = analyzeRepository(ctx)
      expect(result.evidenceSummary).toContain('32768 bytes inspected')
      expect(result.evidenceSummary).not.toContain('100000 bytes inspected')
    })
  })
})
