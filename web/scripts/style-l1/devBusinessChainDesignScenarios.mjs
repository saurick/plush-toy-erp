import { expect } from 'playwright/test'
import { chooseGranularity, chooseLayout, chooseExplorerAction, openExplorerActions, searchWholeLibrary } from './devFlowExplorerControls.mjs'
import { chooseChainNodeView } from './devBusinessChainNodeFilterAssertions.mjs'
import { createDevBusinessChainDesignFullscreenScenarios } from './devBusinessChainDesignFullscreenAssertions.mjs'
import { createDevBusinessChainDesignViewportScenarios } from './devBusinessChainDesignViewportScenarios.mjs'
import { createDevBusinessChainDesignMainlineScenarios } from './devBusinessChainDesignMainlineScenarios.mjs'
import { createDevBusinessChainMapScenarios } from './devBusinessChainMapScenarios.mjs'
import { createDevFlowExplorerScenarios } from './devFlowExplorerScenarios.mjs'

export function createDevBusinessChainDesignScenarios({
  assert,
  assertNoHorizontalOverflow,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    ...createDevFlowExplorerScenarios({ assert, assertNoHorizontalOverflow, startNoWriteAudit }),
    ...createDevBusinessChainMapScenarios({ assert, startNoWriteAudit }),
    ...createDevBusinessChainDesignFullscreenScenarios({
      assert,
      startNoWriteAudit,
    }),
    ...createDevBusinessChainDesignViewportScenarios({
      assert,
      startNoWriteAudit,
    }),
    ...createDevBusinessChainDesignMainlineScenarios({
      assert,
      startNoWriteAudit,
    }),
    {
      name: 'dev-business-chain-design-desktop',
      path: '/__dev/flow-explorer?new=blank',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const editor = page.getByRole('region', {
          name: '流程探索',
          exact: true,
        })
        await searchWholeLibrary(editor)
        // Object-level gestures remain available through the complete node library.
        await chooseChainNodeView(page, editor, '全部')
        const saveStatus = editor.getByRole('status', {
          name: '视图保存状态',
          exact: true,
        })
        const more = editor.getByRole('button', { name: '更多视图操作', exact: true })
        const flowBoundary = page.locator(
          '.erp-dev-fulfillment-guide__boundary'
        )
        const add = async (name) => {
          await searchWholeLibrary(editor)
          await editor
            .getByRole('button', { name: `加入：${name}`, exact: true })
            .click()
          await editor
            .getByRole('button', { name: '关闭画布说明', exact: true })
            .click()
        }
        await expect(editor.getByRole('status', { name: '节点筛选结果' })).toHaveAttribute('title', '全库 11 条链路')
        await expect(saveStatus).toHaveCount(0)
        await expect(flowBoundary).toHaveCount(0)
        await expect(
          editor.getByRole('button', { name: '岗位高亮：全链路视角', exact: true })
        ).toBeVisible()
        await expect(editor.getByRole('combobox', { name: '选择收藏视图' })).toHaveCount(0)
        const menu = await openExplorerActions(editor)
        const undo = menu.getByRole('menuitem', { name: '撤销', exact: true })
        await expect(undo).toBeDisabled()
        await expect(menu.getByRole('menuitem')).toHaveText(['撤销', '重做', '新建空白视图', '导出当前范围', '在新标签页新建'])
        await more.click()
        await expect(
          page.getByRole('link', { name: '业务规则', exact: true })
        ).toHaveAttribute('href', '/__dev/business-rules')
        await chooseLayout(editor, '阶段排布')
        await chooseGranularity(editor, '节点明细')
        await add('销售订单')
        await add('提交后启动受理')
        await add('销售订单受理流程')
        await expect.poll(() => editor.evaluate((element) =>
          element.querySelector('.erp-chain-design__viewport').getBoundingClientRect().width >=
            element.querySelector('.erp-chain-design__canvas-area').getBoundingClientRect().width - 2
        ), { message: '关闭详情后恢复全部画布宽度，再开始拖线' }).toBe(true)
        await openExplorerActions(editor)
        await expect(undo).toBeEnabled()
        await more.click()
        await expect(saveStatus).toHaveCount(0)
        await editor.getByRole('button', { name: '切换画布为纵向布局', exact: true }).click()
        await expect(editor.getByRole('region', { name: '流程探索画布', exact: true })).toHaveAttribute('data-direction', 'TB')
        const from = editor.getByRole('button', {
          name: '从销售订单拖出连线',
          exact: true,
        })
        const to = editor.getByRole('button', {
          name: '查看节点：提交后启动受理',
          exact: true,
        })
        const a = await from.boundingBox()
        const b = await to.boundingBox()
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
        await page.mouse.down()
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {
          steps: 8,
        })
        await expect(
          editor.locator('[data-design-node][data-candidate="known"]')
        ).toHaveCount(1)
        await page.mouse.up()
        await expect(
          editor.locator('[data-connection-status]')
        ).toHaveAttribute('data-connection-status', 'known')
        await expect(editor.locator('[data-design-edge]')).toHaveCount(0)
        const initialURL = page.url()
        await editor
          .getByRole('button', { name: '加入视图连线', exact: true })
          .click()
        await expect(editor.locator('[data-design-edge="known"]')).toHaveCount(
          1
        )
        await chooseExplorerAction(editor, '撤销')
        await expect(editor.locator('[data-design-edge]')).toHaveCount(0)
        await expect(editor.locator('[data-design-node]')).toHaveCount(3)
        await chooseExplorerAction(editor, '重做')
        await expect(editor.locator('[data-design-edge="known"]')).toHaveCount(1)
        assert.equal(page.url(), initialURL, '画布连线与条件检查不触发页面跳转')
        await from.click()
        await editor
          .getByRole('button', {
            name: '查看节点：销售订单受理流程',
            exact: true,
          })
          .click()
        await expect(
          editor.locator('[data-connection-status]')
        ).toHaveAttribute('data-connection-status', 'blocked')
        await expect(
          editor.getByRole('button', { name: '加入视图连线', exact: true })
        ).toHaveCount(0)
        await editor
          .getByRole('button', { name: '取消连线', exact: true })
          .click()
        await add('采购订单')
        await from.click()
        await editor
          .getByRole('button', { name: '查看节点：采购订单', exact: true })
          .click()
        await expect(
          editor.locator('[data-connection-status]')
        ).toHaveAttribute('data-connection-status', 'unknown')
        await editor
          .getByRole('button', { name: '保留待核对参考线', exact: true })
          .click()
        await expect(
          editor.locator('[data-design-edge="unknown"] .erp-chain-design__edge')
        ).not.toHaveAttribute('marker-end', /.+/u)
        await expect(saveStatus).toHaveCount(0)
        await page.reload()
        await chooseChainNodeView(page, editor, '全部')
        await expect(saveStatus).toHaveCount(0)
        await expect(editor.locator('[data-design-node]')).toHaveCount(4)
        await expect(editor.locator('[data-design-edge]')).toHaveCount(2)
        const search = editor.getByRole('textbox', {
          name: '搜索链路或业务节点',
          exact: true,
        })
        await search.fill('BOM')
        await search.press('Enter')
        await expect(
          editor
            .locator('.erp-chain-design__library-item')
            .filter({ hasText: '有效 BOM' })
        ).toContainText('工程')
        await search.fill('采购审批任务')
        await search.press('Enter')
        await add('采购订单审批')
        await editor
          .getByRole('button', { name: '查看节点：采购订单审批', exact: true })
          .click()
        await editor.getByRole('tab', { name: '状态', exact: true }).click()
        await expect(
          editor.locator('.erp-chain-design__state-preview').getByText(/任务完成不代表库存/u)
        ).toBeVisible()
        await editor
          .getByRole('button', { name: '关闭画布说明', exact: true })
          .click()
        for (const width of [1920, 1280, 1024]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page)
          const library = await editor
            .locator('.erp-chain-design__library-list')
            .evaluate((el) => ({
              height: el.clientHeight,
              content: el.scrollHeight,
            }))
          assert(
            library.height > 0 && library.height < 900,
            '节点库保持有界滚动'
          )
          await expect(
            editor.getByRole('button', { name: '更多视图操作', exact: true })
          ).toBeInViewport()
          await expect(editor.getByRole('button', { name: '保存视图', exact: true })).toHaveCount(0)
          await editor.getByRole('button', { name: '图例与操作说明', exact: true }).click()
          const legend = editor.getByRole('dialog', { name: '画布图例', exact: true })
          await expect(legend).toBeVisible()
          await legend.press('Escape')
          await expect(legend).toBeHidden()
        }
        await page
          .getByRole('link', { name: '业务链路', exact: true })
          .click()
        await expect(page.getByRole('tab', { name: '订单全流程', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(flowBoundary).toBeVisible()
        await page.getByRole('link', { name: '流程探索', exact: true }).click()
        await editor.getByRole('button', { name: '展开节点库', exact: true }).click()
        await chooseChainNodeView(page, editor, '全部')
        await expect(flowBoundary).toHaveCount(0)
        await expect(saveStatus).toHaveCount(0)
        await expect(editor.locator('[data-design-node]')).toHaveCount(5)
        await expect(page.getByRole('heading', { name: '流程探索', level: 1 })).toBeVisible()
        await expect(page.getByRole('tablist', { name: '流程视图' })).toHaveCount(0)
        await page.setViewportSize({ width: 1920, height: 1080 })
        await search.fill('')
        await search.press('Enter')
        await from.click()
        await to.click()
        await expect(
          editor.locator('[data-connection-status]')
        ).toHaveAttribute('data-connection-status', 'known')
        await editor
          .getByRole('button', { name: '取消连线', exact: true })
          .click()
        await editor
          .getByRole('button', { name: '全屏探索', exact: true })
          .click()
        await openExplorerActions(editor)
        await expect(undo).toBeInViewport()
        await expect(
          page.getByRole('menuitem', { name: '导出当前范围', exact: true })
        ).toBeInViewport()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menuitem', { name: '导出当前范围', exact: true })).toBeHidden()
        await expect(
          page.getByRole('dialog', { name: '流程探索全屏', exact: true })
        ).toBeVisible()
        await expect(
          editor.getByRole('button', { name: '更多视图操作', exact: true })
        ).toBeFocused()
        await editor.getByRole('button', { name: '退出全屏', exact: true }).click()
        await page.reload()
        await chooseChainNodeView(page, editor, '全部')
        await expect(editor.locator('[data-design-node]')).toHaveCount(5)
        assert.deepEqual(writes.get(page), [], '视图编辑不调用业务写接口')
      },
    },
  ]
}
