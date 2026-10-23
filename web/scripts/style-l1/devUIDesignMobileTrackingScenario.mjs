import { chooseSelectOption } from './selectControlActions.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createDevUIDesignMobileTrackingScenario({
  assert,
  path,
  outputDir,
  assertNoHorizontalOverflow,
}) {
  return {
    name: 'dev-ui-design-mobile-tracking',
    path: '/__dev/ui-design?page=mobile-tasks',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page
        .getByRole('heading', { name: '交互设计', exact: true })
        .waitFor()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      const phone = frame.locator('.role-mobile-device')
      await phone.getByRole('tab', { name: '流程跟踪', exact: true }).waitFor()
      await chooseSelectOption(frame.getByLabel('预览身份', { exact: true }), 'admin')
      const document = await (
        await page.locator('iframe[title="ERP 最新可交互设计"]').elementHandle()
      ).contentFrame()
      const preview = {
        emulateMedia: (options) => page.emulateMedia(options),
        evaluate: (...args) => document.evaluate(...args),
        locator: (selector) => document.locator(selector),
      }
      const primaryGeometry = () => phone.locator('.rm-primary-tabs').evaluate((root) => {
        const box = root.getBoundingClientRect()
        return { height: box.height, top: box.top - root.closest('.role-mobile-device').getBoundingClientRect().top }
      })
      const taskGeometry = await primaryGeometry()
      await phone.locator('[data-action="mobile-main"][data-value="progress"]').click()
      const progressGeometry = await primaryGeometry()
      assert.equal(taskGeometry.height, 46)
      assert.deepEqual(progressGeometry, taskGeometry, '设计演示的两组主页面页签同高、同起点')
      await verifyMobileNavigationMotion(preview, assert, '.rm-primary-tabs[aria-label="进度视图"]', 1)
      await verifyMobileNavigationMotion(preview, assert, '.rm-primary-tabs[aria-label="进度视图"]', 0, true)
      await phone.locator('[data-action="mobile-main"][data-value="tasks"]').click()
      await verifyMobileNavigationMotion(
        preview,
        assert,
        '.rm-view-tabs[aria-label="任务状态"]',
        2
      )
      const tracking = phone.getByRole('region', {
        name: '流程跟踪',
        exact: true,
      })
      assert.equal(
        await phone
          .getByRole('tablist', { name: '任务状态', exact: true })
          .count(),
        1
      )
      assert.match(await tracking.innerText(), /岗位：工程/s)
      assert.equal(
        await phone
          .getByRole('tablist', { name: '任务状态', exact: true })
          .getByRole('tab')
          .count(),
        3
      )
      assert.equal(
        await phone
          .getByRole('tablist', { name: '跟踪内容', exact: true })
          .getByRole('tab')
          .count(),
        2
      )
      await tracking.getByRole('button', { name: '筛选流程', exact: true }).click()
      const filters = phone.getByRole('dialog', {
        name: '流转筛选',
        exact: true,
      })
      await filters
        .getByRole('group', { name: '当前岗位', exact: true })
        .getByRole('button', { name: '老板', exact: true })
        .click()
      await tracking
        .getByText('当前筛选下没有匹配记录', { exact: true })
        .waitFor()
      await filters
        .getByRole('button', { name: '关闭筛选', exact: true })
        .click()
      await tracking.locator('[data-action="mobile-options"]').click()
      await filters
        .locator('[data-action="mobile-tracking-scope"][data-value="participated"]')
        .click()
      await filters.waitFor({ state: 'hidden' })
      await tracking
        .getByRole('button', { name: '流程跟踪：销售订单受理', exact: true })
        .waitFor()
      assert.deepEqual(
        await tracking
          .getByRole('group', { name: '流转状态', exact: true })
          .locator('.filter-chip-count')
          .allTextContents(),
        ['1', '1', '0']
      )
      await tracking.locator('[data-action="mobile-options"]').click()
      await filters
        .locator('[data-action="mobile-tracking-scope"][data-value="visible"]')
        .click()
      await filters.waitFor({ state: 'hidden' })
      await tracking
        .getByText('当前筛选下没有匹配记录', { exact: true })
        .waitFor()
      await tracking.locator('[data-action="mobile-options"]').click()
      await filters
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      await filters
        .getByRole('button', { name: '关闭筛选', exact: true })
        .click()
      await page.screenshot({
        path: path.join(outputDir, 'dev-ui-design-mobile-tracking-list-4k.png'),
      })
      await tracking
        .getByRole('button', { name: '查看浅棕小熊大图', exact: true })
        .click()
      await frame
        .getByRole('button', { name: '关闭图片预览', exact: true })
        .click()
      assert.equal(
        await phone
          .getByRole('dialog', { name: '流程跟踪', exact: true })
          .count(),
        0
      )
      await tracking
        .getByRole('button', { name: '流程跟踪：销售订单受理', exact: true })
        .click()
      const drawer = phone.getByRole('dialog', {
        name: '流程跟踪',
        exact: true,
      })
      const exceptions = drawer
        .locator('details')
        .filter({ has: frame.getByText('本流程异常跟踪', { exact: true }) })
      assert.equal(await exceptions.getAttribute('open'), null)
      await exceptions.locator('summary').click()
      await exceptions
        .getByText('本流程暂无可见异常', { exact: true })
        .waitFor()
      await exceptions.locator('summary').click()

      await drawer.waitFor()
      const geometry = await drawer.evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        overflow: node.scrollWidth - node.clientWidth,
        phone: node.closest('.role-mobile-device').getBoundingClientRect()
          .width,
      }))
      assert.ok(
        geometry.width <= geometry.phone && geometry.overflow < 2,
        JSON.stringify(geometry)
      )
      await drawer
        .getByRole('button', { name: '复制 SO-20260925-001', exact: true })
        .click()
      assert.equal(await drawer.isVisible(), true)
      await page.screenshot({
        path: path.join(
          outputDir,
          'dev-ui-design-mobile-tracking-detail-4k.png'
        ),
      })
      assert.equal(
        await drawer
          .locator('.drawer-body [data-action="open-tracking-task"]')
          .count(),
        0
      )
      await drawer
        .locator('.drawer-foot')
        .getByRole('button', { name: '去处理工程资料', exact: true })
        .click()
      await phone
        .getByRole('heading', { name: '任务信息', exact: true })
        .waitFor()
      assert.equal(await phone.locator('.rm-steps').isVisible(), true, '任务详情从首屏保留三步办理引导')
      await phone.locator('[data-action="mobile-back"]').click()
      await drawer.waitFor()
      await drawer
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await tracking
        .getByRole('button', { name: '流程跟踪：销售订单受理', exact: true })
        .waitFor()
      await phone.getByRole('tab', { name: '异常跟踪', exact: true }).click()
      const exceptionTracking = phone.getByRole('region', {
        name: '异常跟踪',
        exact: true,
      })
      const counts = () =>
        exceptionTracking
          .getByRole('group', { name: '异常处理状态', exact: true })
          .locator('b')
          .allTextContents()
      assert.deepEqual(await counts(), ['1', '1', '0'])
      await exceptionTracking.getByRole('button', { name: /^已处理完/ }).click()
      await exceptionTracking
        .getByText('当前条件下没有匹配记录', { exact: true })
        .waitFor()
      assert.deepEqual(await counts(), ['1', '1', '0'])
      await exceptionTracking.getByRole('button', { name: /^未处理完/ }).click()
      const search =
        exceptionTracking.getByLabel('搜索异常单号、订单、批次或原因')
      await search.fill('无匹配')
      await search.press('Enter')
      await exceptionTracking
        .getByText('当前条件下没有匹配记录', { exact: true })
        .waitFor()
      assert.deepEqual(await counts(), ['0', '0', '0'])
      await search.fill('')
      await search.press('Enter')
      await exceptionTracking
        .getByRole('button', { name: '查看异常关联任务', exact: true })
        .waitFor()
      assert.deepEqual(await counts(), ['1', '1', '0'])

      assert.equal(await exceptionTracking.getByRole('button', { name: '筛选', exact: true }).count(), 0)
      await exceptionTracking.getByRole('button', { name: /^关联待办/ }).click()
      assert.equal(
        await exceptionTracking
          .getByRole('button', { name: /^未处理完/ })
          .count(),
        0
      )
      await exceptionTracking
        .getByRole('button', { name: '查看异常关联任务', exact: true })
        .click()
      await phone
        .getByRole('button', { name: '返回关联待办', exact: true })
        .click()
      await exceptionTracking
        .getByRole('button', { name: '返回异常跟踪', exact: true })
        .click()
      await exceptionTracking.getByRole('button', { name: /^关联订单/ }).click()
      await exceptionTracking
        .getByRole('heading', { name: /^关联订单/ })
        .waitFor()
      await exceptionTracking
        .getByRole('button', { name: '返回异常跟踪', exact: true })
        .click()
      assert.match(
        await exceptionTracking
          .getByRole('button', { name: /^未处理完/ })
          .getAttribute('class'),
        /active/
      )
      await page.screenshot({
        path: path.join(
          outputDir,
          'dev-ui-design-mobile-exception-tracking-4k.png'
        ),
      })
      const exceptionSearch = exceptionTracking.locator('#mobile-exception-search')
      const exceptionKeyword = await exceptionSearch.inputValue()
      const selectedException = exceptionTracking.getByRole('group', { name: '异常处理状态', exact: true }).getByRole('button', { pressed: true })
      await selectedException.click()
      assert.equal(await exceptionSearch.inputValue(), exceptionKeyword, '设计演示清空状态时保留搜索')
      assert.equal(await exceptionTracking.getByRole('button', { name: '清空异常筛选', exact: true }).count(), 0)
      assert.equal(await exceptionTracking.locator('.rm-applied-filters').count(), 0)
      await phone.getByRole('tab', { name: /^已办/ }).click()
      await phone
        .getByRole('region', { name: '已办任务', exact: true })
        .waitFor()
      await phone.getByRole('button', { name: '筛选已办', exact: true }).click()
      const historyFilters = phone.getByRole('dialog', {
        name: '已办筛选',
        exact: true,
      })
      assert.deepEqual(
        await historyFilters
          .locator('[data-action="mobile-history-result"] .filter-chip-count')
          .allTextContents(),
        ['3', '2', '1', '0']
      )
      await historyFilters.getByRole('button', { name: /^已驳回/ }).click()
      assert.equal(
        await phone
          .getByRole('region', { name: '已办任务', exact: true })
          .locator('.rm-task-card')
          .count(),
        1
      )
      await historyFilters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await phone.getByRole('group', { name: '处理时间快捷筛选', exact: true }).getByRole('button', { name: '今天', exact: true }).click()
      assert.equal(
        await phone
          .getByRole('region', { name: '已办任务', exact: true })
          .locator('.rm-task-card')
          .count(),
        0
      )
      const clearAll = phone.getByRole('button', { name: '清空已办筛选', exact: true })
      assert.equal(await clearAll.count(), 1, '设计稿的面板处理结果保留右侧清空入口')
      assert.equal(await phone.locator('[data-action="mobile-options"]').getAttribute('aria-label'), '筛选已办，已应用 1 项', '快捷时间不重复计入顶部摘要')
      assert.equal(await phone.locator('.rm-applied-filters .rm-filter-clear-all').count(), 0)
      await clearAll.click()
      assert.equal(await phone.getByRole('region', { name: '已办任务', exact: true }).locator('.rm-task-card').count(), 2)
      assert.equal(await phone.getByRole('group', { name: '处理时间快捷筛选', exact: true }).getByRole('button', { name: '今天', exact: true }).getAttribute('aria-pressed'), 'true', '清空额外条件保留时间快捷项')
      assert.equal(await clearAll.count(), 0)
      await phone.getByRole('button', { name: '筛选已办', exact: true }).click()
      assert.equal(await historyFilters.getByRole('button', { name: '重置筛选', exact: true }).isDisabled(), true)
      assert.equal(await historyFilters.getByRole('button', { name: '自定义日期', exact: true }).count(), 0)
      assert.equal(await historyFilters.locator("input, ui-select, textarea").count(), 0)
      await historyFilters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await phone.getByRole('tab', { name: '流程跟踪', exact: true }).click()
      await verifyMobileNavigationMotion(
        preview,
        assert,
        '.rm-view-tabs[aria-label="任务状态"]',
        0,
        true
      )
      await phone.getByRole('tab', { name: '流程跟踪', exact: true }).click()
      await assertNoHorizontalOverflow(page, '效能工作台移动端设计')
    },
  }
}
