import type { RepoFile } from '../types/report'

export interface FileSelectionConfig {
  maxFiles: number // default: 30
  maxBytesTotal: number // default: 262_144 (256 KiB)
  maxBytesPerFile: number // default: 32_768 (32 KiB)
  includeTests: boolean // default: true
  includeConfig: boolean // default: true
}

export const DEFAULT_FILE_SELECTION_CONFIG: FileSelectionConfig = {
  maxFiles: 30,
  maxBytesTotal: 262_144, // 256 KiB
  maxBytesPerFile: 32_768, // 32 KiB
  includeTests: true,
  includeConfig: true,
}

const ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
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
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
])

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.vue',
  '.svelte',
  '.astro',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.cs',
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.php',
  '.swift',
  '.scala',
  '.dart',
  '.lua',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.graphql',
  '.gql',
  '.prisma',
  '.proto',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
])

function getPathInfo(rawPath: string) {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/')
  const filename = parts[parts.length - 1] ?? ''
  const dirParts = parts.slice(0, -1)
  const dotIndex = filename.lastIndexOf('.')
  const ext = dotIndex !== -1 ? filename.slice(dotIndex).toLowerCase() : ''
  return { normalized, parts, dirParts, filename, ext }
}

function isGeneratedFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return (
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.map')
  )
}

function isInSkippedDirectory(dirParts: string[]): boolean {
  for (const part of dirParts) {
    const lower = part.toLowerCase()
    if (HIDDEN_DIRS.has(lower) || GENERATED_DIRS.has(lower)) {
      return true
    }
  }
  return false
}

function isTestFile(parts: string[], filename: string): boolean {
  const lowerParts = parts.map((p) => p.toLowerCase())
  const dirParts = lowerParts.slice(0, -1)
  if (dirParts.some((p) => p === '__tests__' || p === 'test' || p === 'tests')) {
    return true
  }
  return /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/i.test(filename)
}

function isConfigFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (lower === 'package.json') return true
  if (lower === 'tsconfig.json' || /^tsconfig(\..+)?\.json$/i.test(lower)) {
    return true
  }
  if (/^next\.config\./i.test(lower)) return true
  if (/^vite\.config\./i.test(lower)) return true
  if (/^webpack\.config\./i.test(lower)) return true
  if (/^\.eslintrc/i.test(lower)) return true
  if (/^jest\.config\./i.test(lower)) return true
  if (/^vitest\.config\./i.test(lower)) return true
  if (/^docker-compose/i.test(lower)) return true
  if (/^dockerfile/i.test(lower)) return true
  return false
}

function isEntryPoint(parts: string[], filename: string): boolean {
  const lowerFilename = filename.toLowerCase()
  if (/^index\.(js|ts|jsx|tsx|mjs)$/i.test(lowerFilename)) return true
  if (/^main\.(js|ts|jsx|tsx|mjs)$/i.test(lowerFilename)) return true
  if (/^cli\.(js|ts)$/i.test(lowerFilename)) return true
  const lowerParts = parts.map((p) => p.toLowerCase())
  if (lowerParts[0] === 'bin' || lowerParts.slice(0, -1).includes('bin')) {
    return true
  }
  return false
}

function isRouteOrHandler(normalized: string): boolean {
  return /(?:^|\/)(?:src\/)?(app|pages|routes|handlers)\//i.test(normalized)
}

function isAuthServiceConfig(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (/^(auth|login|config|settings|middleware)\./i.test(lower)) return true
  if (lower === '.env' || lower.startsWith('.env.')) return true
  return false
}

function isConfigLikeTier3(filename: string): boolean {
  const lower = filename.toLowerCase()
  return /^config\./i.test(lower) || lower === '.env' || lower.startsWith('.env.')
}

function isCoreSourceFile(parts: string[]): boolean {
  return parts.length > 1 && parts[0].toLowerCase() === 'src'
}

