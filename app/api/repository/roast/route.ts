import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { parseGitHubUrl } from '@/lib/github/parse-url'
import { fetchRepoMeta } from '@/lib/github/client'
import { fetchTree } from '@/lib/github/tree'
import { selectFiles } from '@/lib/github/select-files'
import { extractFiles } from '@/lib/github/extract'
import { type RepoScanResult, intensitySchema, languageSchema, type RoastReport, type Commentary } from '@/lib/types/report'
import { analyzeRepository } from '@/lib/analysis/repository'
import { generateRepoRoast } from '@/lib/ai/deepseek'
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http'
import { acquireScan, assertDeployment, reportExpiry, retainReport } from '@/lib/server/store'
import { collectSensitiveValues } from '@/lib/security/redact'
import { toPublicRepositoryReport, toPublicRepositoryScan } from '@/lib/security/public-report'

export const runtime = 'nodejs'
export const maxDuration = 160

const requestSchema = z.object({
  url: z.string().min(1).max(2048).optional(),
  owner: z.string().min(1).max(100).optional(),
  repo: z.string().min(1).max(100).optional(),
  language: languageSchema,
  intensity: intensitySchema,
  sha: z.string().length(40).optional(),
}).strict().refine(data => Boolean(data.url || (data.owner && data.repo)), {
  message: 'Must provide url or owner and repo',
})

export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined
  const startedAt = Date.now()
  let outcome = 'failed'
  const timeoutController = new AbortController()
  const routeTimeout = setTimeout(() => {
    timeoutController.abort(new Error('Repository roast timed out after 140s'))
  }, 140_000)
  const routeSignal = AbortSignal.any([request.signal, timeoutController.signal])

  try {
    assertDeployment('repository')
    assertSameOrigin(request)
    const input = await readJson(request, requestSchema)
    routeSignal.throwIfAborted()
    
    // Parse and validate GitHub URL
    const target = input.url || `${input.owner}/${input.repo}`
    const parsed = parseGitHubUrl(target)
    if (!parsed) {
      throw new HttpError(400, 'INVALID_REPOSITORY', 'Repository does not exist or cannot be accessed.')
    }
    
    release = acquireScan(request, Date.now(), 'repository')
    
    // Fetch repository metadata
    const meta = await fetchRepoMeta(parsed.owner, parsed.repo, routeSignal)
    const sha = input.sha || meta.sha
    
    // Fetch file tree with 2000 path limit
    const { files: tree, truncated: treeTruncated } = await fetchTree(
      parsed.owner,
      parsed.repo,
      sha,
      2000,
      routeSignal
    )
    
    // Select files for inspection (default: 30 max, 256 KiB total, 32 KiB per file)
    const selected = selectFiles(tree, {
      maxFiles: 30,
      maxBytesTotal: 262_144,
      maxBytesPerFile: 32_768,
    })
    
    // Extract file contents
    const extraction = await extractFiles(
      parsed.owner,
      parsed.repo,
      sha,
      selected.selected,
      262_144,
      32768,
      routeSignal
    )
    
    routeSignal.throwIfAborted()
    
    // Collect request-local sensitive values: direct union of pre-harvested unclipped values and raw scan inputs
    const harvestedValues = collectSensitiveValues([
      ...extraction.files.map(f => f.content),
      meta.description,
      parsed.owner,
      parsed.repo,
    ])
    const sensitiveValues = Array.from(new Set([
      ...(extraction.unclippedSensitiveValues ?? []),
      ...harvestedValues,
    ]))

    const contentTruncated = Boolean(extraction.contentTruncated || extraction.files.some(f => f.truncated))

    // Run repository analysis engine (internal source buffers remain internal)
    const analysis = analyzeRepository({
      owner: parsed.owner,
      repo: parsed.repo,
      sha,
      tree,
      files: extraction.files,
      meta,
      treeTruncated,
      contentTruncated,
      sensitiveValues,
    })

    // Project safe scan metadata without source content before AI model call
    const rawScan = {
      owner: parsed.owner,
      repo: parsed.repo,
      sha,
      defaultBranch: meta.defaultBranch,
      description: meta.description,
      language: meta.language,
      stargazerCount: meta.stargazerCount,
      forkCount: meta.forkCount,
      commitDate: null,
      commitMessage: null,
      tree: selected.selected.map(f => ({ path: f.path, type: f.type, size: f.size })),
      selectedFiles: extraction.files.map(f => ({
        path: f.path,
        size: f.size,
        truncated: f.truncated,
        inspectedBytes: Buffer.byteLength(f.content, 'utf8'),
      })),
      coverage: {
        filesDiscovered: tree.length,
        filesInspected: extraction.files.length,
        bytesInspected: extraction.bytesInspected,
        treeTruncated,
        contentTruncated,
      },
      findings: analysis.findings,
      strengths: analysis.strengths,
      warnings: analysis.warnings,
      evidenceSummary: analysis.evidenceSummary,
    }

    const safeRepoScan: RepoScanResult = toPublicRepositoryScan(rawScan, sensitiveValues)

    // Generate AI roast with safe projected scan (never receives raw source content)
    let commentary: Commentary | null = null
    try {
      const generated = await generateRepoRoast(safeRepoScan, input, routeSignal)
      commentary = generated.commentary
    } catch (error) {
      if (routeSignal.aborted) throw error
    }

    routeSignal.throwIfAborted()

    // Build and sanitize final repository report before retention and response
    const rawReport: RoastReport = {
      id: randomUUID(),
      expiresAt: reportExpiry(),
      language: input.language,
      intensity: input.intensity,
      scanKind: 'repository',
      repoScan: safeRepoScan,
      commentary,
      aiStatus: commentary ? 'completed' : 'unavailable',
      aiMessage: commentary ? null : input.language === 'id'
        ? 'Bukti pemindaian tersedia, tapi komentar AI sedang tidak tersedia.'
        : 'Scanner evidence is available, but AI commentary is unavailable.',
      visualAnalysis: false,
    }

    const safeReport = toPublicRepositoryReport(rawReport, sensitiveValues)
    const storedReport = retainReport(safeReport)
    outcome = safeReport.aiStatus === 'unavailable' ? 'scanner_only' : 'completed'
    return json(storedReport)
    
  } catch (error) {
    outcome = request.signal.aborted ? 'cancelled' : timeoutController.signal.aborted ? 'TIMEOUT' : error instanceof HttpError ? error.code : 'ANALYSIS_UNAVAILABLE'
    if (request.signal.aborted) return json({ error: 'The request was cancelled.', code: 'REQUEST_CANCELLED' }, 499)
    if (timeoutController.signal.aborted) return json({ error: 'The repository analysis timed out. Try again shortly.', code: 'ANALYSIS_TIMEOUT' }, 504)
    return errorResponse(error)
  } finally {
    clearTimeout(routeTimeout)
    release?.()
    console.info(JSON.stringify({ event: 'repository_roast_request', outcome, durationMs: Date.now() - startedAt }))
  }
}