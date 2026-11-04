import { test, expect } from '@playwright/test'
import { makeRepoReport } from '../tests/fixtures/report'
import { reportSchema, type RepositoryReport } from '../lib/types/report'

const RAW_FIXTURE_SECRET = 'ghp_012345678901234567890123456789012345'

function makeSecurityRemediationReport(): RepositoryReport {
  const base = makeRepoReport()
  const sha = 'aabbccd00112233445566778899aabbccddeeff0'

  const secFinding = {
    id: 'sec-credential-leak',
    category: 'Security' as const,
    title: 'Hardcoded secret token detected',
    description: `Token observed: ${RAW_FIXTURE_SECRET}`,
    severity: 'high' as const,
    confidence: 'high' as const,
    evidence: [`const token = "${RAW_FIXTURE_SECRET}"`],
    location: 'src/lib/config.ts:12',
    recommendation: 'Rotate the secret token and move to environment variables.',
    source: 'repository' as const,
    verification: 'verified' as const,
    security: {
      category: 'Secret Leak',
      ruleId: 'github-pat',
      ruleVersion: '1.0.0',
      commitSha: sha,
      filePath: 'src/lib/config.ts',
      lineStart: 12,
      lineEnd: 12,
      observation: `Raw secret observed: ${RAW_FIXTURE_SECRET}`,
      possibleImpact: 'Account compromise',
      coverageLimitations: 'Standard inspection scope',
    },
  }

  const raw = {
    ...base,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      sha,
      securityFindings: [secFinding],
      findings: [
        {
          id: 'repo-quality-only',
          category: 'Code Quality',
          title: 'Unused import in src/index.ts:1',
          description: 'Import is not referenced.',
          severity: 'low',
          confidence: 'high',
          evidence: ['import { foo } from "./foo"'],
          location: 'src/index.ts:1',
          recommendation: 'Remove unused import.',
          source: 'repository',
          verification: 'verified',
        },
      ],
      totalSecurityFindings: 1,
      omittedSecurityFindings: 0,
      securityCoverage: {
        filesDiscovered: 20,
        filesInspected: 10,
        bytesInspected: 10240,
        caps: {
          maxFiles: 50,
          maxBytesPerFile: 65536,
          maxBytesTotal: 262144,
          timeoutMs: 5000,
        },
        statusCounts: {
          inspected: 10,
          'filename-only': 0,
          'skipped-policy': 10,
          'skipped-budget': 0,
          oversized: 0,
          unavailable: 0,
        },
        fileStatuses: [{ path: 'src/lib/config.ts', status: 'inspected', inspectedBytes: 500 }],
        treeTruncated: false,
        contentTruncated: false,
        deadlineExceeded: false,
        budgetExceeded: false,
        unknownRemaining: false,
      },
    },
  }

  return reportSchema.parse(raw) as RepositoryReport
}

function makeBatchRepoReport(): RepositoryReport {
  const base = makeRepoReport()
  const findings = Array.from({ length: 65 }, (_, i) => ({
    id: `batch-finding-${i}`,
    category: 'Code Quality' as const,
    title: `Quality issue number ${i}`,
    description: `Description for issue ${i}`,
    severity: 'low' as const,
    confidence: 'high' as const,
    evidence: [`evidence-${i}`],
    location: `src/file-${i}.ts:1`,
    recommendation: `Fix issue ${i}`,
    source: 'repository' as const,
    verification: 'verified' as const,
  }))

  const raw = {
    ...base,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      findings,
      securityFindings: [],
      totalSecurityFindings: 0,
      omittedSecurityFindings: 0,
    },
  }

  return reportSchema.parse(raw) as RepositoryReport
}

test.describe('Repository Human-Controlled Remediation & Selection Bounding', () => {
  test('security-only finding triggers 9 remediation steps without exposing raw secret fixture', async ({ page }) => {
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: makeSecurityRemediationReport(),
      })
    })

    await page.goto('/')

    // Switch to GitHub repository mode
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
    await page.getByTestId('repo-submit-btn').click()

    await expect(page.getByTestId('repo-results')).toBeVisible()

    // Navigate to Fix My Shame
    await page.getByTestId('repo-fix-my-shame-btn').click()
    await expect(page.getByTestId('repo-fixes-view')).toBeVisible()

    // Prompt preview assertions
    const preview = page.locator('pre')
    await expect(preview).toBeVisible()

    // 1. Selected finding ID present
    await expect(preview).toContainText('sec-credential-leak')

    // 2. 9 remediation steps present
    await expect(preview).toContainText('Human-controlled remediation workflow (9 required steps):')
    await expect(preview).toContainText('1. Confirm without reproducing values')
    await expect(preview).toContainText('Appropriate server secret management')
    await expect(preview).toContainText('Remediation prohibitions and constraints:')

    // 3. Raw fixture secret is NOT present anywhere in the preview or page fixes view
    await expect(preview).not.toContainText(RAW_FIXTURE_SECRET)
    const fixesViewText = await page.getByTestId('repo-fixes-view').innerText()
    expect(fixesViewText).not.toContain(RAW_FIXTURE_SECRET)
  })

  test('batch report with >60 findings caps selection and prevents latent tail auto-shift', async ({ page }) => {
    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: makeBatchRepoReport(),
      })
    })

    await page.goto('/')

    // Switch to GitHub repository mode
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
    await page.getByTestId('repo-submit-btn').click()

    await expect(page.getByTestId('repo-results')).toBeVisible()

    // Navigate to Fix My Shame
    await page.getByTestId('repo-fix-my-shame-btn').click()
    await expect(page.getByTestId('repo-fixes-view')).toBeVisible()

    // Counter consistent with 60 cap
    const statusText = page.locator('span[role="status"]').first()
    await expect(statusText).toContainText('60 of 65 selected (max 60 per prompt)')

    // 61st item is not checked
    const cards = page.locator('.fix-card')
    await expect(cards.nth(60)).toHaveAttribute('data-selected', 'false')

    // Uncheck first item
    await cards.first().click()
    await expect(statusText).toContainText('59 of 65 selected (max 60 per prompt)')

    // 61st item remains unchecked (no latent enqueue)
    await expect(cards.nth(60)).toHaveAttribute('data-selected', 'false')

    // Select all re-clamps to 60
    await page.getByRole('button', { name: 'Select all', exact: true }).click()
    await expect(statusText).toContainText('60 of 65 selected (max 60 per prompt)')
  })
})
