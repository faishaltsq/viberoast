import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateRepoRoast } from '../lib/ai/skills/repo'
import { AiError } from '../lib/ai/deepseek'
import type { RepoScanResult } from '../lib/types/report'

function createSampleScan(): RepoScanResult {
  return {
    owner: 'octocat',
    repo: 'hello-world',
    sha: '1111222233334444555566667777888899990000',
    defaultBranch: 'main',
    description: 'My hello world repo',
    language: 'TypeScript',
    stargazerCount: 10,
    forkCount: 2,
    commitDate: '2026-11-01T10:00:00.000Z',
    commitMessage: 'feat: init repo',
    tree: [
      { path: 'src/index.ts', type: 'file', size: 100 },
      { path: 'package.json', type: 'file', size: 200 },
    ],
    selectedFiles: [
      { path: 'src/index.ts', size: 100, content: 'console.log("hello")', truncated: false },
    ],
    coverage: {
      filesDiscovered: 2,
      filesInspected: 1,
      bytesInspected: 100,
      treeTruncated: false,
      contentTruncated: false,
    },
    findings: [
      {
        id: 'finding-1',
        category: 'Code Quality',
        title: 'Console log in production code',
        description: 'Logging to console can leak info and clutter output.',
        severity: 'low',
        confidence: 'high',
        evidence: ['Line 1: console.log("hello")'],
        location: 'src/index.ts:1',
        recommendation: 'Remove console.log or use a structured logger.',
        source: 'repository',
        verification: 'verified',
      },
    ],
    strengths: ['TypeScript configured.'],
    warnings: [],
    evidenceSummary: 'Sample evidence summary for octocat/hello-world.',
  }
}

