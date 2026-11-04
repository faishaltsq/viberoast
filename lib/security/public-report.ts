import {
  findingSchema,
  findingSecuritySchema,
  commentarySchema,
  repoReportSchema,
  repoScanSchema,
  securityCoverageSchema,
  staticCoverageSchema,
  type Commentary,
  type Finding,
  type FindingSecurity,
  type RepoScanResult,
  type RepositoryReport,
  type SecurityCoverage,
  type SecurityContentStatus,
  type StaticCoverage,
  type StaticContentStatus,
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

function sanitizeFindingSecurity(
  raw: unknown,
  sensitiveValues?: readonly string[]
): FindingSecurity | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const s = raw as Record<string, unknown>
  if (typeof s.ruleId !== 'string' || typeof s.commitSha !== 'string') return undefined

  const rawSha = typeof s.commitSha === 'string' ? s.commitSha.trim().toLowerCase() : ''
  if (!/^[0-9a-fA-F]{40}$/.test(rawSha)) return undefined

  const lineStart =
    typeof s.lineStart === 'number' && Number.isFinite(s.lineStart) && s.lineStart > 0
      ? Math.floor(s.lineStart)
      : undefined
  const lineEnd =
    typeof s.lineEnd === 'number' && Number.isFinite(s.lineEnd) && s.lineEnd > 0
      ? Math.floor(s.lineEnd)
      : undefined

  const projectedSec = {
    category: cleanString(s.category, 100, sensitiveValues, 'Security'),
    ruleId: cleanString(s.ruleId, 100, sensitiveValues),
    ruleVersion: cleanString(s.ruleVersion, 50, sensitiveValues, '1.0.0'),
    commitSha: rawSha,
    ...(typeof s.filePath === 'string' && s.filePath.trim() !== ''
      ? { filePath: cleanString(s.filePath, 500, sensitiveValues) }
      : {}),
    ...(lineStart !== undefined ? { lineStart } : {}),
    ...(lineEnd !== undefined ? { lineEnd } : {}),
    observation: cleanString(s.observation, 1600, sensitiveValues),
    possibleImpact: cleanString(s.possibleImpact, 1600, sensitiveValues),
    coverageLimitations: cleanString(s.coverageLimitations, 1600, sensitiveValues),
  }

  return findingSecuritySchema.parse(projectedSec)
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

  const security = f.security ? sanitizeFindingSecurity(f.security, sensitiveValues) : undefined

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
    ...(security ? { security } : {}),
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

function sanitizeSecurityCoverage(
  raw: unknown,
  sensitiveValues?: readonly string[]
): SecurityCoverage {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid security coverage data')
  }
  const c = raw as Record<string, unknown>
  const caps = typeof c.caps === 'object' && c.caps !== null ? (c.caps as Record<string, unknown>) : {}
  const statusCounts =
    typeof c.statusCounts === 'object' && c.statusCounts !== null
      ? (c.statusCounts as Record<string, unknown>)
      : typeof c.counts === 'object' && c.counts !== null
        ? (c.counts as Record<string, unknown>)
        : {}

  const rawFileStatuses = Array.isArray(c.fileStatuses)
    ? c.fileStatuses
    : Array.isArray(c.statuses)
      ? c.statuses
      : Array.isArray(c.files)
        ? c.files
        : []

  const fileStatuses = rawFileStatuses.slice(0, 2000).map((item) => {
    if (typeof item !== 'object' || item === null) throw new Error('Invalid file status')
    const it = item as Record<string, unknown>
    return {
      path: cleanString(it.path, 500, sensitiveValues),
      status: it.status as SecurityContentStatus,
      size: typeof it.size === 'number' && Number.isFinite(it.size) ? Math.max(0, Math.floor(it.size)) : undefined,
      inspectedBytes:
        typeof it.inspectedBytes === 'number' && Number.isFinite(it.inspectedBytes)
          ? Math.max(0, Math.floor(it.inspectedBytes))
          : undefined,
    }
  })

  const inspected =
    typeof statusCounts.inspected === 'number' && Number.isFinite(statusCounts.inspected)
      ? Math.max(0, Math.floor(statusCounts.inspected))
      : 0
  const filenameOnly =
    typeof statusCounts['filename-only'] === 'number' && Number.isFinite(statusCounts['filename-only'])
      ? Math.max(0, Math.floor(statusCounts['filename-only']))
      : typeof statusCounts.filenameOnly === 'number' && Number.isFinite(statusCounts.filenameOnly)
        ? Math.max(0, Math.floor(statusCounts.filenameOnly))
        : 0
  const skippedPolicy =
    typeof statusCounts['skipped-policy'] === 'number' && Number.isFinite(statusCounts['skipped-policy'])
      ? Math.max(0, Math.floor(statusCounts['skipped-policy']))
      : typeof statusCounts.skippedPolicy === 'number' && Number.isFinite(statusCounts.skippedPolicy)
        ? Math.max(0, Math.floor(statusCounts.skippedPolicy))
        : 0
  const skippedBudget =
    typeof statusCounts['skipped-budget'] === 'number' && Number.isFinite(statusCounts['skipped-budget'])
      ? Math.max(0, Math.floor(statusCounts['skipped-budget']))
      : typeof statusCounts.skippedBudget === 'number' && Number.isFinite(statusCounts.skippedBudget)
        ? Math.max(0, Math.floor(statusCounts.skippedBudget))
        : 0
  const oversized =
    typeof statusCounts.oversized === 'number' && Number.isFinite(statusCounts.oversized)
      ? Math.max(0, Math.floor(statusCounts.oversized))
      : 0
  const unavailable =
    typeof statusCounts.unavailable === 'number' && Number.isFinite(statusCounts.unavailable)
      ? Math.max(0, Math.floor(statusCounts.unavailable))
      : 0

  const projected = {
    caps: {
      maxFiles: typeof caps.maxFiles === 'number' ? Math.max(0, Math.floor(caps.maxFiles)) : 100,
      maxBytesTotal: typeof caps.maxBytesTotal === 'number' ? Math.max(0, Math.floor(caps.maxBytesTotal)) : 2_097_152,
      maxBytesPerFile:
        typeof caps.maxBytesPerFile === 'number' ? Math.max(0, Math.floor(caps.maxBytesPerFile)) : 131_072,
      timeoutMs:
        typeof caps.timeoutMs === 'number'
          ? Math.max(0, Math.floor(caps.timeoutMs))
          : typeof caps.maxTimeMs === 'number'
            ? Math.max(0, Math.floor(caps.maxTimeMs))
            : 30_000,
      ...(typeof caps.maxAttempts === 'number' ? { maxAttempts: Math.max(0, Math.floor(caps.maxAttempts)) } : {}),
    },
    filesDiscovered:
      typeof c.filesDiscovered === 'number' && Number.isFinite(c.filesDiscovered)
        ? Math.max(0, Math.floor(c.filesDiscovered))
        : typeof c.filesEnumerated === 'number' && Number.isFinite(c.filesEnumerated)
          ? Math.max(0, Math.floor(c.filesEnumerated))
          : fileStatuses.length,
    filesInspected:
      typeof c.filesInspected === 'number' && Number.isFinite(c.filesInspected)
        ? Math.max(0, Math.floor(c.filesInspected))
        : 0,
    ...(typeof c.filesAttempted === 'number' && Number.isFinite(c.filesAttempted)
      ? { filesAttempted: Math.max(0, Math.floor(c.filesAttempted)) }
      : typeof c.attemptsCount === 'number' && Number.isFinite(c.attemptsCount)
        ? { filesAttempted: Math.max(0, Math.floor(c.attemptsCount)) }
        : {}),
    ...(typeof c.attemptsCount === 'number' && Number.isFinite(c.attemptsCount)
      ? { attemptsCount: Math.max(0, Math.floor(c.attemptsCount)) }
      : typeof c.filesAttempted === 'number' && Number.isFinite(c.filesAttempted)
        ? { attemptsCount: Math.max(0, Math.floor(c.filesAttempted)) }
        : {}),
    bytesInspected:
      typeof c.bytesInspected === 'number' && Number.isFinite(c.bytesInspected)
        ? Math.max(0, Math.floor(c.bytesInspected))
        : 0,
    statusCounts: {
      inspected,
      'filename-only': filenameOnly,
      'skipped-policy': skippedPolicy,
      'skipped-budget': skippedBudget,
      oversized,
      unavailable,
    },
    fileStatuses,
    treeTruncated: Boolean(c.treeTruncated),
    contentTruncated: Boolean(c.contentTruncated),
    deadlineExceeded: Boolean(c.deadlineExceeded),
    budgetExceeded: Boolean(c.budgetExceeded ?? c.contentTruncated),
    unknownRemaining: Boolean(c.unknownRemaining ?? c.unknownRemainder ?? c.treeTruncated),
    ...(typeof c.totalSecurityFindings === 'number' && Number.isFinite(c.totalSecurityFindings)
      ? { totalSecurityFindings: Math.max(0, Math.floor(c.totalSecurityFindings)) }
      : {}),
    ...(typeof c.omittedSecurityFindings === 'number' && Number.isFinite(c.omittedSecurityFindings)
      ? { omittedSecurityFindings: Math.max(0, Math.floor(c.omittedSecurityFindings)) }
      : {}),
    ...(typeof c.findingsSummary === 'object' && c.findingsSummary !== null
      ? {
          findingsSummary: {
            total: Math.max(0, Math.floor(Number((c.findingsSummary as Record<string, unknown>).total) || 0)),
            admitted: Math.max(0, Math.floor(Number((c.findingsSummary as Record<string, unknown>).admitted) || 0)),
            omitted: Math.max(0, Math.floor(Number((c.findingsSummary as Record<string, unknown>).omitted) || 0)),
          },
        }
      : {}),
  }

  return securityCoverageSchema.parse(projected)
}

