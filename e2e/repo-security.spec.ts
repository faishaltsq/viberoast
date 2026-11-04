import { test, expect } from '@playwright/test'
import { makeRepoReport } from '../tests/fixtures/report'
import { repoReportSchema, type RepositoryReport, type Finding } from '../lib/types/report'

const VIEWPORTS = [
  { width: 360, height: 800, name: '360-mobile-small' },
  { width: 390, height: 844, name: '390-mobile-standard' },
  { width: 768, height: 1024, name: '768-tablet' },
  { width: 1024, height: 768, name: '1024-desktop-small' },
  { width: 1440, height: 900, name: '1440-desktop-wide' },
]

function createReportWithSecurity(): RepositoryReport {
  const base = makeRepoReport()
  const sha = 'aabbccd00112233445566778899aabbccddeeff0'

  const secretFinding: Finding = {
    id: 'openai-api-key-leak',
    title: 'Hardcoded OpenAI API Key Detected',
    category: 'Security',
    severity: 'high',
    location: 'src/lib/ai/client.ts:42',
    description: 'Found OpenAI API key assignment in source code: sk-live-abcdef1234567890abcdef123456',
    evidence: ['const apiKey = "sk-live-abcdef1234567890abcdef123456"'],
    recommendation: 'Move API keys to environment variables and rotate the exposed secret immediately.',
    source: 'repository',
    confidence: 'high',
    verification: 'verified',
    security: {
      category: 'Secret Leak',
      ruleId: 'openai-api-key',
      ruleVersion: '1.2.0',
      commitSha: sha,
      filePath: 'src/lib/ai/client.ts',
      lineStart: 42,
      lineEnd: 42,
      observation: 'Definite OpenAI API key string found assigned to apiKey variable.',
      possibleImpact: 'Unauthorized API usage, billing exhaustion, and potential data exposure.',
      coverageLimitations: 'Only files under 256 KiB in root and src directory were scanned.',
    },
  }

  const hotspotFinding: Finding = {
    id: 'aws-access-key-id-identifier',
    title: 'AWS Access Key ID Identifier Observed',
    category: 'Security',
    severity: 'medium',
    location: 'config/aws.ts:15',
    description: 'Detected public AWS Access Key ID identifier AKIAIOSFODNN7EXAMPLE in configuration file.',
    evidence: ['const keyId = "AKIAIOSFODNN7EXAMPLE"'],
    recommendation: 'Ensure secret access key is not coupled and credentials are managed via IAM roles.',
    source: 'repository',
    confidence: 'medium',
    verification: 'heuristic',
    security: {
      category: 'Identifier Hotspot',
      ruleId: 'aws-access-key-id',
      ruleVersion: '1.0.0',
      commitSha: sha,
      filePath: 'config/aws.ts',
      lineStart: 15,
      lineEnd: 15,
      observation: 'AWS Access Key ID identifier pattern detected. Identifier is public-facing without secret key.',
      possibleImpact: 'Account reconnaissance if combined with secondary leakage.',
      coverageLimitations: 'Does not verify validity against AWS STS API.',
    },
  }

  const report: RepositoryReport = {
    ...base,
    // ponytail: local 15-minute lease avoids expiry banner altering test assertions
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      sha,
      securityFindings: [secretFinding, hotspotFinding],
      totalSecurityFindings: 3,
      omittedSecurityFindings: 1,
      securityCoverage: {
        filesDiscovered: 450,
        filesInspected: 42,
        bytesInspected: 131072,
        caps: {
          maxFiles: 50,
          maxBytesPerFile: 65536,
          maxBytesTotal: 262144,
          timeoutMs: 5000,
        },
        statusCounts: {
          inspected: 42,
          'filename-only': 8,
          'skipped-policy': 380,
          'skipped-budget': 15,
          oversized: 3,
          unavailable: 2,
        },
        fileStatuses: [
          { path: 'src/lib/ai/client.ts', status: 'inspected', inspectedBytes: 1400 },
          { path: 'config/aws.ts', status: 'inspected', inspectedBytes: 900 },
          { path: 'big-bundle.min.js', status: 'oversized', inspectedBytes: 0 },
        ],
        treeTruncated: true,
        contentTruncated: true,
        deadlineExceeded: false,
        budgetExceeded: true,
        unknownRemaining: true,
        omittedSecurityFindings: 1,
      },
      staticCoverage: {
        filesAttempted: 42,
        filesParsed: 40,
        filesPartial: 2,
        filesUnsupported: 0,
        fileStatuses: [
          { path: 'src/lib/ai/client.ts', status: 'parsed', syntaxKind: 'ts' },
          { path: 'config/aws.ts', status: 'parsed', syntaxKind: 'ts' },
        ],
      },
    },
  }

  return repoReportSchema.parse(report) as RepositoryReport
}