describe('generateRepoRoast', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
    process.env.DEEPSEEK_MODEL = 'deepseek-chat'
  })

  afterEach(() => {
    process.env = { ...origEnv }
    vi.restoreAllMocks()
  })

  it('throws AiError when AI environment variables are missing', async () => {
    delete process.env.DEEPSEEK_API_KEY
    const scan = createSampleScan()
    await expect(generateRepoRoast(scan, { language: 'en', intensity: 'Friendly Fire' })).rejects.toThrow(AiError)
  })

  it('parses valid completion response and produces commentary matching findings', async () => {
    const scan = createSampleScan()
    const mockAiResponse = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              verdict: {
                headline: 'A Humble Beginning',
                summary: 'Single console log in an empty ocean.',
                developerNickname: 'Console Logger Extraordinaire',
                reaction: 'suspicious',
              },
              findings: [
                {
                  id: 'finding-1',
                  evidenceIds: ['finding-1'],
                  roast: 'Still debugging with console.log like it is 1999.',
                  reaction: 'laughing',
                },
              ],
              strengths: ['TypeScript configured.'],
              overallSummary: 'Simple repo with minimal complexity.',
            }),
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockAiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await generateRepoRoast(scan, { language: 'en', intensity: 'No Mercy' })
    expect(result.visualAnalysis).toBe(false)
    expect(result.commentary.verdict.headline).toBe('A Humble Beginning')
    expect(result.commentary.verdict.developerNickname).toBe('Console Logger Extraordinaire')
    expect(result.commentary.findings).toHaveLength(1)
    expect(result.commentary.findings[0].id).toBe('finding-1')
    expect(result.commentary.findings[0].roast).toBe('Still debugging with console.log like it is 1999.')
    expect(result.commentary.findings[0].explanation).toBe(scan.findings[0].description)
    expect(result.commentary.findings[0].recommendation).toBe(scan.findings[0].recommendation)
  })

  it('rejects AI output with mismatched evidence IDs', async () => {
    const scan = createSampleScan()
    const mockMismatchedResponse = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              verdict: {
                headline: 'Hallucination',
                summary: 'Invented finding ids.',
                developerNickname: 'Ghost',
                reaction: 'shocked',
              },
              findings: [
                {
                  id: 'invented-id',
                  evidenceIds: ['invented-id'],
                  roast: 'Invented roast.',
                  reaction: 'angry',
                },
              ],
              strengths: [],
              overallSummary: 'Summary',
            }),
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockMismatchedResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(generateRepoRoast(scan, { language: 'en', intensity: 'No Mercy' })).rejects.toThrow(AiError)
  })

  it('redacts secrets in generated verdict and roast text', async () => {
    const scan = createSampleScan()
    const mockSecretResponse = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              verdict: {
                headline: 'Secret leak AKIA1234567890ABCDEF in headline',
                summary: 'Summary with ghp_111122223333444455556666777788889999',
                developerNickname: 'Agent',
                reaction: 'shocked',
              },
              findings: [
                {
                  id: 'finding-1',
                  evidenceIds: ['finding-1'],
                  roast: 'Leaked secret AKIA1234567890ABCDEF in roast.',
                  reaction: 'disappointed',
                },
              ],
              strengths: [],
              overallSummary: 'Safe summary.',
            }),
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockSecretResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await generateRepoRoast(scan, { language: 'en', intensity: 'Career Ending' })
    expect(result.commentary.verdict.headline).not.toContain('AKIA1234567890ABCDEF')
    expect(result.commentary.verdict.headline).toContain('[redacted]')
    expect(result.commentary.findings[0].roast).not.toContain('AKIA1234567890ABCDEF')
    expect(result.commentary.findings[0].roast).toContain('[redacted]')
  })

  it('handles partial finding roasts gracefully by falling back for unmentioned findings', async () => {
    const scan = createSampleScan()
    scan.findings.push({
      id: 'finding-2',
      category: 'Security',
      title: 'Wildcard CORS',
      description: 'CORS header set to *.',
      severity: 'high',
      confidence: 'high',
      evidence: ['Access-Control-Allow-Origin: *'],
      location: 'server.ts:10',
      recommendation: 'Scope origin.',
      source: 'repository',
      verification: 'verified',
    })

    const mockPartialResponse = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              verdict: {
                headline: 'Partial Coverage',
                summary: 'Only roasted finding 1.',
                developerNickname: 'The Selective Reviewer',
                reaction: 'laughing',
              },
              findings: [
                {
                  id: 'finding-1',
                  roast: 'Still using console.log.',
                  reaction: 'shocked',
                },
              ],
              strengths: [],
              overallSummary: 'Overall okay.',
            }),
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockPartialResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await generateRepoRoast(scan, { language: 'en', intensity: 'Friendly Fire' })
    expect(result.commentary.findings).toHaveLength(2)
    expect(result.commentary.findings[0].id).toBe('finding-1')
    expect(result.commentary.findings[0].roast).toBe('Still using console.log.')
    expect(result.commentary.findings[1].id).toBe('finding-2')
    expect(result.commentary.findings[1].roast).toContain('Bro Code was rendered momentarily speechless')
  })

  it('sanitizes unknown reaction strings to valid reactions', async () => {
    const scan = createSampleScan()
    const mockUnknownReactionResponse = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              verdict: {
                headline: 'Creative Reactions',
                summary: 'DeepSeek returned creative reaction strings.',
                developerNickname: 'Emoji Maestro',
                reaction: 'sarcastic_smug_face',
              },
              findings: [
                {
                  id: 'finding-1',
                  roast: 'Roasting with custom reaction.',
                  reaction: 'crying_laughing',
                },
              ],
              strengths: [],
              overallSummary: 'Good run.',
            }),
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockUnknownReactionResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await generateRepoRoast(scan, { language: 'en', intensity: 'No Mercy' })
    expect(result.commentary.verdict.reaction).toBe('suspicious')
    expect(result.commentary.findings[0].reaction).toBe('suspicious')
  })

  it('tolerates extra metadata fields returned by AI without failing schema parsing', async () => {
    const scan = createSampleScan()
    const mockExtraFieldsResponse = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              verdict: {
                headline: 'Extra Fields',
                summary: 'Contains unprompted fields.',
                developerNickname: 'Verbose Model',
                reaction: 'proud',
                confidenceScore: 0.95,
              },
              findings: [
                {
                  id: 'finding-1',
                  title: 'Console log found',
                  category: 'Code Quality',
                  severity: 'low',
                  roast: 'Too many logs.',
                  reaction: 'laughing',
                },
              ],
              visualFindings: [],
              notes: 'Inspection complete.',
              strengths: ['Great repo'],
              overallSummary: 'Clean output.',
            }),
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockExtraFieldsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await generateRepoRoast(scan, { language: 'en', intensity: 'Friendly Fire' })
    expect(result.commentary.verdict.headline).toBe('Extra Fields')
    expect(result.commentary.findings[0].roast).toBe('Too many logs.')
  })

  it('handles repository scan with zero findings', async () => {
    const scan = createSampleScan()
    scan.findings = []

    const mockZeroFindingsResponse = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              verdict: {
                headline: 'Pristine Architecture',
                summary: 'Zero defects detected by static analyzer.',
                developerNickname: 'The Perfectionist',
                reaction: 'impressed',
              },
              findings: [],
              strengths: ['No defects detected.'],
              overallSummary: 'Remarkably clean codebase.',
            }),
          },
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockZeroFindingsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await generateRepoRoast(scan, { language: 'en', intensity: 'Friendly Fire' })
    expect(result.commentary.findings).toHaveLength(0)
    expect(result.commentary.verdict.headline).toBe('Pristine Architecture')
  })
})
