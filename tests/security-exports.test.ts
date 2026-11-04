import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RepositoryFix } from '../components/fixes/RepositoryFix'
import { downloadRepoShareCard, downloadShareCard, shareText } from '../lib/share/card'
import type { RepositoryReport } from '../lib/types/report'
import {
  DATABASE_URL_POSTGRES,
  GENERIC_SECRET_ASSIGNMENT,
  GITHUB_PAT,
  PEM_PRIVATE_KEY,
  STRIPE_SK_LIVE,
} from './fixtures/security'

interface CanvasMockState {
  filledTexts: string[]
  strokedTexts: string[]
  measuredTexts: string[]
  downloadNames: string[]
}

function setupCanvasMock(): CanvasMockState {
  const state: CanvasMockState = {
    filledTexts: [],
    strokedTexts: [],
    measuredTexts: [],
    downloadNames: [],
  }

  const mockContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      state.filledTexts.push(String(text))
    }),
    strokeText: vi.fn((text: string) => {
      state.strokedTexts.push(String(text))
    }),
    measureText: vi.fn((text: string) => {
      state.measuredTexts.push(String(text))
      return { width: String(text).length * 8 }
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
  }

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn((type: string) => {
      if (type === '2d') return mockContext
      return null
    }),
    toBlob: vi.fn((cb: (blob: Blob) => void) => {
      cb(new Blob(['mock-png'], { type: 'image/png' }))
    }),
  }

  class MockImage {
    naturalWidth = 200
    naturalHeight = 200
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    private _src = ''

    set src(val: string) {
      this._src = val
      queueMicrotask(() => {
        if (this.onload) this.onload()
      })
    }
    get src() {
      return this._src
    }
  }

  const mockAnchor = {
    href: '',
    download: '',
    click: vi.fn(function (this: { download: string }) {
      state.downloadNames.push(this.download)
    }),
  }

  vi.stubGlobal('Image', MockImage)
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'canvas') return mockCanvas
      if (tag === 'a') return mockAnchor
      return {}
    },
  })
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void) => {
      fn()
      return 1
    },
  })
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {},
  })

  return state
}

function makeUnsafeRepoReport(): RepositoryReport {
  return {
    scanKind: 'repository',
    id: '77777777-7777-4777-8777-777777777777',
    expiresAt: '2026-11-02T12:15:00.000Z',
    language: 'en',
    intensity: 'No Mercy',
    repoScan: {
      owner: `acme-${GITHUB_PAT}`,
      repo: 'vulnerable-repo',
      sha: 'aabbccddeeff00112233445566778899aabbccdd',
      defaultBranch: `main-${STRIPE_SK_LIVE}`,
      description: `Repo leaking ${DATABASE_URL_POSTGRES}`,
      language: 'TypeScript',
      stargazerCount: 10,
      forkCount: 2,
      commitDate: '2026-11-02T12:00:00.000Z',
      commitMessage: `fix: add ${GENERIC_SECRET_ASSIGNMENT}`,
      tree: [{ path: 'src/config.ts', type: 'file', size: 100 }],
      selectedFiles: [{ path: 'src/config.ts', size: 100 }],
      coverage: {
        filesDiscovered: 1,
        filesInspected: 1,
        bytesInspected: 100,
        treeTruncated: false,
        contentTruncated: false,
      },
      securityCoverage: {
        caps: {
          maxFiles: 50,
          maxBytesTotal: 100000,
          maxBytesPerFile: 10000,
          timeoutMs: 15000,
        },
        filesDiscovered: 1,
        filesInspected: 1,
        bytesInspected: 100,
        statusCounts: {
          inspected: 1,
          'filename-only': 0,
          'skipped-policy': 0,
          'skipped-budget': 0,
          oversized: 0,
          unavailable: 0,
        },
        fileStatuses: [{ path: 'src/config.ts', status: 'inspected', size: 100 }],
        treeTruncated: false,
        contentTruncated: false,
        deadlineExceeded: false,
        budgetExceeded: false,
        unknownRemaining: false,
      },
      findings: [
        {
          id: 'qual-1',
          category: 'Code Quality',
          title: `Quality flaw with ${GITHUB_PAT}`,
          description: 'A quality problem',
          severity: 'low',
          confidence: 'high',
          evidence: [`raw ${DATABASE_URL_POSTGRES}`],
          location: `src/config.ts:${GITHUB_PAT}`,
          recommendation: 'Fix it',
          source: 'repository',
          verification: 'verified',
        },
      ],
      securityFindings: [
        {
          id: 'sec-1',
          category: 'Security',
          title: `Hardcoded API key detected (${GITHUB_PAT})`,
          description: `Private key ${PEM_PRIVATE_KEY}`,
          severity: 'high',
          confidence: 'high',
          evidence: [GITHUB_PAT, STRIPE_SK_LIVE],
          location: 'src/config.ts:1',
          recommendation: 'Rotate key immediately',
          source: 'repository',
          verification: 'verified',
          security: {
            category: 'Credentials',
            ruleId: 'github-pat',
            ruleVersion: '1.0.0',
            commitSha: 'aabbccddeeff00112233445566778899aabbccdd',
            filePath: 'src/config.ts',
            lineStart: 1,
            lineEnd: 1,
            observation: `Found ${GITHUB_PAT}`,
            possibleImpact: 'Account takeover',
            coverageLimitations: 'None',
          },
        },
      ],
      strengths: [],
      warnings: [`Leak in warning: ${STRIPE_SK_LIVE}`],
      evidenceSummary: 'Summary with secrets',
    },
    commentary: {
      verdict: {
        headline: `Bro leaked ${GITHUB_PAT} in headline`,
        summary: `Summary with ${DATABASE_URL_POSTGRES}`,
        developerNickname: 'The Leaker',
        reaction: 'shocked',
      },
      findings: [
        {
          id: 'sec-1',
          evidenceIds: ['sec-1'],
          roast: `Roast roast ${GITHUB_PAT}`,
          explanation: 'Explanation',
          recommendation: 'Rec',
          reaction: 'shocked',
        },
      ],
      strengths: [],
      overallSummary: 'Overall',
    },
    aiStatus: 'completed',
    aiMessage: null,
    visualAnalysis: false,
  }
}

