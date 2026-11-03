import type { Finding, RepoFile } from '../types/report'
import type { ExtractedFile } from '../github/extract'
import type { GitHubRepoMeta } from '../github/client'

export interface AnalysisMeta extends Partial<GitHubRepoMeta> {
  sha?: string
  commitDate?: string | null
  commitMessage?: string | null
}

export interface AnalysisContext {
  owner: string
  repo: string
  sha: string
  tree: RepoFile[]
  files: ExtractedFile[]
  meta?: AnalysisMeta
  treeTruncated?: boolean
  contentTruncated?: boolean
  sensitiveValues?: readonly string[]
}

export interface AnalysisFinding extends Finding {
  filePath?: string
  lineStart?: number
  lineEnd?: number
  githubPermaUrl?: string
}

export type CheckFn = (ctx: AnalysisContext) => AnalysisFinding[]

export interface AnalysisResult {
  findings: Finding[]
  strengths: string[]
  warnings: string[]
  evidenceSummary: string
}
