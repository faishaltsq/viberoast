import type { AnalysisContext, AnalysisFinding } from '../types'

const LOW_EFFORT_MESSAGES = new Set([
  'update', 'fix', 'fixes', 'wip', 'commit', '.', 'asdf', 'test',
  'changes', 'bugfix', 'cleanup', 'misc', 'minor changes',
])

export function checkGitDx(ctx: AnalysisContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = []
  const { owner, repo, sha, tree, files, meta } = ctx

  // 1. Missing or Empty README
  const readmeEntry = tree.find((e) => /^readme(\.[a-z0-9]+)?$/i.test(e.path))
  if (!readmeEntry) {
    findings.push({
      id: 'dx-missing-readme',
      category: 'Git Hygiene',
      title: 'Missing README documentation',
      description: 'The repository lacks a README file explaining what the project does, how to install it, or how to run it.',
      severity: 'medium',
      confidence: 'high',
      evidence: ['No README or README.md found in repository root.'],
      location: 'root',
      recommendation: 'Add a comprehensive README.md with project overview, setup prerequisites, and local development instructions.',
      source: 'repository',
      verification: 'verified',
      githubPermaUrl: `https://github.com/${owner}/${repo}/tree/${sha}`,
    })
  } else {
    const readmeFile = files.find((f) => f.path.toLowerCase() === readmeEntry.path.toLowerCase())
    if (readmeFile && readmeFile.content.trim().length < 50) {
      findings.push({
        id: 'dx-empty-readme',
        category: 'Git Hygiene',
        title: 'Stub or barebones README file',
        description: `The README file is only ${readmeFile.content.trim().length} characters long, providing virtually no documentation for users or contributors.`,
        severity: 'low',
        confidence: 'high',
        evidence: [`Content: "${readmeFile.content.trim()}"`],
        location: readmeFile.path,
        recommendation: 'Expand README with setup instructions, usage examples, and architecture overview.',
        source: 'repository',
        verification: 'verified',
        filePath: readmeFile.path,
        githubPermaUrl: `https://github.com/${owner}/${repo}/blob/${sha}/${readmeFile.path}`,
      })
    }
  }

  // 2. Missing .gitignore
  const hasGitignore = tree.some((e) => e.path === '.gitignore')
  if (!hasGitignore) {
    findings.push({
      id: 'dx-missing-gitignore',
      category: 'Git Hygiene',
      title: 'Missing .gitignore file',
      description: 'The repository does not have a `.gitignore` file, risking accidental commits of dependencies (node_modules), build artifacts, and local secrets.',
      severity: 'medium',
      confidence: 'high',
      evidence: ['No .gitignore file found in repository root.'],
      location: '.gitignore',
      recommendation: 'Add a standard `.gitignore` suited to your programming language and framework ecosystem.',
      source: 'repository',
      verification: 'verified',
      githubPermaUrl: `https://github.com/${owner}/${repo}/tree/${sha}`,
    })
  }

  // 3. Missing LICENSE file
  const hasLicense = tree.some((e) => /^licen[sc]e(\.[a-z0-9]+)?$/i.test(e.path))
  if (!hasLicense) {
    findings.push({
      id: 'dx-missing-license',
      category: 'Git Hygiene',
      title: 'Missing open-source LICENSE file',
      description: 'Without an explicit LICENSE file, default copyright laws apply, meaning other developers have no legal permission to use, copy, or contribute to the repository.',
      severity: 'low',
      confidence: 'high',
      evidence: ['No LICENSE or LICENSE.md found in repository root.'],
      location: 'LICENSE',
      recommendation: 'Add an open-source license (such as MIT, Apache 2.0, or BSD) to clarify usage terms.',
      source: 'repository',
      verification: 'verified',
      githubPermaUrl: `https://github.com/${owner}/${repo}/tree/${sha}`,
    })
  }

  // 4. Low-effort commit messages
  if (meta?.commitMessage) {
    const trimmed = meta.commitMessage.trim().toLowerCase().replace(/[!.]$/, '')
    if (LOW_EFFORT_MESSAGES.has(trimmed) || (trimmed.length > 0 && trimmed.length <= 4)) {
      findings.push({
        id: 'dx-low-effort-commit',
        category: 'Git Hygiene',
        title: `Low-effort commit message: "${meta.commitMessage}"`,
        description: `The latest commit message \`"${meta.commitMessage}"\` is generic and fails to explain what changed or why.`,
        severity: 'low',
        confidence: 'high',
        evidence: [`Latest commit SHA ${sha.slice(0, 7)}: "${meta.commitMessage}"`],
        location: `commit:${sha.slice(0, 7)}`,
        recommendation: 'Write descriptive commit messages explaining the problem solved and the rationale.',
        source: 'repository',
        verification: 'verified',
        githubPermaUrl: `https://github.com/${owner}/${repo}/commit/${sha}`,
      })
    }
  }

  return findings
}