function sanitizeStaticCoverage(
  raw: unknown,
  sensitiveValues?: readonly string[]
): StaticCoverage {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid static coverage data')
  }
  const c = raw as Record<string, unknown>
  const rawFileStatuses = Array.isArray(c.fileStatuses) ? c.fileStatuses : []
  const fileStatuses = rawFileStatuses.slice(0, 2000).map((item) => {
    if (typeof item !== 'object' || item === null) throw new Error('Invalid file status')
    const it = item as Record<string, unknown>
    return {
      path: cleanString(it.path, 500, sensitiveValues),
      status: it.status as StaticContentStatus,
      ...(typeof it.syntaxKind === 'string'
        ? { syntaxKind: cleanString(it.syntaxKind, 50, sensitiveValues) }
        : {}),
      ...(typeof it.parseDiagnosticsCount === 'number' && Number.isFinite(it.parseDiagnosticsCount)
        ? { parseDiagnosticsCount: Math.max(0, Math.floor(it.parseDiagnosticsCount)) }
        : {}),
      ...(typeof it.reason === 'string'
        ? { reason: cleanString(it.reason, 500, sensitiveValues) }
        : {}),
    }
  })

  const rawWarnings = Array.isArray(c.scopeWarnings) ? c.scopeWarnings : []
  const scopeWarnings = rawWarnings
    .slice(0, 50)
    .map((w) => cleanString(w, 500, sensitiveValues))
    .filter(Boolean)

  const projected = {
    filesAttempted:
      typeof c.filesAttempted === 'number' && Number.isFinite(c.filesAttempted)
        ? Math.max(0, Math.floor(c.filesAttempted))
        : 0,
    filesParsed:
      typeof c.filesParsed === 'number' && Number.isFinite(c.filesParsed)
        ? Math.max(0, Math.floor(c.filesParsed))
        : 0,
    filesPartial:
      typeof c.filesPartial === 'number' && Number.isFinite(c.filesPartial)
        ? Math.max(0, Math.floor(c.filesPartial))
        : 0,
    filesUnsupported:
      typeof c.filesUnsupported === 'number' && Number.isFinite(c.filesUnsupported)
        ? Math.max(0, Math.floor(c.filesUnsupported))
        : 0,
    fileStatuses,
    ...(scopeWarnings.length > 0 ? { scopeWarnings } : {}),
  }

  return staticCoverageSchema.parse(projected)
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

  const rawSecurityFindings = Array.isArray(s.securityFindings) ? s.securityFindings : []
  const securityFindings = rawSecurityFindings.slice(0, 100).map(f => sanitizeFinding(f, sensitiveValues))

  const totalSecurityFindings =
    typeof s.totalSecurityFindings === 'number' && Number.isFinite(s.totalSecurityFindings)
      ? Math.max(0, Math.floor(s.totalSecurityFindings))
      : undefined
  const omittedSecurityFindings =
    typeof s.omittedSecurityFindings === 'number' && Number.isFinite(s.omittedSecurityFindings)
      ? Math.max(0, Math.floor(s.omittedSecurityFindings))
      : undefined

  const securityCoverage = s.securityCoverage !== undefined && s.securityCoverage !== null
    ? sanitizeSecurityCoverage(s.securityCoverage, sensitiveValues)
    : undefined

  const staticCoverage = s.staticCoverage !== undefined && s.staticCoverage !== null
    ? sanitizeStaticCoverage(s.staticCoverage, sensitiveValues)
    : undefined

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
    securityFindings,
    ...(totalSecurityFindings !== undefined ? { totalSecurityFindings } : {}),
    ...(omittedSecurityFindings !== undefined ? { omittedSecurityFindings } : {}),
    ...(securityCoverage ? { securityCoverage } : {}),
    ...(staticCoverage ? { staticCoverage } : {}),
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
