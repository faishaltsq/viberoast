import {
  findingSchema,
  commentarySchema,
  repoReportSchema,
  repoScanSchema,
  type Commentary,
  type Finding,
  type RepoScanResult,
  type RepositoryReport,
} from '@/lib/types/report'
import { redactSecrets } from './redact'

export function truncateSafe(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  let sliced = text.slice(0, maxLength)
  if (/[\uD800-\uDBFF]$/.test(sliced)) {
    sliced = sliced.slice(0, -1)
  }
  return sliced
}

function cleanString(val: unknown, max: number, sensitiveValues?: readonly string[], fallback = ''): string {
  if (typeof val !== 'string') return fallback
  const redacted = redactSecrets(val, sensitiveValues)
  return truncateSafe(redacted, max)
}

function cleanNullableString(val: unknown, max: number, sensitiveValues?: readonly string[]): string | null {
  if (typeof val !== 'string' || val === '') return null
  const redacted = redactSecrets(val, sensitiveValues)
  return truncateSafe(redacted, max)
}

export function sanitizeObject<T>(value: T, sensitiveValues?: readonly string[]): T {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return redactSecrets(value, sensitiveValues) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeObject(item, sensitiveValues)) as unknown as T
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      const sanitizedKey = redactSecrets(key, sensitiveValues)
      result[sanitizedKey] = sanitizeObject(val, sensitiveValues)
    }
    return result as unknown as T
  }
  return value
}

function sanitizeFinding(raw: unknown, sensitiveValues?: readonly string[]): Finding {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid finding data')
  }
  const f = raw as Record<string, unknown>
  const evidence = Array.isArray(f.evidence)
    ? f.evidence
        .slice(0, 10)
        .map(entry => {
          const text = typeof entry === 'string' ? entry : String(entry ?? '')
          const red = redactSecrets(text, sensitiveValues)
          return truncateSafe(red, 1600)
        })
        .filter(Boolean)
    : []

  const projected = {
    id: cleanString(f.id, 100, sensitiveValues),
    category: f.category,
    title: cleanString(f.title, 200, sensitiveValues),
    description: cleanString(f.description, 1600, sensitiveValues),
    severity: f.severity,
    confidence: f.confidence,
    evidence: evidence.length > 0 ? evidence : ['[evidence omitted for security]'],
    location: cleanString(f.location, 300, sensitiveValues),
    recommendation: cleanString(f.recommendation, 1600, sensitiveValues),
    source: f.source,
    verification: f.verification,
  }

  return findingSchema.parse(projected)
}

function sanitizeCommentary(raw: unknown, sensitiveValues?: readonly string[]): Commentary {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid commentary data')
  }
  const c = raw as Record<string, unknown>
  if (typeof c.verdict !== 'object' || c.verdict === null) {
    throw new Error('Invalid commentary: missing verdict')
  }
  const v = c.verdict as Record<string, unknown>
  const rawCommFindings = Array.isArray(c.findings) ? c.findings : []

  const projected = {
    verdict: {
      headline: cleanString(v.headline, 240, sensitiveValues),
      summary: cleanString(v.summary, 1600, sensitiveValues),
      developerNickname: cleanString(v.developerNickname, 100, sensitiveValues),
      reaction: v.reaction,
    },
    findings: rawCommFindings.slice(0, 60).map(cf => {
      if (typeof cf !== 'object' || cf === null) {
        throw new Error('Invalid commentary finding entry')
      }
      const item = cf as Record<string, unknown>
      const fId = cleanString(item.id, 100, sensitiveValues)
      const rawEvidenceIds = Array.isArray(item.evidenceIds) ? item.evidenceIds : [fId]
      const evidenceIds = rawEvidenceIds.slice(0, 10).map(e => cleanString(e, 100, sensitiveValues)).filter(Boolean)
      return {
        id: fId,
        evidenceIds: evidenceIds.length > 0 ? evidenceIds : [fId],
        roast: cleanString(item.roast, 700, sensitiveValues),
        explanation: cleanString(item.explanation, 1600, sensitiveValues),
        recommendation: cleanString(item.recommendation, 1600, sensitiveValues),
        reaction: item.reaction,
      }
    }),
    strengths: (Array.isArray(c.strengths) ? c.strengths : [])
      .slice(0, 12)
      .map(s => cleanString(s, 500, sensitiveValues))
      .filter(Boolean),
    overallSummary: cleanString(c.overallSummary, 1600, sensitiveValues),
  }

  return commentarySchema.parse(projected)
}

