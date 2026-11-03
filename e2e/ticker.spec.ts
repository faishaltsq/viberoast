import { expect, test } from '@playwright/test'

test('ticker moves left and joins seamlessly in both languages', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  for (const language of ['en', 'id']) {
    if (language === 'id') await page.getByRole('button', { name: 'Switch to Bahasa Indonesia' }).click()
    const samples = await page.locator('.ticker-inner').evaluate(track => {
      const animation = track.getAnimations()[0]
      if (!animation?.effect) throw new Error('The ticker has no active scrolling animation')
      const groups = track.querySelectorAll('.ticker-group')
      if (groups.length !== 2) throw new Error('The ticker needs two matching loop groups')
      const duration = Number(animation.effect.getTiming().duration)
      animation.pause()
      animation.currentTime = 0
      const startX = groups[0].getBoundingClientRect().left
      const groupWidth = groups[0].getBoundingClientRect().width
      const cloneWidth = groups[1].getBoundingClientRect().width
      animation.currentTime = duration / 2
      const middleX = groups[0].getBoundingClientRect().left
      animation.currentTime = duration - 1
      const joinX = groups[1].getBoundingClientRect().left
      return { startX, middleX, joinX, groupWidth, cloneWidth, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }
    })
    expect(samples.middleX).toBeLessThan(samples.startX)
    expect(Math.abs(samples.joinX - samples.startX)).toBeLessThan(1)
    expect(samples.groupWidth).toBeGreaterThanOrEqual(samples.viewport)
    expect(samples.cloneWidth).toBeCloseTo(samples.groupWidth, 1)
    expect(samples.documentWidth).toBe(samples.viewport)
  }
})

test('ticker can be paused and resumed with the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const track = page.locator('.ticker-inner')
  const pause = page.getByRole('button', { name: 'Pause scrolling text' })
  await pause.focus()
  await expect(pause).toBeFocused()
  await pause.press('Enter')
  await expect.poll(() => track.evaluate(element => element.getAnimations()[0]?.playState)).toBe('paused')
  const positions = await track.evaluate(async element => {
    const before = element.getBoundingClientRect().left
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return { before, after: element.getBoundingClientRect().left }
  })
  expect(positions.after).toBe(positions.before)
  const resume = page.getByRole('button', { name: 'Resume scrolling text' })
  const bounds = await resume.boundingBox()
  expect(bounds!.width).toBeGreaterThanOrEqual(44)
  expect(bounds!.height).toBeGreaterThanOrEqual(44)
  await resume.press('Space')
  await expect.poll(() => track.evaluate(element => element.getBoundingClientRect().left)).toBeLessThan(positions.after)
})

test('reduced motion keeps the primary message static and fully within the strip', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const layout = await page.locator('.ticker-inner').evaluate(track => {
    const window = track.parentElement!.getBoundingClientRect()
    const text = track.querySelector('.ticker-copy')!.getBoundingClientRect()
    return { animations: track.getAnimations().length, left: text.left, right: text.right, windowLeft: window.left, windowRight: window.right }
  })
  expect(layout.animations).toBe(0)
  expect(layout.left).toBeGreaterThanOrEqual(layout.windowLeft)
  expect(layout.right).toBeLessThanOrEqual(layout.windowRight)
  await expect(page.locator('.ticker-toggle')).toBeHidden()
})
