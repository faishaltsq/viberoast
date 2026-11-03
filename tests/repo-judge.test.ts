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
      { path: 'src/index.ts', size: 100, truncated: false },
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
    securityFindings: [],
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
})