describe('security exports and canvas safeguards', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('masks every synthetic credential and split fragment from canvas draw inputs', async () => {
    const state = setupCanvasMock()
    const report = makeUnsafeRepoReport()

    await downloadShareCard(report, 'square', 'en')

    const allDrawInputs = [...state.filledTexts, ...state.strokedTexts, ...state.measuredTexts]
    expect(allDrawInputs.length).toBeGreaterThan(0)

    for (const text of allDrawInputs) {
      expect(text).not.toContain(GITHUB_PAT)
      expect(text).not.toContain(STRIPE_SK_LIVE)
      expect(text).not.toContain(DATABASE_URL_POSTGRES)
      expect(text).not.toContain(GENERIC_SECRET_ASSIGNMENT)
      expect(text).not.toContain('dbadmin:p%40ssw0rd123!')
      expect(text).not.toContain('-----BEGIN RSA PRIVATE KEY-----')
    }
  })

  it('prioritizes security finding titles on repository card', async () => {
    const state = setupCanvasMock()
    const report = makeUnsafeRepoReport()

    await downloadRepoShareCard(report, 'landscape', 'en')

    // Find the text drawn for findings
    const findingsDrawn = state.filledTexts.filter((t) => t.includes('Hardcoded API key detected'))
    expect(findingsDrawn.length).toBeGreaterThan(0)
    expect(findingsDrawn[0]).not.toContain(GITHUB_PAT)
    expect(findingsDrawn[0]).toContain('[redacted]')
  })

  it('draws exact clean phrase when security scope is known and zero security findings', async () => {
    const state = setupCanvasMock()
    const report = makeUnsafeRepoReport()
    report.repoScan.securityFindings = []
    report.repoScan.findings = []

    await downloadShareCard(report, 'square', 'en')

    const hasCleanPhrase = state.filledTexts.some((t) =>
      t.includes('No security findings detected in the inspected scope.')
    )
    expect(hasCleanPhrase).toBe(true)
  })

  it('draws exact clean phrase in Indonesian when language is id', async () => {
    const state = setupCanvasMock()
    const report = makeUnsafeRepoReport()
    report.repoScan.securityFindings = []
    report.repoScan.findings = []

    await downloadShareCard(report, 'square', 'id')

    const hasCleanPhrase = state.filledTexts.some((t) =>
      t.includes('Tidak ada temuan keamanan yang terdeteksi dalam cakupan yang diperiksa.')
    )
    expect(hasCleanPhrase).toBe(true)
  })

  it('does NOT draw clean phrase when security scope is legacy/unassessed', async () => {
    const state = setupCanvasMock()
    const report = makeUnsafeRepoReport()
    delete report.repoScan.securityCoverage
    report.repoScan.securityFindings = []
    report.repoScan.findings = []

    await downloadShareCard(report, 'square', 'en')

    const hasCleanPhrase = state.filledTexts.some((t) =>
      t.includes('No security findings detected in the inspected scope.')
    )
    expect(hasCleanPhrase).toBe(false)
  })

  it('uses SourceSanity branding on card header, watermark, and download filename', async () => {
    const state = setupCanvasMock()
    const report = makeUnsafeRepoReport()

    await downloadShareCard(report, 'square', 'en')

    // Top-left brand
    expect(state.filledTexts).toContain('SourceSanity')
    // Watermark at bottom right must be plain SourceSanity, not an invented URL
    expect(state.filledTexts.filter((t) => t === 'SourceSanity').length).toBeGreaterThanOrEqual(2)
    expect(state.filledTexts).not.toContain('viberoast-app.vercel.app')
    expect(state.filledTexts.some((t) => t.includes('sourcesanity.com'))).toBe(false)

    // Download filename
    expect(state.downloadNames).toContain('sourcesanity-square.png')
    expect(state.downloadNames).not.toContain('viberoast-square.png')
  })

  it('sanitizes shareText and updates branding to SourceSanity', () => {
    const report = makeUnsafeRepoReport()
    const textEn = shareText(report, 'en')
    expect(textEn).toContain('SourceSanity:')
    expect(textEn).not.toContain('VibeRoast:')
    expect(textEn).not.toContain(GITHUB_PAT)

    const textId = shareText(report, 'id')
    expect(textId).toContain('SourceSanity:')
    expect(textId).not.toContain('VibeRoast:')
    expect(textId).not.toContain(GITHUB_PAT)
  })

  describe('RepositoryFix UI sanitization and selection bounding', () => {
    it('defensively redacts displayed strings and falls back from unsafe GitHub links', () => {
      const report = makeUnsafeRepoReport()
      const html = renderToStaticMarkup(
        createElement(RepositoryFix, {
          report,
          language: 'en',
          selectedIds: ['sec-1'],
          select: () => {},
          results: () => {},
        })
      )

      expect(html).not.toContain(GITHUB_PAT)
      expect(html).not.toContain(STRIPE_SK_LIVE)
      expect(html).not.toContain(DATABASE_URL_POSTGRES)
      expect(html).not.toContain(GENERIC_SECRET_ASSIGNMENT)
      expect(html).toContain('[redacted]')
      // Commit SHA 40-hex prefix is preserved
      expect(html).toContain('aabbccd')
      // No clickable link containing [redacted] or tainted owner/repo
      expect(html).not.toMatch(/<a[^>]+href="[^"]*\[redacted\][^"]*"/)
      expect(html).not.toMatch(/<a[^>]+href="[^"]*%5bredacted%5d[^"]*"/)
      // Unsafe location renders in code span instead of anchor
      expect(html).toContain('<code>src/config.ts:[redacted]</code>')
    })

    it('bounds selectedIds to maximum 60, dedupes, and filters unknown IDs', () => {
      const report = makeUnsafeRepoReport()
      const findings = Array.from({ length: 75 }, (_, i) => ({
        id: `finding-${i}`,
        category: 'Code Quality' as const,
        title: `Finding ${i}`,
        description: `Description ${i}`,
        severity: 'low' as const,
        confidence: 'high' as const,
        evidence: [`evidence ${i}`],
        location: `src/file${i}.ts:1`,
        recommendation: `Fix ${i}`,
        source: 'repository' as const,
        verification: 'verified' as const,
      }))
      report.repoScan.findings = findings
      report.repoScan.securityFindings = []

      // Pass 70 selected IDs (exceeding 60)
      const rawSelected = findings.slice(0, 70).map((f) => f.id)
      const html = renderToStaticMarkup(
        createElement(RepositoryFix, {
          report,
          language: 'en',
          selectedIds: rawSelected,
          select: () => {},
          results: () => {},
        })
      )

      // Status text derives from boundedSelectedIds (capped at 60)
      expect(html).toContain('60 of 75 selected (max 60 per prompt)')
      // Selected tab badge derives from boundedSelectedIds (60, not 70)
      expect(html).toContain('<span>60</span>')
      // Finding 0..59 are selected
      expect(html).toContain('data-selected="true"')
      // Finding 60 is NOT selected (61st latent item is not checked)
      expect(html).toMatch(/data-selected="false"[^>]*>[\s\S]*?Finding 60/)

      // Verify Select all is disabled when 60 are already selected
      expect(html).toMatch(/<button[^>]*class="outline-btn"[^>]*disabled=""[^>]*>Select all<\/button>/)
    })

    it('dedupes and filters unknown IDs from selection counts', () => {
      const report = makeUnsafeRepoReport()
      report.repoScan.findings = [
        {
          id: 'item-1',
          category: 'Code Quality',
          title: 'Item 1',
          description: 'Desc 1',
          severity: 'low',
          confidence: 'high',
          evidence: ['ev 1'],
          location: 'src/file1.ts:1',
          recommendation: 'Fix 1',
          source: 'repository',
          verification: 'verified',
        },
        {
          id: 'item-2',
          category: 'Code Quality',
          title: 'Item 2',
          description: 'Desc 2',
          severity: 'low',
          confidence: 'high',
          evidence: ['ev 2'],
          location: 'src/file2.ts:1',
          recommendation: 'Fix 2',
          source: 'repository',
          verification: 'verified',
        },
      ]
      report.repoScan.securityFindings = []

      // Pass duplicates and unknown IDs
      const html = renderToStaticMarkup(
        createElement(RepositoryFix, {
          report,
          language: 'en',
          selectedIds: ['item-1', 'item-1', 'unknown-id'],
          select: () => {},
          results: () => {},
        })
      )

      // Only 1 unique known ID selected
      expect(html).toContain('1 of 2 selected')
    })
  })
})
