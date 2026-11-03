import { test, expect } from '@playwright/test'
import { makeRepoReport } from '../tests/fixtures/report'

test('repository judge mode toggle, validation, inspection results, and agent fixes', async ({ page }) => {
  let requestCount = 0
  let submittedPayload: Record<string, string> = {}

  await page.route('**/api/repository/roast', async (route) => {
    requestCount++
    submittedPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: makeRepoReport(),
    })
  })

  await page.goto('/')

  // Verify initial website roast mode
  await expect(page.getByTestId('mode-website-btn')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('website-form')).toBeVisible()

  // Switch to GitHub repository mode via mode button
  await page.getByTestId('mode-repository-btn').click()
  await expect(page.getByTestId('mode-repository-btn')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('repository-form')).toBeVisible()

  // Validation: empty submit
  const input = page.getByTestId('repo-url-input')
  await input.press('Enter')
  await expect(page.locator('#roast-error')).toContainText('Enter a GitHub repository URL first')
  expect(requestCount).toBe(0)

  // Validation: invalid repo name
  await input.fill('not-a-valid-github-url-@@@')
  await input.press('Enter')
  await expect(page.locator('#roast-error')).toContainText('Enter a valid public GitHub repository URL')
  expect(requestCount).toBe(0)

  // Submit valid GitHub repo
  await input.fill('github.com/acme-corp/cool-app')
  await page.getByTestId('repo-submit-btn').click()

  // Verify request
  expect(requestCount).toBe(1)
  expect(submittedPayload.url).toBe('github.com/acme-corp/cool-app')
  expect(submittedPayload.intensity).toBe('No Mercy')

  // Verify Results View
  await expect(page.getByTestId('repo-results')).toBeVisible()
  await expect(page.getByText('acme-corp/cool-app')).toBeVisible()
  await expect(page.getByText('The Catch-Block Magician')).toBeVisible()
  await expect(page.getByText('Swallowing errors like they are free mints at a diner.')).toBeVisible()
  await expect(page.getByTestId('repo-evidence-panel')).toBeVisible()

  // Verify Fix My Shame transition
  await page.getByTestId('repo-fix-my-shame-btn').click()
  await expect(page.getByTestId('repo-fixes-view')).toBeVisible()
  await expect(page.locator('pre')).toContainText('VibeRoast repository implementation brief')
  await expect(page.locator('pre')).toContainText('aabbccd')

  // Verify Markdown prompt download
  const mdDownloadEvent = page.waitForEvent('download')
  await page.getByTestId('download-md-btn').click()
  const mdDownload = await mdDownloadEvent
  expect(mdDownload.suggestedFilename()).toBe('viberoast-acme-corp-cool-app-codex.md')
  const mdStream = await mdDownload.createReadStream()
  expect(mdStream).not.toBeNull()
  const mdChunks: Buffer[] = []
  for await (const chunk of mdStream!) mdChunks.push(Buffer.from(chunk))
  const markdownText = Buffer.concat(mdChunks).toString('utf8')
  expect(markdownText).toContain('VibeRoast repository implementation brief')
  expect(markdownText).toContain('acme-corp/cool-app')

  // Back to results
  await page.getByTestId('back-to-results').click()
  await expect(page.getByTestId('repo-results')).toBeVisible()

  // Verify square PNG terminal card download
  const squareDownloadEvent = page.waitForEvent('download')
  await page.getByTestId('download-square-png').click()
  const squareDownload = await squareDownloadEvent
  expect(squareDownload.suggestedFilename()).toBe('viberoast-square.png')
  const squareStream = await squareDownload.createReadStream()
  expect(squareStream).not.toBeNull()
  const squareChunks: Buffer[] = []
  for await (const chunk of squareStream!) squareChunks.push(Buffer.from(chunk))
  const squarePng = Buffer.concat(squareChunks)
  expect(squarePng.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

  // Verify landscape PNG terminal card download
  const landscapeDownloadEvent = page.waitForEvent('download')
  await page.getByTestId('download-landscape-png').click()
  const landscapeDownload = await landscapeDownloadEvent
  expect(landscapeDownload.suggestedFilename()).toBe('viberoast-landscape.png')
  const landscapeStream = await landscapeDownload.createReadStream()
  expect(landscapeStream).not.toBeNull()
  const landscapeChunks: Buffer[] = []
  for await (const chunk of landscapeStream!) landscapeChunks.push(Buffer.from(chunk))
  const landscapePng = Buffer.concat(landscapeChunks)
  expect(landscapePng.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
})
