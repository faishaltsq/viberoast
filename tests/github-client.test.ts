import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRepoMeta, fetchFileContent, GitHubRateLimitError, GitHubApiError } from '../lib/github/client'

describe('GitHub Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.GITHUB_TOKEN
  })

  it('fetches repo metadata and SHA', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/commits/main')) {
        return new Response(JSON.stringify({ sha: 'commit-sha-456' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          name: 'my-repo',
          owner: { login: 'octocat' },
          default_branch: 'main',
          description: 'A great repo',
          language: 'TypeScript',
          stargazers_count: 10,
          forks_count: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })

    const meta = await fetchRepoMeta('octocat', 'my-repo')

    expect(meta).toEqual({
      owner: 'octocat',
      repo: 'my-repo',
      defaultBranch: 'main',
      description: 'A great repo',
      language: 'TypeScript',
      stargazerCount: 10,
      forkCount: 2,
      sha: 'commit-sha-456',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('includes Authorization header when GITHUB_TOKEN set', async () => {
    process.env.GITHUB_TOKEN = 'secret-gh-token'
    let authHeader: string | null = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      authHeader = (init?.headers as Record<string, string>)?.Authorization ?? null
      return new Response(
        JSON.stringify({
          name: 'repo',
          owner: { login: 'user' },
          default_branch: 'main',
          sha: 'sha-123',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })

    await fetchRepoMeta('user', 'repo')
    expect(authHeader).toBe('Bearer secret-gh-token')
  })

  it('throws GitHubRateLimitError on 403 with x-ratelimit-remaining: 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limit exceeded', {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'retry-after': '45',
        },
      })
    )

    try {
      await fetchRepoMeta('octocat', 'repo')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubRateLimitError)
      expect((err as GitHubRateLimitError).retryAfter).toBe(45)
    }
  })

  it('throws GitHubApiError on generic non-OK responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Repository not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    )

    await expect(fetchRepoMeta('octocat', 'unknown')).rejects.toThrow(GitHubApiError)
  })

  it('fetches single file content, decodes base64 and handles truncation', async () => {
    const rawText = 'console.log("hello world")'
    const b64 = Buffer.from(rawText, 'utf8').toString('base64')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'file',
          encoding: 'base64',
          content: b64,
          size: rawText.length,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const result = await fetchFileContent('octocat', 'repo', 'src/index.ts', 'sha-1')
    expect(result.content).toBe(rawText)
    expect(result.size).toBe(rawText.length)
    expect(result.truncated).toBe(false)
  })

  it('truncates content exceeding 32 KiB', async () => {
    const largeText = 'a'.repeat(40_000)
    const b64 = Buffer.from(largeText, 'utf8').toString('base64')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'file',
          encoding: 'base64',
          content: b64,
          size: 40_000,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const result = await fetchFileContent('octocat', 'repo', 'large.txt', 'sha-1')
    expect(result.content.length).toBe(32_768)
    expect(result.size).toBe(40_000)
    expect(result.truncated).toBe(true)
  })

  it('aborts when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(fetchRepoMeta('octocat', 'repo', controller.signal)).rejects.toThrow()
  })
})
