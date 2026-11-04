import type { RepoFile } from '../types/report'
import { GitHubApiError, GitHubRateLimitError } from './errors'

interface GitHubTreeItem {
  path?: string
  mode?: string
  type?: string
  size?: number | null
  sha?: string
  url?: string
}

interface GitHubTreeResponse {
  sha?: string
  url?: string
  tree?: GitHubTreeItem[]
  truncated?: boolean
}

const REQUEST_TIMEOUT_MS = 10_000
const MAX_TREE_STREAM_BYTES = 4 * 1024 * 1024 // 4 MiB stream cap for tree payload

async function readBoundedStream(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal
): Promise<string> {
  const body = response.body
  if (!body || typeof body.getReader !== 'function') {
    if (typeof response.text === 'function') {
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw new GitHubApiError(413, `Payload exceeded limit of ${maxBytes} bytes`)
      }
      return text
    }
    return ''
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  const onAbort = () => {
    reader.cancel(signal?.reason).catch(() => {})
  }
  if (signal) {
    if (signal.aborted) {
      reader.cancel(signal.reason).catch(() => {})
      throw signal.reason || new Error('Request aborted')
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason || new Error('Request aborted')
      }
      const { done, value } = await reader.read()
      if (signal?.aborted) {
        throw signal.reason || new Error('Request aborted')
      }
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > maxBytes) {
          await reader.cancel(new Error(`Payload exceeded limit of ${maxBytes} bytes`)).catch(() => {})
          throw new GitHubApiError(413, `Payload exceeded limit of ${maxBytes} bytes`)
        }
        chunks.push(value)
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }

  return Buffer.concat(chunks).toString('utf8')
}

// Fetch git tree recursively for a commit (GET /git/trees/{sha}?recursive=1)
// Returns up to maxPaths entries, with treeTruncated flag if capped
export async function fetchTree(
  owner: string,
  repo: string,
  sha: string,
  maxPaths: number,
  signal?: AbortSignal
): Promise<{ files: RepoFile[]; truncated: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error('GitHub tree request timed out after 10s'))
  }, REQUEST_TIMEOUT_MS)

  const effectiveSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SourceSanity',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  try {
    const response = await fetch(url, { headers, signal: effectiveSignal })

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        const retryAfter = response.headers?.get?.('retry-after')
        if (retryAfter) {
          throw new GitHubRateLimitError(Number(retryAfter) || 60)
        }
        const remaining = response.headers?.get?.('x-ratelimit-remaining')
        if (remaining === '0') {
          const reset = response.headers?.get?.('x-ratelimit-reset')
          const retry = reset ? Math.max(1, Number(reset) - Math.floor(Date.now() / 1000)) : 60
          throw new GitHubRateLimitError(retry)
        }
      }
      const message = typeof response.text === 'function' ? await response.text().catch(() => '') : ''
      throw new GitHubApiError(response.status, message || response.statusText)
    }

    let data: GitHubTreeResponse
    try {
      if (response.body && typeof response.body.getReader === 'function') {
        const text = await readBoundedStream(response, MAX_TREE_STREAM_BYTES, effectiveSignal)
        data = JSON.parse(text) as GitHubTreeResponse
      } else if (typeof response.json === 'function') {
        data = (await response.json()) as GitHubTreeResponse
      } else if (typeof response.text === 'function') {
        const text = await readBoundedStream(response, MAX_TREE_STREAM_BYTES, effectiveSignal)
        data = JSON.parse(text) as GitHubTreeResponse
      } else {
        data = {}
      }
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 413) {
        // Transparently mark incomplete on cap
        return { files: [], truncated: true }
      }
      throw err
    }

    const rawTree = Array.isArray(data.tree) ? data.tree : []

    // ponytail: recursive=1 flat fetch capped in memory; upgrade to paginated sub-trees if repo exceeds GitHub 100k-tree ceiling
    const blobs: RepoFile[] = []
    for (const item of rawTree) {
      if (item.type === 'blob' && typeof item.path === 'string') {
        blobs.push({
          path: item.path,
          type: 'file',
          size: typeof item.size === 'number' && item.size > 0 ? item.size : 0,
        })
      }
    }

    const truncated = Boolean(data.truncated) || blobs.length > maxPaths

    return {
      files: blobs.slice(0, Math.max(0, maxPaths)),
      truncated,
    }
  } finally {
    clearTimeout(timer)
  }
}
