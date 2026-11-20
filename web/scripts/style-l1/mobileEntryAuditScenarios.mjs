import path from 'node:path'
import { createMobileProgressScenarios } from './mobileProgressScenarios.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'

export function createMobileEntryAuditScenarios(deps) {
  const { assert, assertNoHorizontalOverflow, outputDir } = deps
  const base = createMobileProgressScenarios(deps).find((scenario) => scenario.name === 'mobile-progress-boss')
  const audit = async (page, label) => {
    assert.equal(new URL(page.url()).pathname.startsWith('/m/boss/'), true, label)
    assert.equal(await page.locator('.erp-admin-layout').count(), 0, label)
    assert.equal(await page.getByRole('button', { name: /进入单据|打开业务页面|查看相关单据|核对业务单据|办理业务|切换到电脑版/u }).count(), 0, label)
    assert.deepEqual(await page.locator('a[href]').evaluateAll((links) => links.map((link) => new URL(link.href)).filter((url) => url.pathname.startsWith('/erp/') || (/^\/m\/[^/]+\/(?:tasks\/[1-9][0-9]*\/)?handle\//u.test(url.pathname) && !url.pathname.endsWith('/help-center'))).map((url) => url.pathname)), [], label)
    await assertNoHorizontalOverflow(page, label)
  }
  return [{
    ...base,
    name: 'mobile-entry-task-only-contract',
    adminProfile: { ...base.adminProfile, is_super_admin: true },
    verify: async (page) => {
      await page.getByTestId('mobile-progress-panel').waitFor()
      await audit(page, '进度入口')
      for (const key of ['tasks', 'messages']) {
        await page.getByTestId(`mobile-role-nav-${key}`).click()
        const card = page.locator('.erp-task-card').filter({ hasText: '确认面料交期' }).first()
        await card.waitFor()
        await audit(page, `${key} 列表`)
        assert.equal(await page.getByTestId('mobile-role-work-entry-switch').count(), 0)
        await clickTaskCardContent(card, card.getByText('确认面料交期', { exact: true }))
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.waitFor()
        assert.equal(await detail.locator('[data-step-key]').count(), 3)
        await audit(page, `${key} 任务详情`)
        await detail.locator('.mobile-task-flow-back').click()
        await page.getByTestId('mobile-role-bottom-nav').waitFor()
      }
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page.locator('.mobile-workspace-task-views').getByText('流程跟踪', { exact: true }).click()
      await page.getByRole('region', { name: '流程跟踪', exact: true }).waitFor()
      await audit(page, '流程跟踪入口')
      await page.locator('.mobile-workspace-tracking-views').getByText('异常跟踪', { exact: true }).click()
      await page.getByRole('region', { name: '异常跟踪', exact: true }).waitFor()
      await audit(page, '异常跟踪入口')
      await page.getByTestId('mobile-role-nav-mine').click()
      await audit(page, '我的入口')
      assert.equal(await page.getByTestId('mobile-role-work-entry-switch').count(), 1)
      const scroll = page.getByTestId('mobile-role-scroll')
      await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight })
      const savedScroll = await scroll.evaluate((node) => node.scrollTop)
      await page.getByRole('button', { name: '帮助与手册', exact: true }).click()
      await page.locator('.erp-help-center-page[data-help-shell="mobile"]').waitFor()
      await audit(page, '帮助首页')
      assert.equal(await page.locator('.erp-help-home__note').count(), 0)
      await page.getByRole('navigation', { name: '推荐办事场景', exact: true }).getByRole('button').first().click()
      await page.locator('[data-help-scenario]').waitFor()
      await audit(page, '帮助操作图解')
      await page.getByRole('button', { name: '返回', exact: true }).click()
      await page.getByTestId('mobile-role-nav-mine').waitFor()
      assert.equal(await page.getByTestId('mobile-role-nav-mine').getAttribute('aria-selected'), 'true')
      assert(Math.abs(await scroll.evaluate((node) => node.scrollTop) - savedScroll) < 2, '离开帮助后恢复我的原位置')
      await page.screenshot({ path: path.join(outputDir, 'mobile-entry-audit-mine.png') })
      await page.getByTestId('mobile-role-work-entry-switch').click()
      await page.waitForURL('**/entry')
      for (const legacy of ['/m/boss/handle/production/orders?production_order_id=71', '/m/boss/handle/warehouse/shipments?shipment_id=3', '/m/boss/tasks/31/handle/warehouse/inbound?receipt_id=91']) {
        await page.goto(new URL(legacy, page.url()).href)
        await page.getByTestId('mobile-role-bottom-nav').waitFor()
        assert.equal(new URL(page.url()).pathname, '/m/boss/tasks')
        await audit(page, '旧单据链接回到手机版任务')
      }
    },
  }]
}
