import { test, expect } from '@playwright/test'
import { makeRepoReport } from '../tests/fixtures/report'

const VIEWPORTS = [
  { width: 360, height: 800, name: '360-mobile-small' },
  { width: 390, height: 844, name: '390-mobile-standard' },
  { width: 768, height: 1024, name: '768-tablet' },
  { width: 1024, height: 768, name: '1024-desktop-small' },
  { width: 1440, height: 900, name: '1440-desktop-wide' },
]

const LONG_FILE_PATH =
  'packages/deeply/nested/submodules/enterprise/authentication/providers/oauth2/protocols/oidc/handlers/v2/production/internal/validation/security-token-verifier-and-claims-extractor-with-extended-signature-checks-specification.ts' // 231 chars (>200)

function createTestRepoReport() {
  const base = makeRepoReport()
  return {
    ...base,
    // ponytail: local 15-minute lease prevents expiry banner altering viewport geometry; upgrade if test runner exceeds 15m.
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    repoScan: {
      ...base.repoScan,
      coverage: {
        ...base.repoScan.coverage,
        filesDiscovered: 2000,
        filesInspected: 12,
        bytesInspected: 262144, // 256 KiB budget limit
        treeTruncated: true,
        contentTruncated: true,
      },
      selectedFiles: [
        { path: 'src/index.ts', size: 120, truncated: false },
        { path: LONG_FILE_PATH, size: 262024, truncated: true },
      ],
      tree: [
        { path: 'src/index.ts', type: 'file' as const, size: 120 },
        { path: LONG_FILE_PATH, type: 'file' as const, size: 262024 },
      ],
    },
  }
}

function getTransformAngle(transform: string): number {
  if (!transform || transform === 'none') return 0
  if (transform.startsWith('matrix3d(')) {
    return Number.NaN
  }
  const match = transform.match(/^matrix\(([^)]+)\)$/)
  if (!match) return Number.NaN
  const parts = match[1].split(',').map((v) => parseFloat(v.trim()))
  if (parts.length < 4) return Number.NaN
  const [a, b] = parts
  return Math.round(Math.atan2(b, a) * (180 / Math.PI) * 100) / 100
}

