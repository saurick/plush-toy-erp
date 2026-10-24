import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { assertFilterAffordance } from './controlAffordanceAssertions.mjs'

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
    const last = [...node.querySelectorAll('button')]
      .at(-1)
      .getBoundingClientRect()
    const frame = node.querySelector(':scope > .app-scroll-edges')
    return {
      width: node.clientWidth,
      content: node.scrollWidth,
      left: node.scrollLeft,
      edgeRight: Boolean(
        frame && !frame.hidden && frame.dataset.right === 'true'
      ),
      edgeLeft: Boolean(
        frame && !frame.hidden && frame.dataset.left === 'true'
      ),
      mask: frame
        ? getComputedStyle(frame.querySelector('.app-scroll-edge--right'))
            .maskImage
        : 'none',
      height: box.height,
      lastVisible: last.left >= box.left - 1 && last.right <= box.right + 1,
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })
  const remaining = metrics.content - metrics.width - metrics.left
  assert.equal(metrics.edgeRight, remaining > 1, JSON.stringify(metrics))
  assert.equal(metrics.edgeLeft, metrics.left > 1, JSON.stringify(metrics))
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
        const progress = panel.getByRole('group', {
          name: '进度快捷筛选',
          exact: true,
        })
        const evidence = { progress: await readScroll(progress, assert) }
        assert.equal(evidence.progress.height, 44, '进度快捷项在窄屏保持一行且不叠加垂直内边距')
        await assertFilterAffordance(progress.getByRole('button'), 44)
        await progress.evaluate((node) => { node.scrollLeft = node.scrollWidth })
        evidence.progressEnd = await readScroll(progress, assert)
        assert(evidence.progressEnd.lastVisible, '末项可以横向滑入视野')
        await page.getByTestId('mobile-role-nav-tasks').click()
        const row = page.getByTestId('mobile-role-task-filters')
        evidence.start = await readScroll(row, assert)
        assert.equal(evidence.start.height, 44, '任务快捷项保持紧凑行高')
        await assertFilterAffordance(row.getByRole('button'), 44)
        await row.screenshot({
          path: path.join(outputDir, `${name}-start.png`),
        })

        for (const [key, fraction] of [
          ['middle', 0.5],
          ['end', 1],
        ]) {
          await row.evaluate((node, value) => {
            node.scrollLeft = (node.scrollWidth - node.clientWidth) * value
          }, fraction)
          evidence[key] = await readScroll(row, assert)
        }
        assert.equal(evidence.end.edgeRight, false)
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
        await row.getByRole('button').first().focus()
        const count = await row.getByRole('button').count()
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
        }
        assert.equal(evidence.width800.edgeRight, false)
        const badge = row.locator('.erp-filter-chip__count').first()
        const original = await badge.textContent()
        await badge.evaluate((node) => {
          node.textContent = '1234567890'.repeat(20)
        })
        evidence.longCount = await readScroll(row, assert)
        assert(
          evidence.longCount.content > evidence.longCount.width + 1,
          '长内容在真实横向组件中产生溢出'
        )
        assert.equal(evidence.longCount.edgeRight, true)
        await row.evaluate((node) => {
          node.scrollLeft = node.scrollWidth
        })
        evidence.longCountEnd = await readScroll(row, assert)
        assert.equal(evidence.longCountEnd.edgeLeft, true)
        assert.equal(evidence.longCountEnd.edgeRight, false)
        await badge.evaluate((node, value) => {
          node.textContent = value
        }, original)
        evidence.restoredCount = await readScroll(row, assert)
        assert.equal(evidence.restoredCount.edgeRight, false)
        assert.equal(evidence.restoredCount.edgeLeft, false)

        await page.setViewportSize({ width: 320, height: 844 })
        await page.getByTestId('mobile-role-nav-progress').click()
        await progress.waitFor()
        await page.getByTestId('mobile-role-nav-tasks').click()
        await row.waitFor()
        await row.evaluate((node) => {
          node.scrollLeft = 0
        })
        evidence.reopened = await readScroll(row, assert)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await row.evaluate((node) => {
          node.scrollLeft = node.scrollWidth
        })
        assert.equal((await readScroll(row, assert)).edgeRight, false)
        await page.setViewportSize(base.viewport)
        await writeFile(
          path.join(outputDir, `${name}.json`),
          JSON.stringify(evidence, null, 2)
        )
      },
    }
  })
}
