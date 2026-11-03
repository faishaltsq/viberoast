import { describe, expect, it, vi } from 'vitest'
import { makeRepoReport, fixtureRepoScan } from './fixtures/report'
import { toPublicRepositoryReport, toPublicRepositoryScan } from '../lib/security/public-report'
import { collectSensitiveValues, redactUrl, safeSnippet } from '../lib/security/redact'

describe('repository report public boundary', () => {
  it('projects metadata without retaining source or synthetic credentials', () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const report = makeRepoReport()
    const unsafe = {
      ...report,
      repoScan: {
        ...report.repoScan,
        description: secret,
        selectedFiles: [{ path: 'src/index.ts', size: 100, content: `// ${secret}`, truncated: false }],
      },
    }
    const safe = toPublicRepositoryReport(unsafe, [secret])
    expect(safe.repoScan.selectedFiles[0]).not.toHaveProperty('content')
    expect(JSON.stringify(safe)).not.toContain(secret)
  })

  it('sanitizes defaultBranch, commitMessage, and file path strings', () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const report = makeRepoReport()
    const unsafe = {
      ...report,
      repoScan: {
        ...report.repoScan,
        defaultBranch: `feature/${secret}`,
        commitMessage: `fix: leak ${secret}`,
        tree: [{ path: `src/${secret}.ts`, type: 'file' as const, size: 50 }],
        selectedFiles: [{ path: `src/${secret}.ts`, size: 50, truncated: false }],
      },
    }
    const safe = toPublicRepositoryReport(unsafe, [secret])
    expect(JSON.stringify(safe)).not.toContain(secret)
    expect(safe.repoScan.defaultBranch).toContain('[redacted]')
    expect(safe.repoScan.commitMessage).toContain('[redacted]')
    expect(safe.repoScan.tree[0].path).toContain('[redacted]')
    expect(safe.repoScan.selectedFiles[0].path).toContain('[redacted]')
  })

  it('sanitizes object keys recursively and strips unknown keys', () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const report = makeRepoReport()
    const unsafe = {
      ...report,
      [`key_${secret}`]: 'leak',
      repoScan: {
        ...report.repoScan,
        [`inner_${secret}`]: 'leak-inner',
      },
    }
    const safe = toPublicRepositoryReport(unsafe, [secret])
    expect(JSON.stringify(safe)).not.toContain(secret)
    expect(safe).not.toHaveProperty(`key_${secret}`)
    expect(safe.repoScan).not.toHaveProperty(`inner_${secret}`)
  })

  it('redacts finding evidence and handles truncation boundaries with non-ASCII prefixes', () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const report = makeRepoReport()
    const emojiPrefix = '🔥'.repeat(20)
    const longPrefix = 'A'.repeat(1550)
    const unsafe = {
      ...report,
      repoScan: {
        ...report.repoScan,
        findings: [
          {
            ...report.repoScan.findings[0],
            title: `Secret in ${secret}`,
            description: `${emojiPrefix} prefix ${secret}`,
            evidence: [`${longPrefix} ${secret}`, `simple evidence ${secret}`],
            location: `src/${secret}.ts:1`,
            recommendation: `Remove ${secret}`,
          },
        ],
      },
    }
    const safe = toPublicRepositoryReport(unsafe, [secret])
    expect(JSON.stringify(safe)).not.toContain(secret)
    expect(safe.repoScan.findings[0].title).not.toContain(secret)
    expect(safe.repoScan.findings[0].evidence[0]).not.toContain(secret)
    expect(safe.repoScan.findings[0].evidence[0].length).toBeLessThanOrEqual(1600)
  })

  it('sanitizes unsafe model echo in commentary', () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const report = makeRepoReport()
    const unsafe = {
      ...report,
      commentary: {
        ...report.commentary!,
        verdict: {
          headline: `Roast with ${secret}`,
          summary: `Summary with ${secret}`,
          developerNickname: `Hacker ${secret}`,
          reaction: 'shocked' as const,
        },
        findings: [
          {
            id: report.repoScan.findings[0].id,
            evidenceIds: [report.repoScan.findings[0].id],
            roast: `Look at this leaked ${secret}`,
            explanation: `Leaked ${secret}`,
            recommendation: `Rotate ${secret}`,
            reaction: 'laughing' as const,
          },
        ],
        overallSummary: `Overall leaked ${secret}`,
      },
    }
    const safe = toPublicRepositoryReport(unsafe, [secret])
    expect(JSON.stringify(safe)).not.toContain(secret)
    expect(safe.commentary?.verdict.headline).toContain('[redacted]')
    expect(safe.commentary?.findings[0].roast).toContain('[redacted]')
  })

  it('toPublicRepositoryScan drops content and projects safe metadata', () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const scan = fixtureRepoScan
    const unsafeScan = {
      ...scan,
      description: `Desc ${secret}`,
      selectedFiles: [
        { path: 'src/index.ts', size: 100, content: `// ${secret}`, truncated: false },
      ],
    }
    const safeScan = toPublicRepositoryScan(unsafeScan, [secret])
    expect(safeScan.selectedFiles[0]).not.toHaveProperty('content')
    expect(safeScan.selectedFiles[0].path).toBe('src/index.ts')
    expect(safeScan.selectedFiles[0].size).toBe(100)
    expect(JSON.stringify(safeScan)).not.toContain(secret)
  })

  it('never logs raw synthetic credentials to console during sanitation or failures', () => {
    const secret = 'ghp_' + 'Q7n4'.repeat(9)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const report = makeRepoReport()
    const unsafe = {
      ...report,
      repoScan: {
        ...report.repoScan,
        description: secret,
        selectedFiles: [{ path: 'src/index.ts', size: 100, content: `// ${secret}`, truncated: false }],
      },
    }
    toPublicRepositoryReport(unsafe, [secret])

    for (const spy of [errorSpy, warnSpy, logSpy, infoSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret)
      }
    }

    errorSpy.mockRestore()
    warnSpy.mockRestore()
    logSpy.mockRestore()
    infoSpy.mockRestore()
  })

  describe('identity and provenance rejection (Finding 2)', () => {
    it('rejects invalid commit SHA without fabricating or padding zeros', () => {
      const scan = fixtureRepoScan
      const invalidShas = [
        'short-sha',
        '12345',
        'not-a-hex-sha-1234567890123456789012345678',
        '111122223333444455556666777788889999000z', // non-hex 'z'
        '',
        '   ',
      ]
      for (const badSha of invalidShas) {
        expect(() => toPublicRepositoryScan({ ...scan, sha: badSha })).toThrow(/invalid commit SHA/i)
      }
    })

    it('rejects invalid report ID without fabricating a new random UUID', () => {
      const report = makeRepoReport()
      const invalidIds = [
        'not-a-uuid',
        '12345678-1234-1234-1234-12345678901g', // invalid hex 'g'
        '12345',
        '',
        'null',
      ]
      for (const badId of invalidIds) {
        expect(() => toPublicRepositoryReport({ ...report, id: badId })).toThrow(/invalid report ID/i)
      }
    })

    it('rejects invalid expiresAt date without fabricating fallback expiry', () => {
      const report = makeRepoReport()
      const invalidDates = [
        'not-a-date',
        '2026-99-99T99:99:99.999Z',
        '',
        'never',
      ]
      for (const badDate of invalidDates) {
        expect(() => toPublicRepositoryReport({ ...report, expiresAt: badDate })).toThrow(/invalid expiry date/i)
      }
    })

    it('rejects invalid finding categories, severities, or commentary reactions via schema rather than inventing fallbacks', () => {
      const report = makeRepoReport()
      const invalidCategory = {
        ...report,
        repoScan: {
          ...report.repoScan,
          findings: [
            {
              ...report.repoScan.findings[0],
              category: 'InventedCategory',
            },
          ],
        },
      }
      expect(() => toPublicRepositoryReport(invalidCategory)).toThrow()

      const invalidReaction = {
        ...report,
        commentary: {
          ...report.commentary!,
          verdict: {
            ...report.commentary!.verdict,
            reaction: 'non_existent_reaction',
          },
        },
      }
      expect(() => toPublicRepositoryReport(invalidReaction)).toThrow()
    })
  })

  describe('credential harvesting and bare echo redaction (Finding 3)', () => {
    it('captures URL credentials in literal, percent-encoded, and decoded forms', () => {
      const source = `
        const dbUrl = "postgres://dbuser:p%40ss%21word@internal.db:5432/app";
        const altUrl = "https://admin:secret1234@api.internal/v1";
      `
      const values = collectSensitiveValues([source])
      expect(values).toContain('dbuser')
      expect(values).toContain('p%40ss%21word')
      expect(values).toContain('p@ss!word')
      expect(values).toContain('admin')
      expect(values).toContain('secret1234')

      // Redact bare echo in commentary or description
      const bareEcho = 'The password p@ss!word was found along with admin.'
      const redacted = safeSnippet(bareEcho, 100, values)
      expect(redacted).not.toContain('p@ss!word')
      expect(redacted).not.toContain('admin')
      expect(redacted).toContain('[redacted]')
    })

    it('captures bare Bearer and Basic opaque values without decoding Basic for authentication', () => {
      const opaqueBearer = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M'
      const opaqueBasic = 'dXNlcjpzdXBlcnNlY3JldHBhc3M='
      const source = `
        Authorization: Bearer ${opaqueBearer}
        Authorization: Basic ${opaqueBasic}
      `
      const values = collectSensitiveValues([source])
      expect(values).toContain(opaqueBearer)
      expect(values).toContain(opaqueBasic)

      // Test bare echo in metadata
      const echoText = `Echoed bare token: ${opaqueBearer} and ${opaqueBasic}`
      const redacted = safeSnippet(echoText, 200, values)
      expect(redacted).not.toContain(opaqueBearer)
      expect(redacted).not.toContain(opaqueBasic)
      expect(redacted).toContain('[redacted]')
    })

    it('captures PEM private key lines and redacts bare fragments from summaries', () => {
      const pemKey = [
        '-----BEGIN RSA PRIVATE KEY-----',
        'MIIEowIBAAKCAQEA0Y3J1gR4Xk5vM8m+9mK1L2P3Q4R5S6T7U8V9W0X1Y2Z3A4B5',
        'C6D7E8F9G0H1I2J3K4L5M6N7O8P9Q0R1S2T3U4V5W6X7Y8Z9A0B1C2D3E4F5G6H7',
        '-----END RSA PRIVATE KEY-----',
      ].join('\n')

      const values = collectSensitiveValues([pemKey])
      expect(values).toContain(pemKey)
      expect(values).toContain('MIIEowIBAAKCAQEA0Y3J1gR4Xk5vM8m+9mK1L2P3Q4R5S6T7U8V9W0X1Y2Z3A4B5')

      const summary = `Found key fragment MIIEowIBAAKCAQEA0Y3J1gR4Xk5vM8m+9mK1L2P3Q4R5S6T7U8V9W0X1Y2Z3A4B5 in config.`
      const safeSummary = safeSnippet(summary, 200, values)
      expect(safeSummary).not.toContain('MIIEowIBAAKCAQEA0Y3J1gR4Xk5vM8m+9mK1L2P3Q4R5S6T7U8V9W0X1Y2Z3A4B5')
      expect(safeSummary).toContain('[redacted]')
    })
  })

  describe('GitHub permalink SHA preservation and path redaction (Finding 4)', () => {
    it('preserves valid 40-char commit SHA in GitHub blob, tree, and commit permalinks with line anchors', () => {
      const sha = '1111222233334444555566667777888899990000'
      const blobUrl = `https://github.com/test-owner/test-repo/blob/${sha}/src/index.ts#L42`
      const treeUrl = `https://github.com/test-owner/test-repo/tree/${sha}`
      const commitUrl = `https://github.com/test-owner/test-repo/commit/${sha}`
      const rangeUrl = `https://github.com/test-owner/test-repo/blob/${sha}/src/index.ts#L10-L20`

      expect(redactUrl(blobUrl)).toBe(blobUrl)
      expect(redactUrl(treeUrl)).toBe(treeUrl)
      expect(redactUrl(commitUrl)).toBe(commitUrl)
      expect(redactUrl(rangeUrl)).toBe(rangeUrl)
    })

    it('redacts suspicious >=32 char components in file paths while preserving the commit SHA', () => {
      const sha = '1111222233334444555566667777888899990000'
      const secretPathComponent = 'secret_token_with_length_greater_than_32_chars'
      const blobUrlWithSecret = `https://github.com/test-owner/test-repo/blob/${sha}/src/${secretPathComponent}.ts#L1`

      const redacted = redactUrl(blobUrlWithSecret)
      expect(redacted).toContain(`/blob/${sha}/src/`)
      expect(redacted).not.toContain(secretPathComponent)
      expect(redacted).toContain('[redacted]')
      expect(redacted).toContain('#L1')
    })

    it('does not broadly exempt arbitrary long GitHub paths without blob/tree/commit SHA structure', () => {
      const arbitraryUrl = 'https://github.com/test-owner/test-repo/issues/ghp_12345678901234567890123456789012'
      const redacted = redactUrl(arbitraryUrl)
      expect(redacted).not.toContain('ghp_12345678901234567890123456789012')
      expect(redacted).toContain('[redacted]')
    })

    it('strips non-line hash anchors but preserves valid line anchors', () => {
      const sha = '1111222233334444555566667777888899990000'
      const urlWithTokenHash = `https://github.com/owner/repo/blob/${sha}/src/main.ts#access_token=secret123`
      expect(redactUrl(urlWithTokenHash)).toBe(`https://github.com/owner/repo/blob/${sha}/src/main.ts`)
    })
  })
})
