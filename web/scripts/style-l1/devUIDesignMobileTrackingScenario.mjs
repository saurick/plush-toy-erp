import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createDevUIDesignMobileTrackingScenario({ assert, path, outputDir, assertNoHorizontalOverflow }) {
  return {
    name: 'dev-ui-design-mobile-tracking',
    path: '/__dev/ui-design?page=mobile-tasks',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('heading', { name: 'UI 交互设计', exact: true }).waitFor()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      const phone = frame.locator('.role-mobile-device')
      await phone.getByRole('tab', { name: '流程跟踪', exact: true }).waitFor()
      const document = await (await page.locator('iframe[title="ERP 最新可交互设计"]').elementHandle()).contentFrame()
      const preview = {
        emulateMedia: (options) => page.emulateMedia(options),
        evaluate: (...args) => document.evaluate(...args),
        locator: (selector) => document.locator(selector),
      }
      await verifyMobileNavigationMotion(preview, assert, '.rm-view-tabs', 2)
      const tracking = phone.getByRole('region', { name: '流程跟踪', exact: true })
      assert.equal(await phone.getByRole('tablist', { name: '任务状态', exact: true }).count(), 1)
      assert.match(await tracking.innerText(), /我发起的.*我参与的.*岗位：工程/s)
      await tracking.getByRole('button', { name: '筛选', exact: true }).click()
      const filters = phone.getByRole('dialog', { name: '流转筛选', exact: true })
      await filters.getByRole('combobox', { name: '当前岗位', exact: true }).selectOption('老板')
      await tracking.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
      await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await tracking.getByRole('button', { name: '我参与的', exact: true }).click()
      await tracking.getByRole('button', { name: '查看销售订单受理流转进度', exact: true }).waitFor()
      await tracking.getByRole('button', { name: '我发起的', exact: true }).click()
      await tracking.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
      await tracking.locator('[data-action="mobile-options"]').click()
      await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
      await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await page.screenshot({ path: path.join(outputDir, 'dev-ui-design-mobile-tracking-list-4k.png') })
      await tracking.getByRole('button', { name: '查看浅棕小熊大图', exact: true }).click()
      await frame.getByRole('button', { name: '关闭图片预览', exact: true }).click()
      assert.equal(await phone.getByRole('dialog', { name: '任务流转进度', exact: true }).count(), 0)
      await tracking.getByRole('button', { name: '查看销售订单受理流转进度', exact: true }).click()
      const drawer = phone.getByRole('dialog', { name: '任务流转进度', exact: true })
      await drawer.waitFor()
      const geometry = await drawer.evaluate((node) => ({ width: node.getBoundingClientRect().width, overflow: node.scrollWidth - node.clientWidth, phone: node.closest('.role-mobile-device').getBoundingClientRect().width }))
      assert.ok(geometry.width <= geometry.phone && geometry.overflow < 2, JSON.stringify(geometry))
      await drawer.getByRole('button', { name: '复制 SO-20260925-001', exact: true }).click()
      assert.equal(await drawer.isVisible(), true)
      await page.screenshot({ path: path.join(outputDir, 'dev-ui-design-mobile-tracking-detail-4k.png') })
      assert.equal(await drawer.locator('.drawer-body [data-action="open-tracking-task"]').count(), 0)
      await drawer.locator('.drawer-foot').getByRole('button', { name: '去处理工程资料 →', exact: true }).click()
      await phone.getByRole('heading', { name: '任务信息', exact: true }).waitFor()
      assert.match(await phone.locator('.rm-steps').innerText(), /任务信息.*任务办理.*结果回执/s)
      await phone.locator('[data-action="mobile-back"]').click()
      await drawer.waitFor()
      await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
      await tracking.getByRole('button', { name: '查看销售订单受理流转进度', exact: true }).waitFor()
      await phone.getByRole('tab', { name: /^已办/ }).click()
      await phone.getByRole('region', { name: '已办任务', exact: true }).waitFor()
      await phone.getByRole('tab', { name: '流程跟踪', exact: true }).click()
      await verifyMobileNavigationMotion(preview, assert, '.rm-view-tabs', 0, true)
      await phone.getByRole('tab', { name: '流程跟踪', exact: true }).click()
      await assertNoHorizontalOverflow(page, '效能工作台移动端设计')
    },
  }
}
