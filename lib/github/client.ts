import { GitHubApiError, GitHubRateLimitError } from './errors'
import { recordGitHubRateLimit } from '../server/store'
import { collectSensitiveValues } from '../security/redact'
import { sliceUtf8String } from './utf8'

export { GitHubApiError, GitHubRateLimitError } from './errors'

export interface FileContentResult {
  content: string
  size: number
  truncated: boolean
  unclippedSensitiveValues?: string[]
}

export interface FetchFileContentOptions {
  maxFileSize?: number
}

export interface GitHubRepoMeta {
  owner: string
  repo: string
  defaultBranch: string
  description: string | null
  language: string | null
  stargazerCount: number
  forkCount: number
}

const BASE_URL = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 10_000
export const MAX_FILE_SIZE = 32_768
export const MAX_CONTENT_STREAM_BYTES = 200 * 1024 // 200 KiB base64/JSON stream cap
export const MAX_META_STREAM_BYTES = 256 * 1024 // 256 KiB metadata stream cap

interface GitHubRequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function readBoundedStream(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal
): Promise<string> {
  const body = response.body
  if (!body || typeof body.getReader !== 'function') {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new GitHubApiError(413, `Response body exceeded ${maxBytes} bytes`)
    }
    return text
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
          await reader.cancel(new Error(`Response body exceeded ${maxBytes} bytes`)).catch(() => {})
          throw new GitHubApiError(413, `Response body exceeded ${maxBytes} bytes`)
        }
        chunks.push(value)
      }
    }
    if (signal?.aborted) {
      throw signal.reason || new Error('Request aborted')
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

async function requestGitHubBoundedJson<T>(
  endpoint: string,
  maxBodyBytes: number,
  options: GitHubRequestOptions = {}
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error('GitHub API request timed out after 10s'))
  }, REQUEST_TIMEOUT_MS)

  const userSignal = options.signal
  const onAbort = () => {
    controller.abort(userSignal?.reason)
  }

  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timer)
      controller.abort(userSignal.reason)
    } else {
      userSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  const url = endpoint.startsWith('https://') || endpoint.startsWith('http://')
    ? endpoint
    : `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'SourceSanity',
    ...options.headers,
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    })

    const remaining = response.headers.get('x-ratelimit-remaining')
    const reset = response.headers.get('x-ratelimit-reset')
    if (remaining !== null && reset !== null) {
      const remNum = Number(remaining)
      const resetNum = Number(reset)
      if (!Number.isNaN(remNum) && !Number.isNaN(resetNum)) {
        recordGitHubRateLimit(remNum, resetNum)
      }
    }

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('retry-after')

      if ((response.status === 403 && remaining === '0') || response.status === 429) {
        const retryAfter = retryAfterHeader
          ? Number(retryAfterHeader) || 60
          : (() => {
              return reset ? Math.max(1, Number(reset) - Math.floor(Date.now() / 1000)) : 60
            })()
        recordGitHubRateLimit(0, Math.floor(Date.now() / 1000) + retryAfter)
        throw new GitHubRateLimitError(retryAfter)
      }

      const text = await readBoundedStream(response, maxBodyBytes, controller.signal).catch(() => '')
      let message = response.statusText || `Request failed with status ${response.status}`
      if (text) {
        try {
          const parsed = JSON.parse(text) as { message?: string }
          if (parsed && typeof parsed.message === 'string') {
            message = parsed.message
          } else {
            message = text
          }
        } catch {
          message = text
        }
      }
      throw new GitHubApiError(response.status, message)
    }

    const bodyText = await readBoundedStream(response, maxBodyBytes, controller.signal)
    return JSON.parse(bodyText) as T
  } finally {
    clearTimeout(timer)
    if (userSignal) {
      userSignal.removeEventListener('abort', onAbort)
    }
  }
}

// Fetch /repos/{owner}/{repo} — repo metadata + default branch SHA
export async function fetchRepoMeta(
  owner: string,
  repo: string,
  signal?: AbortSignal
): Promise<GitHubRepoMeta & { sha: string }> {
  const encOwner = encodeURIComponent(owner)
  const encRepo = encodeURIComponent(repo)

  const data = await requestGitHubBoundedJson<{
    owner?: { login?: string } | string
    name?: string
    repo?: string
    default_branch?: string
    defaultBranch?: string
    description?: string | null
    language?: string | null
    stargazers_count?: number
    stargazerCount?: number
    forks_count?: number
    forks?: number
    forkCount?: number
    sha?: string
    commit?: { sha?: string }
  }>(`/repos/${encOwner}/${encRepo}`, MAX_META_STREAM_BYTES, { signal })

  const defaultBranch = data.default_branch ?? data.defaultBranch ?? 'main'
  let sha = typeof data.sha === 'string'
    ? data.sha
    : (typeof data.commit?.sha === 'string' ? data.commit.sha : '')

  // ponytail: secondary fetch for commit SHA when not embedded by API or test fixture
  if (!sha && defaultBranch) {
    try {
      const commitData = await requestGitHubBoundedJson<{ sha?: string }>(
        `/repos/${encOwner}/${encRepo}/commits/${encodeURIComponent(defaultBranch)}`,
        MAX_META_STREAM_BYTES,
        { signal }
      )
      if (typeof commitData.sha === 'string') {
        sha = commitData.sha
      }
    } catch (err) {
      if (err instanceof GitHubRateLimitError || err instanceof GitHubApiError) throw err
    }
  }

  const meta: GitHubRepoMeta = {
    owner: (typeof data.owner === 'object' && data.owner?.login) ? data.owner.login : (typeof data.owner === 'string' ? data.owner : owner),
    repo: data.name ?? data.repo ?? repo,
    defaultBranch,
    description: data.description ?? null,
    language: data.language ?? null,
    stargazerCount: Number(data.stargazers_count ?? data.stargazerCount ?? 0),
    forkCount: Number(data.forks_count ?? data.forks ?? data.forkCount ?? 0),
  }

  return {
    ...meta,
    sha,
  }
}

// Fetch /repos/{owner}/{repo}/contents/{path}?ref={sha} — single file as base64+decoded text
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  sha: string,
  signal?: AbortSignal,
  optionsOrMaxBytes?: FetchFileContentOptions | number
): Promise<FileContentResult> {
  const maxBytes = typeof optionsOrMaxBytes === 'number'
    ? optionsOrMaxBytes
    : (optionsOrMaxBytes?.maxFileSize ?? MAX_FILE_SIZE)
  const encOwner = encodeURIComponent(owner)
  const encRepo = encodeURIComponent(repo)
  const normalizedPath = path.replace(/^\/+/, '')
  const cleanPath = normalizedPath.split('/').map(encodeURIComponent).join('/')
  const encSha = encodeURIComponent(sha)

  const data = await requestGitHubBoundedJson<{
    content?: string
    encoding?: string
    size?: number
    truncated?: boolean
  } | Array<unknown>>(`/repos/${encOwner}/${encRepo}/contents/${cleanPath}?ref=${encSha}`, MAX_CONTENT_STREAM_BYTES, { signal })

  if (Array.isArray(data)) {
    throw new GitHubApiError(400, `Path '${path}' is a directory, not a file`)
  }

  const rawContent = data.content ?? ''
  const decoded = data.encoding === 'base64'
    ? Buffer.from(rawContent.replace(/\s/g, ''), 'base64').toString('utf8')
    : rawContent

  // Harvest sensitive values on full decoded content before any clipping
  const unclippedSensitiveValues = collectSensitiveValues([decoded])

  const decodedByteLength = Buffer.byteLength(decoded, 'utf8')
  const fullSize = typeof data.size === 'number' ? Math.max(data.size, decodedByteLength) : decodedByteLength
  const isTruncated = Boolean(data.truncated) || decodedByteLength > maxBytes || fullSize > maxBytes
  let content = decoded
  if (decodedByteLength > maxBytes) {
    content = sliceUtf8String(decoded, maxBytes)
  }

  return {
    content,
    size: fullSize,
    truncated: isTruncated,
    unclippedSensitiveValues,
  }
}
