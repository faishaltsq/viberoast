import { z } from 'zod'

export type HallLanguage = 'en' | 'id'

const kebabIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80)

export const localizedTextSchema = z
  .object({
    en: z.string().trim().min(1).max(2000),
    id: z.string().trim().min(1).max(2000),
  })
  .strict()

export type LocalizedText = z.infer<typeof localizedTextSchema>

export const hallFindingSchema = z
  .object({
    id: kebabIdSchema,
    title: localizedTextSchema,
    category: localizedTextSchema,
    explanation: localizedTextSchema,
    roast: localizedTextSchema,
    remediation: localizedTextSchema,
    severity: z.enum(['low', 'medium', 'high']),
    evidenceType: z.literal('fictional-example'),
  })
  .strict()

export type HallFinding = z.infer<typeof hallFindingSchema>

export const hallCaseSchema = z
  .object({
    id: kebabIdSchema,
    slug: kebabIdSchema,
    sourceType: z.literal('fictional-example'),
    visibility: z.literal('anonymous'),
    collection: z.enum(['shame', 'vibes']),
    targetKind: z.enum(['website', 'repository']),
    publicAlias: localizedTextSchema,
    title: localizedTextSchema,
    category: localizedTextSchema,
    verdictHeadline: localizedTextSchema,
    verdictSummary: localizedTextSchema,
    broCodeReaction: localizedTextSchema,
    comedyHeat: z.number().int().min(0).max(100),
    findings: z.array(hallFindingSchema).min(1).max(20),
    strengths: z.array(localizedTextSchema).max(12),
    limitations: z.array(localizedTextSchema).min(1).max(12),
    publishedAt: z.iso.datetime().optional(),
  })
  .strict()

export type HallCase = z.infer<typeof hallCaseSchema>

export type HallUser = {
  displayName: string
  avatarUrl: string | null
  provider: string
}
