import { z } from 'zod'

export const languageSchema = z.enum(['en', 'id'])
export const intensitySchema = z.enum(['Friendly Fire', 'No Mercy', 'Career Ending'])
export const reactionSchema = z.enum(['idle', 'suspicious', 'analyzing', 'shocked', 'laughing', 'disappointed', 'angry', 'impressed', 'helpful', 'proud'])

const repoCategories = ['UI', 'UX', 'Accessibility', 'Performance', 'Functionality', 'Security', 'SEO', 'Code Quality', 'Git Hygiene', 'Dependencies', 'Architecture', 'Tests'] as const

export const findingSecuritySchema = z.object({
  category: z.string().max(100),
  ruleId: z.string().min(1).max(100),
  ruleVersion: z.string().min(1).max(50),
  commitSha: z.string().length(40),
  filePath: z.string().min(1).max(500).optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  observation: z.string().max(1600),
  possibleImpact: z.string().max(1600),
  coverageLimitations: z.string().max(1600),
})
export type FindingSecurity = z.infer<typeof findingSecuritySchema>

export const findingSchema = z.object({
  id: z.string().min(1).max(100),
  category: z.enum(repoCategories),
  title: z.string().min(1).max(200),
  description: z.string().max(1600),
  severity: z.enum(['high', 'medium', 'low']),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(z.string().max(1600)).min(1).max(10),
  location: z.string().max(300),
  recommendation: z.string().max(1600),
  source: z.enum(['dom', 'browser', 'metadata', 'timing', 'repository']),
  verification: z.enum(['verified', 'heuristic', 'inconclusive']),
  security: findingSecuritySchema.optional(),
})
export type Finding = z.infer<typeof findingSchema>

export const screenshotSchema = z.object({
  desktop: z.string().max(4_000_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).nullable(),
  mobile: z.string().max(4_000_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).nullable(),
})

export const scanSchema = z.object({
  url: z.string().max(2048),
  finalUrl: z.string().max(2048),
  scannedAt: z.string().datetime(),
  status: z.enum(['completed', 'partially_completed']),
  title: z.string().max(300),
  description: z.string().max(1000),
  screenshots: screenshotSchema,
  findings: z.array(findingSchema).max(60),
  strengths: z.array(z.string().max(500)).max(12),
  warnings: z.array(z.string().max(500)).max(20),
  metrics: z.object({
    navigationMs: z.number().nonnegative().nullable(),
    requestCount: z.number().int().nonnegative(),
    failedRequests: z.number().int().nonnegative(),
    consoleErrors: z.number().int().nonnegative(),
  }),
  evidenceSummary: z.string().max(16_000),
})

// Repository scan — no screenshots, tree/coverage metadata instead
export const repoFileSchema = z.object({
  path: z.string().min(1).max(500),
  type: z.enum(['file', 'dir']),
  size: z.number().int().nonnegative(),
})
export type RepoFile = z.infer<typeof repoFileSchema>

export const repoSelectedFileSchema = z.object({
  path: z.string().min(1).max(500),
  size: z.number().int().nonnegative(),
  truncated: z.boolean().optional(),
  inspectedBytes: z.number().int().nonnegative().optional(),
})
export type RepoSelectedFile = z.infer<typeof repoSelectedFileSchema>

export const securityContentStatusSchema = z.enum([
  'inspected',
  'filename-only',
  'skipped-policy',
  'skipped-budget',
  'oversized',
  'unavailable',
])
export type SecurityContentStatus = z.infer<typeof securityContentStatusSchema>

export const securityFileStatusSchema = z.object({
  path: z.string().min(1).max(500),
  status: securityContentStatusSchema,
  size: z.number().int().nonnegative().optional(),
  inspectedBytes: z.number().int().nonnegative().optional(),
})
export type SecurityFileStatus = z.infer<typeof securityFileStatusSchema>

