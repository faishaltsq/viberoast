import { z } from 'zod'

export const languageSchema = z.enum(['en', 'id'])
export const intensitySchema = z.enum(['Friendly Fire', 'No Mercy', 'Career Ending'])
export const reactionSchema = z.enum(['idle', 'suspicious', 'analyzing', 'shocked', 'laughing', 'disappointed', 'angry', 'impressed', 'helpful', 'proud'])
export const findingSchema = z.object({
  id: z.string().min(1).max(100),
  category: z.enum(['UI', 'UX', 'Accessibility', 'Performance', 'Functionality', 'Security', 'SEO', 'Code Quality']),
  title: z.string().min(1).max(200),
  description: z.string().max(1600),
  severity: z.enum(['high', 'medium', 'low']),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(z.string().max(1600)).min(1).max(10),
  location: z.string().max(300),
  recommendation: z.string().max(1600),
  source: z.enum(['dom', 'browser', 'metadata', 'timing', 'repository']),
  verification: z.enum(['verified', 'heuristic', 'inconclusive']),
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
export const reportSchema = z.object({
  id: z.string().uuid(),
  expiresAt: z.string().datetime(),
  language: languageSchema,
  intensity: intensitySchema,
  scan: scanSchema,
  commentary: commentarySchema.nullable(),
  aiStatus: z.enum(['completed', 'unavailable']),
  aiMessage: z.string().max(500).nullable(),
  visualAnalysis: z.boolean(),
})
export type RoastReport = z.infer<typeof reportSchema>
export const promptOptionsSchema = z.object({
  selectedIds: z.array(z.string().max(100)).max(60),
  preset: z.enum(['Codex', 'Claude Code', 'Cursor', 'Windsurf', 'Generic Agent']),
  language: languageSchema,
  detail: z.enum(['short', 'detailed']),
})
export type PromptOptions = z.infer<typeof promptOptionsSchema>
