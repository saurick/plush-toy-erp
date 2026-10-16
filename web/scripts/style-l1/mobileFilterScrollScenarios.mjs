import path from 'node:path'
import { writeFile } from 'node:fs/promises'

async function readScroll(row, assert) {
  await row.waitFor()
  await row
    .page()
    .evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
  const metrics = await row.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const last = node.querySelector('button:last-child').getBoundingClientRect()
    return {
      width: node.clientWidth,
      content: node.scrollWidth,
      left: node.scrollLeft,
      mask: getComputedStyle(node).maskImage,
      height: box.height,
      lastVisible: last.left >= box.left - 1 && last.right <= box.right + 1,
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })
  const remaining = metrics.content - metrics.width - metrics.left
  assert.equal(metrics.mask !== 'none', remaining > 1, JSON.stringify(metrics))
  if (remaining > 1) assert.match(metrics.mask, /linear-gradient/)
  assert(metrics.pageOverflow <= 1, JSON.stringify(metrics))
  return metrics
}

export function createMobileFilterScrollScenarios({
  scenarios,
  assert,
  outputDir,
}) {
  return ['boss', 'pmc'].map((role) => {
    const base = scenarios.find(
      (scenario) => scenario.name === `mobile-progress-${role}`
    )
    const name = `mobile-filter-scroll-${base.themeMode}`
    return {
      ...base,
      name,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        const panel = page.getByTestId('mobile-progress-panel')
        await panel.locator('.mobile-progress-card').first().waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.setViewportSize({ width: 320, height: 844 })
        const row = panel.getByRole('group', {
          name: '进度快捷筛选',
          exact: true,
        })
        const evidence = { start: await readScroll(row, assert) }
        assert(evidence.start.content > evidence.start.width + 1)
        await row.screenshot({
          path: path.join(outputDir, `${name}-start.png`),
        })

        await row.evaluate((node) => {
          node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2
        })
        evidence.middle = await readScroll(row, assert)
        assert(evidence.middle.left > 0)
        await row.evaluate((node) => {
          node.scrollLeft = node.scrollWidth
        })
        evidence.end = await readScroll(row, assert)
        assert.equal(evidence.end.mask, 'none')
        assert(evidence.end.lastVisible)
        assert.equal(evidence.end.height, evidence.start.height)
        await row.screenshot({ path: path.join(outputDir, `${name}-end.png`) })
        await row.getByRole('button').last().click()
        assert.equal(
          await row.getByRole('button').last().getAttribute('aria-pressed'),
          'true'
        )

        await row.evaluate((node) => {
          node.scrollLeft = 0
        })
        evidence.returned = await readScroll(row, assert)
        assert.notEqual(evidence.returned.mask, 'none')
        await row.getByRole('button').first().focus()
        const count = await row.getByRole('button').count()
        // macOS WebKit uses Option-Tab to include buttons in keyboard traversal.
        const tabKey =
          process.platform === 'darwin' &&
          page.context().browser().browserType().name() === 'webkit'
            ? 'Alt+Tab'
            : 'Tab'
        for (let i = 1; i < count; i += 1) await page.keyboard.press(tabKey)
        assert(
          await row
            .getByRole('button')
            .last()
            .evaluate((node) => node === document.activeElement)
        )
        evidence.keyboard = await readScroll(row, assert)
        assert(evidence.keyboard.lastVisible, JSON.stringify(evidence.keyboard))

        for (const width of [390, 430, 800]) {
          await page.setViewportSize({ width, height: 844 })
          await row.evaluate((node) => {
            node.scrollLeft = 0
          })
          evidence[`width${width}`] = await readScroll(row, assert)
          if (width === 390) {
            await panel.locator('.mobile-progress-controls').screenshot({
              path: path.join(outputDir, `${name}-progress.png`),
            })
          }
        }
        assert.equal(evidence.width800.mask, 'none')
        const badge = row.locator('.erp-filter-chip__count').first()
        const original = await badge.textContent()
        await badge.evaluate((node) => {
          node.textContent = '1234567890'.repeat(20)
        })
        evidence.longCount = await readScroll(row, assert)
        assert.notEqual(evidence.longCount.mask, 'none')
        await badge.evaluate((node, value) => {
          node.textContent = value
        }, original)
        evidence.restoredCount = await readScroll(row, assert)
        assert.equal(evidence.restoredCount.mask, 'none')

        await page.setViewportSize({ width: 320, height: 844 })
        await page.getByTestId('mobile-role-nav-tasks').click()
        const tasks = page.getByTestId('mobile-role-task-filters')
        await tasks.waitFor()
        evidence.tasks = await readScroll(tasks, assert)
        await tasks.evaluate((node) => {
          node.scrollLeft = node.scrollWidth
        })
        evidence.tasksEnd = await readScroll(tasks, assert)
        assert.equal(evidence.tasksEnd.mask, 'none')
        await tasks.getByRole('button').last().click()
        assert.equal(
          await tasks.getByRole('button').last().getAttribute('aria-pressed'),
          'true'
        )
        await tasks.screenshot({
          path: path.join(outputDir, `${name}-tasks.png`),
        })

        await page.getByTestId('mobile-role-nav-progress').click()
        await row.waitFor()
        await row.evaluate((node) => {
          node.scrollLeft = 0
        })
        evidence.reopened = await readScroll(row, assert)
        assert.notEqual(evidence.reopened.mask, 'none')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await row.evaluate((node) => {
          node.scrollLeft = node.scrollWidth
        })
        assert.equal((await readScroll(row, assert)).mask, 'none')
        await page.setViewportSize(base.viewport)
        await writeFile(
          path.join(outputDir, `${name}.json`),
          JSON.stringify(evidence, null, 2)
        )
      },
    }
  })
}
