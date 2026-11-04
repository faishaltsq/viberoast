import { describe, expect, it, vi } from 'vitest'
import { extractFiles } from '../lib/github/extract'
import * as client from '../lib/github/client'
import type { RepoFile } from '../lib/types/report'

describe('extractFiles', () => {
  it('extracts files, decodes content, and calculates pre-truncation byte sum', async () => {
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_owner, _repo, path) => {
      if (path === 'a.ts') {
        return {
          content: 'const a = 1;',
          size: 12,
          truncated: false,
        }
      }
      return {
        content: 'console.log("b");',
        size: 17,
        truncated: false,
      }
    })

    const files: RepoFile[] = [
      { path: 'a.ts', type: 'file', size: 12 },
      { path: 'b.ts', type: 'file', size: 17 },
    ]

    const result = await extractFiles('owner', 'repo', 'sha123', files, 100_000, 10_000)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.bytesInspected).toBe(29)
    expect(result.contentTruncated).toBe(false)
    expect(result.files).toEqual([
      { path: 'a.ts', size: 12, content: 'const a = 1;', truncated: false },
      { path: 'b.ts', size: 17, content: 'console.log("b");', truncated: false },
    ])

    fetchSpy.mockRestore()
  })

  it('keeps base64-looking source code intact without heuristic double-decoding', async () => {
    const base64Literal = 'const greeting = "SGVsbG8gV29ybGQ=";'
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: base64Literal,
      size: base64Literal.length,
      truncated: false,
    })

    const files: RepoFile[] = [{ path: 'test.ts', type: 'file', size: base64Literal.length }]
    const result = await extractFiles('owner', 'repo', 'sha123', files, 100_000, 10_000)

    expect(result.files[0].content).toBe(base64Literal)
    fetchSpy.mockRestore()
  })

  it('truncates file when decoded size exceeds maxBytesPerFile and sets flags', async () => {
    const largeContent = 'x'.repeat(100)
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: largeContent,
      size: 100,
      truncated: false,
    })

    const files: RepoFile[] = [{ path: 'big.txt', type: 'file', size: 100 }]
    const result = await extractFiles('owner', 'repo', 'sha123', files, 1000, 40)

    expect(result.contentTruncated).toBe(true)
    expect(result.bytesInspected).toBe(40)
    expect(result.files[0]).toEqual({
      path: 'big.txt',
      size: 100,
      content: 'x'.repeat(40),
      truncated: true,
    })

    fetchSpy.mockRestore()
  })

  it('stops fetching new files when bytesInspected >= maxBytesTotal', async () => {
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockImplementation(async () => ({
      content: 'x'.repeat(60),
      size: 60,
      truncated: false,
    }))

    const files: RepoFile[] = [
      { path: '1.ts', type: 'file', size: 60 },
      { path: '2.ts', type: 'file', size: 60 },
      { path: '3.ts', type: 'file', size: 60 },
    ]

    // Budget is 100. File 1 brings bytes to 60 (< 100). File 2 brings bytes to 100 (clipped to remaining budget 40). File 3 must not be fetched.
    const result = await extractFiles('owner', 'repo', 'sha123', files, 100, 1000)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.bytesInspected).toBe(100)
    expect(result.files).toHaveLength(2)

    fetchSpy.mockRestore()
  })

  it('skips directory entries', async () => {
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: 'code',
      size: 4,
      truncated: false,
    })

    const files: RepoFile[] = [
      { path: 'src', type: 'dir', size: 0 },
      { path: 'src/index.ts', type: 'file', size: 4 },
    ]

    const result = await extractFiles('owner', 'repo', 'sha123', files)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('src/index.ts')

    fetchSpy.mockRestore()
  })

  it('propagates abort error if signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('User aborted'))

    const files: RepoFile[] = [{ path: 'a.ts', type: 'file', size: 10 }]

    await expect(extractFiles('owner', 'repo', 'sha123', files, 1000, 100, controller.signal))
      .rejects.toThrow('User aborted')
  })

  it('harvests unclipped sensitive values on files > 32,768 bytes before clipping', async () => {
    const secretKey = 'ghp_' + 'K7m2'.repeat(9) // 40 chars GitHub PAT
    const padding = '// safe line padding\n'.repeat(1600) // ~33,600 bytes
    const deepSecretAssignment = `const apiKey = "${secretKey}";\n`
    const bigContent = `${padding}${deepSecretAssignment}`
    expect(Buffer.byteLength(bigContent, 'utf8')).toBeGreaterThan(32_768)

    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: bigContent,
      size: Buffer.byteLength(bigContent, 'utf8'),
      truncated: false,
    })

    const files: RepoFile[] = [{ path: 'big-secret.ts', type: 'file', size: Buffer.byteLength(bigContent, 'utf8') }]
    const result = await extractFiles('owner', 'repo', 'sha123', files, 262_144, 32_768)

    expect(result.contentTruncated).toBe(true)
    expect(result.files[0].truncated).toBe(true)
    // The clipped content does not contain the secret (since it occurred beyond 32,768 bytes)
    expect(result.files[0].content).not.toContain(secretKey)
    // But unclippedSensitiveValues harvested it before clipping!
    expect(result.unclippedSensitiveValues).toBeDefined()
    expect(result.unclippedSensitiveValues).toContain(secretKey)

    fetchSpy.mockRestore()
  })

  it('handles multibyte UTF-8 and surrogate truncation boundaries safely without corruption', async () => {
    // 32,766 ASCII bytes + 4-byte emoji (takes boundary to 32,770 bytes)
    const asciiPrefix = 'a'.repeat(32_766)
    const emoji = '🔥' // 4 bytes in UTF-8: F0 9F 94 A5
    const content = `${asciiPrefix}${emoji}suffix`

    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content,
      size: Buffer.byteLength(content, 'utf8'),
      truncated: false,
    })

    const files: RepoFile[] = [{ path: 'multibyte.ts', type: 'file', size: Buffer.byteLength(content, 'utf8') }]
    const result = await extractFiles('owner', 'repo', 'sha123', files, 262_144, 32_768)

    expect(result.files[0].truncated).toBe(true)
    // Verify JSON serialize safety and absence of orphaned high surrogates
    expect(() => JSON.stringify(result.files[0])).not.toThrow()
    const serialized = JSON.stringify(result.files[0].content)
    expect(serialized).toBeDefined()
    // No dangling high surrogate
    expect(/[\uD800-\uDBFF]$/.test(result.files[0].content)).toBe(false)

    fetchSpy.mockRestore()
  })

  it('trims at valid UTF-8 boundary when emoji crosses per-file 1, 2, or 3 byte budget without replacement expansion', async () => {
    // 4-byte emoji 🚀 is \xF0\x9F\x9A\x80
    // Test budgets that cut into the emoji at 1, 2, and 3 bytes
    for (const cutBytes of [1, 2, 3]) {
      const prefix = 'abc' // 3 bytes
      const emoji = '🚀' // 4 bytes
      const content = `${prefix}${emoji}tail`
      const cap = 3 + cutBytes // 4, 5, or 6 bytes (cutting emoji at 1, 2, 3 bytes)

      const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
        content,
        size: Buffer.byteLength(content, 'utf8'),
        truncated: false,
      })

      const files: RepoFile[] = [{ path: `emoji-${cutBytes}.ts`, type: 'file', size: Buffer.byteLength(content, 'utf8') }]
      const result = await extractFiles('owner', 'repo', 'sha123', files, 10_000, cap)

      const admittedBytes = Buffer.byteLength(result.files[0].content, 'utf8')
      expect(admittedBytes).toBeLessThanOrEqual(cap)
      // Must not contain replacement character U+FFFD
      expect(result.files[0].content).not.toContain('\uFFFD')
      expect(result.files[0].content).toBe('abc')
      expect(result.bytesInspected).toBe(3)
      expect(result.bytesInspected).toBeLessThanOrEqual(cap)

      fetchSpy.mockRestore()
    }
  })

  it('trims at valid UTF-8 boundary when emoji crosses remaining total budget at 1, 2, or 3 bytes', async () => {
    // File 1 consumes 10 bytes out of total budget (10 + cutBytes)
    for (const cutBytes of [1, 2, 3]) {
      const totalBudget = 10 + cutBytes
      const file1Content = '0123456789' // exactly 10 bytes
      const file2Content = '🚀overflow' // 4-byte emoji at start

      const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_o, _r, path) => {
        if (path === 'file1.ts') {
          return { content: file1Content, size: 10, truncated: false }
        }
        return { content: file2Content, size: Buffer.byteLength(file2Content, 'utf8'), truncated: false }
      })

      const files: RepoFile[] = [
        { path: 'file1.ts', type: 'file', size: 10 },
        { path: 'file2.ts', type: 'file', size: Buffer.byteLength(file2Content, 'utf8') },
      ]

      const result = await extractFiles('owner', 'repo', 'sha123', files, totalBudget, 1000)

      expect(result.bytesInspected).toBeLessThanOrEqual(totalBudget)
      const f2 = result.files.find((f) => f.path === 'file2.ts')
      if (f2) {
        expect(Buffer.byteLength(f2.content, 'utf8')).toBeLessThanOrEqual(cutBytes)
        expect(f2.content).not.toContain('\uFFFD')
      }

      fetchSpy.mockRestore()
    }
  })

  it('direct-unions preharvested unclippedSensitiveValues from fetchFileContent result', async () => {
    const clientSecret = 'CLIENT_PREHARVESTED_OPAQUE_VAL_999'
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockResolvedValue({
      content: 'const a = 1;',
      size: 12,
      truncated: false,
      unclippedSensitiveValues: [clientSecret],
    })

    const files: RepoFile[] = [{ path: 'safe.ts', type: 'file', size: 12 }]
    const result = await extractFiles('owner', 'repo', 'sha123', files)

    expect(result.unclippedSensitiveValues).toBeDefined()
    expect(result.unclippedSensitiveValues).toContain(clientSecret)

    fetchSpy.mockRestore()
  })
})
