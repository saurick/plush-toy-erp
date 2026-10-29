import { expect } from 'playwright/test'

export function createDevBusinessRelationsScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  return [{
    name: 'dev-business-relations-desktop',
    path: '/__dev/status-flows?view=chain&chain=all',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      const primary = page.getByRole('tablist', { name: '业务链路方式' })
      const secondary = page.getByRole('tablist', { name: '关联信息类型' })
      const visit = async (query) => page.goto(new URL(`/__dev/status-flows?${query}`, page.url()).href)
      const choose = async (name, text) => {
        await page.getByRole('combobox', { name, exact: true }).click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).click()
      }
      await expect(guide.locator('[data-chain-stage]')).toHaveCount(17)
      await expect(page.getByRole('combobox', { name: '状态对象', exact: true })).toHaveCount(0)
      await guide.getByRole('button', { name: '6 来料检验与材料入库', exact: true }).click()
      await guide.locator('[data-graph-node="inbound"]').click()
      const action = page.locator('[data-relation-action]')
      await expect(action).toContainText('采购入库：草稿 → 已过账')
      await expect(action.getByText('warehouse.inbound.confirm', { exact: true })).toBeHidden()
      await page.getByRole('button', { name: '关联筛选', exact: true }).click()
      const panel = page.getByRole('region', { name: '关联筛选条件' })
      await expect(panel).toBeVisible()
      await choose('参与岗位', /^仓库 · /)
      await choose('状态对象', /^采购入库 · /)
      await choose('办理权限', /^确认采购或成品入库 · /)
      await page.getByRole('button', { name: '关联筛选', exact: true }).click()
      await expect(guide.locator('[data-chain-stage]')).toHaveCount(17)
      await expect(action).toHaveCount(1)
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      await action.getByRole('button', { name: '查看动作规则', exact: true }).click()
      await expect(page.getByRole('link', { name: '业务规则', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('[data-selected-flow]')).toHaveAttribute('data-selected-flow', 'fact.purchase_receipt')
      await expect(secondary.getByRole('tab', { name: '协同记录', exact: true })).toHaveCount(0)
      await expect(secondary.getByRole('tab', { name: '流程定义', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '返回 业务结构', exact: true }).click()
      await primary.getByRole('tab', { name: '实例跟踪', exact: true }).click()
      await expect(page.getByText(/当前参考：来料检验与材料入库/)).toBeVisible()
      await expect(secondary.getByRole('tab', { name: '协同记录', exact: true })).toBeVisible()
      await expect(secondary.getByRole('tab', { name: '流程轨迹', exact: true })).toBeVisible()
      await primary.getByRole('tab', { name: '业务结构', exact: true }).click()
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      await page.reload()
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      await visit('view=chain&chain=all&flow_stage=incoming_quality&flow_object=fact.purchase_receipt&flow_permission=quality.inspection.update')
      await expect(guide.getByText(/本环节没有同时满足条件的动作/)).toBeVisible()
      await expect(page.locator('[data-relation-action]')).toHaveCount(0)
      await expect(guide.locator('[data-selected-substep]')).toHaveCount(0)
      await guide.getByRole('button', { name: '移除办理权限筛选', exact: true }).click()
      await expect(page.locator('[data-relation-action]')).toContainText('确认本次合格行入库')
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1080 })
        await assertNoHorizontalOverflow(page, `关联详情 ${width}`)
        const before = await primary.boundingBox()
        await action.getByRole('button', { name: '查看动作规则', exact: true }).click()
        await expect(page.locator('[data-selected-flow]')).toBeVisible()
        await page.getByRole('button', { name: '返回 业务结构', exact: true }).click()
        await expect(primary.getByRole('tab', { name: '业务结构', exact: true })).toHaveAttribute('aria-selected', 'true')
        const after = await primary.boundingBox()
        assert(Math.abs(before.x - after.x) <= 1 && Math.abs(before.width - after.width) <= 1, '主导航宽度和位置稳定')
        await page.getByRole('button', { name: '关联筛选', exact: true }).click()
        await expect(panel).toBeVisible()
        const geometry = await panel.boundingBox()
        assert(geometry.x >= 0 && geometry.x + geometry.width <= width + 1)
        await page.getByRole('button', { name: '关联筛选', exact: true }).click()
      }
      await expect(panel).toBeHidden()
      await page.locator('[data-relation-action]').scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(outputDir, 'business-relations-stage.png') })
      await page.goto(new URL('/__dev/business-topics?flow_object=fact.purchase_receipt&flow_permission=quality.inspection.update', page.url()).href)
      await expect(page.getByText(/没有同时满足条件的专题/)).toBeVisible()
      await expect(page.locator('[data-topic-diagram]')).toHaveCount(0)
      await page.getByRole('button', { name: '移除办理权限筛选', exact: true }).click()
      await expect(page.locator('[data-topic-diagram]')).toBeVisible()
      await assertNoHorizontalOverflow(page)
      await visit('view=states&chain=all&flow_object=fact.purchase_receipt&flow_permission=quality.inspection.update')
      await expect(page.locator('[data-selected-flow]')).toHaveCount(0)
      await expect(page.getByRole('region', { name: '当前规则范围' })).toContainText('全部关联动作')
      await page.getByRole('button', { name: '移除办理权限筛选', exact: true }).click()
      await expect(page.locator('[data-selected-flow]')).toBeVisible()
      await page.getByRole('button', { name: '查看全部定义', exact: true }).click()
      assert(!new URL(page.url()).searchParams.has('flow_object'), '查看全部定义显式清除关系条件')
      await visit('view=states&chain=purchase_to_inventory&flow_stage=sales_order')
      await expect(page.locator('[data-chain-projection-context]')).toHaveAttribute('data-chain-projection-context', 'purchase_to_inventory')
      await expect(page.getByRole('region', { name: '当前规则范围' })).toContainText('采购')
    },
  }, {
    name: 'dev-finished-quality-responsibility',
    path: '/__dev/status-flows?view=chain&chain=all&flow_stage=finished_quality&flow_substep=passed',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const action = page.locator('[data-relation-action]')
      await expect(action).toContainText('系统自动处理')
      await expect(action).toContainText('质检事务自动回写')
      await expect(action).toContainText('没有额外的手工接收步骤')
      await expect(action).not.toContainText('具有对应业务权限的岗位')
      await action.getByText('系统自动处理', { exact: true }).scrollIntoViewIfNeeded()
      await expect(action.getByText('系统自动处理', { exact: true })).toBeVisible()
      await assertNoHorizontalOverflow(page)
      await page.screenshot({ path: path.join(outputDir, 'finished-quality-system-result.png'), fullPage: false })
    },
  }]
}
