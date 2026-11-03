import { describe, expect, it } from 'vitest'
import { isValidGitHubUrl, parseGitHubUrl } from '../lib/github/parse-url'

describe('parseGitHubUrl', () => {
  it('parses https and http URLs with and without trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('http://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('http://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses bare owner/repo and scheme-less github.com URLs', () => {
    expect(parseGitHubUrl('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('www.github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('strips .git suffix and handles query / hash', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('https://github.com/owner/repo.git/')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('https://github.com/owner/repo?tab=readme')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubUrl('https://github.com/owner/repo#readme')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('rejects gist URLs', () => {
    expect(parseGitHubUrl('https://gist.github.com/owner/123456')).toBeNull()
    expect(parseGitHubUrl('gist.github.com/owner/123456')).toBeNull()
  })

  it('rejects pull requests, issues, actions, and releases', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/pull/1')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner/repo/pulls')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner/repo/issues')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner/repo/issues/1')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner/repo/actions')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner/repo/releases')).toBeNull()
    expect(parseGitHubUrl('owner/repo/pull/1')).toBeNull()
    expect(parseGitHubUrl('owner/repo/issues')).toBeNull()
  })

  it('rejects raw URLs and non-github.com hosts', () => {
    expect(parseGitHubUrl('https://raw.githubusercontent.com/owner/repo/main/README.md')).toBeNull()
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull()
    expect(parseGitHubUrl('gitlab.com/owner/repo')).toBeNull()
    expect(parseGitHubUrl('https://bitbucket.org/owner/repo')).toBeNull()
  })

  it('rejects reserved owners, paths beyond repo, and malformed inputs', () => {
    expect(parseGitHubUrl('https://github.com/settings/billing')).toBeNull()
    expect(parseGitHubUrl('https://github.com/explore')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner/repo/tree/main')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner/repo/blob/main/file.ts')).toBeNull()
    expect(parseGitHubUrl('https://github.com/owner')).toBeNull()
    expect(parseGitHubUrl('owner')).toBeNull()
    expect(parseGitHubUrl('')).toBeNull()
    expect(parseGitHubUrl('   ')).toBeNull()
    expect(parseGitHubUrl('owner//repo')).toBeNull()
    expect(parseGitHubUrl('-invalid/repo')).toBeNull()
  })
})

describe('isValidGitHubUrl', () => {
  it('returns true for valid repos and false for invalid', () => {
    expect(isValidGitHubUrl('https://github.com/facebook/react')).toBe(true)
    expect(isValidGitHubUrl('facebook/react')).toBe(true)
    expect(isValidGitHubUrl('https://github.com/facebook/react/pull/1')).toBe(false)
    expect(isValidGitHubUrl('https://gitlab.com/owner/repo')).toBe(false)
  })
})
