import type { RepoFile } from '../types/report'
import { fetchFileContent } from './client'
import { collectSensitiveValues } from '../security/redact'
import { sliceUtf8String } from './utf8'

export interface ExtractedFile {
  path: string
  size: number
  content: string
  truncated: boolean
}

export interface ExtractResult {
  files: ExtractedFile[]
  bytesInspected: number
  contentTruncated: boolean
  unclippedSensitiveValues?: string[]
}

// Fetch content for selected files, respecting per-file and total byte budgets.
// Calls fetchFileContent from './client' internally.
// Returns extracted files + coverage stats.
export async function extractFiles(
  owner: string,
  repo: string,
  sha: string,
  files: RepoFile[],
  maxBytesTotal: number = 262_144,
  maxBytesPerFile: number = 32_768,
  signal?: AbortSignal
): Promise<ExtractResult> {
  let bytesInspected = 0
  let contentTruncated = false
  const extractedFiles: ExtractedFile[] = []
  const unclippedSensitiveValues = new Set<string>()

  const timeoutController = new AbortController()
  const timer = setTimeout(() => {
    timeoutController.abort(new Error('File extraction timed out after 60s'))
  }, 60_000)
  const linkedSignal = AbortSignal.any([signal ?? new AbortController().signal, timeoutController.signal])

  try {
    // ponytail: sequential file extraction respects rate limits and budget ceilings; upgrade to pooled concurrency (e.g. p-limit 3) if multi-file latency requires it
    for (const file of files) {
      linkedSignal.throwIfAborted()

      if (bytesInspected >= maxBytesTotal) {
        contentTruncated = true
        break
      }

      if (file.type === 'dir') {
        continue
      }

      const res = await fetchFileContent(owner, repo, file.path, sha, linkedSignal)

      linkedSignal.throwIfAborted()

      // Direct-union preharvested sensitive values from client decode boundary
      if (res.unclippedSensitiveValues && res.unclippedSensitiveValues.length > 0) {
        for (const val of res.unclippedSensitiveValues) {
          unclippedSensitiveValues.add(val)
        }
      }

      const fullDecoded = res.content ?? ''
      // Harvest sensitive values request-locally on the full admitted content before clipping
      const capturedSecrets = collectSensitiveValues([fullDecoded])
      for (const val of capturedSecrets) {
        unclippedSensitiveValues.add(val)
      }

      const decodedByteLength = Buffer.byteLength(fullDecoded, 'utf8')
      const originalSize = Math.max(
        typeof res.size === 'number' ? res.size : 0,
        typeof file.size === 'number' ? file.size : 0,
        decodedByteLength
      )

      const remainingBudget = maxBytesTotal - bytesInspected
      if (remainingBudget <= 0) {
        contentTruncated = true
        break
      }

      const effectiveCap = Math.min(maxBytesPerFile, remainingBudget)
      let isFileTruncated = Boolean(res.truncated) || originalSize > effectiveCap || decodedByteLength > effectiveCap
      let content = fullDecoded

      if (decodedByteLength > effectiveCap) {
        content = sliceUtf8String(fullDecoded, effectiveCap)
        isFileTruncated = true
      }

      if (isFileTruncated) {
        contentTruncated = true
      }

      const admittedBytes = Buffer.byteLength(content, 'utf8')
      bytesInspected += admittedBytes

      extractedFiles.push({
        path: file.path,
        size: originalSize,
        content,
        truncated: isFileTruncated,
      })

      if (bytesInspected >= maxBytesTotal) {
        const fileIdx = files.indexOf(file)
        if (fileIdx < files.length - 1 && files.slice(fileIdx + 1).some((f) => f.type !== 'dir')) {
          contentTruncated = true
        }
        break
      }
    }

    return {
      files: extractedFiles,
      bytesInspected,
      contentTruncated,
      unclippedSensitiveValues: Array.from(unclippedSensitiveValues),
    }
  } finally {
    clearTimeout(timer)
  }
}
