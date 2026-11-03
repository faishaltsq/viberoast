import { GitHubApiError, GitHubRateLimitError } from './errors'
import { recordGitHubRateLimit } from '../server/store'

export { GitHubApiError, GitHubRateLimitError } from './errors'

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
const MAX_FILE_SIZE = 32_768

interface GitHubRequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function requestGitHub(
  endpoint: string,
  options: GitHubRequestOptions = {}
): Promise<Response> {
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
    'User-Agent': 'VibeRoast',
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

      const text = await response.text().catch(() => '')
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

    return response
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

  const res = await requestGitHub(`/repos/${encOwner}/${encRepo}`, { signal })
  const data = (await res.json()) as {
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
  }

  const defaultBranch = data.default_branch ?? data.defaultBranch ?? 'main'
  let sha = typeof data.sha === 'string'
    ? data.sha
    : (typeof data.commit?.sha === 'string' ? data.commit.sha : '')

  // ponytail: secondary fetch for commit SHA when not embedded by API or test fixture
  if (!sha && defaultBranch) {
    try {
      const commitRes = await requestGitHub(`/repos/${encOwner}/${encRepo}/commits/${encodeURIComponent(defaultBranch)}`, { signal })
      const commitData = (await commitRes.json()) as { sha?: string }
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
  signal?: AbortSignal
): Promise<{ content: string; size: number; truncated: boolean }> {
  const encOwner = encodeURIComponent(owner)
  const encRepo = encodeURIComponent(repo)
  const normalizedPath = path.replace(/^\/+/, '')
  const cleanPath = normalizedPath.split('/').map(encodeURIComponent).join('/')
  const encSha = encodeURIComponent(sha)

  const res = await requestGitHub(`/repos/${encOwner}/${encRepo}/contents/${cleanPath}?ref=${encSha}`, { signal })
  const data = (await res.json()) as {
    content?: string
    encoding?: string
    size?: number
    truncated?: boolean
  } | Array<unknown>

  if (Array.isArray(data)) {
    throw new GitHubApiError(400, `Path '${path}' is a directory, not a file`)
  }

  const rawContent = data.content ?? ''
  const decoded = data.encoding === 'base64'
    ? Buffer.from(rawContent.replace(/\s/g, ''), 'base64').toString('utf8')
    : rawContent

  const fullSize = typeof data.size === 'number' ? data.size : Buffer.byteLength(decoded, 'utf8')
  const isTruncated = Boolean(data.truncated) || decoded.length > MAX_FILE_SIZE || fullSize > MAX_FILE_SIZE
  // ponytail: 32 KiB cap aligns with repoScanSchema file size ceiling; upgrade to raw stream if larger inspections needed
  const content = decoded.length > MAX_FILE_SIZE ? decoded.slice(0, MAX_FILE_SIZE) : decoded

  return {
    content,
    size: fullSize,
    truncated: isTruncated,
  }
}
