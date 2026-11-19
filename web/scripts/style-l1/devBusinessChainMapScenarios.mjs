import { chooseDisplay, chooseExplorerAction } from './devFlowExplorerControls.mjs'
import { expect } from 'playwright/test'

export function createDevBusinessChainMapScenarios({
  assert,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    {
      name: 'dev-business-chain-map-desktop',
      path: '/__dev/flow-explorer?new=blank',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const editor = page.getByRole('region', {
          name: '流程探索',
          exact: true,
        })
        const canvas = editor.getByRole('region', {
          name: '流程探索画布',
          exact: true,
        })
        const card = editor.locator('.erp-chain-design__card')
        const action = (name) =>
          editor.getByRole('button', { name, exact: true })
        const detail = (name) => chooseDisplay(editor, name)
        const working = () =>
          page.evaluate(
            () =>
              JSON.parse(
                sessionStorage.getItem(
                  'plush-workbench:business-chain-design:working'
                )
              ).draft
          )
        const chooseScope = async (name) => {
          await editor
            .locator('.ant-select')
            .filter({
              has: page.getByRole('combobox', {
                name: '选择流程范围',
                exact: true,
              }),
            })
            .locator('.ant-select-selector')
            .click()
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText(name, { exact: true })
            .click()
        }
        const stable = (before, after) => {
          for (const node of before.nodes) {
            assert.deepEqual(
              after.nodes.find(({ id }) => id === node.id),
              node,
              '范围变化保留已有节点的精确位置'
            )
          }
        }
        const upstream = action('往前展开一步')
        const downstream = action('往后展开一步')
        await expect(upstream).toHaveCount(0)
        await expect(downstream).toHaveCount(0)
        const search = editor.getByRole('textbox', { name: '搜索业务节点' })
        await search.fill('提交委外订单')
        await search.press('Enter')
        await action('加入：提交委外订单').click()
        await action('关闭画布说明').click()
        const node = action('查看节点：提交委外订单')
        await expect(canvas).not.toHaveAttribute('data-adjusting', 'true')
        const initial = await working()
        const drag = async () => {
          const box = await node.boundingBox()
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(
            box.x + box.width / 2 + 70,
            box.y + box.height / 2 + 35,
            { steps: 6 }
          )
          await page.mouse.up()
        }
        await drag()
        assert.deepEqual(
          await working(),
          initial,
          '默认阅读时拖动节点不会改变布局'
        )
        if (await card.isVisible()) await action('关闭画布说明').click()
        await chooseExplorerAction(editor, '调整布局')
        await drag()
        const manual = await working()
        assert.equal(
          manual.nodes.find(({ id }) => id === initial.map.focusId).manual,
          true
        )
        assert.notDeepEqual(manual.nodes, initial.nodes)
        await action('结束调整').click()
        await action('往后展开一步').click()
        const first = await working()
        assert.equal(first.map.visibleIds.length, 2)
        stable(manual, first)
        await action('往后展开一步').click()
        const second = await working()
        assert(second.map.visibleIds.length > first.map.visibleIds.length)
        stable(first, second)
        await detail('全部已载入节点')
        assert.deepEqual((await working()).nodes, second.nodes, '显示全部已载入节点不新增内容或改变手动位置')
        assert.deepEqual((await working()).edges, second.edges, '显示切换保留已载入关系')
        assert.deepEqual(
          (await working()).map.visibleIds,
          second.map.visibleIds,
          '颗粒度与范围独立'
        )
        stable(second, await working())
        await action('回到整体').click()
        await expect(canvas).toHaveAttribute('data-map-scope', 'whole')
        await expect(canvas).toHaveAttribute('data-view-mode', 'all')
        const whole = await working()
        assert(whole.map.visibleIds.length > second.map.visibleIds.length)
        stable(manual, whole)
        await node.click()
        await card
          .getByRole('button', { name: '聚焦此处', exact: true })
          .click()
        await expect(canvas).toHaveAttribute('data-map-scope', 'local')
        const local = await working()
        assert(local.map.visibleIds.length < whole.map.visibleIds.length)
        stable(whole, local)
        await detail('链路概览')
        assert.deepEqual((await working()).map.visibleIds, local.map.visibleIds)
        await expect(editor.locator('[data-design-node]')).toHaveCount(1)
        await action('查看节点：委外发料到回货应付').click()
        await card
          .getByRole('button', { name: '展开这条链路的步骤', exact: true })
          .click()
        assert((await editor.locator('[data-design-node]').count()) > 1)
        await chooseScope('业务全流程地图')
        await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
        await expect(editor.locator('[data-design-node^="map:"]')).toHaveCount(
          11
        )
        const overview = await working()
        await action('适应画布全图').click()
        await action('查看节点：委外发料到回货应付').click()
        await card
          .getByRole('button', { name: '折叠这条链路为卡片', exact: true })
          .click()
        await expect(editor.locator('[data-design-node]')).toHaveCount(11)
        assert.deepEqual(
          (await working()).map.summaries,
          overview.map.summaries,
          '收起区域不移动其他概览节点'
        )
        await action('适应画布全图').click()
        await action('查看节点：委外发料到回货应付').click()
        await card
          .getByRole('button', { name: '展开这条链路的步骤', exact: true })
          .click()
        await chooseScope('委外发料到回货应付')
        await detail('业务步骤')
        await node.click()
        await card
          .getByRole('button', { name: '聚焦此处', exact: true })
          .click()
        await detail('链路概览')
        const saved = await working()
        await page.reload()
        await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
        assert.deepEqual(
          await working(),
          saved,
          '刷新恢复范围、颗粒度、展开状态和手动位置'
        )
        await expect(canvas).not.toHaveAttribute('data-adjusting', 'true')
        await action('回到整体').click()
        stable(manual, await working())
        for (const viewport of [
          { width: 1024, height: 768 },
          { width: 1920, height: 1080 },
        ]) {
          await page.setViewportSize(viewport)
          const layout = await editor.evaluate((element) => {
            const canvas = element
              .querySelector('.erp-chain-design__viewport')
              .getBoundingClientRect()
            const scope = element
              .querySelector('.erp-chain-design__scope-bar')
              .getBoundingClientRect()
            return {
              canvasHeight: canvas.height,
              scopeBottom: scope.bottom,
              canvasTop: canvas.top,
              overflow: document.documentElement.scrollWidth > innerWidth,
            }
          })
          assert(layout.canvasHeight >= 200, '桌面收缩仍保留可阅读画布')
          assert(layout.scopeBottom <= layout.canvasTop, '范围操作不覆盖画布')
          assert.equal(layout.overflow, false)
        }

        const drawn = async () => ({
          nodes: await canvas.locator('[data-design-node]').evaluateAll((nodes) =>
            nodes.map((node) => ({
              id: node.dataset.designNode,
              x: parseFloat(node.style.left),
              y: parseFloat(node.style.top),
            }))
          ),
        })
        const spanY = (nodes) => {
          const ys = nodes.map(({ y }) => y)
          return Math.max(...ys) - Math.min(...ys)
        }
        await chooseScope('业务全流程地图')
        await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
        await action('适应画布全图').click()
        await chooseScope('采购下单到入库应付')
        await detail('链路概览')
        const scope = editor.getByRole('group', { name: '画布操作', exact: true })
        const boundaryText = '已没有更多前后内容可展开'
        await expect(upstream).toBeEnabled()
        await downstream.click()
        await downstream.click()
        await expect(upstream).toBeVisible()
        await expect(upstream).toBeDisabled()
        await expect(downstream).toBeVisible()
        await expect(downstream).toBeDisabled()
        await expect(scope).toContainText(boundaryText)
        const fullyExpanded = await working()
        const collapseGrowth = action('收起扩展')
        await expect(collapseGrowth).toBeVisible()
        await collapseGrowth.click()
        const collapsed = await working()
        assert(collapsed.map.visibleIds.length < fullyExpanded.map.visibleIds.length)
        assert.deepEqual(collapsed.nodes, fullyExpanded.nodes, '收起扩展保留缓存节点与坐标')
        assert.deepEqual(collapsed.edges, fullyExpanded.edges, '收起扩展保留缓存关系')
        await expect(collapseGrowth).toHaveCount(0)
        await expect(scope).not.toContainText(boundaryText)
        await chooseExplorerAction(editor, '调整布局')
        await action('撤销').click()
        assert.deepEqual((await working()).map.visibleIds, fullyExpanded.map.visibleIds)
        await expect(collapseGrowth).toBeVisible()
        await action('重做').click()
        assert.deepEqual((await working()).map.visibleIds, collapsed.map.visibleIds)
        await downstream.click()
        await downstream.click()
        const reopened = await working()
        assert.deepEqual(reopened.map.visibleIds, fullyExpanded.map.visibleIds)
        stable(fullyExpanded, reopened)
        await action('撤销').click()
        await expect(downstream).toBeEnabled()
        await expect(scope).not.toContainText(boundaryText)
        await action('返回来处').click()
        await action('查看节点：采购入库的退货、调整与冲正').click()
        await action('只看这条链路').click()
        await detail('全部已载入节点')
        await expect(canvas).toHaveAttribute('data-map-scope', 'whole')
        const overviewLayout = await drawn()
        const purchaseAdjustment = action('查看节点：采购入库调整')
        const fitAll = action('适应画布全图')
        const fitWidth = action('适配画布宽度')
        await fitWidth.click()
        await expect(fitWidth).toHaveAttribute('aria-pressed', 'true')
        await purchaseAdjustment.press('Enter')
        await card.getByRole('button', { name: '聚焦此处', exact: true }).click()
        await expect(canvas).toHaveAttribute('data-map-scope', 'local')
        await expect(fitAll).toHaveAttribute('aria-pressed', 'true')
        const compact = await drawn()
        assert.equal(compact.nodes.length, 6, '采购入库调整展示同一组已载入节点')
        const focusedIds = new Set(compact.nodes.map(({ id }) => id))
        const originalNodes = overviewLayout.nodes.filter(({ id }) => focusedIds.has(id))
        assert(
          spanY(compact.nodes) < spanY(originalNodes),
          '聚焦在已紧凑的阶段布局上继续收拢局部节点，无须手动重排'
        )
        assert(
          await canvas.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const items = element.querySelectorAll('[data-design-node], [data-design-edge]')
            return [...items].every((item) => {
              const rect = item.getBoundingClientRect()
              return (
                rect.left >= bounds.left - 1 &&
                rect.right <= bounds.right + 1 &&
                rect.top >= bounds.top - 1 &&
                rect.bottom <= bounds.bottom + 1
              )
            })
          }),
          '聚焦后适应全图能看到所有局部节点和连线'
        )
        await purchaseAdjustment.press('ArrowDown')
        const moved = await drawn()
        assert.notDeepEqual(moved, compact, '局部图仍可手动调整')
        await action('重新排布').click()
        assert.deepEqual(await drawn(), compact, '重新排布仍能整理局部布局')
        await action('撤销').click()
        assert.deepEqual(await drawn(), moved, '局部主动重排可撤销')
        await action('重做').click()
        await fitAll.click()
        await action('往后展开一步').click()
        const extended = await drawn()
        assert(extended.nodes.length > compact.nodes.length, '继续展示更多下游节点')
        stable(compact, extended)
        await action('回到整体').click()
        await expect(canvas).toHaveAttribute('data-map-scope', 'whole')
        assert.deepEqual(
          await drawn(),
          overviewLayout,
          '返回时恢复整图每个节点的位置'
        )
        await chooseScope('生产异常决策与执行')
        await expect(upstream).toBeEnabled()
        await expect(downstream).toBeDisabled()
        await expect(scope).not.toContainText(boundaryText)
        assert.deepEqual(
          writes.get(page),
          [],
          '地图探索只保存本地阅读状态，不写业务接口'
        )
      },
    },
  ]
}
