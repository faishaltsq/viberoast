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

// Fetch git tree recursively for a commit (GET /git/trees/{sha}?recursive=1)
// Returns up to maxPaths entries, with treeTruncated flag if capped
export async function fetchTree(
  owner: string,
  repo: string,
  sha: string,
  maxPaths: number,
  signal?: AbortSignal
): Promise<{ files: RepoFile[]; truncated: boolean }> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SourceSanity',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const response = await fetch(url, { headers, signal })

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      if (retryAfter) {
        throw new GitHubRateLimitError(Number(retryAfter) || 60)
      }
      const remaining = response.headers.get('x-ratelimit-remaining')
      if (remaining === '0') {
        const reset = response.headers.get('x-ratelimit-reset')
        const retry = reset ? Math.max(1, Number(reset) - Math.floor(Date.now() / 1000)) : 60
        throw new GitHubRateLimitError(retry)
      }
    }
    const message = await response.text().catch(() => '')
    throw new GitHubApiError(response.status, message || response.statusText)
  }

  const data = (await response.json()) as GitHubTreeResponse
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
}
