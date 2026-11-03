import type { AnalysisContext, AnalysisFinding } from '../types'
import { redactUrl, safeSnippet } from '../../security/redact'

export function checkTestingCi(ctx: AnalysisContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const { owner, repo, sha, tree, files, sensitiveValues } = ctx

  // 1. CI Workflow Automation
  const hasCi = tree.some((entry) =>
    entry.path.startsWith('.github/workflows/') ||
    entry.path === '.gitlab-ci.yml' ||
    entry.path.startsWith('.circleci/') ||
    entry.path === 'azure-pipelines.yml'
  )

  if (!hasCi) {
    findings.push({
      id: 'ci-missing-workflow',
      category: 'Tests',
      title: 'No automated CI/CD workflow configured',
      description: 'The repository does not contain any GitHub Actions or CI pipeline configurations. Code changes cannot be automatically verified against regressions.',
      severity: 'high',
      confidence: 'high',
      evidence: ['No workflow configuration found in .github/workflows/ or root CI descriptors.'],
      location: '.github/workflows',
      recommendation: 'Add a GitHub Actions workflow to run type checks, unit tests, and linting on pull requests.',
      source: 'repository',
      verification: 'verified',
      githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/tree/${sha}`, sensitiveValues),
    })
  }

  // 2. Test Files Existence
  const testFiles = tree.filter((entry) =>
    entry.type === 'file' && (
      /\.(test|spec)\.[a-z0-9]+$/i.test(entry.path) ||
      entry.path.includes('__tests__/') ||
      entry.path.startsWith('tests/') ||
      entry.path.startsWith('test/')
    )
  )

  if (testFiles.length === 0) {
    findings.push({
      id: 'test-no-test-files',
      category: 'Tests',
      title: 'Zero test files found in repository',
      description: 'No unit, integration, or end-to-end test files were discovered in the repository tree.',
      severity: 'high',
      confidence: 'high',
      evidence: ['Tree scan of repository paths found zero files matching *.test.*, *.spec.*, or located in test directories.'],
      location: 'root',
      recommendation: 'Introduce an automated test runner (such as Vitest, Jest, or Pytest) and add unit tests for critical paths.',
      source: 'repository',
      verification: 'verified',
      githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/tree/${sha}`, sensitiveValues),
    })
  }

  // 3. package.json test script analysis
  const pkgFile = files.find((f) => f.path === 'package.json')
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content)
      const testScript = pkg.scripts?.test
      if (!testScript) {
        findings.push({
          id: 'test-missing-test-script',
          category: 'Tests',
          title: 'Missing `test` script in package.json',
          description: '`package.json` does not define a `"test"` script in its scripts dictionary.',
          severity: 'medium',
          confidence: 'high',
          evidence: ['"scripts" in package.json lacks a "test" entry.'],
          location: 'package.json',
          recommendation: 'Add a `"test"` command in `package.json` so contributors and CI can execute tests via `npm test`.',
          source: 'repository',
          verification: 'verified',
          filePath: 'package.json',
          githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/package.json`, sensitiveValues),
        })
      } else if (typeof testScript === 'string' && testScript.includes('no test specified')) {
        findings.push({
          id: 'test-unconfigured-test-script',
          category: 'Tests',
          title: 'Default placeholder `test` script in package.json',
          description: 'The `npm test` script is still the initial `echo "Error: no test specified" && exit 1` default from `npm init`.',
          severity: 'high',
          confidence: 'high',
          evidence: pkgFile.truncated
            ? ['[source evidence omitted: file content truncated]']
            : [safeSnippet(`"test": "${testScript}"`, 120, sensitiveValues)],
          location: 'package.json',
          recommendation: 'Configure a real test runner in package.json scripts (e.g. `"test": "vitest run"`).',
          source: 'repository',
          verification: 'verified',
          filePath: 'package.json',
          githubPermaUrl: redactUrl(`https://github.com/${owner}/${repo}/blob/${sha}/package.json`, sensitiveValues),
        })
      }
    } catch {
      // Ignore JSON parse errors here; handled by package manifest check
    }
  }

  return findings
}
