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
        content: Buffer.from('console.log("b");').toString('base64'),
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
    expect(result.bytesInspected).toBe(100) // Pre-truncation original size
    expect(result.files[0]).toEqual({
      path: 'big.txt',
      size: 100,
      content: 'x'.repeat(40),
      truncated: true,
    })

    fetchSpy.mockRestore()
  })

  it('stops fetching new files when bytesInspected >= maxBytesTotal', async () => {
    const fetchSpy = vi.spyOn(client, 'fetchFileContent').mockImplementation(async (_o, _r, path) => ({
      content: path,
      size: 60,
      truncated: false,
    }))

    const files: RepoFile[] = [
      { path: '1.ts', type: 'file', size: 60 },
      { path: '2.ts', type: 'file', size: 60 },
      { path: '3.ts', type: 'file', size: 60 },
    ]

    // Budget is 100. File 1 brings bytes to 60 (< 100). File 2 brings bytes to 120 (>= 100). File 3 must not be fetched.
    const result = await extractFiles('owner', 'repo', 'sha123', files, 100, 1000)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.bytesInspected).toBe(120)
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