function createCleanSecurityReport(): RepositoryReport {
  const base = makeRepoReport()
  const report: RepositoryReport = {
    ...base,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      securityFindings: [],
      totalSecurityFindings: 0,
      omittedSecurityFindings: 0,
      securityCoverage: {
        filesDiscovered: 120,
        filesInspected: 50,
        bytesInspected: 65536,
        caps: {
          maxFiles: 50,
          maxBytesPerFile: 65536,
          maxBytesTotal: 262144,
          timeoutMs: 5000,
        },
        statusCounts: {
          inspected: 50,
          'filename-only': 5,
          'skipped-policy': 60,
          'skipped-budget': 5,
          oversized: 0,
          unavailable: 0,
        },
        fileStatuses: [],
        treeTruncated: false,
        contentTruncated: false,
        deadlineExceeded: false,
        budgetExceeded: false,
        unknownRemaining: false,
      },
    },
  }

  return repoReportSchema.parse(report) as RepositoryReport
}

function createLegacyReport(): RepositoryReport {
  const base = makeRepoReport()
  const report: RepositoryReport = {
    ...base,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      securityFindings: [],
      securityCoverage: undefined, // Legacy report without securityCoverage
    },
  }

  return repoReportSchema.parse(report) as RepositoryReport
}

function createReportWithSpecialPathAndSecrets(): RepositoryReport {
  const base = makeRepoReport()
  const sha = 'aabbccd00112233445566778899aabbccddeeff0'

  const specialFileFinding: Finding = {
    id: 'special-path-finding',
    title: 'Secret in path with spaces and special characters',
    category: 'Security',
    severity: 'high',
    location: 'src/my utils/foo#bar?baz.ts:12-14',
    description: 'Found token in file with spaces, hash, and question mark in name.',
    evidence: ['const secret = "ghp_012345678901234567890123456789012345"'],
    recommendation: 'Rotate key sk-live-recommendationsecret12345678 immediately.',
    source: 'repository',
    confidence: 'high',
    verification: 'verified',
    security: {
      category: 'Secret Leak',
      ruleId: 'github-pat',
      ruleVersion: '1.0.0',
      commitSha: sha,
      filePath: 'src/my utils/foo#bar?baz.ts',
      lineStart: 12,
      lineEnd: 14,
      observation: 'Observed PAT in code.',
      possibleImpact: 'Leaked sk-live-impactsecret12345678 allows unauthorized API usage.',
      coverageLimitations: 'Only inspected files under 64 KiB.',
    },
  }

  const secretInPathFinding: Finding = {
    id: 'secret-in-path-finding',
    title: 'Secret inside location path itself',
    category: 'Security',
    severity: 'high',
    location: 'src/tokens/ghp_012345678901234567890123456789012345/config.ts:5',
    description: 'The location path contains credentials.',
    evidence: ['config line with credential'],
    recommendation: 'Audit path.',
    source: 'repository',
    confidence: 'high',
    verification: 'verified',
    security: {
      category: 'Secret Leak',
      ruleId: 'github-pat',
      ruleVersion: '1.0.0',
      commitSha: sha,
      filePath: 'src/tokens/ghp_012345678901234567890123456789012345/config.ts',
      lineStart: 5,
      lineEnd: 5,
      observation: 'Credential observed in path.',
      possibleImpact: 'Token exposure.',
      coverageLimitations: 'None.',
    },
  }

  const envFileFinding: Finding = {
    id: 'sec-committed-env-file-root',
    title: 'Committed environment file: .env',
    category: 'Security',
    severity: 'medium',
    location: '.env',
    description: 'Tracked environment file in repository root.',
    evidence: ['Tracked in git tree: .env'],
    recommendation: 'Remove from git tracking.',
    source: 'repository',
    confidence: 'high',
    verification: 'verified',
    security: {
      category: 'Security',
      ruleId: 'sec.committed-env-file',
      ruleVersion: '1.0.0',
      commitSha: sha,
      filePath: '.env',
      observation: 'Tracked environment file.',
      possibleImpact: 'Potential exposure of configuration.',
      coverageLimitations: 'Filename-only inspection from git tree.',
    },
  }

  const credentialFileFinding: Finding = {
    id: 'sec-tracked-credential-file-creds',
    title: 'Tracked credential configuration file: credentials.json',
    category: 'Security',
    severity: 'medium',
    location: 'credentials.json',
    description: 'Tracked credential configuration file.',
    evidence: ['Tracked in git tree: credentials.json'],
    recommendation: 'Remove from git tracking.',
    source: 'repository',
    confidence: 'high',
    verification: 'verified',
    security: {
      category: 'Security',
      ruleId: 'sec.tracked-credential-file',
      ruleVersion: '1.0.0',
      commitSha: sha,
      filePath: 'credentials.json',
      observation: 'Tracked credential file.',
      possibleImpact: 'Potential credential exposure.',
      coverageLimitations: 'Filename-only inspection from git tree.',
    },
  }

  const corsFinding: Finding = {
    id: 'cors-wildcard-finding',
    title: 'Wildcard CORS with credentials enabled',
    category: 'Security',
    severity: 'medium',
    location: 'server/cors.ts:18',
    description: 'Wildcard Access-Control-Allow-Origin with Allow-Credentials: true.',
    evidence: ['cors({ origin: "*", credentials: true })'],
    recommendation: 'Restrict allowed origins.',
    source: 'repository',
    confidence: 'high',
    verification: 'verified',
    security: {
      category: 'Security',
      ruleId: 'cors.wildcard-credentials',
      ruleVersion: '1.0.0',
      commitSha: sha,
      filePath: 'server/cors.ts',
      lineStart: 18,
      lineEnd: 18,
      observation: 'Overly permissive CORS policy.',
      possibleImpact: 'Cross-origin data access.',
      coverageLimitations: 'AST scan.',
    },
  }

  const report: RepositoryReport = {
    ...base,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      sha,
      securityFindings: [
        specialFileFinding,
        secretInPathFinding,
        envFileFinding,
        credentialFileFinding,
        corsFinding,
      ],
      totalSecurityFindings: 5,
      omittedSecurityFindings: 0,
      securityCoverage: {
        filesDiscovered: 50,
        filesInspected: 10,
        bytesInspected: 32768,
        caps: {
          maxFiles: 50,
          maxBytesPerFile: 65536,
          maxBytesTotal: 262144,
          timeoutMs: 5000,
        },
        statusCounts: {
          inspected: 10,
          'filename-only': 2,
          'skipped-policy': 38,
          'skipped-budget': 0,
          oversized: 0,
          unavailable: 0,
        },
        fileStatuses: [],
        treeTruncated: false,
        contentTruncated: false,
        deadlineExceeded: false,
        budgetExceeded: false,
        unknownRemaining: false,
      },
    },
  }

  return repoReportSchema.parse(report) as RepositoryReport
}

