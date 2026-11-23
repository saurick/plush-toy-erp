import { expect } from 'playwright/test'
import { grainControl, chooseChainScope, chooseGranularity, searchWholeLibrary } from './devFlowExplorerControls.mjs'
import { assertChainNodeFilters } from './devBusinessChainNodeFilterAssertions.mjs'
import { assertChainDesignKeyboard } from './devBusinessChainDesignKeyboardAssertions.mjs'

export function createDevBusinessChainDesignMainlineScenarios({
  assert,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    {
      name: 'dev-business-chain-design-mainline-desktop',
      path: '/__dev/flow-explorer?new=blank',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const editor = page.getByRole('region', {
          name: '流程探索',
          exact: true,
        })
        await searchWholeLibrary(editor)
        const canvas = editor.getByRole('region', {
          name: '流程探索画布',
          exact: true,
        })
        const nodes = editor.locator('[data-design-node]')
        const card = editor.locator('.erp-chain-design__card')
        const search = editor.getByRole('textbox', {
          name: '搜索链路或业务节点',
          exact: true,
        })
        await assertChainNodeFilters(page, editor, assert)
        const working = () =>
          page.evaluate(
            () =>
              JSON.parse(
                sessionStorage.getItem(
                  'plush-workbench:business-chain-design:working'
                )
              ).draft
          )
        await search.fill('IQC 确认')
        await search.press('Enter')
        await editor
          .getByRole('button', {
            name: '加入：IQC 确认本行检验通过',
            exact: true,
          })
          .click()
        await expect(nodes).toHaveCount(1)
        await expect(
          card.getByRole('region', { name: '已登记上游', exact: true })
        ).toContainText('自动建立逐行待检 IQC')
        await expect(
          card.getByRole('region', { name: '已登记下游', exact: true })
        ).toContainText('仓库确认本次合格行入库')
        const anchor = (await working()).nodes[0]
        await card.getByRole('tab', { name: '接入规则', exact: true }).click()
        await expect(card).toContainText('库存由仓库另行入账')
        await card.getByRole('tab', { name: '状态', exact: true }).click()
        await expect(
          card.locator('.erp-chain-design__state-transition')
        ).not.toHaveCount(0)
        await card.getByRole('tab', { name: '上下游', exact: true }).click()
        await card
          .getByRole('button', { name: '展开下游', exact: true })
          .click()
        await expect(nodes).toHaveCount(2)
        await card
          .getByRole('button', { name: '展开完整上下游', exact: true })
          .click()
        assert(
          (await working()).nodes.length > 5,
          '只加入一个步骤也能展开完整的已登记路径'
        )
        assert.deepEqual(
          (await working()).nodes.find((node) => node.id === anchor.id),
          anchor,
          '展开保留原节点坐标'
        )
        const expanded = await working()
        await card
          .getByRole('button', { name: '展开完整上下游', exact: true })
          .click()
        assert.deepEqual(await working(), expanded, '重复展开不复制节点或连线')
        await card
          .getByRole('button', { name: '关闭画布说明', exact: true })
          .click()
        const beforeGranularity = await working()
        const granularity = grainControl(editor)
        const steps = granularity.getByRole('radio', { name: '业务步骤' })
        await expect(steps).toBeChecked()
        await steps.focus()
        assert.deepEqual(await working(), beforeGranularity, '聚焦颗粒度不会修改画布')
        await steps.press('ArrowRight')
        await expect(granularity.getByRole('radio', { name: '节点明细' })).toBeChecked()
        await expect(canvas).toHaveAttribute('data-view-mode', 'all')
        const detailed = await working()
        assert.deepEqual(detailed.map, beforeGranularity.map, '颗粒度不扩大范围或改变展开状态')
        assert.deepEqual(detailed.nodes, beforeGranularity.nodes, '颗粒度不新增节点并保留位置')
        assert.deepEqual(detailed.edges, beforeGranularity.edges, '颗粒度切换保留已载入关系')
        await chooseGranularity(editor, '业务步骤')
        assert.deepEqual((await working()).nodes, beforeGranularity.nodes, '返回业务步骤保留手动位置')
        await chooseChainScope(page, '销售受理到生产准备')
        await search.fill('')
        await search.press('Enter')
        await expect(canvas).toHaveAttribute('data-view-mode', 'mainline')
        for (const label of ['老板批准用料', '财务批准采购']) {
          await expect(
            editor.getByRole('button', {
              name: `查看节点：${label}`,
              exact: true,
            })
          ).toHaveCount(1)
        }
        await expect(
          editor.getByRole('button', {
            name: '查看节点：自动汇总用料并完成两级审核',
            exact: true,
          })
        ).toHaveCount(0)
        await editor
          .getByRole('button', { name: '全屏探索', exact: true })
          .click()
        await editor
          .getByRole('button', { name: '适应画布全图', exact: true })
          .click()
        await expect(editor.getByRole('button', { name: '适应画布全图' })).toHaveAttribute('aria-pressed', 'true')
        await editor.locator('button[data-picker="sales-variant"]').click()
        await page.getByRole('dialog', { name: '选择受理流程' }).getByRole('button', { name: '先办工程资料', exact: true }).click()
        const content = await working()
        await editor
          .locator(
            '[data-design-node="process:sales_to_production:sales_order_acceptance/approval_engineering_pmc:activate_sales_order"]'
          )
          .getByRole('button', { name: '查看节点：生效销售订单', exact: true })
          .click()
        await card.getByRole('tab', { name: '任务与单据', exact: true }).click()
        const tasks = card.getByRole('region', {
          name: '具体岗位任务',
          exact: true,
        })
        await expect(tasks).toContainText('工程资料')
        await expect(tasks).toContainText('订单审批')
        await card
          .getByRole('button', { name: '关闭画布说明', exact: true })
          .click()
        assert.deepEqual(await working(), content, '查看关联任务不改变视图')
        const count = await nodes.count()
        await chooseGranularity(editor, '节点明细')
        assert(
          (await nodes.count()) > count,
          '节点明细显示办理步骤间已载入的单据和业务记录'
        )
        await chooseGranularity(editor, '业务步骤')
        assert.deepEqual(
          (await working()).nodes,
          content.nodes,
          '切换范围保留位置'
        )
        for (const width of [1024, 1920]) {
          await page.setViewportSize({ width, height: 1080 })
          await editor
            .getByRole('button', { name: '适应画布全图', exact: true })
            .click()
          await expect(
            editor.getByRole('button', { name: '更多视图操作', exact: true })
          ).toBeInViewport()
          const bounds = await canvas.boundingBox()
          assert(
            await nodes.evaluateAll(
              (items, b) =>
                items.every((item) => {
                  const r = item.getBoundingClientRect()
                  return (
                    r.left >= b.x &&
                    r.right <= b.x + b.width + 1 &&
                    r.top >= b.y &&
                    r.bottom <= b.y + b.height + 1
                  )
                }),
              bounds
            ),
            '步骤总览完整位于画布内'
          )
        }
        await assertChainDesignKeyboard(page, editor, assert)
        assert.deepEqual(
          writes.get(page),
          [],
          '流程探索、状态预览与保存不调用业务写接口'
        )
      },
    },
  ]
}
