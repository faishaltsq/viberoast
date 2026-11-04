import { test, expect } from '@playwright/test'
import { setAuthenticatedCookie } from './support/auth-fixtures'
import { DETERMINISTIC_TOKENS, MOCK_GITHUB_USER } from './support/mock-auth'

test.describe('SourceSanity Hall Gallery & Case File UI', () => {
  test.beforeEach(async ({ context }) => {
    await setAuthenticatedCookie(context, {
      user: MOCK_GITHUB_USER,
      token: DETERMINISTIC_TOKENS.GITHUB,
    })
  })

  test('displays 4 shame cases and 2 vibes cases in curated collection button group', async ({ page }) => {
    await page.goto('/hall')

    // Collection controls using role="group" and button aria-pressed
    const collectionGroup = page.getByRole('group', { name: /Case file collections|Koleksi berkas kasus/i })
    await expect(collectionGroup).toBeVisible()

    // Initial collection is Shame: 4 items
    const shameBtn = collectionGroup.getByRole('button', { name: /Hall of Shame/i })
    const vibesBtn = collectionGroup.getByRole('button', { name: /Hall of Vibes/i })

    await expect(shameBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(vibesBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('status')).toContainText('4 cases displayed')

    // Every card clearly displays fictional example notice
    const cards = page.locator('#hall-case-grid article')
    await expect(cards).toHaveCount(4)
    const fictionalBadges = page.locator('#hall-case-grid').getByText('FICTIONAL EXAMPLE', { exact: true })
    await expect(fictionalBadges).toHaveCount(4)

    // Verify verified shame data fixtures: Registration Labyrinth (91), Project Velvet Trap (88), Monolith Matrix (84), Direct To Production Fleet (78)
    await expect(page.getByText('Registration Labyrinth')).toBeVisible()
    await expect(page.locator('#hall-case-grid').getByText('91')).toBeVisible()
    await expect(page.getByText('Project Velvet Trap')).toBeVisible()
    await expect(page.locator('#hall-case-grid').getByText('88')).toBeVisible()
    await expect(page.getByText('Monolith Matrix')).toBeVisible()
    await expect(page.locator('#hall-case-grid').getByText('84')).toBeVisible()
    await expect(page.getByText('Direct To Production Fleet')).toBeVisible()
    await expect(page.locator('#hall-case-grid').getByText('78')).toBeVisible()

    // Switch to Vibes collection
    await vibesBtn.click()
    await expect(vibesBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(shameBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('status')).toContainText('2 cases displayed')
    await expect(page.locator('#hall-case-grid article')).toHaveCount(2)

    // Verify verified vibes data fixtures: Clean Canopy Docs (12), Prism Core Utilities (18)
    await expect(page.getByText('Clean Canopy Docs')).toBeVisible()
    await expect(page.locator('#hall-case-grid').getByText('12')).toBeVisible()
    await expect(page.getByText('Prism Core Utilities')).toBeVisible()
    await expect(page.locator('#hall-case-grid').getByText('18')).toBeVisible()
  })

  test('search filters case files and handles empty results with filter reset', async ({ page }) => {
    await page.goto('/hall')

    const searchInput = page.getByRole('textbox', { name: /Search case files|Cari berkas kasus/i })
    await searchInput.fill('Newsletter')

    await expect(page.getByRole('status')).toContainText('1 case displayed')
    await expect(page.getByRole('heading', { name: /The Escapeless Newsletter Overlay/i })).toBeVisible()

    // Non-existent search
    await searchInput.fill('nonexistent-query-xyz')
    await expect(page.getByRole('heading', { name: /No case files match|Tidak ada kasus yang cocok/i })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('0 cases displayed')

    // Reset filters restores all shame cases
    await page.getByRole('button', { name: /Reset Filters|Atur Ulang Filter/i }).first().click()
    await expect(searchInput).toHaveValue('')
    await expect(page.getByRole('status')).toContainText('4 cases displayed')
  })

  test('filters by target kind and category', async ({ page }) => {
    await page.goto('/hall')

    // Filter by target kind: Website
    const targetSelect = page.getByRole('combobox', { name: /Filter by target kind|Filter berdasarkan jenis target/i })
    await targetSelect.selectOption('website')
    await expect(page.getByRole('status')).toContainText('2 cases displayed')

    // Filter by target kind: Repository
    await targetSelect.selectOption('repository')
    await expect(page.getByRole('status')).toContainText('2 cases displayed')

    // Reset to all
    await targetSelect.selectOption('all')
    await expect(page.getByRole('status')).toContainText('4 cases displayed')
  })

  test('category filter selection persists across language switch', async ({ page }) => {
    await page.goto('/hall?lang=en')

    const categorySelect = page.getByRole('combobox', { name: /Filter by category|Filter berdasarkan kategori/i })
    await categorySelect.selectOption('Functionality & UX')

    await expect(page.getByRole('status')).toContainText('1 case displayed')
    await expect(page.getByText('Registration Labyrinth')).toBeVisible()

    // Toggle language to Indonesian via top nav
    const langBtn = page.getByRole('banner').getByRole('button', { name: /Switch language to Indonesian|Ganti bahasa/i })
    await langBtn.click()

    // Filter persists: Indonesian status count, stable selection, and Indonesian card alias
    await expect(page.getByRole('status')).toContainText('1 kasus ditampilkan')
    await expect(page.getByText('Labirin Pendaftaran')).toBeVisible()
    await expect(categorySelect).toHaveValue('Functionality & UX')
    await expect(categorySelect.locator('option:checked')).toContainText('Fungsionalitas & Pengalaman Pengguna')
  })

  test('sorts cases by heat descending, heat ascending, and title A-Z', async ({ page }) => {
    await page.goto('/hall')

    const sortSelect = page.getByRole('combobox', { name: /Sort case files|Urutkan berkas kasus/i })
    const cards = page.locator('#hall-case-grid article')

    // Default: heat descending (91 first, 78 last)
    await expect(cards.first().locator('h2')).toHaveText('The Vanishing Field Validation Void')
    await expect(cards.first().getByText('91')).toBeVisible()
    await expect(cards.nth(1).locator('h2')).toHaveText('The Escapeless Newsletter Overlay')
    await expect(cards.nth(1).getByText('88')).toBeVisible()
    await expect(cards.nth(2).locator('h2')).toHaveText('Circular Dependencies and Orphaned Packages')
    await expect(cards.nth(2).getByText('84')).toBeVisible()
    await expect(cards.nth(3).locator('h2')).toHaveText('Branchless Commits and Bypassed Automation')
    await expect(cards.nth(3).getByText('78')).toBeVisible()

    // Sort heat ascending (78 first, 91 last)
    await sortSelect.selectOption('heat-asc')
    await expect(cards.first().locator('h2')).toHaveText('Branchless Commits and Bypassed Automation')
    await expect(cards.first().getByText('78')).toBeVisible()
    await expect(cards.nth(1).locator('h2')).toHaveText('Circular Dependencies and Orphaned Packages')
    await expect(cards.nth(1).getByText('84')).toBeVisible()
    await expect(cards.nth(2).locator('h2')).toHaveText('The Escapeless Newsletter Overlay')
    await expect(cards.nth(2).getByText('88')).toBeVisible()
    await expect(cards.nth(3).locator('h2')).toHaveText('The Vanishing Field Validation Void')
    await expect(cards.nth(3).getByText('91')).toBeVisible()

    // Sort title A-Z (Branchless, Circular Dependencies, The Escapeless, The Vanishing)
    await sortSelect.selectOption('title-asc')
    await expect(cards.first().locator('h2')).toHaveText('Branchless Commits and Bypassed Automation')
    await expect(cards.nth(1).locator('h2')).toHaveText('Circular Dependencies and Orphaned Packages')
    await expect(cards.nth(2).locator('h2')).toHaveText('The Escapeless Newsletter Overlay')
    await expect(cards.nth(3).locator('h2')).toHaveText('The Vanishing Field Validation Void')
  })

  test('case file modal opens, contains disclosures, traps focus, and restores focus on Escape', async ({ page }) => {
    await page.goto('/hall')

    // Setup initial search and filter state to assert restoration
    const searchInput = page.getByRole('textbox', { name: /Search case files|Cari berkas kasus/i })
    await searchInput.fill('Newsletter')
    const categorySelect = page.getByRole('combobox', { name: /Filter by category|Filter berdasarkan kategori/i })
    await categorySelect.selectOption('User Experience & Accessibility')
    await expect(page.getByRole('status')).toContainText('1 case displayed')

    // Click case trigger button
    const firstCardTrigger = page.locator('#hall-case-grid article button').first()
    await firstCardTrigger.click()

    // Modal is visible
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Modal eyebrow: BRO CODE'S CASE FILE and Anonymous Case
    await expect(dialog.getByText(/BRO CODE'S CASE FILE|BERKAS KASUS BRO CODE/i)).toBeVisible()
    await expect(dialog.getByText(/Anonymous Case|Kasus Anonim/i)).toBeVisible()

    // Title and description linked to dialog
    await expect(dialog.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(dialog.getByText(/SYNTHETIC AUDIT VERDICT|PUTUSAN AUDIT FIKTIF/i)).toBeVisible()
    await expect(dialog.getByText(/Illustrative Comedy Heat|Panas Komedi Ilustratif/i)).toBeVisible()
    await expect(dialog.getByText(/not a security audit|bukan audit keamanan/i)).toBeVisible()

    // Section headings: The Receipts, Keep the Good Parts, Analysis Scope
    await expect(dialog.getByRole('heading', { name: /The Receipts|Bukti Temuan/i })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /Keep the Good Parts|Pertahankan yang Bagus/i })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /Analysis Scope|Cakupan Analisis/i })).toBeVisible()

    // Body scroll locked
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow)
    expect(bodyOverflow).toBe('hidden')

    // Actually toggle summary via keyboard Enter and assert open/closed state
    const firstDetails = dialog.locator('details').first()
    const firstSummary = firstDetails.locator('summary')
    // First finding disclosure starts open by default (open={index === 0})
    await expect(firstDetails).toHaveAttribute('open', '')

    await firstSummary.focus()
    // Press Enter to toggle closed
    await page.keyboard.press('Enter')
    await expect(firstDetails).not.toHaveAttribute('open', '')

    // Press Enter to toggle open again
    await page.keyboard.press('Enter')
    await expect(firstDetails).toHaveAttribute('open', '')

    // Focus trap via ShiftTab/Tab cycle and background cannot focus
    // Tab cycling within dialog
    const focusableInDialog = dialog.locator('button, [href], input, select, textarea, details, summary, [tabindex]:not([tabindex="-1"])')
    const count = await focusableInDialog.count()
    expect(count).toBeGreaterThan(0)

    // Verify first and last focusable elements in dialog
    const firstFocusable = dialog.getByRole('button', { name: /Close dialog|Tutup dialog/i })
    await firstFocusable.focus()
    expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true)

    // Shift+Tab from close button (top) wraps or stays inside dialog
    await page.keyboard.press('Shift+Tab')
    const activeAfterShiftTab = await page.evaluate(() => {
      const el = document.activeElement
      const d = document.querySelector('dialog')
      return d ? d.contains(el) || el === d : false
    })
    expect(activeAfterShiftTab).toBe(true)

    // Background element cannot receive focus while dialog is modal
    const backgroundFocusable = await page.evaluate(() => {
      const search = document.querySelector('input[type="text"]') as HTMLElement | null
      if (!search) return false
      search.focus()
      return document.activeElement === search
    })
    expect(backgroundFocusable).toBe(false)

    // Footer actions return to scanner with mode query
    const websiteAction = dialog.getByRole('link', { name: /Judge Your Website|Uji Website Sendiri/i })
    await expect(websiteAction).toHaveAttribute('href', /\/\?mode=website/)

    const repoAction = dialog.getByRole('link', { name: /Judge Your Repository|Uji Repositori Sendiri/i })
    await expect(repoAction).toHaveAttribute('href', /\/\?mode=repository/)

    // Press Escape key
    await page.keyboard.press('Escape')

    // Dialog closed and focus restored to trigger
    await expect(dialog).toHaveCount(0)
    await expect(firstCardTrigger).toBeFocused()

    // Restore search, filter, and scroll state
    await expect(searchInput).toHaveValue('Newsletter')
    await expect(categorySelect).toHaveValue('User Experience & Accessibility')
    const restoredOverflow = await page.evaluate(() => document.body.style.overflow)
    expect(restoredOverflow).not.toBe('hidden')
  })

  test('language toggle updates modal and gallery without closing modal or losing state', async ({ page }) => {
    await page.goto('/hall?lang=en')

    // Open first modal
    const firstTrigger = page.locator('#hall-case-grid article button').first()
    await firstTrigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("BRO CODE'S CASE FILE")
    await expect(dialog).toContainText('Anonymous Case')
    await expect(dialog).toContainText('The Receipts')
    await expect(dialog).toContainText('Keep the Good Parts')
    await expect(dialog).toContainText('Analysis Scope')

    // Toggle language to Indonesian via modal header action while modal is open
    const langBtn = dialog.getByRole('button', { name: /Switch language to Indonesian|Ganti bahasa/i })
    await langBtn.click()

    // Modal stays open and text updates in-place to Indonesian
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('BERKAS KASUS BRO CODE')
    await expect(dialog).toContainText('Kasus Anonim')
    await expect(dialog).toContainText('Bukti Temuan')
    await expect(dialog).toContainText('Pertahankan yang Bagus')
    await expect(dialog).toContainText('Cakupan Analisis')
    await expect(dialog).toContainText('Tutup Berkas')

    // Close modal
    await dialog.getByRole('button', { name: /Tutup berkas|Tutup dialog/i }).first().click()
    await expect(dialog).toHaveCount(0)

    // Gallery also reflects updated language status
    await expect(page.getByRole('status')).toContainText('4 kasus ditampilkan')
  })

  test('regression: bilingual search preserves matching card and restores trigger focus on modal locale switch', async ({ page }) => {
    await page.goto('/hall?lang=en')

    // Search English query 'Vanishing' matching Registration Labyrinth
    const searchInput = page.getByRole('textbox', { name: /Search case files|Cari berkas kasus/i })
    await searchInput.fill('Vanishing')

    await expect(page.getByRole('status')).toContainText('1 case displayed')
    const trigger = page.locator('#hall-case-grid article button').first()
    await expect(trigger).toBeVisible()
    await expect(page.getByText('Registration Labyrinth')).toBeVisible()

    // Open Registration Labyrinth modal
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText('The Vanishing Field Validation Void')

    // Switch modal locale to Indonesian
    const modalLangBtn = dialog.getByRole('button', { name: /Switch language to Indonesian|Ganti bahasa/i })
    await modalLangBtn.click()

    // Modal updates to Indonesian content
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText('Misteri Isian Formulir yang Lenyap')
    await expect(dialog).toContainText('Labirin Pendaftaran')

    // Close modal
    const closeBtn = dialog.getByRole('button', { name: /Tutup berkas|Tutup dialog/i }).first()
    await closeBtn.click()
    await expect(dialog).toHaveCount(0)

    // Bilingual search keeps card in DOM even though query is English ('Vanishing') and active locale is Indonesian
    await expect(page.getByRole('status')).toContainText('1 kasus ditampilkan')
    await expect(page.getByText('Labirin Pendaftaran')).toBeVisible()

    // Focus is restored to the exact trigger button that opened the modal
    await expect(trigger).toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('mobile search input maintains compact height without vertical flex inflation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/hall')

    const searchInput = page.getByRole('textbox', { name: /Search case files|Cari berkas kasus/i })
    await expect(searchInput).toBeVisible()

    const box = await searchInput.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeLessThan(60)
  })

  test('no horizontal overflow across 6 standard viewport widths in gallery and modal', async ({ page }) => {
    const viewports = [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]

    for (const vp of viewports) {
      await page.setViewportSize(vp)
      await page.goto('/hall')
      await page.waitForLoadState('domcontentloaded')

      // 1. Gallery viewport fit: no horizontal overflow
      const noOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth
      })
      expect(noOverflow, `Gallery overflow detected at ${vp.width}x${vp.height}`).toBe(true)

      // 2. Open modal and assert dialog fit
      const firstCardTrigger = page.locator('#hall-case-grid article button').first()
      await firstCardTrigger.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // Dialog scrollWidth <= clientWidth (+1 for subpixel tolerance)
      const dialogFit = await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)
      expect(dialogFit, `Dialog horizontal overflow detected at ${vp.width}x${vp.height}`).toBe(true)

      // Close button tap target >= 44x44px
      const closeBtn = dialog.getByRole('button', { name: /Close dialog|Tutup dialog/i })
      await expect(closeBtn).toBeVisible()
      const closeBox = await closeBtn.boundingBox()
      expect(closeBox).not.toBeNull()
      expect(closeBox!.width).toBeGreaterThanOrEqual(44)
      expect(closeBox!.height).toBeGreaterThanOrEqual(44)

      // Internal scroll: scroll to bottom of dialog and assert close button remains reachable and clickable
      await dialog.evaluate(el => {
        el.scrollTop = el.scrollHeight
      })
      await closeBtn.click()
      await expect(dialog).toHaveCount(0)
    }
  })

  test('respects reduced motion media preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/hall')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const firstCard = page.locator('#hall-case-grid article').first()
    await expect(firstCard).toBeVisible()

    // Hover card under prefers-reduced-motion: reduce
    await firstCard.hover()

    const styles = await firstCard.evaluate(el => {
      const computed = window.getComputedStyle(el)
      return {
        transitionDuration: computed.transitionDuration,
        transform: computed.transform,
      }
    })

    // Assert computed transition duration 0s (or none) and transform none under reduce
    expect(['0s', 'none', '']).toContain(styles.transitionDuration)
    expect(styles.transform).toBe('none')
  })

  test('captures desktop and mobile mock-backed screenshots for documentation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Screenshots are captured exclusively by the desktop project to prevent race conditions')

    // 1. Desktop gallery view at 1440x900
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/hall?lang=en')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: 'docs/hall/screenshots/desktop.png',
      fullPage: false,
    })

    // 2. Desktop case file modal view at 1440x900
    const desktopCardTrigger = page.locator('#hall-case-grid article button').first()
    await desktopCardTrigger.click()
    const desktopDialog = page.getByRole('dialog')
    await expect(desktopDialog).toBeVisible()
    await page.screenshot({
      path: 'docs/hall/screenshots/desktop-case-file.png',
      fullPage: false,
    })

    // Close desktop modal
    await page.keyboard.press('Escape')
    await expect(desktopDialog).toHaveCount(0)

    // 3. Mobile gallery view at 390x844
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/hall?lang=en')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: 'docs/hall/screenshots/mobile.png',
      fullPage: false,
    })

    // 4. Mobile case file modal view at 390x844
    const mobileCardTrigger = page.locator('#hall-case-grid article button').first()
    await mobileCardTrigger.click()
    const mobileDialog = page.getByRole('dialog')
    await expect(mobileDialog).toBeVisible()
    await page.screenshot({
      path: 'docs/hall/screenshots/mobile-case-file.png',
      fullPage: false,
    })
  })
})