function createZeroInspectedSecurityReport(): RepositoryReport {
  const base = makeRepoReport()
  const report: RepositoryReport = {
    ...base,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      securityFindings: [],
      totalSecurityFindings: 0,
      omittedSecurityFindings: 0,
      securityCoverage: {
        filesDiscovered: 10,
        filesInspected: 0,
        bytesInspected: 0,
        caps: {
          maxFiles: 50,
          maxBytesPerFile: 65536,
          maxBytesTotal: 262144,
          timeoutMs: 5000,
        },
        statusCounts: {
          inspected: 0,
          'filename-only': 0,
          'skipped-policy': 10,
          'skipped-budget': 0,
          oversized: 0,
          unavailable: 0,
        },
        fileStatuses: [],
        treeTruncated: false,
        contentTruncated: false,
        deadlineExceeded: false,
        budgetExceeded: false,
        unknownRemaining: false,
      },
    },
  }

  return repoReportSchema.parse(report) as RepositoryReport
}

test.describe('SourceSanity Security Focus UI', () => {
  test('tabs, switch toggle, keyboard navigation, and classification', async ({ page }) => {
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createReportWithSecurity(),
      })
    })

    await page.goto('/')

    // Switch to GitHub repository mode
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
    await page.getByTestId('repo-submit-btn').click()

    await expect(page.getByTestId('repo-results')).toBeVisible()

    // 1. Initial tab state: Code Receipts (Quality) is active
    const tabQuality = page.getByTestId('tab-quality')
    const tabSecurity = page.getByTestId('tab-security')
    const switchToggle = page.getByTestId('security-focus-toggle')

    await expect(tabQuality).toHaveAttribute('aria-selected', 'true')
    await expect(tabSecurity).toHaveAttribute('aria-selected', 'false')
    await expect(switchToggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('panel-quality')).toBeVisible()

    // 2. Keyboard navigation between tabs using Arrow keys
    await tabQuality.focus()
    await page.keyboard.press('ArrowRight')
    await expect(tabSecurity).toHaveAttribute('aria-selected', 'true')
    await expect(tabQuality).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByTestId('panel-security')).toBeVisible()

    // ArrowLeft switches back to Quality
    await page.keyboard.press('ArrowLeft')
    await expect(tabQuality).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('panel-quality')).toBeVisible()

    // 3. Switch toggle keyboard operation (Space / Enter)
    await switchToggle.focus()
    await page.keyboard.press('Space')
    await expect(switchToggle).toHaveAttribute('aria-checked', 'true')
    await expect(tabSecurity).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('repo-security-panel')).toBeVisible()

    // 4. Verify Non-Audit Grade Disclaimer & Branding
    await expect(page.getByRole('heading', { name: 'SourceSanity Security Focus' })).toBeVisible()
    await expect(
      page.getByText('Security observations are prioritized separately from styling, architecture, and comedy issue-density.')
    ).toBeVisible()
    await expect(
      page.getByText('The Roast Heat score is not an audit grade or security certification.')
    ).toBeVisible()

    // 5. Verify Triage Counters & Metrics: Total reported includes omitted (3), separate indicators
    await expect(page.getByTestId('metric-total-findings')).toContainText('3')
    await expect(page.getByTestId('metric-total-findings')).toContainText('2 admitted')
    await expect(page.getByTestId('metric-total-findings')).toContainText('1 omitted')
    await expect(page.getByTestId('metric-exposed-secrets')).toContainText('1') // Only openai-api-key
    await expect(page.getByTestId('metric-security-hotspots')).toContainText('1') // aws-access-key-id is hotspot!
    await expect(page.getByTestId('metric-files-checked')).toContainText('42/450')

    // 6. Verify Coverage & Limit Details
    const coverageBox = page.getByTestId('security-coverage-details')
    await expect(coverageBox).toBeVisible()
    await expect(coverageBox).toContainText('42') // inspected
    await expect(coverageBox).toContainText('8') // filename-only
    await expect(coverageBox).toContainText('380') // skipped policy
    await expect(coverageBox).toContainText('15') // skipped budget
    await expect(coverageBox).toContainText('3') // oversized
    await expect(coverageBox).toContainText('2') // unavailable

    // Scope warnings: Distinguishes generic limited scope (byte cap was not exceeded)
    await expect(page.getByText('Tree budget reached (truncated)')).toBeVisible()
    await expect(page.getByText('Incomplete content inspection (limited scope)')).toBeVisible()
    await expect(page.getByText('Uninspected tree remainder')).toBeVisible()
    await expect(page.getByText('(1 security findings omitted due to analysis caps)')).toBeVisible()

    // 7. Verify Classification Badges
    const secretCard = page.getByTestId('security-finding-openai-api-key-leak')
    const hotspotCard = page.getByTestId('security-finding-aws-access-key-id-identifier')

    await expect(secretCard).toBeVisible()
    await expect(hotspotCard).toBeVisible()

    // Classified as secret vs hotspot
    await expect(secretCard.locator('button')).toContainText('POTENTIAL EXPOSED SECRET')
    await expect(hotspotCard.locator('button')).toContainText('SECURITY HOTSPOT')

    // Verification badges
    await expect(secretCard.locator('button')).toContainText('VERIFIED')
    await expect(hotspotCard.locator('button')).toContainText('HEURISTIC · REVIEW')

    // 8. Expand Finding & Verify Defensive Redaction and Safe GitHub Permalink
    await secretCard.locator('button').click()
    const secretDetail = secretCard.locator('.finding-detail')
    await expect(secretDetail).toBeVisible()

    // Safe permalink pointing to pinned sha and file
    const permalink = secretDetail.locator('a[href*="github.com/acme-corp/cool-app/blob/aabbccd"]')
    await expect(permalink).toBeVisible()
    await expect(permalink).toHaveAttribute('href', /blob\/aabbccd00112233445566778899aabbccddeeff0\/src\/lib\/ai\/client\.ts#L42/)

    // Defensive redaction: raw sk-live token must NOT appear in DOM; masked token should
    const detailText = await secretDetail.innerText()
    expect(detailText).not.toContain('sk-live-abcdef1234567890abcdef123456')
    expect(detailText).toContain('[redacted]')

    // Observation, limitations, remediation priority, and possible impact
    await expect(secretDetail).toContainText('Definite OpenAI API key string found')
    await expect(secretDetail).toContainText('Move API keys to environment variables')
    await expect(secretDetail).toContainText('Unauthorized API usage, billing exhaustion')
    await expect(secretDetail).toContainText('Only files under 256 KiB')

    // 9. Switch back to Quality Tab and confirm scoring and quality receipts are untouched
    await tabQuality.click()
    await expect(page.getByTestId('panel-quality')).toBeVisible()
    await expect(page.getByTestId('repo-fix-my-shame-btn')).toBeVisible()
    await expect(page.getByText('Roast heat. Not an audit grade.')).toBeVisible()
  })

  test('valid filenames with #, ?, spaces format permalink and line ranges correctly, rejects secrets in path', async ({ page }) => {
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createReportWithSpecialPathAndSecrets(),
      })
    })

    await page.goto('/')
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
    await page.getByTestId('repo-submit-btn').click()
    await expect(page.getByTestId('repo-results')).toBeVisible()

    await page.getByTestId('tab-security').click()
    await expect(page.getByTestId('repo-security-panel')).toBeVisible()

    // 1. Finding with spaces, hash, and question mark in filename
    const specialCard = page.getByTestId('security-finding-special-path-finding')
    await expect(specialCard).toBeVisible()
    await specialCard.locator('button').click()

    const specialDetail = specialCard.locator('.finding-detail')
    await expect(specialDetail).toBeVisible()

    // Permalink must preserve spaces (encoded as %20) and #, ? (encoded as %23, %3F), and format line range #L12-L14
    const specialLink = specialDetail.locator('a[href*="blob/aabbccd00112233445566778899aabbccddeeff0"]')
    await expect(specialLink).toBeVisible()
    const specialHref = await specialLink.getAttribute('href')
    expect(specialHref).toBe(
      'https://github.com/acme-corp/cool-app/blob/aabbccd00112233445566778899aabbccddeeff0/src/my%20utils/foo%23bar%3Fbaz.ts#L12-L14'
    )

    // 2. Finding with secret token inside path: must NOT create link
    const secretPathCard = page.getByTestId('security-finding-secret-in-path-finding')
    await expect(secretPathCard).toBeVisible()
    await secretPathCard.locator('button').click()

    const secretPathDetail = secretPathCard.locator('.finding-detail')
    await expect(secretPathDetail).toBeVisible()

    // No permalink anchor tag for redacted path containing secrets
    const anchorsInSecretPath = secretPathDetail.locator('a[href*="ghp_"]')
    await expect(anchorsInSecretPath).toHaveCount(0)

    // Raw token must not appear in DOM or in any link href
    const pageHtml = await page.content()
    expect(pageHtml).not.toContain('href="https://github.com/acme-corp/cool-app/blob/aabbccd00112233445566778899aabbccddeeff0/src/tokens/ghp_')
  })

  test('defensively redacts credentials in expanded recommendation and possibleImpact', async ({ page }) => {
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createReportWithSpecialPathAndSecrets(),
      })
    })

    await page.goto('/')
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
    await page.getByTestId('repo-submit-btn').click()
    await expect(page.getByTestId('repo-results')).toBeVisible()

    await page.getByTestId('tab-security').click()
    const card = page.getByTestId('security-finding-special-path-finding')
    await card.locator('button').click()

    const detail = card.locator('.finding-detail')
    await expect(detail).toBeVisible()

    const detailText = await detail.innerText()
    // Raw credentials must not appear in recommendation or possible impact
    expect(detailText).not.toContain('sk-live-recommendationsecret12345678')
    expect(detailText).not.toContain('sk-live-impactsecret12345678')
    // Redacted token marker must appear
    expect(detailText).toContain('[redacted]')
  })

  test('classifies filename rules and CORS as security hotspots, not secrets', async ({ page }) => {
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createReportWithSpecialPathAndSecrets(),
      })
    })

    await page.goto('/')
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
    await page.getByTestId('repo-submit-btn').click()
    await expect(page.getByTestId('repo-results')).toBeVisible()

    await page.getByTestId('tab-security').click()

    // 1. sec.committed-env-file -> SECURITY HOTSPOT
    const envCard = page.getByTestId('security-finding-sec-committed-env-file-root')
    await expect(envCard.locator('button')).toContainText('SECURITY HOTSPOT')
    await expect(envCard.locator('button')).not.toContainText('POTENTIAL EXPOSED SECRET')

    // 2. sec.tracked-credential-file -> SECURITY HOTSPOT
    const credCard = page.getByTestId('security-finding-sec-tracked-credential-file-creds')
    await expect(credCard.locator('button')).toContainText('SECURITY HOTSPOT')
    await expect(credCard.locator('button')).not.toContainText('POTENTIAL EXPOSED SECRET')

    // 3. cors.wildcard-credentials -> SECURITY HOTSPOT
    const corsCard = page.getByTestId('security-finding-cors-wildcard-finding')
    await expect(corsCard.locator('button')).toContainText('SECURITY HOTSPOT')
    await expect(corsCard.locator('button')).not.toContainText('POTENTIAL EXPOSED SECRET')
  })

  test('clean scan shows exact zero-findings text and never claims 100% secure', async ({ page }) => {
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createCleanSecurityReport(),
      })
    })

    await page.goto('/')
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/clean-repo')
    await page.getByTestId('repo-submit-btn').click()

    await expect(page.getByTestId('repo-results')).toBeVisible()

    // Switch to Security Focus
    await page.getByTestId('tab-security').click()

    // Exact required copy
    const notice = page.getByTestId('no-security-findings')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('No security findings detected in the inspected scope.')

    // Must not claim 100% secure
    const pageText = await page.innerText('body')
    expect(pageText).not.toContain('100% secure')
    expect(pageText).not.toContain('completely secure')
    expect(pageText).not.toContain('totally safe')
  })

  test('legacy report and zero-scope inspection do not display clean scan claim', async ({ page }) => {
    // 1. Legacy report without securityCoverage
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createLegacyReport(),
      })
    })

    await page.goto('/')
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/legacy-repo')
    await page.getByTestId('repo-submit-btn').click()

    await expect(page.getByTestId('repo-results')).toBeVisible()

    // Switch to Security Focus
    await page.getByTestId('tab-security').click()

    // Legacy coverage notice
    const legacyNotice = page.getByTestId('legacy-security-coverage')
    await expect(legacyNotice).toBeVisible()
    await expect(legacyNotice).toContainText(
      'Security coverage not available (legacy report — scope was not checked for secrets).'
    )

    // Legacy unassessed notice displayed, clean notice NOT displayed
    await expect(page.getByTestId('legacy-unassessed-security')).toBeVisible()
    await expect(page.getByTestId('no-security-findings')).not.toBeVisible()

    const legacyBodyText = await page.innerText('body')
    expect(legacyBodyText).not.toContain('No security findings detected in the inspected scope.')

    // Metric files checked displays Legacy
    await expect(page.getByTestId('metric-files-checked')).toContainText('Legacy')

    // 2. Zero-scope inspection (filesInspected: 0): must NOT claim clean scope
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createZeroInspectedSecurityReport(),
      })
    })

    await page.getByTestId('back-to-home').click()
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/zero-scope-repo')
    await page.getByTestId('repo-submit-btn').click()

    await expect(page.getByTestId('repo-results')).toBeVisible()
    await page.getByTestId('tab-security').click()

    await expect(page.getByTestId('zero-scope-security-notice')).toBeVisible()
    await expect(page.getByTestId('no-security-findings')).not.toBeVisible()
    const zeroScopeBodyText = await page.innerText('body')
    expect(zeroScopeBodyText).not.toContain('No security findings detected in the inspected scope.')
  })

  test('website form mode remains intact and fully functional', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mode-website-btn')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('website-form')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Website URL', exact: true })).toBeVisible()
    await expect(page.getByTestId('website-form').getByRole('button', { name: 'Roast My App', exact: true })).toBeVisible()
  })

  // Responsive geometry: no horizontal overflow at 360, 390, 768, 1024, 1440
  for (const vp of VIEWPORTS) {
    test(`responsive layout without horizontal overflow at ${vp.width}px (${vp.name})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })

      await page.route('**/api/repository/roast', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: createReportWithSecurity(),
        })
      })

      await page.goto('/')
      await page.getByTestId('mode-repository-btn').click()
      await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
      await page.getByTestId('repo-submit-btn').click()

      await expect(page.getByTestId('repo-results')).toBeVisible()

      // Switch to security tab
      await page.getByTestId('tab-security').click()
      await expect(page.getByTestId('repo-security-panel')).toBeVisible()

      // Check document horizontal overflow: scrollWidth <= clientWidth + 1
      const overflow = await page.evaluate(() => {
        return {
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          bodyScroll: document.body.scrollWidth,
          bodyClient: document.body.clientWidth,
        }
      })

      expect(overflow.docScroll, `viewport ${vp.width}px doc scrollWidth`).toBeLessThanOrEqual(overflow.docClient + 1)
      expect(overflow.bodyScroll, `viewport ${vp.width}px body scrollWidth`).toBeLessThanOrEqual(overflow.bodyClient + 1)
      await page.getByTestId('repo-security-panel').screenshot({ path: testInfo.outputPath(`security-focus-${vp.width}.png`) })
    })
  }
})
