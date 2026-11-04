import type { RepoFile, SecurityCoverage, SecurityContentStatus, SecurityFileStatus } from '../types/report'
import { fetchFileContent, GitHubApiError, GitHubRateLimitError } from './client'
import type { ExtractedFile } from './extract'
import { collectSensitiveValues } from '../security/redact'

export interface SecurityScanOptions {
  treeTruncated?: boolean
  maxFiles?: number
  maxBytesTotal?: number
  maxBytesPerFile?: number
  timeoutMs?: number
}

export interface SecurityScanResult {
  files: ExtractedFile[]
  coverage: SecurityCoverage
  sensitiveValues: string[]
  unclippedSensitiveValues: string[]
}

const DEFAULT_MAX_FILES = 100
const DEFAULT_MAX_BYTES_TOTAL = 2 * 1024 * 1024 // 2 MiB (2,097,152 bytes)
const DEFAULT_MAX_BYTES_PER_FILE = 128 * 1024 // 128 KiB (131,072 bytes)
const DEFAULT_TIMEOUT_MS = 30_000 // 30 seconds

const ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.pdf', '.zip', '.tar', '.gz',
  '.bin', '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.war', '.ear',
  '.iso', '.dmg', '.7z', '.rar', '.wasm',
])

const HIDDEN_DIRS = new Set([
  'node_modules',
  '.git',
  'vendor',
  'bower_components',
])

const GENERATED_DIRS = new Set([
  'dist',
  'build',
  '.next',
  '.output',
  'coverage',
  '__pycache__',
  '.turbo',
])

const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'gemfile.lock',
  'composer.lock',
])

function isSkippedByPolicy(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/')
  const filename = (parts[parts.length - 1] ?? '').toLowerCase()
  const dirParts = parts.slice(0, -1)

  for (const dir of dirParts) {
    const lower = dir.toLowerCase()
    if (HIDDEN_DIRS.has(lower) || GENERATED_DIRS.has(lower)) {
      return true
    }
  }

  if (LOCKFILES.has(filename)) {
    return true
  }

  const dotIndex = filename.lastIndexOf('.')
  const ext = dotIndex !== -1 ? filename.slice(dotIndex).toLowerCase() : ''
  if (ASSET_EXTENSIONS.has(ext)) {
    return true
  }

  return false
}

function getSecurityPriority(path: string): number {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  const parts = normalized.split('/')
  const filename = parts[parts.length - 1] ?? ''

  // Tier 1: Sensitive environment, credentials, private keys, secrets
  if (
    /^\.env(\.|$)/i.test(filename) ||
    /(secret|credential|token|apikey|api_key|password|private_key|id_rsa|id_dsa|id_ecdsa|id_ed25519)/i.test(filename) ||
    /\.(pem|key|p12|pfx|pkcs12|kdbx)$/i.test(filename)
  ) {
    return 1
  }

  // Tier 2: Deployment, CI/CD, workflows, infrastructure
  if (
    normalized.startsWith('.github/') ||
    normalized.startsWith('.gitlab/') ||
    normalized.includes('/workflow/') ||
    /(dockerfile|docker-compose|compose\.ya?ml|helm|k8s|kubernetes|terraform|\.tf$|cloudformation)/i.test(normalized)
  ) {
    return 2
  }

  // Tier 3: General configs & settings (prioritize config before ordinary source)
  if (
    /\.(json|ya?ml|toml|ini|xml|conf|cfg)$/i.test(filename) ||
    parts.includes('config') ||
    /(config|settings|manifest|database|datasource)/i.test(filename)
  ) {
    return 3
  }

  // Tier 4: Server, routes, handlers, API, auth, middleware
  if (
    /(auth|login|session|oauth|jwt|security|crypto|permission|rbac|admin)/i.test(normalized) ||
    /(api|route|routes|handler|handlers|controller|controllers|middleware|server|backend|service|services)/i.test(normalized)
  ) {
    return 4
  }

  // Tier 5: Core application source code
  if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|cs|cpp|c|h)$/i.test(filename)) {
    return 5
  }

  // Tier 6: Documentation, text
  if (
    /(readme|contributing|setup|install)/i.test(filename) ||
    /\.(txt|md|rst)$/i.test(filename)
  ) {
    return 6
  }

  // Tier 7: Everything else
  return 7
}

