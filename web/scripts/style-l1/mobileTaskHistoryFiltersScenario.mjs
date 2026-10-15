import { mobileTaskListOptionsScenario } from './mobileTaskListOptionsScenario.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { clickMobileThemeOption } from './mobileTaskThemeAssertions.mjs'
import { formatBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function mobileTaskHistoryFiltersScenario({ assert, path, outputDir }) {
  const base = mobileTaskListOptionsScenario({ assert, path, outputDir })
  const now = Math.floor(Date.now() / 1000)
  const today = Math.floor((now + 8 * 3600) / 86400) * 86400 - 8 * 3600
  const tasks = Array.from({ length: 64 }, (_, index) => ({
    ...base.workflowTaskFixtures[0],
    id: 99000 + index,
    task_code: `STYLE-L1-HISTORY-${index}`,
    task_name: `历史筛选任务 ${index}`,
    source_no: `HISTORY-${index}`,
    task_status_key: 'done',
    created_at: now - index * 60,
    completed_at: today - 86400 + index * 60,
  }))
  const rejected = {
    ...tasks[0],
    id: 99100,
    task_code: 'STYLE-L1-HISTORY-REJECTED',
    task_name: '历史筛选驳回任务',
    task_status_key: 'rejected',
    completed_at: today + 60,
  }
  const withdrawn = {
    ...tasks[0],
    id: 99101,
    task_code: 'STYLE-L1-HISTORY-WITHDRAWN',
    task_name: '历史筛选撤回任务',
    task_status_key: 'withdrawn',
    completed_at: today - 10 * 86400,
  }
  return {
    ...base,
    name: 'mobile-task-history-filters',
    deviceScaleFactor: 4,
    workflowTaskFixtures: [
      ...tasks,
      rejected,
      withdrawn,
      base.workflowTaskFixtures[0],
    ],
    verify: async (page) => {
      const reads = []
      page.on('request', (request) => {
        try {
          const body = request.postDataJSON()
          if (body?.method === 'list_role_tasks') reads.push(body.params)
        } catch {
          /* Requests without JSON are unrelated to task queries. */
        }
      })
      const search = page.getByRole('searchbox')
      await search.fill('排序')
      await search.press('Enter')
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('已办', { exact: true })
        .click()
      const trigger = page.getByTestId('mobile-history-filter-trigger')
      await trigger.waitFor()
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="mobile-role-done-count"]')
            ?.textContent === '66'
      )
      assert.equal(await search.inputValue(), '', '已办有独立搜索条件')
      const rows = page.locator('.erp-mobile-list-item')
      assert.equal(
        await rows.first().getAttribute('data-mobile-task-id'),
        '99100',
        '按处理时间显示最近已办'
      )
      const dialog = page.getByRole('dialog', { name: '筛选已办', exact: true })
      const open = async () => {
        await trigger.click()
        await dialog.waitFor({ state: 'visible' })
        await page.waitForFunction(() => {
          const popup = document.querySelector('[data-filter-context="已办"]')?.closest('.ant-popover')
          return popup && getComputedStyle(popup).opacity === '1' && !/ant-zoom-big-(enter|appear)/.test(popup.className)
        })
      }
      const close = async () => {
        await dialog
          .getByRole('button', { name: '关闭筛选', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
      }
      const waitCount = (count) =>
        page.waitForFunction(
          (n) =>
            document.querySelector('[data-testid="mobile-role-done-count"]')
              ?.textContent === String(n),
          count
        )
      await open()
      await dialog.getByText('今天', { exact: true }).click()
      await waitCount(1)
      await dialog.getByText('已完成', { exact: true }).click()
      await waitCount(0)
      await close()
      await page.getByText('当前筛选下暂无已办任务', { exact: true }).waitFor()
      await open()
      await dialog.getByText('近 7 天', { exact: true }).click()
      await waitCount(64)
      await close()
      assert.equal(
        await trigger.getAttribute('aria-label'),
        '筛选已办，已应用 2 项'
      )
      assert.match(
        await page.getByLabel('当前已办筛选').innerText(),
        /近 7 天 · 已完成/
      )
      const scroller = page.getByTestId('mobile-role-scroll')
      for (let i = 0; i < 8 && (await rows.count()) < 64; i += 1) {
        const count = await rows.count()
        await page.getByTestId('mobile-role-list-toggle-done').click()
        await page.waitForFunction(
          (before) =>
            document.querySelectorAll('.erp-mobile-list-item').length > before,
          count
        )
      }
      assert.equal(await rows.count(), 64, '筛选作用于全部分页')
      assert(
        reads.some(
          (q) =>
            q.view_key === 'history' &&
            q.cursor &&
            q.period === '7d' &&
            q.status_key === 'done'
        ),
        '后续页传递相同筛选'
      )
      const ids = await rows.evaluateAll((els) =>
        els.map((el) => Number(el.dataset.mobileTaskId))
      )
      assert.deepEqual(
        ids,
        Array.from({ length: 64 }, (_, i) => 99063 - i)
      )
      await scroller.evaluate((el) => {
        el.scrollTop = 0
      })
      await clickTaskCardContent(
        rows.first(),
        rows.first().locator('.mobile-task-list-row__head')
      )
      await page.getByTestId('mobile-task-detail-screen').waitFor()
      await page.reload()
      await page.getByTestId('mobile-task-detail-screen').waitFor()
      await page
        .getByRole('button', { name: '返回任务列表', exact: true })
        .click()
      await trigger.waitFor()
      await waitCount(64)
      assert.equal(
        await trigger.getAttribute('aria-label'),
        '筛选已办，已应用 2 项'
      )
      await search.fill('历史筛选')
      await search.press('Enter')
      await open()
      await dialog
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      await waitCount(66)
      assert.equal(await search.inputValue(), '历史筛选', '重置保留搜索词')
      await dialog.getByText('近 30 天', { exact: true }).click()
      await dialog.getByText('已撤回', { exact: true }).click()
      await waitCount(1)
      await close()
      assert.equal(
        await rows.first().getAttribute('data-mobile-task-id'),
        '99101'
      )
      await open()
      await dialog
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      await dialog
        .getByRole('button', { name: '自定义日期', exact: true })
        .click()
      const yesterday = formatBusinessDate((today - 86400) * 1000)
      if (
        yesterday.slice(0, 7) !== formatBusinessDate(today * 1000).slice(0, 7)
      )
        await dialog.getByRole('button', { name: '上个月' }).click()
      const day = dialog.locator(`td[title="${yesterday}"]`)
      await day.click()
      await day.click()
      await waitCount(64)
      await close()
      assert.match(
        await page.getByLabel('当前已办筛选').innerText(),
        new RegExp(yesterday)
      )
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('待办', { exact: true })
        .click()
      assert.equal(await search.inputValue(), '排序')
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('已办', { exact: true })
        .click()
      await waitCount(64)
      assert.equal(await search.inputValue(), '历史筛选')
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await open()
        const box = await dialog.boundingBox()
        assert(
          box.x >= 0 && box.x + box.width <= width + 1,
          '筛选浮层不超出手机视口'
        )
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        )
        assert(overflow <= 1)
        await close()
      }
      await page.setViewportSize({ width: 432, height: 960 })
      await open()
      await waitForFiniteAnimations(page)
      const surface = await dialog.evaluate((node) => {
        const popup = node.closest('.ant-popover')
        const inner = node.closest('.ant-popover-inner')
        return {
          popupOpacity: getComputedStyle(popup).opacity,
          innerOpacity: getComputedStyle(inner).opacity,
          background: getComputedStyle(inner).backgroundColor,
          token: getComputedStyle(inner).getPropertyValue('--erp-surface-bg'),
          classes: popup.className,
        }
      })
      assert.equal(surface.popupOpacity, '1', JSON.stringify(surface))
      assert.equal(surface.innerOpacity, '1', JSON.stringify(surface))
      assert.equal(surface.background, 'rgb(255, 255, 255)', JSON.stringify(surface))
      await page.screenshot({
        path: path.join(outputDir, 'mobile-history-filters-light.png'),
      })
      await close()
      await clickMobileThemeOption(page, '暗色')
      await trigger.waitFor()
      await open()
      await waitForFiniteAnimations(page)
      await page.screenshot({
        path: path.join(outputDir, 'mobile-history-filters-dark.png'),
      })
      await close()
    },
  }
}