test.describe('Git Inspect straight alignment & responsive geometry', () => {
  for (const vp of VIEWPORTS) {
    test(`geometry and alignment at ${vp.width}px (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })

      await page.route('**/api/repository/roast', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: createTestRepoReport(),
        })
      })

      await page.goto('/')

      // Switch to repository judge
      await page.getByTestId('mode-repository-btn').click()
      await expect(page.getByTestId('repository-form')).toBeVisible()

      await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
      await page.getByTestId('repo-submit-btn').click()

      const results = page.getByTestId('repo-results')
      await expect(results).toBeVisible()

      const panel = page.getByTestId('repo-evidence-panel')
      await expect(panel).toBeVisible()

      const terminal = panel.locator('.terminal-preview')
      await expect(terminal).toBeVisible()

      // 1. Transform / Rotation / Skew check on ancestor chain: terminal -> panel -> results-grid -> repo-results
      const chainTransforms = await page.evaluate(() => {
        const panelEl = document.querySelector('[data-testid="repo-evidence-panel"]') as HTMLElement | null
        const terminalEl = panelEl?.querySelector('.terminal-preview') as HTMLElement | null
        const resultsGridEl = panelEl?.closest('.results-grid') as HTMLElement | null
        const repoResultsEl = document.querySelector('[data-testid="repo-results"]') as HTMLElement | null

        const elements = [
          { name: 'terminal', el: terminalEl },
          { name: 'panel', el: panelEl },
          { name: 'results-grid', el: resultsGridEl },
          { name: 'repo-results', el: repoResultsEl },
        ]

        return elements.flatMap(({ name, el }) => {
          if (!el) {
            return [
              {
                name,
                pseudo: 'element',
                transform: 'missing',
                a: 0,
                b: 1,
                c: 1,
                d: 0,
                e: 0,
                f: 0,
                is2D: false,
                isIdentity: false,
              },
            ]
          }
          return ([null, '::before', '::after'] as const).map((pseudo) => {
            const raw = window.getComputedStyle(el, pseudo).transform
            const isNone = !raw || raw === 'none'
            let matrix: DOMMatrixReadOnly
            try {
              matrix = new DOMMatrixReadOnly(isNone ? undefined : raw)
            } catch {
              return {
                name,
                pseudo: pseudo ?? 'element',
                transform: raw,
                a: 0,
                b: 0,
                c: 0,
                d: 0,
                e: 0,
                f: 0,
                is2D: false,
                isIdentity: false,
              }
            }
            return {
              name,
              pseudo: pseudo ?? 'element',
              transform: raw,
              a: matrix.a,
              b: matrix.b,
              c: matrix.c,
              d: matrix.d,
              e: matrix.e,
              f: matrix.f,
              is2D: matrix.is2D,
              isIdentity: matrix.isIdentity,
            }
          })
        })
      })

      for (const t of chainTransforms) {
        expect(t.transform, `${t.name} (${t.pseudo}) must not be missing`).not.toBe('missing')
        expect(t.is2D, `${t.name} (${t.pseudo}) must be 2D transform`).toBe(true)
        expect(t.a, `${t.name} (${t.pseudo}) matrix.a`).toBe(1)
        expect(t.b, `${t.name} (${t.pseudo}) matrix.b`).toBe(0)
        expect(t.c, `${t.name} (${t.pseudo}) matrix.c`).toBe(0)
        expect(t.d, `${t.name} (${t.pseudo}) matrix.d`).toBe(1)
        expect(t.e, `${t.name} (${t.pseudo}) matrix.e (translateX)`).toBe(0)
        expect(t.f, `${t.name} (${t.pseudo}) matrix.f (translateY)`).toBe(0)
        expect(t.isIdentity, `${t.name} (${t.pseudo}) must be identity`).toBe(true)
        expect(getTransformAngle(t.transform), `${t.name} (${t.pseudo}) angle`).toBe(0)
      }

      // 2. Grid alignment: Desktop aligned tops vs Mobile/Tablet stacked
      const rects = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="repo-evidence-panel"]') as HTMLElement | null
        const v = document.querySelector('[data-testid="repo-verdict"]') as HTMLElement | null
        if (!p || !v) return null
        const pRect = p.getBoundingClientRect()
        const vRect = v.getBoundingClientRect()
        return {
          panel: { x: pRect.x, y: pRect.y, width: pRect.width, height: pRect.height },
          verdict: { x: vRect.x, y: vRect.y, width: vRect.width, height: vRect.height },
        }
      })

      if (rects) {
        if (vp.width >= 1024) {
          // Desktop: side-by-side, aligned tops (within 3px tolerance)
          expect(Math.abs(rects.panel.y - rects.verdict.y)).toBeLessThanOrEqual(3)
          expect(rects.verdict.x).toBeGreaterThan(rects.panel.x)
        } else {
          // Mobile/Tablet: stacked vertically (one above the other)
          const stacked =
            rects.verdict.y >= rects.panel.y + rects.panel.height - 2 ||
            rects.panel.y >= rects.verdict.y + rects.verdict.height - 2
          expect(stacked).toBe(true)
        }
      }

      // 3. Dropdown keyboard interaction, overflow, and local clipping assertions
      const toggleBtn = panel.locator('button.outline-btn')
      await expect(toggleBtn).toBeVisible()
      await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')

      // Keyboard trigger: Space to open
      await toggleBtn.focus()
      await page.keyboard.press('Space')
      await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')

      // Internal chevron must rotate when open (~180deg)
      const chevron = toggleBtn.locator('svg.lucide-chevron-down')
      await expect.poll(async () => {
        const tr = await chevron.evaluate((el) => window.getComputedStyle(el).transform)
        return Math.abs(getTransformAngle(tr))
      }).toBe(180)

      // Inspected files list visible
      const list = panel.locator('#repo-inspected-files-list')
      await expect(list).toBeVisible()

      // Long file path (200+ chars) rendered
      const longLink = list.locator('a[href*="security-token-verifier"]')
      await expect(longLink).toBeVisible()

      // Links focusable after opening
      await page.keyboard.press('Tab')
      const firstLink = list.locator('a').first()
      await expect(firstLink).toBeFocused()
      await longLink.focus()
      await expect(longLink).toBeFocused()

      // Local clipping: scrollWidth <= clientWidth (tolerance 1px) for panel, terminal, and list
      const localOverflow = await page.evaluate(() => {
        const panelEl = document.querySelector('[data-testid="repo-evidence-panel"]') as HTMLElement | null
        const terminalEl = panelEl?.querySelector('.terminal-preview') as HTMLElement | null
        const listEl = document.getElementById('repo-inspected-files-list') as HTMLElement | null
        return {
          panel: panelEl ? { scrollWidth: panelEl.scrollWidth, clientWidth: panelEl.clientWidth } : null,
          terminal: terminalEl ? { scrollWidth: terminalEl.scrollWidth, clientWidth: terminalEl.clientWidth } : null,
          list: listEl ? { scrollWidth: listEl.scrollWidth, clientWidth: listEl.clientWidth } : null,
        }
      })
      expect(localOverflow.panel, 'panel element must exist').not.toBeNull()
      expect(localOverflow.terminal, 'terminal element must exist').not.toBeNull()
      expect(localOverflow.list, 'list element must exist').not.toBeNull()

      expect(
        localOverflow.panel!.scrollWidth,
        `panel scrollWidth (${localOverflow.panel!.scrollWidth}) <= clientWidth (${localOverflow.panel!.clientWidth}) + 1`
      ).toBeLessThanOrEqual(localOverflow.panel!.clientWidth + 1)

      expect(
        localOverflow.terminal!.scrollWidth,
        `terminal scrollWidth (${localOverflow.terminal!.scrollWidth}) <= clientWidth (${localOverflow.terminal!.clientWidth}) + 1`
      ).toBeLessThanOrEqual(localOverflow.terminal!.clientWidth + 1)

      expect(
        localOverflow.list!.scrollWidth,
        `list scrollWidth (${localOverflow.list!.scrollWidth}) <= clientWidth (${localOverflow.list!.clientWidth}) + 1`
      ).toBeLessThanOrEqual(localOverflow.list!.clientWidth + 1)

      // Document-level overflow check
      const docScroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(docScroll.scrollWidth).toBeLessThanOrEqual(vp.width + 1)

      // Bounds check: inside viewport and container (tolerance 1px, shadow tolerance 5px)
      // Geometry assertions do not require top of viewport when panel is below fold
      const bounds = await page.evaluate(() => {
        const container = (document.querySelector('.container') ||
          document.querySelector('[data-testid="repo-results"]')) as HTMLElement | null
        const panelEl = document.querySelector('[data-testid="repo-evidence-panel"]') as HTMLElement | null
        const terminalEl = panelEl?.querySelector('.terminal-preview') as HTMLElement | null
        const listEl = document.getElementById('repo-inspected-files-list') as HTMLElement | null
        const links = Array.from(listEl?.querySelectorAll('a') ?? []) as HTMLElement[]

        const cRect = container?.getBoundingClientRect()
        const tRect = terminalEl?.getBoundingClientRect()
        const lRect = listEl?.getBoundingClientRect()
        const linkRects = links.map((a) => a.getBoundingClientRect())

        return {
          container: cRect ? { left: cRect.left, right: cRect.right, width: cRect.width } : null,
          terminal: tRect ? { left: tRect.left, right: tRect.right, width: tRect.width } : null,
          list: lRect ? { left: lRect.left, right: lRect.right, width: lRect.width } : null,
          links: linkRects.map((a) => ({ left: a.left, right: a.right, width: a.width })),
        }
      })

      expect(bounds.terminal, 'terminal bounds must exist').not.toBeNull()
      expect(bounds.list, 'list bounds must exist').not.toBeNull()
      expect(bounds.links.length, 'inspected file links must exist').toBeGreaterThan(0)

      // Viewport bounds
      expect(bounds.terminal!.left).toBeGreaterThanOrEqual(-1)
      expect(bounds.terminal!.right).toBeLessThanOrEqual(vp.width + 1)

      expect(bounds.list!.left).toBeGreaterThanOrEqual(-1)
      expect(bounds.list!.right).toBeLessThanOrEqual(vp.width + 1)

      for (let i = 0; i < bounds.links.length; i++) {
        expect(bounds.links[i].left).toBeGreaterThanOrEqual(-1)
        expect(bounds.links[i].right).toBeLessThanOrEqual(vp.width + 1)
      }

      // Container bounds (margin/shadow allowed)
      if (bounds.container) {
        expect(bounds.terminal!.left).toBeGreaterThanOrEqual(bounds.container.left - 1)
        expect(bounds.terminal!.right).toBeLessThanOrEqual(bounds.container.right + 5)

        expect(bounds.list!.left).toBeGreaterThanOrEqual(bounds.terminal!.left - 1)
        expect(bounds.list!.right).toBeLessThanOrEqual(bounds.terminal!.right + 1)

        for (let i = 0; i < bounds.links.length; i++) {
          expect(bounds.links[i].left).toBeGreaterThanOrEqual(bounds.list!.left - 1)
          expect(bounds.links[i].right).toBeLessThanOrEqual(bounds.list!.right + 1)
        }
      }

      // Keyboard close: Enter to close
      await toggleBtn.focus()
      await page.keyboard.press('Enter')
      await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
      await expect(list).toBeHidden()

      // Chevron returns to 0deg
      await expect.poll(async () => {
        const tr = await chevron.evaluate((el) => window.getComputedStyle(el).transform)
        return getTransformAngle(tr)
      }).toBe(0)

      // Scroll into view for screenshots
      await panel.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `test-results/repo-evidence-${vp.width}.png`,
        fullPage: false,
      })
      await terminal.screenshot({
        path: `test-results/repo-terminal-${vp.width}.png`,
      })
    })
  }

  test('dropdown keyboard accessibility and chevron rotation', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })

    await page.route('**/api/repository/roast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: createTestRepoReport(),
      })
    })

    await page.goto('/')
    await page.getByTestId('mode-repository-btn').click()
    await page.getByTestId('repo-url-input').fill('github.com/acme-corp/cool-app')
    await page.getByTestId('repo-submit-btn').click()

    const panel = page.getByTestId('repo-evidence-panel')
    await expect(panel).toBeVisible()

    const toggleBtn = panel.locator('button.outline-btn')
    await expect(toggleBtn).toBeVisible()
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')

    // Keyboard trigger: Space to open
    await toggleBtn.focus()
    await page.keyboard.press('Space')
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')

    // Inspect files list visible
    const list = panel.locator('#repo-inspected-files-list')
    await expect(list).toBeVisible()
    const longLink = list.locator('a[href*="security-token-verifier"]')
    await expect(longLink).toBeVisible()

    // Links focusable after opening
    await page.keyboard.press('Tab')
    const firstLink = list.locator('a').first()
    await expect(firstLink).toBeFocused()

    // Internal chevron must rotate when open (~180deg)
    const chevron = panel.locator('svg.lucide-chevron-down')
    await expect.poll(async () => {
      const chevronTransform = await chevron.evaluate((el) => {
        return window.getComputedStyle(el).transform
      })
      return Math.abs(getTransformAngle(chevronTransform))
    }).toBe(180)

    // Keyboard trigger: Enter to close
    await toggleBtn.focus()
    await page.keyboard.press('Enter')
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(list).toBeHidden()

    // Internal chevron returns to 0deg
    await expect.poll(async () => {
      const chevronTransform = await chevron.evaluate((el) => {
        return window.getComputedStyle(el).transform
      })
      return getTransformAngle(chevronTransform)
    }).toBe(0)

    // Keyboard trigger: Enter to open
    await page.keyboard.press('Enter')
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(list).toBeVisible()

    // Keyboard trigger: Space to close
    await page.keyboard.press('Space')
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(list).toBeHidden()

    // Chevron returns to 0deg
    await expect.poll(async () => {
      const chevronTransform = await chevron.evaluate((el) => {
        return window.getComputedStyle(el).transform
      })
      return getTransformAngle(chevronTransform)
    }).toBe(0)
  })
})
