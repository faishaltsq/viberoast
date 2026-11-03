import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { parseGitHubUrl } from '@/lib/github/parse-url'
import { fetchRepoMeta } from '@/lib/github/client'
import { fetchTree } from '@/lib/github/tree'
import { selectFiles } from '@/lib/github/select-files'
import { extractFiles } from '@/lib/github/extract'
import { scanSecurityFiles } from '@/lib/github/security-scan'
import { type RepoScanResult, intensitySchema, languageSchema, type RoastReport, type Commentary } from '@/lib/types/report'
import { analyzeRepository, validateFinding } from '@/lib/analysis/repository'
import { checkSecurity } from '@/lib/analysis/checks/security'
import { deduplicateFindings } from '@/lib/analysis/deduplicate'
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
    
    // Extract file contents for quality sampling
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

    // Independent wider security scan (caps: 100 files, 2 MiB, 128 KiB per file, 30s)
    const securityScan = await scanSecurityFiles(
      parsed.owner,
      parsed.repo,
      sha,
      tree,
      routeSignal,
      extraction.files,
      { treeTruncated }
    )

    routeSignal.throwIfAborted()
    
    // Collect request-local sensitive values: direct union of pre-harvested unclipped values and raw scan inputs
    const harvestedValues = collectSensitiveValues([
      ...extraction.files.map(f => f.content),
      ...securityScan.files.map(f => f.content),
      meta.description,
      parsed.owner,
      parsed.repo,
    ])
    const sensitiveValues = Array.from(new Set([
      ...(extraction.unclippedSensitiveValues ?? []),
      ...(securityScan.unclippedSensitiveValues ?? []),
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

    // Run deterministic security check on wider security files + all tree filenames (separate from quality top 12)
    const secCtx = {
      owner: parsed.owner,
      repo: parsed.repo,
      sha,
      tree,
      files: securityScan.files,
      meta,
      treeTruncated,
      contentTruncated: securityScan.coverage.contentTruncated,
      sensitiveValues,
    }
    const rawSecFindings = checkSecurity(secCtx).map((f) => validateFinding(f, secCtx))
    const dedupedSecFindings = deduplicateFindings(rawSecFindings)
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const verificationOrder: Record<string, number> = { verified: 0, heuristic: 1, inconclusive: 2 }
    const sortedSecFindings = [...dedupedSecFindings].sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
      if (sevDiff !== 0) return sevDiff
      const verDiff = (verificationOrder[a.verification] ?? 1) - (verificationOrder[b.verification] ?? 1)
      if (verDiff !== 0) return verDiff
      return a.id.localeCompare(b.id)
    })
    const totalSecurityFindings = sortedSecFindings.length
    const securityFindings = sortedSecFindings.slice(0, 100)
    const omittedSecurityFindings = Math.max(0, totalSecurityFindings - securityFindings.length)

    // Append scope warnings for tree truncation, deadline exhaustion, or unavailable files
    const combinedWarnings = [...analysis.warnings]
    if (treeTruncated && !combinedWarnings.some((w) => w.includes('2,000 files'))) {
      combinedWarnings.push('Repository tree truncated at 2,000 files; security coverage of remaining files is unknown.')
    }
    if (securityScan.coverage.deadlineExceeded && !combinedWarnings.some((w) => w.includes('30-second deadline'))) {
      combinedWarnings.push('Security scan reached 30-second deadline; remaining files were skipped.')
    }
    if (securityScan.coverage.statusCounts.unavailable > 0 && !combinedWarnings.some((w) => w.includes('unavailable during security scan'))) {
      combinedWarnings.push(`${securityScan.coverage.statusCounts.unavailable} file(s) unavailable during security scan.`)
    }

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
      securityCoverage: {
        ...securityScan.coverage,
        totalSecurityFindings,
        omittedSecurityFindings,
        findingsSummary: {
          total: totalSecurityFindings,
          admitted: securityFindings.length,
          omitted: omittedSecurityFindings,
        },
      },
      findings: analysis.findings,
      securityFindings,
      totalSecurityFindings,
      omittedSecurityFindings,
      strengths: analysis.strengths,
      warnings: combinedWarnings.slice(0, 20),
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