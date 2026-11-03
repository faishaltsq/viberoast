import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTree } from '../lib/github/tree'
import { GitHubApiError, GitHubRateLimitError } from '../lib/github/errors'

describe('fetchTree', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubEnv('GITHUB_TOKEN', '')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('fetches and filters blobs, maps size and type', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        truncated: false,
        tree: [
          { path: 'src/index.ts', type: 'blob', size: 1024 },
          { path: 'src', type: 'tree' },
          { path: 'symlink', type: 'blob', size: null },
        ],
      }),
    }) as unknown as typeof fetch

    const result = await fetchTree('octocat', 'hello-world', 'abc1234', 100)

    expect(result.truncated).toBe(false)
    expect(result.files).toEqual([
      { path: 'src/index.ts', type: 'file', size: 1024 },
      { path: 'symlink', type: 'file', size: 0 },
    ])
  })

  it('caps at maxPaths and marks truncated', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        truncated: false,
        tree: [
          { path: 'a.ts', type: 'blob', size: 10 },
          { path: 'b.ts', type: 'blob', size: 20 },
          { path: 'c.ts', type: 'blob', size: 30 },
        ],
      }),
    }) as unknown as typeof fetch

    const result = await fetchTree('octocat', 'hello-world', 'abc1234', 2)

    expect(result.truncated).toBe(true)
    expect(result.files).toEqual([
      { path: 'a.ts', type: 'file', size: 10 },
      { path: 'b.ts', type: 'file', size: 20 },
    ])
  })

  it('preserves GitHub truncated flag even when within maxPaths', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        truncated: true,
        tree: [{ path: 'a.ts', type: 'blob', size: 10 }],
      }),
    }) as unknown as typeof fetch

    const result = await fetchTree('octocat', 'hello-world', 'abc1234', 10)

    expect(result.truncated).toBe(true)
    expect(result.files).toHaveLength(1)
  })

  it('includes Authorization header when GITHUB_TOKEN set', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_secret123')
    let capturedHeaders: HeadersInit | undefined

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedHeaders = init?.headers
      return Promise.resolve({
        ok: true,
        json: async () => ({ truncated: false, tree: [] }),
      })
    }) as unknown as typeof fetch

    await fetchTree('octocat', 'hello-world', 'abc1234', 10)

    expect((capturedHeaders as Record<string, string>)?.Authorization).toBe('Bearer ghp_secret123')
  })

  it('throws GitHubRateLimitError on 403 rate limit', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({ 'retry-after': '120' }),
      text: async () => 'rate limit exceeded',
    }) as unknown as typeof fetch

    await expect(fetchTree('octocat', 'hello-world', 'abc1234', 10))
      .rejects.toThrow(GitHubRateLimitError)
  })

  it('passes effective combined signal to fetch call', async () => {
    const controller = new AbortController()
    let capturedSignal: AbortSignal | undefined | null

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedSignal = init?.signal
      return Promise.resolve({
        ok: true,
        json: async () => ({ truncated: false, tree: [] }),
      })
    }) as unknown as typeof fetch

    await fetchTree('octocat', 'hello-world', 'abc1234', 10, controller.signal)

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal?.aborted).toBe(false)
    controller.abort()
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('times out stalled headers when caller signal is unaborted', async () => {
    vi.useFakeTimers()
    try {
      const callerController = new AbortController()

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal.reason || new Error('Aborted'))
          })
        })
      }) as unknown as typeof fetch

      const treePromise = fetchTree('octocat', 'hello-world', 'abc1234', 10, callerController.signal)
      const assertion = expect(treePromise).rejects.toThrow(/timed out after 10s/)

      await vi.advanceTimersByTimeAsync(10_001)
      await assertion
      expect(callerController.signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out stalled body stream when caller signal is unaborted and leaves no unhandled promises', async () => {
    vi.useFakeTimers()
    try {
      const callerController = new AbortController()

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(10))
          // stalls and never closes
        },
      })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: stream,
      }) as unknown as typeof fetch

      const treePromise = fetchTree('octocat', 'hello-world', 'abc1234', 10, callerController.signal)
      const assertion = expect(treePromise).rejects.toThrow(/timed out after 10s/)

      await vi.advanceTimersByTimeAsync(10_001)
      await assertion
      expect(callerController.signal.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws GitHubApiError on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      text: async () => 'Not Found',
    }) as unknown as typeof fetch

    await expect(fetchTree('octocat', 'hello-world', 'abc1234', 10))
      .rejects.toThrow(GitHubApiError)
  })
})