export function toPublicRepositoryScan(
  scan: unknown,
  sensitiveValues?: readonly string[]
): RepoScanResult {
  if (typeof scan !== 'object' || scan === null) {
    throw new Error('Invalid repository scan data')
  }
  const s = scan as Record<string, unknown>

  const rawSha = typeof s.sha === 'string' ? s.sha.trim() : ''
  if (!/^[0-9a-fA-F]{40}$/.test(rawSha)) {
    throw new Error('Invalid repository scan: invalid commit SHA')
  }
  const sha = rawSha.toLowerCase()

  const owner = cleanString(s.owner, 100, sensitiveValues)
  const repo = cleanString(s.repo, 100, sensitiveValues)
  const defaultBranch = cleanString(s.defaultBranch, 100, sensitiveValues)
  const description = cleanNullableString(s.description, 500, sensitiveValues)
  const language = cleanNullableString(s.language, 50, sensitiveValues)
  const stargazerCount = typeof s.stargazerCount === 'number' && Number.isFinite(s.stargazerCount)
    ? Math.max(0, Math.floor(s.stargazerCount))
    : null
  const forkCount = typeof s.forkCount === 'number' && Number.isFinite(s.forkCount)
    ? Math.max(0, Math.floor(s.forkCount))
    : null

  let commitDate: string | null = null
  if (typeof s.commitDate === 'string' && s.commitDate.trim() !== '') {
    const parsedDate = Date.parse(s.commitDate)
    if (!Number.isNaN(parsedDate)) {
      commitDate = new Date(parsedDate).toISOString()
    }
  }

  const commitMessage = cleanNullableString(s.commitMessage, 500, sensitiveValues)

  const tree = (Array.isArray(s.tree) ? s.tree : []).slice(0, 2000).map(item => {
    if (typeof item !== 'object' || item === null) throw new Error('Invalid tree entry')
    const it = item as Record<string, unknown>
    return {
      path: cleanString(it.path, 500, sensitiveValues),
      type: it.type,
      size: typeof it.size === 'number' && Number.isFinite(it.size) ? Math.max(0, Math.floor(it.size)) : 0,
    }
  })

  // Explicitly project selectedFiles without source content
  const selectedFiles = (Array.isArray(s.selectedFiles) ? s.selectedFiles : []).slice(0, 30).map(file => {
    if (typeof file !== 'object' || file === null) throw new Error('Invalid selected file entry')
    const f = file as Record<string, unknown>
    const path = cleanString(f.path, 500, sensitiveValues)
    const size = typeof f.size === 'number' && Number.isFinite(f.size) ? Math.max(0, Math.floor(f.size)) : 0
    const truncated = Boolean(f.truncated)
    const inspectedBytes = typeof f.inspectedBytes === 'number' && Number.isFinite(f.inspectedBytes)
      ? Math.max(0, Math.floor(f.inspectedBytes))
      : undefined
    return {
      path,
      size,
      truncated,
      ...(inspectedBytes !== undefined ? { inspectedBytes } : {}),
    }
  })

  if (typeof s.coverage !== 'object' || s.coverage === null) {
    throw new Error('Invalid repository scan: missing coverage')
  }
  const cov = s.coverage as Record<string, unknown>
  const coverage = {
    filesDiscovered: typeof cov.filesDiscovered === 'number' && Number.isFinite(cov.filesDiscovered)
      ? Math.max(0, Math.floor(cov.filesDiscovered)) : 0,
    filesInspected: typeof cov.filesInspected === 'number' && Number.isFinite(cov.filesInspected)
      ? Math.max(0, Math.floor(cov.filesInspected)) : 0,
    bytesInspected: typeof cov.bytesInspected === 'number' && Number.isFinite(cov.bytesInspected)
      ? Math.max(0, Math.floor(cov.bytesInspected)) : 0,
    treeTruncated: Boolean(cov.treeTruncated),
    contentTruncated: Boolean(cov.contentTruncated),
  }

  const rawFindings = Array.isArray(s.findings) ? s.findings : []
  const findings = rawFindings.slice(0, 100).map(f => sanitizeFinding(f, sensitiveValues))

  const strengths = (Array.isArray(s.strengths) ? s.strengths : [])
    .slice(0, 12)
    .map(str => cleanString(str, 500, sensitiveValues))
    .filter(Boolean)

  const warnings = (Array.isArray(s.warnings) ? s.warnings : [])
    .slice(0, 20)
    .map(w => cleanString(w, 500, sensitiveValues))
    .filter(Boolean)

  const evidenceSummary = cleanString(s.evidenceSummary, 16_000, sensitiveValues)

  const projected = {
    owner,
    repo,
    sha,
    defaultBranch,
    description,
    language,
    stargazerCount,
    forkCount,
    commitDate,
    commitMessage,
    tree,
    selectedFiles,
    coverage,
    findings,
    strengths,
    warnings,
    evidenceSummary,
  }

  const validated = repoScanSchema.parse(projected)

  if (sensitiveValues && sensitiveValues.length > 0) {
    const serialized = JSON.stringify(validated)
    for (const val of sensitiveValues) {
      if (val && val.length >= 4 && serialized.includes(val)) {
        throw new Error('Repository scan failed security serialization check')
      }
    }
  }

  return validated
}