function isCiWorkflow(normalized: string, filename: string): boolean {
  const lowerPath = normalized.toLowerCase()
  const lowerFile = filename.toLowerCase()
  if (
    lowerPath.startsWith('.github/workflows/') ||
    lowerPath.includes('/.github/workflows/')
  ) {
    return true
  }
  if (lowerFile === '.gitlab-ci.yml' || lowerFile.startsWith('.gitlab-ci.')) {
    return true
  }
  if (lowerFile === 'jenkinsfile' || lowerFile.startsWith('jenkinsfile.')) {
    return true
  }
  return false
}

function isSourceFile(ext: string, filename: string): boolean {
  if (SOURCE_EXTENSIONS.has(ext)) return true
  const lower = filename.toLowerCase()
  return (
    lower === 'makefile' ||
    lower === 'gemfile' ||
    lower === 'rakefile' ||
    lower === 'procfile'
  )
}

function getPriorityTier(
  file: RepoFile,
  config: FileSelectionConfig
): number | null {
  if (file.type !== 'file') return null

  const { normalized, parts, dirParts, filename, ext } = getPathInfo(file.path)

  if (isInSkippedDirectory(dirParts)) return null
  if (isGeneratedFile(filename)) return null
  if (ASSET_EXTENSIONS.has(ext)) return null
  if (LOCKFILES.has(filename.toLowerCase())) return null
  if (MARKDOWN_EXTENSIONS.has(ext)) return null

  // Tier 7: Test files (skip early if includeTests is false)
  if (isTestFile(parts, filename)) {
    return config.includeTests ? 7 : null
  }

  // Tier 5: Config files (skip early if includeConfig is false)
  if (isConfigFile(filename)) {
    return config.includeConfig ? 5 : null
  }

  // Tier 1: Entry points
  if (isEntryPoint(parts, filename)) {
    return 1
  }

  // Tier 2: Route/handler files
  if (isRouteOrHandler(normalized)) {
    return 2
  }

  // Tier 3: Auth/service/config
  if (isAuthServiceConfig(filename)) {
    if (!config.includeConfig && isConfigLikeTier3(filename)) {
      return null
    }
    return 3
  }

  // Tier 4: Core source files (src/ excluding test files)
  if (isCoreSourceFile(parts) && isSourceFile(ext, filename)) {
    return 4
  }

  // Tier 6: CI workflows
  if (isCiWorkflow(normalized, filename)) {
    return 6
  }

  // Tier 8: Other source files
  if (isSourceFile(ext, filename)) {
    return 8
  }

  // Tier 9: Everything else -> skip
  return null
}

// ponytail: greedy tier-ranked file selection capped at maxFiles and maxBytesTotal.
// Ceiling: ignores AST symbol count or cyclomatic complexity; upgrade path: parse file exports for centrality scoring.
export function selectFiles(
  files: RepoFile[],
  config?: Partial<FileSelectionConfig>
): { selected: RepoFile[]; skipped: number; bytesBudget: number } {
  const resolvedConfig: FileSelectionConfig = {
    ...DEFAULT_FILE_SELECTION_CONFIG,
    ...config,
  }

  interface ScoredFile {
    file: RepoFile
    tier: number
    index: number
  }

  const candidates: ScoredFile[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const tier = getPriorityTier(file, resolvedConfig)
    if (tier !== null) {
      candidates.push({ file, tier, index: i })
    }
  }

  candidates.sort((a, b) => {
    if (a.tier !== b.tier) {
      return a.tier - b.tier
    }
    return a.index - b.index
  })

  const selected: RepoFile[] = []
  let bytesBudget = 0

  for (const candidate of candidates) {
    if (selected.length >= resolvedConfig.maxFiles) {
      break
    }

    const effectiveBytes = Math.min(
      Math.max(0, candidate.file.size),
      resolvedConfig.maxBytesPerFile
    )

    if (bytesBudget + effectiveBytes > resolvedConfig.maxBytesTotal) {
      continue
    }

    selected.push(candidate.file)
    bytesBudget += effectiveBytes
  }

  return {
    selected,
    skipped: files.length - selected.length,
    bytesBudget,
  }
}
