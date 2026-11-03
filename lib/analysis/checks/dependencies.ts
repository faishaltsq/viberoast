import type { AnalysisContext, AnalysisFinding } from '../types'

const DEV_TOOLS = new Set([
  'typescript', '@types/node', '@types/react', '@types/react-dom',
  'eslint', 'prettier', 'vitest', 'jest', 'mocha', 'chai',
  'nodemon', 'ts-node', 'tsx', 'webpack-dev-server', 'vite',
])

const DEPRECATED_PKGS: Record<string, string> = {
  request: 'Deprecated library. Use native fetch() or axios instead.',
  querystring: 'Legacy Node.js API. Use URLSearchParams instead.',
  moment: 'Legacy date library with large bundle overhead. Consider date-fns, Day.js, or native Temporal.',
}

export function checkDependencies(ctx: AnalysisContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const { owner, repo, sha, tree, files } = ctx

  const hasPackageJson = tree.some((e) => e.path === 'package.json')
  if (!hasPackageJson) return findings

  // 1. Missing package lockfile
  const hasLockfile = tree.some((e) =>
    e.path === 'package-lock.json' ||
    e.path === 'pnpm-lock.yaml' ||
    e.path === 'yarn.lock' ||
    e.path === 'bun.lockb'
  )
  if (!hasLockfile) {
    findings.push({
      id: 'dep-missing-lockfile',
      category: 'Dependencies',
      title: 'Missing dependency lockfile in repository',
      description: 'Found `package.json` without an accompanying lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, or bun.lockb). Builds may produce non-deterministic dependency versions.',
      severity: 'high',
      confidence: 'high',
      evidence: ['package.json exists but no lockfile found in repository root.'],
      location: 'package.json',
      recommendation: 'Commit your package manager lockfile to ensure reproducible builds across machines and CI.',
      source: 'repository',
      verification: 'verified',
      filePath: 'package.json',
      githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/package.json`,
    })
  }

  // 2. package.json content inspection
  const pkgFile = files.find((f) => f.path === 'package.json')
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content)
      const deps = (pkg.dependencies && typeof pkg.dependencies === 'object') ? pkg.dependencies : {}

      // Check for dev dependencies in production dependencies
      const misplacedDevDeps = Object.keys(deps).filter((dep) =>
        DEV_TOOLS.has(dep) || dep.startsWith('@types/') || dep.startsWith('eslint-')
      )
      if (misplacedDevDeps.length > 0) {
        findings.push({
          id: 'dep-dev-in-prod',
          category: 'Dependencies',
          title: `Build tools placed in production \`dependencies\` (${misplacedDevDeps.length} items)`,
          description: `Development packages like \`${misplacedDevDeps.slice(0, 3).join(', ')}\` are listed under \`dependencies\` instead of \`devDependencies\`. This bloats the production deployment bundle.`,
          severity: 'medium',
          confidence: 'high',
          evidence: misplacedDevDeps.slice(0, 5).map((d) => `"${d}": "${deps[d]}"`),
          location: 'package.json:dependencies',
          recommendation: 'Move build and test tools into `devDependencies` using `npm install --save-dev`.',
          source: 'repository',
          verification: 'verified',
          filePath: 'package.json',
          githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/package.json`,
        })
      }

      // Check for wildcard / latest versions
      const wildVersions = Object.entries(deps).filter(([, ver]) => ver === '*' || ver === 'latest')
      if (wildVersions.length > 0) {
        findings.push({
          id: 'dep-wildcard-versions',
          category: 'Dependencies',
          title: `Wildcard or "latest" versions in dependencies (${wildVersions.length} packages)`,
          description: `Dependencies specifying "*" or "latest" version ranges risk breaking on every upstream release.`,
          severity: 'high',
          confidence: 'high',
          evidence: wildVersions.map(([d, v]) => `"${d}": "${v}"`),
          location: 'package.json:dependencies',
          recommendation: 'Pin dependencies to specific semantic version ranges (e.g. `^1.2.0`).',
          source: 'repository',
          verification: 'verified',
          filePath: 'package.json',
          githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/package.json`,
        })
      }

      // Check for known deprecated packages
      const foundDeprecated = Object.keys(deps).filter((d) => Boolean(DEPRECATED_PKGS[d]))
      if (foundDeprecated.length > 0) {
        findings.push({
          id: 'dep-deprecated-libraries',
          category: 'Dependencies',
          title: `Deprecated dependency detected: ${foundDeprecated.join(', ')}`,
          description: foundDeprecated.map((d) => `${d}: ${DEPRECATED_PKGS[d]}`).join(' '),
          severity: 'medium',
          confidence: 'high',
          evidence: foundDeprecated.map((d) => `"${d}": "${deps[d]}"`),
          location: 'package.json:dependencies',
          recommendation: 'Replace deprecated packages with modern, actively maintained alternatives.',
          source: 'repository',
          verification: 'verified',
          filePath: 'package.json',
          githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/package.json`,
        })
      }
    } catch {
      findings.push({
        id: 'dep-invalid-package-json',
        category: 'Dependencies',
        title: 'Malformed package.json file',
        description: 'Failed to parse package.json as valid JSON.',
        severity: 'high',
        confidence: 'high',
        evidence: ['package.json contains invalid syntax or is corrupted.'],
        location: 'package.json',
        recommendation: 'Fix the JSON syntax error in package.json.',
        source: 'repository',
        verification: 'verified',
        filePath: 'package.json',
      })
    }
  }

  return findings
}
