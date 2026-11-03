import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import type { HallCase } from '@/lib/hall/types'
import { hallExamples } from '@/lib/hall/examples'
import { validateHallCase } from '@/lib/hall/validate'
import { sanitizeHallCase } from '@/lib/hall/sanitize'
import { loadHallCases } from '@/lib/hall/server'

describe('Hall Data Contracts and Privacy', () => {
  const validMockCase: HallCase = {
    id: 'case-mock-01',
    slug: 'case-mock-01',
    sourceType: 'fictional-example',
    visibility: 'anonymous',
    collection: 'shame',
    targetKind: 'website',
    publicAlias: { en: 'Mock Portal', id: 'Portal Tiruan' },
    title: { en: 'The Infinite Spinner', id: 'Pemutar Tanpa Akhir' },
    category: { en: 'User Experience', id: 'Pengalaman Pengguna' },
    verdictHeadline: { en: 'Spinning into the Void', id: 'Berputar ke Ruang Hampa' },
    verdictSummary: {
      en: 'Empty states must explain what happened and offer a recovery action.',
      id: 'Kondisi kosong harus menjelaskan apa yang terjadi dan menawarkan pemulihan.',
    },
    broCodeReaction: {
      en: 'Bro stared at the loading spinner until his coffee went cold.',
      id: 'Bro menatap lingkaran pemuatan sampai kopinya dingin.',
    },
    comedyHeat: 75,
    findings: [
      {
        id: 'finding-01',
        title: { en: 'Infinite Loading State', id: 'Status Pemuatan Tanpa Henti' },
        category: { en: 'UX', id: 'UX' },
        explanation: {
          en: 'No timeout or fallback message is shown when data fetching stalls.',
          id: 'Tidak ada batas waktu atau pesan pengganti saat pengambilan data terhenti.',
        },
        roast: {
          en: 'Legend says the spinner is still waiting for the backend to wake up.',
          id: 'Konon katanya pemutarnya masih menunggu backend bangun.',
        },
        remediation: {
          en: 'Add a five-second timeout and render an actionable retry button.',
          id: 'Tambahkan batas waktu lima detik dan tampilkan tombol coba lagi.',
        },
        severity: 'high',
        evidenceType: 'fictional-example',
      },
    ],
    strengths: [
      {
        en: 'The spinner animation itself runs at sixty frames per second.',
        id: 'Animasi pemutar itu sendiri berjalan mulus pada enam puluh bingkai per detik.',
      },
    ],
    limitations: [
      {
        en: 'Synthetic demonstration focusing purely on client-side state handling.',
        id: 'Demonstrasi sintetis yang berfokus murni pada penanganan status sisi klien.',
      },
    ],
    publishedAt: '2026-11-01T00:00:00.000Z',
  }

  describe('Zod Schema Validation', () => {
    it('validates a conformant fictional case', () => {
      const parsed = validateHallCase(validMockCase)
      expect(parsed.id).toBe('case-mock-01')
      expect(parsed.sourceType).toBe('fictional-example')
      expect(parsed.visibility).toBe('anonymous')
    })

    it('enforces lowercase kebab ID/slug format and max 80 characters', () => {
      expect(() => validateHallCase({ ...validMockCase, id: 'CaseMock01' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, id: 'case_mock_01' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, id: '-case-mock' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, id: 'case-mock-' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, id: 'case--mock' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, id: 'a'.repeat(81) })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, slug: 'Bad Slug' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, slug: 'a'.repeat(81) })).toThrow()
      expect(() =>
        validateHallCase({
          ...validMockCase,
          findings: [{ ...validMockCase.findings[0], id: 'Invalid_Id' }],
        })
      ).toThrow()
    })

    it('enforces localized strings max 2000 characters', () => {
      const tooLong = 'a'.repeat(2001)
      expect(() =>
        validateHallCase({
          ...validMockCase,
          title: { en: tooLong, id: 'Valid' },
        })
      ).toThrow()
    })

    it('enforces findings array bounds between 1 and 20', () => {
      expect(() => validateHallCase({ ...validMockCase, findings: [] })).toThrow()
      const twentyOneFindings = Array.from({ length: 21 }, (_, i) => ({
        ...validMockCase.findings[0],
        id: `finding-${i + 1}`,
      }))
      expect(() => validateHallCase({ ...validMockCase, findings: twentyOneFindings })).toThrow()
    })

    it('enforces strengths array max 12 items and allows empty strengths', () => {
      expect(validateHallCase({ ...validMockCase, strengths: [] }).strengths).toEqual([])
      const thirteenStrengths = Array.from({ length: 13 }, () => ({
        en: 'Good performance.',
        id: 'Performa bagus.',
      }))
      expect(() => validateHallCase({ ...validMockCase, strengths: thirteenStrengths })).toThrow()
    })

    it('enforces limitations array bounds between 1 and 12', () => {
      expect(() => validateHallCase({ ...validMockCase, limitations: [] })).toThrow()
      const thirteenLimitations = Array.from({ length: 13 }, () => ({
        en: 'Synthetic boundary.',
        id: 'Batasan sintetis.',
      }))
      expect(() => validateHallCase({ ...validMockCase, limitations: thirteenLimitations })).toThrow()
    })

    it('validates publishedAt as ISO datetime or rejects invalid format', () => {
      expect(
        validateHallCase({ ...validMockCase, publishedAt: '2026-11-01T12:00:00.000Z' }).publishedAt
      ).toBe('2026-11-01T12:00:00.000Z')
      expect(validateHallCase({ ...validMockCase, publishedAt: undefined }).publishedAt).toBeUndefined()
      expect(() => validateHallCase({ ...validMockCase, publishedAt: 'not-a-date' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, publishedAt: '2026-11-01' })).toThrow()
    })

    it('rejects unknown fields in case schema (strict check)', () => {
      const caseWithUnknown = {
        ...validMockCase,
        reportId: 'rep_12345',
        scanUrl: 'https://secret.corp/audit',
      }
      expect(() => validateHallCase(caseWithUnknown)).toThrow()
    })

    it('rejects unknown fields in findings schema', () => {
      const caseWithDirtyFinding = {
        ...validMockCase,
        findings: [
          {
            ...validMockCase.findings[0],
            rawSnippet: 'const token = "secret"',
          },
        ],
      }
      expect(() => validateHallCase(caseWithDirtyFinding)).toThrow()
    })

    it('enforces comedyHeat bounds between 0 and 100', () => {
      expect(() => validateHallCase({ ...validMockCase, comedyHeat: -1 })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, comedyHeat: 101 })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, comedyHeat: 42.5 })).toThrow()
      expect(validateHallCase({ ...validMockCase, comedyHeat: 0 }).comedyHeat).toBe(0)
      expect(validateHallCase({ ...validMockCase, comedyHeat: 100 }).comedyHeat).toBe(100)
    })

    it('rejects empty or whitespace-only localized strings', () => {
      expect(() =>
        validateHallCase({
          ...validMockCase,
          publicAlias: { en: '   ', id: 'Valid' },
        })
      ).toThrow()
    })

    it('rejects invalid sourceType, visibility, collection, or targetKind literals', () => {
      expect(() => validateHallCase({ ...validMockCase, sourceType: 'real-report' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, visibility: 'public' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, collection: 'hall-of-fame' })).toThrow()
      expect(() => validateHallCase({ ...validMockCase, targetKind: 'mobile-app' })).toThrow()
    })
  })

  describe('Sanitizer Privacy Constraints', () => {
    it('accepts clean fictional case through sanitizeHallCase', () => {
      const sanitized = sanitizeHallCase(validMockCase)
      expect(sanitized.id).toBe(validMockCase.id)
    })

    it('rejects arbitrary raw reports instead of claiming to sanitize them', () => {
      const rawReport = {
        reportId: 'rpt_abc123',
        target: 'https://real-company.com',
        screenshots: { desktop: 'data:image/jpeg;base64,...' },
        metrics: { navigationMs: 400 },
        findings: [],
      }
      expect(() => sanitizeHallCase(rawReport)).toThrow()
    })

    it('rejects cases containing URLs in any localized field', () => {
      const caseWithUrl = {
        ...validMockCase,
        title: { en: 'Visit https://evil.corp for info', id: 'Kunjungi situs' },
      }
      expect(() => sanitizeHallCase(caseWithUrl)).toThrow(/disallowed content|url/i)
    })

    it('rejects cases containing email addresses', () => {
      const caseWithEmail = {
        ...validMockCase,
        verdictSummary: {
          en: 'Contact security-lead@bigcorp.io immediately',
          id: 'Hubungi tim keamanan segera',
        },
      }
      expect(() => sanitizeHallCase(caseWithEmail)).toThrow(/disallowed content|email/i)
    })

    it('rejects cases containing 40-character git commit SHAs', () => {
      const caseWithSha = {
        ...validMockCase,
        findings: [
          {
            ...validMockCase.findings[0],
            explanation: {
              en: 'Broken in commit e6c25785f8389c89e3779e51c89fca6d3fc2916b yesterday',
              id: 'Rusak pada commit e6c25785f8389c89e3779e51c89fca6d3fc2916b kemarin',
            },
          },
        ],
      }
      expect(() => sanitizeHallCase(caseWithSha)).toThrow(/disallowed content|sha/i)
    })

    it('rejects cases containing API tokens or secret patterns', () => {
      const caseWithToken = {
        ...validMockCase,
        findings: [
          {
            ...validMockCase.findings[0],
            roast: {
              en: 'You leaked ghp_123456789012345678901234567890123456 in public',
              id: 'Token bocor ke publik',
            },
          },
        ],
      }
      expect(() => sanitizeHallCase(caseWithToken)).toThrow(/disallowed content|token|secret/i)
    })

    it('rejects cases containing absolute filesystem paths', () => {
      const caseWithPath = {
        ...validMockCase,
        findings: [
          {
            ...validMockCase.findings[0],
            remediation: {
              en: 'Remove files from /Users/cubeb/projects/secret/src',
              id: 'Hapus berkas dari direktori',
            },
          },
        ],
      }
      expect(() => sanitizeHallCase(caseWithPath)).toThrow(/disallowed content|path/i)
    })
  })

  describe('Curated Examples Fixtures', () => {
    it('contains at least 4 shame cases and at least 2 vibes cases', () => {
      const shameCases = hallExamples.filter((c) => c.collection === 'shame')
      const vibesCases = hallExamples.filter((c) => c.collection === 'vibes')

      expect(shameCases.length).toBeGreaterThanOrEqual(4)
      expect(vibesCases.length).toBeGreaterThanOrEqual(2)
    })

    it('covers both website and repository target kinds in curated examples', () => {
      const websiteCases = hallExamples.filter((c) => c.targetKind === 'website')
      const repoCases = hallExamples.filter((c) => c.targetKind === 'repository')

      expect(websiteCases.length).toBeGreaterThanOrEqual(2)
      expect(repoCases.length).toBeGreaterThanOrEqual(2)

      const shameWebsite = hallExamples.some(
        (c) => c.collection === 'shame' && c.targetKind === 'website'
      )
      const shameRepo = hallExamples.some(
        (c) => c.collection === 'shame' && c.targetKind === 'repository'
      )
      const vibesWebsite = hallExamples.some(
        (c) => c.collection === 'vibes' && c.targetKind === 'website'
      )
      const vibesRepo = hallExamples.some(
        (c) => c.collection === 'vibes' && c.targetKind === 'repository'
      )

      expect(shameWebsite).toBe(true)
      expect(shameRepo).toBe(true)
      expect(vibesWebsite).toBe(true)
      expect(vibesRepo).toBe(true)
    })

    it('has unique ids and slugs across all examples', () => {
      const ids = hallExamples.map((c) => c.id)
      const slugs = hallExamples.map((c) => c.slug)

      expect(new Set(ids).size).toBe(hallExamples.length)
      expect(new Set(slugs).size).toBe(hallExamples.length)
    })

    it('passes strict schema validation and sanitization for every single fixture', () => {
      for (const item of hallExamples) {
        expect(() => validateHallCase(item)).not.toThrow()
        expect(() => sanitizeHallCase(item)).not.toThrow()
      }
    })

    it('has complete English and Indonesian text with no empty fields', () => {
      for (const item of hallExamples) {
        expect(item.publicAlias.en.trim()).toBeTruthy()
        expect(item.publicAlias.id.trim()).toBeTruthy()
        expect(item.title.en.trim()).toBeTruthy()
        expect(item.title.id.trim()).toBeTruthy()
        expect(item.category.en.trim()).toBeTruthy()
        expect(item.category.id.trim()).toBeTruthy()
        expect(item.verdictHeadline.en.trim()).toBeTruthy()
        expect(item.verdictHeadline.id.trim()).toBeTruthy()
        expect(item.verdictSummary.en.trim()).toBeTruthy()
        expect(item.verdictSummary.id.trim()).toBeTruthy()
        expect(item.broCodeReaction.en.trim()).toBeTruthy()
        expect(item.broCodeReaction.id.trim()).toBeTruthy()
        expect(item.findings.length).toBeGreaterThanOrEqual(1)

        for (const finding of item.findings) {
          expect(finding.title.en.trim()).toBeTruthy()
          expect(finding.title.id.trim()).toBeTruthy()
          expect(finding.explanation.en.trim()).toBeTruthy()
          expect(finding.explanation.id.trim()).toBeTruthy()
          expect(finding.roast.en.trim()).toBeTruthy()
          expect(finding.roast.id.trim()).toBeTruthy()
          expect(finding.remediation.en.trim()).toBeTruthy()
          expect(finding.remediation.id.trim()).toBeTruthy()
          expect(finding.evidenceType).toBe('fictional-example')
        }

        for (const strength of item.strengths) {
          expect(strength.en.trim()).toBeTruthy()
          expect(strength.id.trim()).toBeTruthy()
        }

        for (const limitation of item.limitations) {
          expect(limitation.en.trim()).toBeTruthy()
          expect(limitation.id.trim()).toBeTruthy()
        }
      }
    })

    it('does not contain any code snippets, URLs, emails, or secret tokens in fixtures', () => {
      const urlPattern = /https?:\/\/|www\./i
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
      const shaPattern = /\b[0-9a-fA-F]{40}\b/
      const secretPattern = /ghp_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16}/

      for (const item of hallExamples) {
        const fullDump = JSON.stringify(item)
        expect(fullDump).not.toMatch(urlPattern)
        expect(fullDump).not.toMatch(emailPattern)
        expect(fullDump).not.toMatch(shaPattern)
        expect(fullDump).not.toMatch(secretPattern)
      }
    })
  })

  describe('Server Loader', () => {
    it('loadHallCases returns all sanitized examples', () => {
      const cases = loadHallCases()
      expect(cases.length).toBe(hallExamples.length)
      expect(cases.length).toBeGreaterThanOrEqual(6)
      for (const c of cases) {
        expect(c.sourceType).toBe('fictional-example')
        expect(c.visibility).toBe('anonymous')
      }
    })
  })
})