export const securityCoverageSchema = z.object({
  caps: z.object({
    maxFiles: z.number().int().nonnegative(),
    maxBytesTotal: z.number().int().nonnegative(),
    maxBytesPerFile: z.number().int().nonnegative(),
    timeoutMs: z.number().int().nonnegative(),
    maxTimeMs: z.number().int().nonnegative().optional(),
    maxAttempts: z.number().int().nonnegative().optional(),
  }),
  filesDiscovered: z.number().int().nonnegative(),
  filesEnumerated: z.number().int().nonnegative().optional(),
  filesInspected: z.number().int().nonnegative(),
  filesAttempted: z.number().int().nonnegative().optional(),
  attemptsCount: z.number().int().nonnegative().optional(),
  bytesInspected: z.number().int().nonnegative(),
  statusCounts: z.object({
    inspected: z.number().int().nonnegative(),
    'filename-only': z.number().int().nonnegative(),
    'skipped-policy': z.number().int().nonnegative(),
    'skipped-budget': z.number().int().nonnegative(),
    oversized: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }),
  counts: z.object({
    inspected: z.number().int().nonnegative(),
    filenameOnly: z.number().int().nonnegative(),
    skippedPolicy: z.number().int().nonnegative(),
    skippedBudget: z.number().int().nonnegative(),
    oversized: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }).optional(),
  fileStatuses: z.array(securityFileStatusSchema).max(2000),
  statuses: z.array(securityFileStatusSchema).max(2000).optional(),
  files: z.array(securityFileStatusSchema).max(2000).optional(),
  treeTruncated: z.boolean(),
  contentTruncated: z.boolean(),
  deadlineExceeded: z.boolean(),
  budgetExceeded: z.boolean(),
  unknownRemaining: z.boolean(),
  unknownRemainder: z.boolean().optional(),
  totalSecurityFindings: z.number().int().nonnegative().optional(),
  omittedSecurityFindings: z.number().int().nonnegative().optional(),
  findingsSummary: z.object({
    total: z.number().int().nonnegative(),
    admitted: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
  }).optional(),
})
export type SecurityCoverage = z.infer<typeof securityCoverageSchema>

export const staticContentStatusSchema = z.enum([
  'supported',
  'parsed',
  'partial',
  'unsupported',
])
export type StaticContentStatus = z.infer<typeof staticContentStatusSchema>

export const staticFileStatusSchema = z.object({
  path: z.string().min(1).max(500),
  status: staticContentStatusSchema,
  syntaxKind: z.string().max(50).optional(),
  parseDiagnosticsCount: z.number().int().nonnegative().optional(),
  reason: z.string().max(500).optional(),
})
export type StaticFileStatus = z.infer<typeof staticFileStatusSchema>

export const staticCoverageSchema = z.object({
  filesAttempted: z.number().int().nonnegative(),
  filesParsed: z.number().int().nonnegative(),
  filesPartial: z.number().int().nonnegative(),
  filesUnsupported: z.number().int().nonnegative(),
  fileStatuses: z.array(staticFileStatusSchema).max(2000),
  scopeWarnings: z.array(z.string().max(500)).max(50).optional(),
})
export type StaticCoverage = z.infer<typeof staticCoverageSchema>

export const repoScanSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  sha: z.string().length(40),
  defaultBranch: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  language: z.string().max(50).nullable(),
  stargazerCount: z.number().int().nonnegative().nullable(),
  forkCount: z.number().int().nonnegative().nullable(),
  commitDate: z.string().datetime().nullable(),
  commitMessage: z.string().max(500).nullable(),
  tree: z.array(repoFileSchema).max(2000),
  selectedFiles: z.array(repoSelectedFileSchema).max(30),
  coverage: z.object({
    filesDiscovered: z.number().int().nonnegative(),
    filesInspected: z.number().int().nonnegative(),
    bytesInspected: z.number().int().nonnegative(),
    treeTruncated: z.boolean(),
    contentTruncated: z.boolean(),
  }),
  findings: z.array(findingSchema).max(100),
  securityFindings: z.array(findingSchema).max(100).default([]),
  totalSecurityFindings: z.number().int().nonnegative().optional(),
  omittedSecurityFindings: z.number().int().nonnegative().optional(),
  securityCoverage: securityCoverageSchema.optional(),
  staticCoverage: staticCoverageSchema.optional(),
  strengths: z.array(z.string().max(500)).max(12),
  warnings: z.array(z.string().max(500)).max(20),
  evidenceSummary: z.string().max(16_000),
})
export type RepoScanResult = z.infer<typeof repoScanSchema>

