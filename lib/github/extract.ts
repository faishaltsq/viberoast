import type { RepoFile } from '../types/report'
import { fetchFileContent } from './client'
import { collectSensitiveValues } from '../security/redact'

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

function decodeContent(rawContent: string, encoding?: string): string {
  if (encoding === 'base64') {
    try {
      return Buffer.from(rawContent.replace(/\s/g, ''), 'base64').toString('utf8')
    } catch {
      return rawContent
    }
  }

  const trimmed = rawContent.trim()
  if (trimmed.endsWith('=') && /^[A-Za-z0-9+/]+={1,2}$/.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
      if (Buffer.from(decoded, 'utf8').toString('base64') === trimmed) {
        return decoded
      }
    } catch {
      // not valid base64
    }
  }

  return rawContent
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

      const fullDecoded = decodeContent(res.content ?? '', (res as { encoding?: string }).encoding)
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

      let isFileTruncated = Boolean(res.truncated) || originalSize > maxBytesPerFile || decodedByteLength > maxBytesPerFile
      let content = fullDecoded

      if (decodedByteLength > maxBytesPerFile) {
        const buf = Buffer.from(fullDecoded, 'utf8')
        let truncatedStr = buf.subarray(0, maxBytesPerFile).toString('utf8')
        if (/[\uD800-\uDBFF]$/.test(truncatedStr)) {
          truncatedStr = truncatedStr.slice(0, -1)
        }
        content = truncatedStr
        isFileTruncated = true
      }

      if (isFileTruncated) {
        contentTruncated = true
      }

      bytesInspected += originalSize

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