export function toPublicRepositoryReport(
  report: unknown,
  sensitiveValues?: readonly string[]
): RepositoryReport {
  if (typeof report !== 'object' || report === null) {
    throw new Error('Invalid repository report data')
  }
  const r = report as Record<string, unknown>

  const rawId = typeof r.id === 'string' ? r.id.trim() : ''
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rawId)) {
    throw new Error('Invalid repository report: invalid report ID')
  }
  const id = rawId.toLowerCase()

  const rawExpiresAt = typeof r.expiresAt === 'string' ? r.expiresAt.trim() : ''
  if (!rawExpiresAt || Number.isNaN(Date.parse(rawExpiresAt))) {
    throw new Error('Invalid repository report: invalid expiry date')
  }
  const expiresAt = new Date(rawExpiresAt).toISOString()

  const language = r.language
  const intensity = r.intensity
  const repoScan = toPublicRepositoryScan(r.repoScan, sensitiveValues)
  const commentary = r.commentary ? sanitizeCommentary(r.commentary, sensitiveValues) : null
  const aiStatus = r.aiStatus
  const aiMessage = cleanNullableString(r.aiMessage, 500, sensitiveValues)
  const visualAnalysis = Boolean(r.visualAnalysis)

  const projectedReport = {
    scanKind: 'repository',
    id,
    expiresAt,
    language,
    intensity,
    repoScan,
    commentary,
    aiStatus,
    aiMessage,
    visualAnalysis,
  }

  const validated = repoReportSchema.parse(projectedReport)

  if (sensitiveValues && sensitiveValues.length > 0) {
    const serialized = JSON.stringify(validated)
    for (const val of sensitiveValues) {
      if (val && val.length >= 4 && serialized.includes(val)) {
        throw new Error('Repository report failed security serialization check')
      }
    }
  }

  return validated
}
