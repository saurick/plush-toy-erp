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
        const detail = (name) =>
          editor
            .locator('.erp-chain-design__canvas-bar')
            .getByText(name, { exact: true })
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
        const search = editor.getByRole('textbox', { name: '搜索业务节点' })
        await search.fill('提交委外订单')
        await search.press('Enter')
        await action('加入：提交委外订单').click()
        await action('关闭画布说明').click()
        const node = action('查看节点：提交委外订单')
        await expect(action('调整布局')).toHaveAttribute(
          'aria-pressed',
          'false'
        )
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
        await action('调整布局').click()
        await drag()
        const manual = await working()
        assert.equal(
          manual.nodes.find(({ id }) => id === initial.map.focusId).manual,
          true
        )
        assert.notDeepEqual(manual.nodes, initial.nodes)
        await action('调整布局').click()
        await action('下游再一层').click()
        const first = await working()
        assert.equal(first.map.visibleIds.length, 2)
        stable(manual, first)
        await action('下游再一层').click()
        const second = await working()
        assert(second.map.visibleIds.length > first.map.visibleIds.length)
        stable(first, second)
        await detail('全部已载入节点').click()
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
        await detail('链路概览').click()
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
          .getByRole('button', { name: '收起这条链路', exact: true })
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
        await detail('业务步骤').click()
        await node.click()
        await card
          .getByRole('button', { name: '聚焦此处', exact: true })
          .click()
        await detail('链路概览').click()
        await action('保存当前').click()
        const naming = page.getByRole('dialog', {
          name: '保存本地视图',
          exact: true,
        })
        await naming
          .getByRole('textbox', { name: '视图名称', exact: true })
          .fill('地图式阅读验证')
        await naming.getByRole('button', { name: '保存', exact: true }).click()
        const saved = await working()
        await page.reload()
        await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
        assert.deepEqual(
          await working(),
          saved,
          '刷新恢复范围、颗粒度、展开状态和手动位置'
        )
        await expect(action('调整布局')).toHaveAttribute(
          'aria-pressed',
          'false'
        )
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
        await action('查看节点：采购入库的退货、调整与冲正').click()
        await action('只看这条链路').click()
        await detail('全部已载入节点').click()
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
        await action('调整布局').click()
        await purchaseAdjustment.press('ArrowDown')
        await action('调整布局').click()
        const moved = await drawn()
        assert.notDeepEqual(moved, compact, '局部图仍可手动调整')
        await action('重新排布').click()
        assert.deepEqual(await drawn(), compact, '重新排布仍能整理局部布局')
        await action('撤销').click()
        assert.deepEqual(await drawn(), moved, '局部主动重排可撤销')
        await action('重做').click()
        await fitAll.click()
        await action('下游再一层').click()
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
        assert.deepEqual(
          writes.get(page),
          [],
          '地图探索只保存本地阅读状态，不写业务接口'
        )
      },
    },
  ]
}
