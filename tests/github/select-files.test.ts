import { describe, expect, it } from 'vitest'
import { selectFiles } from '../../lib/github/select-files'
import type { RepoFile } from '../../lib/types/report'

describe('selectFiles', () => {
  it('prioritizes entry points (tier 1) and routes (tier 2) over other source files', () => {
    const files: RepoFile[] = [
      { path: 'src/components/Header.tsx', type: 'file', size: 1000 },
      { path: 'src/app/page.tsx', type: 'file', size: 2000 },
      { path: 'src/index.ts', type: 'file', size: 500 },
      { path: 'lib/utils.ts', type: 'file', size: 1500 },
    ]

    const result = selectFiles(files, { maxFiles: 2 })
    expect(result.selected.map((f) => f.path)).toEqual([
      'src/index.ts', // Tier 1: Entry point
      'src/app/page.tsx', // Tier 2: Route
    ])
    expect(result.skipped).toBe(2)
    expect(result.bytesBudget).toBe(2500)
  })

  it('ranks tiers in correct order (1 -> 8)', () => {
    const files: RepoFile[] = [
      { path: 'lib/other.ts', type: 'file', size: 100 }, // Tier 8
      { path: 'tests/app.test.ts', type: 'file', size: 100 }, // Tier 7
      { path: '.github/workflows/ci.yml', type: 'file', size: 100 }, // Tier 6
      { path: 'package.json', type: 'file', size: 100 }, // Tier 5
      { path: 'src/services/data.ts', type: 'file', size: 100 }, // Tier 4
      { path: 'src/auth.ts', type: 'file', size: 100 }, // Tier 3
      { path: 'routes/api.ts', type: 'file', size: 100 }, // Tier 2
      { path: 'bin/run', type: 'file', size: 100 }, // Tier 1
    ]

    const result = selectFiles(files, { maxFiles: 10 })
    expect(result.selected.map((f) => f.path)).toEqual([
      'bin/run',
      'routes/api.ts',
      'src/auth.ts',
      'src/services/data.ts',
      'package.json',
      '.github/workflows/ci.yml',
      'tests/app.test.ts',
      'lib/other.ts',
    ])
    expect(result.skipped).toBe(0)
    expect(result.bytesBudget).toBe(800)
  })

  it('filters out asset extensions, lockfiles, markdown, generated files, and hidden dirs', () => {
    const files: RepoFile[] = [
      { path: 'src/index.ts', type: 'file', size: 100 },
      { path: 'node_modules/pkg/index.js', type: 'file', size: 100 },
      { path: '.git/HEAD', type: 'file', size: 50 },
      { path: 'vendor/bundle.js', type: 'file', size: 1000 },
      { path: 'dist/index.js', type: 'file', size: 500 },
      { path: 'build/bundle.js', type: 'file', size: 500 },
      { path: '.next/server.js', type: 'file', size: 500 },
      { path: 'coverage/lcov.info', type: 'file', size: 500 },
      { path: 'src/bundle.min.js', type: 'file', size: 500 },
      { path: 'public/logo.png', type: 'file', size: 2000 },
      { path: 'public/favicon.ico', type: 'file', size: 200 },
      { path: 'public/vector.svg', type: 'file', size: 300 },
      { path: 'fonts/inter.woff2', type: 'file', size: 4000 },
      { path: 'package-lock.json', type: 'file', size: 50000 },
      { path: 'yarn.lock', type: 'file', size: 50000 },
      { path: 'pnpm-lock.yaml', type: 'file', size: 50000 },
      { path: 'bun.lockb', type: 'file', size: 50000 },
      { path: 'README.md', type: 'file', size: 1200 },
      { path: 'docs/guide.markdown', type: 'file', size: 1500 },
      { path: 'dir', type: 'dir', size: 0 },
    ]

    const result = selectFiles(files)
    expect(result.selected.map((f) => f.path)).toEqual(['src/index.ts'])
    expect(result.skipped).toBe(files.length - 1)
  })

  it('respects includeTests: false', () => {
    const files: RepoFile[] = [
      { path: 'src/index.ts', type: 'file', size: 100 },
      { path: 'tests/index.test.ts', type: 'file', size: 100 },
      { path: 'src/__tests__/button.spec.tsx', type: 'file', size: 100 },
    ]

    const result = selectFiles(files, { includeTests: false })
    expect(result.selected.map((f) => f.path)).toEqual(['src/index.ts'])
    expect(result.skipped).toBe(2)
  })

  it('respects includeConfig: false', () => {
    const files: RepoFile[] = [
      { path: 'src/index.ts', type: 'file', size: 100 },
      { path: 'package.json', type: 'file', size: 100 },
      { path: 'tsconfig.json', type: 'file', size: 100 },
      { path: 'next.config.js', type: 'file', size: 100 },
      { path: '.eslintrc.json', type: 'file', size: 100 },
      { path: 'Dockerfile', type: 'file', size: 100 },
      { path: '.env.local', type: 'file', size: 100 },
      { path: 'src/config.ts', type: 'file', size: 100 },
    ]

    const result = selectFiles(files, { includeConfig: false })
    expect(result.selected.map((f) => f.path)).toEqual(['src/index.ts'])
    expect(result.skipped).toBe(7)
  })

  it('caps at maxFiles', () => {
    const files: RepoFile[] = Array.from({ length: 50 }, (_, i) => ({
      path: `src/file${i}.ts`,
      type: 'file',
      size: 100,
    }))

    const result = selectFiles(files, { maxFiles: 15 })
    expect(result.selected).toHaveLength(15)
    expect(result.skipped).toBe(35)
    expect(result.bytesBudget).toBe(1500)
  })

  it('respects maxBytesPerFile when calculating budget', () => {
    const files: RepoFile[] = [
      { path: 'src/index.ts', type: 'file', size: 50_000 },
    ]

    const result = selectFiles(files, { maxBytesPerFile: 32_768 })
    expect(result.selected).toHaveLength(1)
    expect(result.bytesBudget).toBe(32_768)
  })

  it('skips files that exceed maxBytesTotal', () => {
    const files: RepoFile[] = [
      { path: 'src/index.ts', type: 'file', size: 200_000 },
      { path: 'src/app/page.tsx', type: 'file', size: 100_000 }, // Would exceed 256 KiB budget (200k + 32.7k + 32.7k?) wait
    ]

    // If maxBytesTotal is 200, and maxBytesPerFile is 300:
    const result = selectFiles(files, {
      maxBytesTotal: 150_000,
      maxBytesPerFile: 150_000,
    })
    // First file needs 150_000 -> fits exactly (150_000 <= 150_000)
    // Second file needs 100_000 -> 150_000 + 100_000 > 150_000 -> does not fit
    expect(result.selected.map((f) => f.path)).toEqual(['src/index.ts'])
    expect(result.bytesBudget).toBe(150_000)
    expect(result.skipped).toBe(1)
  })

  it('handles empty input', () => {
    const result = selectFiles([])
    expect(result.selected).toEqual([])
    expect(result.skipped).toBe(0)
    expect(result.bytesBudget).toBe(0)
  })
})
