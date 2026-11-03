import { z } from 'zod'

export const gitHubRepoSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
})

export type GitHubRepo = z.infer<typeof gitHubRepoSchema>

export const gitHubUrlSchema = z.string().refine(isValidGitHubUrl, {
  message: 'Invalid GitHub repository URL',
})

const RESERVED_OWNERS = new Set([
  'about',
  'account',
  'blog',
  'business',
  'contact',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'git-guides',
  'join',
  'login',
  'marketplace',
  'notifications',
  'organizations',
  'orgs',
  'pricing',
  'readme',
  'search',
  'security',
  'session',
  'settings',
  'signup',
  'site',
  'sponsors',
  'stars',
  'team',
  'topics',
  'trending',
])

function isValidOwner(owner: string): boolean {
  if (owner.length < 1 || owner.length > 100) return false
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return false
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(owner)
}

function isValidRepo(repo: string): boolean {
  if (repo.length < 1 || repo.length > 100) return false
  if (repo === '.' || repo === '..') return false
  return /^[a-z0-9_.-]+$/i.test(repo)
}

// ponytail: single repo target only -> skipped: tree/blob subpath extraction, add when branch-deep scanning needed.
export function parseGitHubUrl(input: string): GitHubRepo | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) return null

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null
  }

  let pathname: string
  if (/^https?:\/\//i.test(trimmed) || /^(?:www\.)?github\.com\//i.test(trimmed)) {
    const urlString = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    let url: URL
    try {
      url = new URL(urlString)
    } catch {
      return null
    }

    if (url.username || url.password || (url.port && url.port !== '80' && url.port !== '443')) {
      return null
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host !== 'github.com') return null
    pathname = url.pathname
  } else {
    const [withoutQuery] = trimmed.split(/[?#]/, 1)
    pathname = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`
  }

  const segments = pathname.split('/')
  if (segments[0] === '') segments.shift()
  if (segments[segments.length - 1] === '') segments.pop()

  if (segments.length !== 2 || segments.some((s) => !s)) return null

  const [owner, rawRepo] = segments
  const repo = rawRepo.replace(/\.git$/i, '')

  if (!isValidOwner(owner) || !isValidRepo(repo)) return null

  return { owner, repo }
}

export function isValidGitHubUrl(input: string): boolean {
  return parseGitHubUrl(input) !== null
}