export async function scanSecurityFiles(
  owner: string,
  repo: string,
  sha: string,
  tree: RepoFile[],
  signal?: AbortSignal,
  cachedFiles?: ExtractedFile[],
  options?: SecurityScanOptions
): Promise<SecurityScanResult> {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES
  const maxBytesTotal = options?.maxBytesTotal ?? DEFAULT_MAX_BYTES_TOTAL
  const maxBytesPerFile = options?.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const treeTruncated = Boolean(options?.treeTruncated)

  let bytesInspected = 0
  let contentTruncated = false
  let deadlineExceeded = false
  let budgetExceeded = false
  let contentAttempts = 0

  const admittedFiles: ExtractedFile[] = []
  const sensitiveValuesSet = new Set<string>()
  const fileStatusMap = new Map<string, { status: SecurityContentStatus; size?: number; inspectedBytes?: number }>()

  // Classify policy-skipped and upfront oversized files
  const eligibleFiles: RepoFile[] = []
  for (const file of tree) {
    if (file.type === 'dir') {
      fileStatusMap.set(file.path, { status: 'skipped-policy', size: file.size })
      continue
    }

    if (isSkippedByPolicy(file.path)) {
      fileStatusMap.set(file.path, { status: 'skipped-policy', size: file.size })
      continue
    }

    if (file.size > maxBytesPerFile) {
      fileStatusMap.set(file.path, { status: 'oversized', size: file.size })
      contentTruncated = true
      continue
    }

    eligibleFiles.push(file)
  }

  // Sort eligible files by security priority, then path deterministically
  eligibleFiles.sort((a, b) => {
    const prioA = getSecurityPriority(a.path)
    const prioB = getSecurityPriority(b.path)
    if (prioA !== prioB) return prioA - prioB
    return a.path.localeCompare(b.path)
  })

  // Set up 30s deadline
  const deadlineController = new AbortController()
  const timer = setTimeout(() => {
    deadlineController.abort(new Error(`Security scan timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  const linkedSignal = AbortSignal.any([signal ?? new AbortController().signal, deadlineController.signal])

  try {
    for (let i = 0; i < eligibleFiles.length; i++) {
      const file = eligibleFiles[i]

      // Check abort signals (caller abort throws immediately; internal deadlineController marks deadlineExceeded)
      if (signal?.aborted) {
        throw signal.reason || new Error('Request aborted')
      }
      if (deadlineController.signal.aborted) {
        deadlineExceeded = true
        contentTruncated = true
        for (let j = i; j < eligibleFiles.length; j++) {
          fileStatusMap.set(eligibleFiles[j].path, { status: 'skipped-budget', size: eligibleFiles[j].size })
        }
        break
      }

      // Check content attempt budget cap (failed/oversized fetches consume attempts; <= maxFiles total requests)
      if (contentAttempts >= maxFiles) {
        budgetExceeded = true
        contentTruncated = true
        for (let j = i; j < eligibleFiles.length; j++) {
          fileStatusMap.set(eligibleFiles[j].path, { status: 'skipped-budget', size: eligibleFiles[j].size })
        }
        break
      }

      // Check byte budget ceiling
      if (bytesInspected >= maxBytesTotal) {
        budgetExceeded = true
        contentTruncated = true
        for (let j = i; j < eligibleFiles.length; j++) {
          fileStatusMap.set(eligibleFiles[j].path, { status: 'skipped-budget', size: eligibleFiles[j].size })
        }
        break
      }

      contentAttempts++

      // Check if complete unclipped cache buffer is available
      const cached = cachedFiles?.find((f) => f.path === file.path)
      if (cached && !cached.truncated) {
        const cachedByteLength = Buffer.byteLength(cached.content, 'utf8')
        if (cachedByteLength > maxBytesPerFile) {
          fileStatusMap.set(file.path, { status: 'oversized', size: cached.size })
          contentTruncated = true
          continue
        }

        if (bytesInspected + cachedByteLength > maxBytesTotal) {
          budgetExceeded = true
          contentTruncated = true
          for (let j = i; j < eligibleFiles.length; j++) {
            fileStatusMap.set(eligibleFiles[j].path, { status: 'skipped-budget', size: eligibleFiles[j].size })
          }
          break
        }

        bytesInspected += cachedByteLength
        fileStatusMap.set(file.path, {
          status: 'inspected',
          size: cached.size,
          inspectedBytes: cachedByteLength,
        })
        admittedFiles.push(cached)

        const captured = collectSensitiveValues([cached.content])
        for (const s of captured) {
          sensitiveValuesSet.add(s)
        }
        continue
      }

      // Fetch file content with 128 KiB limit (pass maxBytesPerFile as number)
      try {
        const res = await fetchFileContent(
          owner,
          repo,
          file.path,
          sha,
          linkedSignal,
          maxBytesPerFile
        )

        // Harvest pre-harvested unclipped sensitive values
        if (res.unclippedSensitiveValues) {
          for (const s of res.unclippedSensitiveValues) {
            sensitiveValuesSet.add(s)
          }
        }

        const decodedByteLength = Buffer.byteLength(res.content, 'utf8')
        const fullSize = typeof res.size === 'number' ? res.size : decodedByteLength

        // If actual size exceeds 128 KiB cap, mark oversized
        if (res.truncated || fullSize > maxBytesPerFile || decodedByteLength > maxBytesPerFile) {
          fileStatusMap.set(file.path, { status: 'oversized', size: fullSize })
          contentTruncated = true
          continue
        }

        // Check if admitting would exceed total budget
        if (bytesInspected + decodedByteLength > maxBytesTotal) {
          budgetExceeded = true
          contentTruncated = true
          for (let j = i; j < eligibleFiles.length; j++) {
            fileStatusMap.set(eligibleFiles[j].path, { status: 'skipped-budget', size: eligibleFiles[j].size })
          }
          break
        }

        bytesInspected += decodedByteLength
        fileStatusMap.set(file.path, {
          status: 'inspected',
          size: fullSize,
          inspectedBytes: decodedByteLength,
        })
        admittedFiles.push({
          path: file.path,
          size: fullSize,
          content: res.content,
          truncated: false,
        })

        const captured = collectSensitiveValues([res.content])
        for (const s of captured) {
          sensitiveValuesSet.add(s)
        }
      } catch (err: unknown) {
        if (signal?.aborted) {
          throw signal.reason || new Error('Request aborted')
        }
        if (deadlineController.signal.aborted) {
          deadlineExceeded = true
          contentTruncated = true
          for (let j = i; j < eligibleFiles.length; j++) {
            fileStatusMap.set(eligibleFiles[j].path, { status: 'skipped-budget', size: eligibleFiles[j].size })
          }
          break
        }

        if (err instanceof GitHubRateLimitError) {
          throw err
        }

        if (err instanceof GitHubApiError) {
          if (err.status === 413 || err.message?.includes('exceeded')) {
            fileStatusMap.set(file.path, { status: 'oversized', size: file.size })
            contentTruncated = true
            continue
          }
          if (err.status === 404) {
            fileStatusMap.set(file.path, { status: 'unavailable', size: file.size })
            continue
          }
        }

        fileStatusMap.set(file.path, { status: 'unavailable', size: file.size })
      }
    }
  } finally {
    clearTimeout(timer)
  }

  // Construct reconciled fileStatuses preserving original tree order
  const fileStatuses: SecurityFileStatus[] = tree.map((file) => {
    const entry = fileStatusMap.get(file.path) ?? { status: 'skipped-budget' as SecurityContentStatus }
    return {
      path: file.path,
      status: entry.status,
      size: typeof entry.size === 'number' ? entry.size : file.size,
      ...(typeof entry.inspectedBytes === 'number' ? { inspectedBytes: entry.inspectedBytes } : {}),
    }
  })

  const statusCounts = {
    inspected: 0,
    'filename-only': 0,
    'skipped-policy': 0,
    'skipped-budget': 0,
    oversized: 0,
    unavailable: 0,
  }

  for (const fs of fileStatuses) {
    statusCounts[fs.status]++
  }

  const coverage: SecurityCoverage = {
    caps: {
      maxFiles,
      maxBytesTotal,
      maxBytesPerFile,
      timeoutMs,
      maxAttempts: maxFiles,
    },
    filesDiscovered: tree.length,
    filesInspected: admittedFiles.length,
    filesAttempted: contentAttempts,
    attemptsCount: contentAttempts,
    bytesInspected,
    statusCounts,
    fileStatuses,
    treeTruncated,
    contentTruncated: Boolean(
      contentTruncated ||
      budgetExceeded ||
      deadlineExceeded ||
      statusCounts.oversized > 0
    ),
    deadlineExceeded,
    budgetExceeded,
    unknownRemaining: Boolean(treeTruncated),
  }

  return {
    files: admittedFiles,
    coverage,
    sensitiveValues: Array.from(sensitiveValuesSet),
    unclippedSensitiveValues: Array.from(sensitiveValuesSet),
  }
}
