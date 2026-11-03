import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as client from '../lib/github/client'
import { scanSecurityFiles } from '../lib/github/security-scan'
import type { RepoFile } from '../lib/types/report'
import type { ExtractedFile } from '../lib/github/extract'

describe('scanSecurityFiles', () => {
  it('does not count an unattempted file after the byte budget is exhausted', async () => {
    const fetchFile = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: 'abc', size: 3, truncated: false,
    })
    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), [
      { path: 'a.ts', type: 'file', size: 3 },
      { path: 'b.ts', type: 'file', size: 3 },
    ], new AbortController().signal, undefined, { maxBytesTotal: 3 })
    expect(fetchFile).toHaveBeenCalledTimes(1)
    expect(result.coverage.filesAttempted).toBe(1)
    expect(result.coverage.bytesInspected).toBe(3)
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Oversized advertised file without fetch
  it('accounts for oversized content without fetching it', async () => {
    const fetchFile = vi.spyOn(client, 'fetchFileContent')
    const result = await scanSecurityFiles(
      'acme',
      'app',
      'a'.repeat(40),
      [{ path: 'large.ts', type: 'file', size: 131073 }],
      new AbortController().signal
    )
    expect(fetchFile).not.toHaveBeenCalled()
    expect(JSON.stringify(result.coverage)).toContain('oversized')
    expect(result.coverage.statusCounts.oversized).toBe(1)
    expect(result.coverage.filesInspected).toBe(0)
    expect(result.files).toHaveLength(0)
  })

  // 2. Non-priority secret file inspection
  it('inspects non-priority text files that quality selection might omit', async () => {
    const secret = 'ghp_' + 'A1b2'.repeat(9)
    const noteContent = `// Notes file\nconst backupToken = "${secret}";\n`

    const fetchFile = vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_o, _r, path) => {
      if (path === 'docs/notes.txt') {
        return {
          content: noteContent,
          size: Buffer.byteLength(noteContent, 'utf8'),
          truncated: false,
          unclippedSensitiveValues: [secret],
        }
      }
      return { content: 'console.log("ok")', size: 17, truncated: false }
    })

    const tree: RepoFile[] = [
      { path: 'src/index.ts', type: 'file', size: 17 },
      { path: 'docs/notes.txt', type: 'file', size: Buffer.byteLength(noteContent, 'utf8') },
    ]

    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(fetchFile).toHaveBeenCalledWith('acme', 'app', 'docs/notes.txt', 'a'.repeat(40), expect.anything(), 131_072)
    expect(result.files.some(f => f.path === 'docs/notes.txt')).toBe(true)
    expect(result.unclippedSensitiveValues).toContain(secret)
    expect(result.coverage.statusCounts.inspected).toBe(2)
  })

  // 3. 40 KiB file secret beyond 32 KiB
  it('admits 40 KiB file and captures secret located beyond 32 KiB boundary', async () => {
    const secret = 'ghp_' + 'S3cr'.repeat(9)
    const padding = '// line padding\n'.repeat(2200) // ~35 KiB
    const fullContent = `${padding}const adminKey = "${secret}";\n`
    const fullByteLength = Buffer.byteLength(fullContent, 'utf8')
    expect(fullByteLength).toBeGreaterThan(32_768)
    expect(fullByteLength).toBeLessThan(131_072)

    vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: fullContent,
      size: fullByteLength,
      truncated: false,
      unclippedSensitiveValues: [secret],
    })

    const tree: RepoFile[] = [{ path: 'server/large-service.ts', type: 'file', size: fullByteLength }]
    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.files).toHaveLength(1)
    expect(result.files[0].content).toContain(secret)
    expect(result.files[0].truncated).toBe(false)
    expect(result.coverage.statusCounts.inspected).toBe(1)
    expect(result.unclippedSensitiveValues).toContain(secret)
  })

  // 4. Actual-size lie: advertised small, decoded > 128 KiB
  it('rejects file as oversized when actual decoded size exceeds 128 KiB (actualsize lie)', async () => {
    const oversizedContent = 'x'.repeat(140_000) // 140 KiB > 128 KiB
    vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: oversizedContent,
      size: 140_000,
      truncated: true,
    })

    // Tree advertised 500 bytes (lie)
    const tree: RepoFile[] = [{ path: 'sneaky.ts', type: 'file', size: 500 }]
    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.coverage.statusCounts.oversized).toBe(1)
    expect(result.coverage.statusCounts.inspected).toBe(0)
    // Partial unsafe content must NOT be admitted
    expect(result.files).toHaveLength(0)
  })

  // 5. Oversize streaming error handled gracefully
  it('handles oversize stream failure and marks file as oversized', async () => {
    vi.spyOn(client, 'fetchFileContent').mockRejectedValue(
      new client.GitHubApiError(413, 'Response body exceeded maximum allowed size')
    )

    const tree: RepoFile[] = [{ path: 'huge-stream.ts', type: 'file', size: 500 }]
    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.coverage.statusCounts.oversized).toBe(1)
    expect(result.coverage.statusCounts.inspected).toBe(0)
    expect(result.files).toHaveLength(0)
  })

  // 6. 100 file cap stop
  it('stops scanning content at 100 files cap and marks remainder skipped-budget', async () => {
    vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_o, _r, path) => ({
      content: `// ${path}`,
      size: 10,
      truncated: false,
    }))

    const tree: RepoFile[] = Array.from({ length: 115 }, (_, i) => ({
      path: `src/file-${String(i).padStart(3, '0')}.ts`,
      type: 'file',
      size: 10,
    }))

    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.files).toHaveLength(100)
    expect(result.coverage.statusCounts.inspected).toBe(100)
    expect(result.coverage.statusCounts['skipped-budget']).toBe(15)
    expect(result.coverage.filesInspected).toBe(100)
    // Reconciliation: 100 inspected + 15 skipped-budget = 115 discovered
    expect(result.coverage.filesDiscovered).toBe(115)
  })

  // 7. 2 MiB budget stop
  it('stops scanning when 2 MiB decoded budget is reached', async () => {
    const chunk100k = 'a'.repeat(100_000)
    vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: chunk100k,
      size: 100_000,
      truncated: false,
    })

    // 25 files of 100,000 bytes = 2.5 MB (> 2 MiB = 2,097,152 bytes)
    const tree: RepoFile[] = Array.from({ length: 25 }, (_, i) => ({
      path: `src/mod-${i}.ts`,
      type: 'file',
      size: 100_000,
    }))

    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.coverage.bytesInspected).toBeLessThanOrEqual(2_097_152)
    expect(result.coverage.contentTruncated).toBe(true)
    expect(result.coverage.statusCounts['skipped-budget']).toBeGreaterThan(0)
    expect(
      result.coverage.statusCounts.inspected + result.coverage.statusCounts['skipped-budget']
    ).toBe(25)
  })

  // 8. 30 second deadline stop using fake timers
  it('stops scanning and marks deadlineExceeded when 30s deadline triggers', async () => {
    vi.useFakeTimers()
    try {
      let callCount = 0
      vi.spyOn(client, 'fetchFileContent').mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          vi.advanceTimersByTime(30_000)
        }
        return { content: 'ok', size: 2, truncated: false }
      })

      const tree: RepoFile[] = Array.from({ length: 5 }, (_, i) => ({
        path: `src/file-${i}.ts`,
        type: 'file',
        size: 10,
      }))

      const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

      expect(result.coverage.deadlineExceeded).toBe(true)
      expect(result.coverage.statusCounts['skipped-budget']).toBeGreaterThan(0)
      expect(
        result.coverage.statusCounts.inspected + result.coverage.statusCounts['skipped-budget']
      ).toBe(5)
    } finally {
      vi.useRealTimers()
    }
  })

  // 8b. Distinguish caller cancellation abort from 30s deadline: throws, does not invent deadline coverage
  it('throws on caller abort signal without marking deadlineExceeded', async () => {
    const controller = new AbortController()
    let callCount = 0
    vi.spyOn(client, 'fetchFileContent').mockImplementation(async () => {
      callCount++
      if (callCount === 2) {
        controller.abort(new Error('Caller cancelled request'))
      }
      return { content: 'ok', size: 2, truncated: false }
    })

    const tree: RepoFile[] = Array.from({ length: 5 }, (_, i) => ({
      path: `src/file-${i}.ts`,
      type: 'file',
      size: 10,
    }))

    await expect(
      scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, controller.signal)
    ).rejects.toThrow('Caller cancelled request')
  })

  // 9. Missing 404 / unavailable handled gracefully
  it('marks 404 or network failure as unavailable and continues scanning other files', async () => {
    vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_o, _r, path) => {
      if (path === 'missing.ts') {
        throw new client.GitHubApiError(404, 'Not Found')
      }
      return { content: 'export const ready = true;', size: 26, truncated: false }
    })

    const tree: RepoFile[] = [
      { path: 'missing.ts', type: 'file', size: 50 },
      { path: 'present.ts', type: 'file', size: 26 },
    ]

    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.coverage.statusCounts.unavailable).toBe(1)
    expect(result.coverage.statusCounts.inspected).toBe(1)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('present.ts')
  })

  // 10. Truncated tree flag and unknown remaining
  it('preserves treeTruncated and sets unknownRemaining without zeroing skipped remainder', async () => {
    const tree: RepoFile[] = [{ path: 'file1.ts', type: 'file', size: 10 }]
    vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: 'code',
      size: 4,
      truncated: false,
    })

    const result = await scanSecurityFiles(
      'acme',
      'app',
      'a'.repeat(40),
      tree,
      new AbortController().signal,
      undefined,
      { treeTruncated: true }
    )

    expect(result.coverage.treeTruncated).toBe(true)
    expect(result.coverage.unknownRemaining).toBe(true)
    expect(result.coverage.statusCounts.inspected).toBe(1)
    expect(result.coverage.filesDiscovered).toBe(1)
  })

  // 11. Clean repo produces valid reconciled coverage
  it('produces valid reconciled coverage for a clean repo', async () => {
    vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: 'const safe = 1;',
      size: 15,
      truncated: false,
    })

    const tree: RepoFile[] = [
      { path: 'src/a.ts', type: 'file', size: 15 },
      { path: 'public/logo.png', type: 'file', size: 200 }, // skipped-policy
    ]

    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.coverage.statusCounts.inspected).toBe(1)
    expect(result.coverage.statusCounts['skipped-policy']).toBe(1)
    expect(result.coverage.filesDiscovered).toBe(2)
    expect(
      result.coverage.statusCounts.inspected +
      result.coverage.statusCounts['filename-only'] +
      result.coverage.statusCounts['skipped-policy'] +
      result.coverage.statusCounts['skipped-budget'] +
      result.coverage.statusCounts.oversized +
      result.coverage.statusCounts.unavailable
    ).toBe(result.coverage.filesDiscovered)
  })

  // 12. Complete cache reuse vs clipped refetch
  it('reuses complete untruncated cache but refetches clipped quality files with 128 KiB limit', async () => {
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: 'refetched 128 KiB content',
      size: 25,
      truncated: false,
    })

    const cachedFiles: ExtractedFile[] = [
      { path: 'complete.ts', size: 50, content: 'complete cached content', truncated: false },
      { path: 'clipped.ts', size: 40_000, content: 'clipped content'.padEnd(32_768, 'x'), truncated: true },
    ]

    const tree: RepoFile[] = [
      { path: 'complete.ts', type: 'file', size: 50 },
      { path: 'clipped.ts', type: 'file', size: 40_000 },
    ]

    const result = await scanSecurityFiles(
      'acme',
      'app',
      'a'.repeat(40),
      tree,
      new AbortController().signal,
      cachedFiles
    )

    // 'complete.ts' must NOT be refetched
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'complete.ts', expect.anything(), expect.anything(), expect.anything())
    // 'clipped.ts' MUST be refetched with 131,072 maxBytes
    expect(fetchSpy).toHaveBeenCalledWith('acme', 'app', 'clipped.ts', 'a'.repeat(40), expect.anything(), 131_072)
    expect(result.files).toHaveLength(2)
  })

  // 13. Multibyte byte length calculation
  it('accurately counts multibyte UTF-8 characters towards bytesInspected', async () => {
    const emojiStr = '🚀'.repeat(10) // 10 chars, 40 bytes in UTF-8
    vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: emojiStr,
      size: Buffer.byteLength(emojiStr, 'utf8'),
      truncated: false,
    })

    const tree: RepoFile[] = [{ path: 'emoji.txt', type: 'file', size: 40 }]
    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.coverage.bytesInspected).toBe(40)
  })

  // 14. Base64-looking source unchanged
  it('does not corrupt or decode base64-looking source code', async () => {
    const b64Source = 'export const token = "SGVsbG8gV29ybGQ=";\n'
    vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: b64Source,
      size: Buffer.byteLength(b64Source, 'utf8'),
      truncated: false,
    })

    const tree: RepoFile[] = [{ path: 'constants.ts', type: 'file', size: b64Source.length }]
    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.files[0].content).toBe(b64Source)
  })

  // 15. Prioritizes config and secret config before >100 ordinary source files
  it('prioritizes general configs and secret configs before ordinary source files when tree has >100 files', async () => {
    vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_o, _r, path) => ({
      content: `// content of ${path}`,
      size: 20,
      truncated: false,
    }))

    // 105 ordinary source files + 1 config + 1 secret config = 107 files
    const sourceFiles: RepoFile[] = Array.from({ length: 105 }, (_, i) => ({
      path: `src/mod-${String(i).padStart(3, '0')}.ts`,
      type: 'file',
      size: 20,
    }))
    const tree: RepoFile[] = [
      ...sourceFiles,
      { path: 'config/app.json', type: 'file', size: 20 },
      { path: 'config/secrets.json', type: 'file', size: 20 },
    ]

    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    expect(result.files).toHaveLength(100)
    // Both secret config and general config MUST be admitted!
    expect(result.files.some((f) => f.path === 'config/secrets.json')).toBe(true)
    expect(result.files.some((f) => f.path === 'config/app.json')).toBe(true)
    expect(result.coverage.statusCounts['skipped-budget']).toBe(7)
  })

  // 16. Caps content attempts at 100 even when fetches fail with 404 or oversize
  it('caps content attempts at 100 requests even when files 404 or are oversized, marking remainder skipped-budget', async () => {
    let fetchCount = 0
    vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_o, _r, path) => {
      fetchCount++
      if (path.startsWith('missing-')) {
        throw new client.GitHubApiError(404, 'Not Found')
      }
      if (path.startsWith('oversized-')) {
        return { content: 'x'.repeat(140_000), size: 140_000, truncated: true }
      }
      return { content: 'ok', size: 2, truncated: false }
    })

    // 120 files: 50 missing, 50 oversized, 20 normal (alphabetically after)
    const tree: RepoFile[] = [
      ...Array.from({ length: 50 }, (_, i) => ({ path: `missing-${String(i).padStart(2, '0')}.ts`, type: 'file' as const, size: 50 })),
      ...Array.from({ length: 50 }, (_, i) => ({ path: `oversized-${String(i).padStart(2, '0')}.ts`, type: 'file' as const, size: 50 })),
      ...Array.from({ length: 20 }, (_, i) => ({ path: `zzz-normal-${String(i).padStart(2, '0')}.ts`, type: 'file' as const, size: 50 })),
    ]

    const result = await scanSecurityFiles('acme', 'app', 'a'.repeat(40), tree, new AbortController().signal)

    // Total actual fetch requests must NOT exceed 100
    expect(fetchCount).toBeLessThanOrEqual(100)
    expect(fetchCount).toBe(100)
    // Remainder must be marked skipped-budget
    expect(result.coverage.statusCounts['skipped-budget']).toBe(20)
    expect(result.coverage.statusCounts.unavailable).toBe(50)
    expect(result.coverage.statusCounts.oversized).toBe(50)
    expect(result.coverage.statusCounts.inspected).toBe(0)
    expect(result.coverage.budgetExceeded).toBe(true)
    expect(result.coverage.contentTruncated).toBe(true)
  })
})