export type ScanResult = z.infer<typeof scanSchema>

export const commentarySchema = z.object({
  verdict: z.object({ headline: z.string().min(1).max(240), summary: z.string().min(1).max(1600), developerNickname: z.string().min(1).max(100), reaction: reactionSchema }),
  findings: z.array(z.object({ id: z.string().max(100), evidenceIds: z.array(z.string().max(100)).min(1).max(10), roast: z.string().min(1).max(700), explanation: z.string().max(1600), recommendation: z.string().max(1600), reaction: reactionSchema })).max(60),
  strengths: z.array(z.string().max(500)).max(12),
  overallSummary: z.string().max(1600),
})
export type Commentary = z.infer<typeof commentarySchema>

export type Language = z.infer<typeof languageSchema>
export type Intensity = z.infer<typeof intensitySchema>
export type Reaction = z.infer<typeof reactionSchema>

// Dual report schemas: Website and Repository
export const websiteReportSchema = z.object({
  scanKind: z.literal('website').optional(),
  id: z.string().uuid(),
  expiresAt: z.string().datetime(),
  language: languageSchema,
  intensity: intensitySchema,
  scan: scanSchema,
  repoScan: z.undefined().optional(),
  commentary: commentarySchema.nullable(),
  aiStatus: z.enum(['completed', 'unavailable']),
  aiMessage: z.string().max(500).nullable(),
  visualAnalysis: z.boolean(),
})

export const repoReportSchema = z.object({
  scanKind: z.literal('repository'),
  id: z.string().uuid(),
  expiresAt: z.string().datetime(),
  language: languageSchema,
  intensity: intensitySchema,
  scan: z.undefined().optional(),
  repoScan: repoScanSchema,
  commentary: commentarySchema.nullable(),
  aiStatus: z.enum(['completed', 'unavailable']),
  aiMessage: z.string().max(500).nullable(),
  visualAnalysis: z.boolean().default(false),
})

export const reportSchema = z.union([websiteReportSchema, repoReportSchema])

export type WebsiteReport = z.infer<typeof websiteReportSchema>
export type RepositoryReport = z.infer<typeof repoReportSchema>
export type RoastReport = WebsiteReport | RepositoryReport

export function isWebsiteReport(report: unknown): report is WebsiteReport {
  return typeof report === 'object' && report !== null && 'scan' in report && (report as { scan?: unknown }).scan !== undefined && (report as { scan?: unknown }).scan !== null
}

export function isRepositoryReport(report: unknown): report is RepositoryReport {
  return typeof report === 'object' && report !== null && 'repoScan' in report && (report as { repoScan?: unknown }).repoScan !== undefined && (report as { repoScan?: unknown }).repoScan !== null
}

export const promptOptionsSchema = z.object({
  selectedIds: z.array(z.string().max(100)).max(60),
  preset: z.enum(['Codex', 'Claude Code', 'Cursor', 'Windsurf', 'Generic Agent']),
  language: languageSchema,
  detail: z.enum(['short', 'detailed']),
  scanKind: z.enum(['website', 'repository']).optional(),
  // Repository context for Fix My Shame
  repoOwner: z.string().max(100).optional(),
  repoName: z.string().max(100).optional(),
  repoSha: z.string().length(40).optional(),
})
export type PromptOptions = z.infer<typeof promptOptionsSchema>
