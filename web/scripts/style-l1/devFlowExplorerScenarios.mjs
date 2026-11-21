import fs from 'node:fs/promises'
import { expect } from 'playwright/test'
import { viewTrigger, chooseChainScope, chooseViewOption, chooseExplorerAction, openExplorerActions, searchWholeLibrary } from './devFlowExplorerControls.mjs'
import { createFlowExplorerExportScenario } from './devFlowExplorerExportScenario.mjs'
import { expectDiagramControlTooltip, verifyDiagramControlTooltips } from './diagramViewControlsAssertions.mjs'

const workingKey = 'plush-workbench:business-chain-design:working'
const recentDraft = {
  nodes: [{ id: 'node:purchase_order', x: 96, y: 80, manual: true }],
  edges: [],
  ideas: [{ text: '保留原来的阅读备注' }],
  presentation: { mode: 'all', role: '' },
}

export function createDevFlowExplorerScenarios({
  assert,
  assertNoHorizontalOverflow,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    createFlowExplorerExportScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }),
    createFlowExplorerReadingScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }),
    createFlowExplorerOverviewLanesScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }),
    {
      name: 'dev-flow-explorer-navigation-desktop',
      path: '/__dev/flow-explorer',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writes)
        await page.addInitScript(
          ({ key, draft }) => {
            if (!localStorage.getItem(key)) {
              localStorage.setItem(key, JSON.stringify({ draft }))
            }
          },
          { key: workingKey, draft: recentDraft }
        )
      },
      verify: async (page) => {
        const editor = page.getByRole('region', {
          name: '流程探索',
          exact: true,
        })
        const readWorking = () =>
          page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), workingKey)
        await expect(viewTrigger(editor)).toContainText('阶段排布')
        await expect(
          page.getByRole('heading', { name: '流程探索', level: 1 })
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: '流程探索', exact: true })
        ).toHaveAttribute('aria-current', 'page')
        const labels = await page
          .getByRole('group', { name: '产品与业务工作入口' })
          .getByRole('link')
          .allTextContents()
        assert.equal(labels[labels.indexOf('业务链路') + 1], '流程探索')
        await expect(editor.getByRole('combobox', { name: '选择收藏视图' })).toHaveCount(0)
        await expect(
          editor.getByRole('button', {
            name: '查看节点：采购订单',
            exact: true,
          })
        ).toBeVisible()
        await assertCompactExplorerLayout(page, editor, assert, assertNoHorizontalOverflow)
        await searchWholeLibrary(editor)
        await editor
          .getByRole('button', { name: '加入：预留现有成品', exact: true })
          .click()
        await editor
          .getByRole('button', { name: '关闭画布说明', exact: true })
          .click()
        const workingBefore = await readWorking()
        await page
          .getByRole('link', { name: '业务链路', exact: true })
          .click()
        await expect(page.getByRole('tab', { name: '订单全流程', exact: true })).toHaveAttribute('aria-selected', 'true')
        await page.getByRole('link', { name: '流程探索', exact: true }).click()
        await expect(
          editor.getByRole('status', { name: '视图保存状态' })
        ).toHaveCount(0)
        assert.deepEqual(await readWorking(), workingBefore)
        await page.reload()
        await expect(editor).toBeVisible()
        assert.deepEqual(await readWorking(), workingBefore)

        await page.goto(new URL(
          '/__dev/status-flows?view=chain&chain=all&flow_stage=incoming_quality&flow_role=purchase',
          page.url()
        ).href)
        const opener = page.getByRole('link', { name: '在流程探索中查看链路', exact: true })
        await expect(opener).toHaveAttribute('href', '/__dev/flow-explorer?chain=purchase_to_inventory')
        await opener.scrollIntoViewIfNeeded()
        const source = new URL(page.url())
        await opener.click()
        await expect(page.getByRole('button', { name: '流程范围：采购下单到入库应付' })).toBeVisible()
        await expect(page).toHaveURL(/\/__dev\/flow-explorer$/u)
        await page.getByRole('button', { name: '返回 订单全流程', exact: true }).click()
        await expect(page).toHaveURL(source.href)
        await expect(opener).toBeFocused()
        await opener.click()
        await expect(editor).toBeVisible()
        await expect.poll(async () => (await readWorking()).draft.map.scope).toBe('whole')
        const restored = (await readWorking()).draft
        assert.deepEqual(restored.nodes.find((node) => node.id === 'node:purchase_order'), recentDraft.nodes[0])
        assert.deepEqual(restored.ideas, recentDraft.ideas)
        await assertNoHorizontalOverflow(page)
        assert.deepEqual(writes.get(page), [], '探索与保存只使用浏览器视图存储')
      },
    },
  ]
}

function createFlowExplorerOverviewLanesScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }) {
  const writes = new WeakMap()
  return {
    name: 'dev-flow-explorer-overview-lanes-desktop',
    path: '/__dev/flow-explorer',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: (page) => startNoWriteAudit(page, writes),
    verify: async (page) => {
      const editor = page.getByRole('region', { name: '流程探索', exact: true })
      const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
      const nodePositions = () => canvas.locator('[data-design-node]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.designNode, x: node.style.left, y: node.style.top })))
      const click = (name) => editor.getByRole('button', { name, exact: true }).click()
      const switchLayout = editor.locator('[data-diagram-layout-action="toggle"]')
      const fitAll = editor.getByRole('button', { name: '适应画布全图', exact: true })
      const controls = editor.getByRole('group', { name: '画布视图操作', exact: true })
      const edgePaths = () => canvas.locator('[data-design-edge] .erp-chain-design__edge').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')))
      await click('查看节点：销售受理到生产准备')
      const mapPositions = await nodePositions()
      const mapEdges = await edgePaths()
      await verifyDiagramControlTooltips(page, controls, '切换为纵向布局')
      await switchLayout.press('Enter')
      await expect(canvas).toHaveAttribute('data-direction', 'TB')
      await expect(switchLayout).toBeFocused()
      await expectDiagramControlTooltip(controls, '切换为横向布局')
      await expect(fitAll).toHaveAttribute('aria-pressed', 'true')
      await expect(editor.locator('.erp-chain-design__card')).toContainText('用途与交接')
      const verticalMap = await nodePositions()
      const position = (items, id) => items.find((node) => node.id === `map:${id}`)
      assert(parseFloat(position(mapPositions, 'sales_to_production').x) < parseFloat(position(mapPositions, 'purchase_to_inventory').x))
      assert(parseFloat(position(verticalMap, 'sales_to_production').y) < parseFloat(position(verticalMap, 'purchase_to_inventory').y))
      assert.deepEqual(verticalMap.map((node) => node.id), mapPositions.map((node) => node.id), '方向切换保留全部链路卡片')
      const verticalEdges = await edgePaths()
      assert.equal(verticalEdges.length, mapEdges.length)
      assert.notDeepEqual(verticalEdges, mapEdges, '连线跟随节点重新定位')
      await switchLayout.click()
      await expect(canvas).toHaveAttribute('data-direction', 'LR')
      assert.deepEqual(await nodePositions(), mapPositions, '切回横向恢复原坐标')
      await click('关闭画布说明')
      await chooseChainScope(page, '销售受理到生产准备')
      await expect(switchLayout).toHaveCount(0)
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      const mainlinePositions = await nodePositions()
      const savedMap = () => page.evaluate((key) => {
        const { nodes, edges, map } = JSON.parse(sessionStorage.getItem(key)).draft
        return { nodes, edges, map }
      }, workingKey)
      const beforeDisplay = await savedMap()
      const trigger = viewTrigger(editor)
      const panel = page.getByRole('dialog', { name: '画布视图', exact: true })
      const radio = (label) => panel.getByRole('radio', { name: label, exact: true })
      const pick = (label) => radio(label).locator('xpath=ancestor::label[1]').click()
      await trigger.press('Enter')
      await expect(radio('业务步骤')).toBeFocused()
      await expect(radio('业务泳道')).toBeChecked()
      await pick('全部已载入节点')
      await expect(trigger).toHaveText('全部已载入节点 · 业务泳道')
      await expect(panel).toBeVisible()
      assert((await nodePositions()).length > mainlinePositions.length, '切换显示能看到已载入的单据和记录')
      assert.deepEqual(await savedMap(), beforeDisplay, '切换显示保留原范围、节点、坐标和关系')
      await pick('阶段排布')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(0)
      await pick('链路概览')
      await expect(panel).toContainText('展开后布局')
      await pick('业务泳道')
      await expect(canvas.locator('[data-design-node]')).toHaveCount(1)
      await expect(trigger).toHaveText('链路概览 · 业务泳道')
      await radio('业务泳道').press('Escape')
      await expect(trigger).toBeFocused()
      await trigger.click()
      await expect(radio('链路概览')).toBeChecked()
      await expect(radio('业务泳道')).toBeChecked()
      await panel.getByRole('button', { name: '关闭视图面板' }).click()
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(0)
      await click('查看节点：销售受理到生产准备')
      await click('展开这条链路的步骤')
      await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
      await expect(viewTrigger(editor)).toContainText('业务泳道')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      const overviewPositions = await nodePositions()
      for (const previous of mainlinePositions) assert.deepEqual(overviewPositions.find((node) => node.id === previous.id), previous, '概览展开沿用原步骤位置')
      const scope = editor.locator('[aria-label="当前探索范围"]')
      await expect(scope).toContainText('19 步')
      const assertSingleChainFit = async () => {
        await expect(canvas.locator('[data-design-node^="map:"]')).toHaveCount(0)
        await expect.poll(() => canvas.evaluate((area) => {
          const viewport = area.getBoundingClientRect()
          const boxes = [...area.querySelectorAll('.erp-chain-design__lane,[data-design-node],[data-design-edge]')].map((el) => el.getBoundingClientRect())
          const top = Math.min(...boxes.map((box) => box.top))
          return top >= viewport.top - 1 && top <= viewport.top + 18 &&
            boxes.every((box) => box.left >= viewport.left - 1 && box.right <= viewport.right + 1 && box.bottom <= viewport.bottom + 1)
        }), { message: '适应全图从泳道顶部开始，包含当前步骤、泳道和连线' }).toBe(true)
      }
      await click('适应画布全图')
      await assertSingleChainFit()
      await click('适配画布宽度')
      await expect.poll(() => canvas.locator('.erp-chain-design__lane').evaluateAll((lanes) => {
        const boxes = lanes.map((lane) => lane.getBoundingClientRect()).sort((a, b) => a.top - b.top)
        return boxes.every((box, index) => box.width > 0 && box.height > 0 && (!index || boxes[index - 1].bottom <= box.top))
      }), { message: '概览展开后的领域泳道具有独立且不重叠的可见分区' }).toBe(true)
      if (process.env.STYLE_L1_OUTPUT_DIR) await page.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/swimlane-overview-expanded.png` })
      await chooseViewOption(editor, '阶段排布')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(0)
      await click('展开分支')
      await click('查看节点：完成订单工程资料')
      const readDraft = () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)).draft, workingKey)
      const beforeDirection = await readDraft()
      const stagePositions = await nodePositions()
      await switchLayout.click()
      await expect(canvas).toHaveAttribute('data-direction', 'TB')
      await expect(editor.locator('.erp-chain-design__card')).toContainText('完成订单工程资料')
      await expect(fitAll).toHaveAttribute('aria-pressed', 'true')
      assert.notDeepEqual(await nodePositions(), stagePositions, '阶段排布按新方向展示节点')
      const afterDirection = await readDraft()
      assert.deepEqual(afterDirection.map, beforeDirection.map, '切换方向保留范围和展开状态')
      assert.deepEqual(afterDirection.nodes, beforeDirection.nodes, '切换方向保留保存的节点坐标')
      assert.deepEqual(afterDirection.edges, beforeDirection.edges, '切换方向保留原有连线')
      await click('关闭画布说明')
      await page.reload()
      await expect(canvas).toHaveAttribute('data-direction', 'TB')
      await expect(editor.getByRole('button', { name: '收起分支', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await switchLayout.click()
      await click('收起分支')
      await chooseViewOption(editor, '业务泳道')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      const rearrangedOverview = await nodePositions()
      await scope.getByRole('button', { name: '折叠为链路卡片' }).click()
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(0)
      await expect(canvas.locator('[data-design-node]:not([data-design-node^="map:"])')).toHaveCount(0)
      await expect(canvas.locator('[data-design-node^="map:"]')).toHaveCount(1)
      await scope.getByRole('button', { name: '展开链路步骤' }).click()
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      assert.deepEqual(await nodePositions(), rearrangedOverview, '概览收起和再次展开保留泳道内的步骤坐标')
      await page.addInitScript((key) => {
        const saved = JSON.parse(sessionStorage.getItem(key))
        if (!saved) return
        saved.draft.map.summaries.find((item) => item.id === saved.draft.map.chainKey).y = -800
        saved.draft.presentation.viewport = { mode: 'fit-all', scale: 0.18, x: 80, y: 350 }
        sessionStorage.setItem(key, JSON.stringify(saved))
      }, workingKey)
      await page.reload()
      await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      await assertSingleChainFit()
      assert.deepEqual(await nodePositions(), rearrangedOverview, '刷新恢复概览的泳道布局与步骤坐标')
      await chooseViewOption(editor, '业务步骤')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      await assertNoHorizontalOverflow(page)
      assert.deepEqual(writes.get(page), [], '概览布局切换只调整浏览器内的阅读视图')
    },
  }
}

function createFlowExplorerReadingScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }) {
  const writes = new WeakMap()
  return {
    name: 'dev-flow-explorer-reading-desktop',
    path: '/__dev/flow-explorer',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: (page) => startNoWriteAudit(page, writes),
    verify: async (page) => {
      const editor = page.getByRole('region', { name: '流程探索', exact: true })
      const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
      const card = editor.locator('.erp-chain-design__card')
      const surface = editor.locator('.erp-chain-design__surface')
      const camera = () => surface.evaluate((element) => element.style.transform)
      const nodePositions = () => editor.locator('[data-design-node]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.designNode, x: node.style.left, y: node.style.top })))
      const choose = async (label, value) => {
        await editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: label, exact: true }) }).locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').getByText(value, { exact: true }).click()
      }
      const click = (name) => editor.getByRole('button', { name, exact: true }).click()
      const search = editor.getByRole('textbox', { name: '搜索业务节点', exact: true })
      const crossChain = editor.getByRole('button', { name: '跨链关系', exact: true })
      const crossChainEdges = canvas.locator('[data-design-edge][data-relation-kind]')
      await expect(editor.locator('[data-design-node^="map:"]')).toHaveCount(11)
      const scopeSummary = editor.getByRole('status', { name: '当前探索范围', exact: true })
      await expect(scopeSummary).toHaveText('11 个节点')
      await expect(crossChain).toHaveCount(0)
      await expect(viewTrigger(editor)).toContainText('链路概览 · 跨链：主线与供给')
      const roleTrigger = editor.getByRole('button', { name: /^岗位高亮：/u })
      const rolePanel = page.getByRole('dialog', { name: '选择高亮岗位', exact: true })
      const pickRole = async (name) => {
        await roleTrigger.click()
        await rolePanel.getByRole('button', { name, exact: true }).click()
        await expect(rolePanel).toBeHidden()
        await expect(roleTrigger).toBeFocused()
      }
      await roleTrigger.press('ArrowDown')
      const clearRole = rolePanel.getByRole('button', { name: '全链路视角', exact: true })
      await expect(clearRole).toBeFocused()
      await expect(rolePanel.getByRole('group', { name: '本图有节点' })).toHaveCount(0)
      await expect(rolePanel.getByRole('group', { name: '本图暂无节点' }).getByRole('button', { name: '品质' })).toBeVisible()
      await expect(rolePanel).toContainText('展开一条链路的步骤后，可查看办理岗位。')
      await clearRole.press('Escape')
      await expect(roleTrigger).toBeFocused()
      const normalEdgeCount = await crossChainEdges.count()
      assert(normalEdgeCount > 0, '总图默认显示跨链主线')
      await viewTrigger(editor).click()
      const normalRelations = page.getByRole('checkbox', { name: '主线与供给', exact: true })
      const exceptionRelations = page.getByRole('checkbox', { name: '异常与回接', exact: true })
      await exceptionRelations.click()
      await expect(exceptionRelations).toBeChecked()
      await expect.poll(() => crossChainEdges.count()).toBeGreaterThan(normalEdgeCount)
      await exceptionRelations.click()
      await expect(exceptionRelations).not.toBeChecked()
      await normalRelations.click()
      await expect(normalRelations).not.toBeChecked()
      await expect(crossChainEdges).toHaveCount(0)
      await expect(viewTrigger(editor)).toContainText('跨链：')
      await normalRelations.click()
      await expect(normalRelations).toBeChecked()
      await expect(crossChainEdges).toHaveCount(normalEdgeCount)
      await viewTrigger(editor).click()
      await click('查看节点：销售受理到生产准备')
      await expect(card).toContainText('用途与交接')
      await expect(card).toContainText('从什么开始')
      await expect(card).toContainText('交出什么结果')
      await click('关闭画布说明')
      const scopeTrigger = editor.getByRole('button', { name: '流程范围：业务全流程地图', exact: true })
      const picker = page.getByRole('dialog', { name: '选择流程范围', exact: true })
      await scopeTrigger.press('ArrowDown')
      const selectedScope = picker.getByRole('button', { pressed: true })
      await expect(selectedScope).toBeFocused()
      await expect(selectedScope).toHaveText('业务全流程地图')
      await expect(picker.getByRole('group')).toHaveCount(4)
      await expect(picker.getByRole('group').getByRole('button')).toHaveCount(11)
      assert(await picker.locator('.erp-chain-design__picker-options').evaluate((list) => list.scrollHeight <= list.clientHeight + 1), '桌面无需滚动即可看到所有范围')
      await selectedScope.press('End')
      const lastScope = picker.getByRole('button', { name: '采购入库的退货、调整与冲正', exact: true })
      await expect(lastScope).toBeFocused()
      await lastScope.press('Escape')
      await expect(picker).toBeHidden()
      await expect(scopeTrigger).toBeFocused()
      await scopeTrigger.click()
      await expect(selectedScope).toBeFocused()
      await selectedScope.press('ArrowRight')
      const salesScope = picker.getByRole('button', { name: '销售受理到生产准备', exact: true })
      await expect(salesScope).toBeFocused()
      await salesScope.press('Enter')
      await expect(picker).toBeHidden()
      await expect(editor.getByRole('button', { name: '流程范围：销售受理到生产准备', exact: true })).toBeFocused()
      await expect(crossChain).toHaveCount(0)
      await expect(viewTrigger(editor)).toBeEnabled()
      await expect(viewTrigger(editor)).toContainText('业务泳道')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(0)
      await expect(editor.locator('.erp-chain-design__lane')).toHaveCount(6)
      const laneStyles = await editor.locator('.erp-chain-design__lane').evaluateAll((lanes) => lanes.map((lane) => {
        const style = getComputedStyle(lane)
        return { background: style.backgroundColor, border: style.borderTopColor, borderWidth: parseFloat(style.borderTopWidth), labelColor: getComputedStyle(lane.querySelector('strong')).color }
      }))
      assert.equal(new Set(laneStyles.map((lane) => lane.background)).size, 6, '各领域泳道使用各自底色')
      assert(laneStyles.every((lane) => lane.borderWidth >= 1 && lane.background !== lane.border && lane.labelColor !== lane.background), '底色、边界与标题保持可区分的层次')
      await click('适应画布全图')
      await expect.poll(() => canvas.locator('.erp-chain-design__lane').evaluateAll((lanes) => lanes.every((lane) => {
        const area = lane.closest('.erp-chain-design__viewport').getBoundingClientRect()
        const box = lane.getBoundingClientRect()
        return box.left >= area.left && box.right <= area.right + 1 && box.top >= area.top && box.bottom <= area.bottom + 1
      })), { message: '适应全图包含完整泳道标题和边框' }).toBe(true)
      const assertLaneGaps = async () => {
        const gaps = await canvas.locator('.erp-chain-design__lane').evaluateAll((lanes) => {
          const scale = lanes[0].getBoundingClientRect().height / lanes[0].offsetHeight
          const boxes = lanes.map((lane) => lane.getBoundingClientRect()).sort((a, b) => a.top - b.top)
          return boxes.slice(1).map((box, i) => (box.top - boxes[i].bottom) / scale)
        })
        assert.equal(gaps.length, 5)
        assert(gaps.every((gap) => Math.abs(gap - 32) < 1), `相邻泳道净距应为 32，实际为 ${gaps.join('、')}`)
      }
      await assertLaneGaps()
      const mainlinePositions = await nodePositions()
      if (process.env.STYLE_L1_OUTPUT_DIR) {
        await page.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/swimlane-mainline.png` })
        await fs.writeFile(`${process.env.STYLE_L1_OUTPUT_DIR}/swimlane-styles.json`, JSON.stringify(laneStyles, null, 2))
      }
      await click('展开分支')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(2)
      await assertLaneGaps()
      await click('收起分支')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(0)
      assert.deepEqual(await nodePositions(), mainlinePositions, '展开收起分支不改变主线节点位置')
      await chooseChainScope(page, '采购下单到入库应付')
      const roleMatches = canvas.locator('[data-role-highlighted]')
      const present = rolePanel.getByRole('group', { name: '本图有节点', exact: true })
      const absent = rolePanel.getByRole('group', { name: '本图暂无节点', exact: true })
      const roleGeometry = () => canvas.evaluate((el) => ({
        camera: el.querySelector('.erp-chain-design__surface').style.transform,
        nodes: [...el.querySelectorAll('[data-design-node]')].map((n) => [n.dataset.designNode, n.style.left, n.style.top]),
        edges: [...el.querySelectorAll('[data-design-edge]')].map((edge) => [edge.dataset.edgeFrom, edge.dataset.edgeTo, edge.querySelector('.erp-chain-design__edge').getAttribute('d')]),
      }))
      const view = viewTrigger(editor)
      const viewPanel = page.getByRole('dialog', { name: '画布视图', exact: true })
      const handoffs = editor.getByRole('region', { name: '本链对外交接', exact: true })
      await view.click()
      await expect(viewPanel.getByRole('checkbox')).toHaveCount(0)
      await viewPanel.getByRole('button', { name: '关闭视图面板' }).click()
      await click('用途与交接')
      await card.getByRole('button', { name: '在图上看交接', exact: true }).click()
      await expect(view).toBeFocused()
      await expect(handoffs.locator('[data-design-edge]')).toHaveCount(3)
      await view.click()
      const internalGeometry = await roleGeometry()
      const exceptions = viewPanel.getByRole('checkbox', { name: '异常与回接', exact: true })
      await exceptions.check()
      await expect(viewPanel).toContainText('已显示 5 / 7 条本链交接')
      const purchase = 'purchase_to_inventory'
      const refusal = 'purchase_quality_disposition'
      for (const [from, to, label] of [[purchase, refusal, '质检拒绝进入处置'], [refusal, purchase, '补换待收重新进入收货与检验']]) {
        const edge = handoffs.locator(`[data-edge-from="${from}"][data-edge-to="${to}"]`)
        await expect(edge).toHaveAccessibleName(new RegExp(label, 'u'))
        assert(await edge.locator('.erp-chain-design__edge').evaluate((path, outbound) => {
          const marker = path.ownerDocument.getElementById(path.getAttribute('marker-end').slice(5, -1))
          const style = getComputedStyle(path)
          const start = path.getPointAtLength(0)
          const end = path.getPointAtLength(path.getTotalLength())
          const graph = path.closest('.erp-chain-handoffs__plot')
          const peer = graph.querySelector('[data-handoff-chain="purchase_quality_disposition"]').getBoundingClientRect()
          const origin = path.ownerSVGElement.getBoundingClientRect()
          const socket = outbound ? end : start
          return Math.abs(origin.left + socket.x - peer.left) <= 2 && origin.top + socket.y > peer.top && origin.top + socket.y < peer.bottom &&
            marker && style.stroke !== 'none' && style.strokeDasharray !== 'none' &&
            getComputedStyle(marker.querySelector('path')).fill === style.stroke && (end.x > start.x) === outbound
        }, from === purchase), '虚线及箭头准确连接两张链路卡片')
      }
      await normalRelations.uncheck()
      await expect(handoffs.locator('[data-design-edge]')).toHaveCount(2)
      assert.deepEqual(await roleGeometry(), internalGeometry, '勾选交接层保留链内步骤、路径与镜头')
      await expect(exceptions).toBeChecked()
      await expect(normalRelations).not.toBeChecked()
      if (process.env.STYLE_L1_OUTPUT_DIR) {
        await page.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/purchase-handoffs.png`, animations: 'disabled' })
        await handoffs.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/purchase-handoffs-detail.png`, animations: 'disabled' })
      }
      await exceptions.uncheck()
      await expect(handoffs.locator('[data-design-edge]')).toHaveCount(0)
      await expect(handoffs.locator('[data-handoff-chain]')).toHaveCount(7)
      await normalRelations.check()
      await viewPanel.getByRole('button', { name: '关闭视图面板' }).click()
      await click('收起交接图')
      await expect(handoffs).toHaveCount(0)
      const beforeRole = await roleGeometry()
      await roleTrigger.click()
      await expect(present.getByRole('button', { name: '品质', exact: true })).toHaveAccessibleDescription('当前画布有 1 个相关节点')
      await expect(present.getByRole('button', { name: '仓库', exact: true })).toHaveAccessibleDescription('当前画布有 3 个相关节点')
      await expect(absent.getByRole('button', { name: '记录财务放行分工', exact: true })).toBeEnabled()
      await present.getByRole('button', { name: '品质', exact: true }).click()
      await expect(roleMatches).toHaveCount(1)
      await pickRole('仓库')
      await expect(roleMatches).toHaveCount(3)
      await pickRole('记录财务放行分工')
      await expect(roleMatches).toHaveCount(0)
      await expect(editor.getByText('本图无该岗位节点', { exact: true })).toBeVisible()
      await pickRole('全链路视角')
      await expect(canvas.locator('[data-dimmed]')).toHaveCount(0)
      assert.deepEqual(await roleGeometry(), beforeRole, '岗位选择和清除保留节点、连线及镜头')
      await pickRole('品质')
      await click('展开分支')
      const expandedRoleCount = await roleMatches.count()
      assert(expandedRoleCount > 1, '分支包含更多品质节点')
      await roleTrigger.click()
      await expect(present.getByRole('button', { name: '品质', exact: true })).toHaveAccessibleDescription(`当前画布有 ${expandedRoleCount} 个相关节点`)
      await clearRole.click()
      await click('收起分支')
      const expandBranches = editor.getByRole('button', { name: '展开分支', exact: true })
      const collapseBranches = editor.getByRole('button', { name: '收起分支', exact: true })
      const rejectEdge = canvas.locator('[data-design-edge][data-edge-to$=":reject_purchase_order"]')
      await chooseViewOption(editor, '链路概览')
      await expect(expandBranches).toHaveCount(0)
      await click('展开链路步骤')
      await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
      await expect(crossChain).toHaveCount(0)
      await expect(rejectEdge).toHaveCount(0)
      const beforeBranches = await nodePositions()
      await expandBranches.press('Enter')
      await expect(collapseBranches).toBeFocused()
      await expect(rejectEdge).toHaveCount(1)
      await collapseBranches.click()
      await expect(rejectEdge).toHaveCount(0)
      assert.deepEqual(await nodePositions(), beforeBranches, '单链概览切换分支不移动主线步骤')
      await chooseViewOption(editor, '业务步骤')
      await click('适应画布全图')
      const normalPositions = await nodePositions()
      const normalCamera = await camera()
      await click('查看节点：自动建立逐行待检 IQC')
      assert.equal(await camera(), normalCamera, '选中节点不改变镜头')
      const selectedPositions = await nodePositions()
      for (const previous of normalPositions) assert.deepEqual(selectedPositions.find((node) => node.id === previous.id), previous, '原位查看不移动原节点')
      await expect(card.getByLabel('已登记上游', { exact: true })).toContainText('上游 · 2')
      await expect(card.getByLabel('已登记下游', { exact: true })).toContainText('下游 · 2')
      await card.getByRole('tab', { name: '状态', exact: true }).click()
      await expect(card.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '查看状态对象', exact: true }) })).toContainText('质量检验')
      await expect(card.locator('[data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
      await click('关闭画布说明')
      await search.fill('创建来料纠正检验')
      await search.press('Enter')
      await expect(editor.getByRole('complementary', { name: '业务节点库' })).toBeVisible()
      await click('适应画布全图')
      const beforeInspect = await camera()
      await click('查看：创建来料纠正检验')
      await expect(canvas).toHaveAttribute('data-view-mode', 'mainline')
      await expect(canvas.getByRole('button', { name: '查看节点：创建来料纠正检验', exact: true })).toHaveCount(0)
      assert.equal(await camera(), beforeInspect, '目录详情不隐式展开或缩放')
      await card.getByRole('button', { name: '展开此节点', exact: true }).click()
      await expect(canvas.getByRole('button', { name: '查看节点：创建来料纠正检验', exact: true })).toBeVisible()
      await click('关闭画布说明')
      await click('查看节点：提交采购订单')
      await card.getByRole('tab', { name: '审批', exact: true }).click()
      await card.getByRole('tab', { name: '查看驳回采购订单路径', exact: true }).click()
      await expect(card.locator('[data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
      await expect(editor.locator('[data-design-edge][data-highlighted][data-edge-to$=":reject_purchase_order"]')).toHaveCount(1)
      await expect(editor.locator('[data-design-edge][data-highlighted][data-edge-to$=":approve_purchase_order"]')).toHaveCount(0)
      assert(await editor.locator('[data-design-edge][data-highlighted] .erp-chain-design__edge').evaluateAll((lines) => lines.every((line) => {
        const markerId = /^url\(#(.+)\)$/.exec(line.getAttribute('marker-end'))?.[1]
        const arrow = document.getElementById(markerId)?.querySelector('path')
        return arrow && getComputedStyle(arrow).fill === getComputedStyle(line).stroke
      })), '所选审批路径的线条与箭头使用同一高亮色')
      await click('关闭画布说明')
      await search.fill('IQC')
      await search.press('Enter')
      await click('查看节点：自动建立逐行待检 IQC')
      await choose('查看一条链路交接', '质检拒绝进入处置')
      const returnCamera = await camera()
      await card.getByRole('button', { name: '进入目标链', exact: true }).click()
      await expect(editor.locator('.erp-chain-design__toolbar')).toContainText('采购拒收处置')
      await search.fill('补换')
      await search.press('Enter')
      await click('返回来处')
      await expect(search).toHaveValue('IQC')
      assert.equal(await camera(), returnCamera, '跨链返回恢复镜头')
      await expect(card).toContainText('质检拒绝进入处置')
      await click('关闭画布说明')
      await chooseExplorerAction(editor, '员工定位示例')
      const example = editor.getByRole('region', { name: '员工定位示例', exact: true })
      const notes = example.getByRole('textbox', { name: '检查备注（模拟草稿）', exact: true })
      await notes.fill('核对 A 行后继续填写')
      await example.getByRole('button', { name: '在规则图定位此环', exact: true }).click()
      await expect(card.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '选择要观察的状态', exact: true }) })).toContainText('已提交')
      await expect.poll(() => canvas.locator('[data-design-node][data-selected]').evaluate((node) => {
        const area = node.closest('.erp-chain-design__viewport').getBoundingClientRect()
        const box = node.getBoundingClientRect()
        return box.left >= area.left && box.right <= area.right + 1 && box.top >= area.top && box.bottom <= area.bottom + 1
      }), { message: '从员工示例定位后，所选步骤完整出现在可见画布内' }).toBe(true)
      await click('返回员工示例')
      await expect(notes).toHaveValue('核对 A 行后继续填写')
      await example.getByRole('tab', { name: 'B 行 · 检验通过', exact: true }).click()
      await expect(example).toContainText('已通过，尚未入库')
      await click('返回规则探索')
      await click('缩小画布')
      const savedCamera = await camera()
      await page.reload()
      await expect(editor).toBeVisible()
      await expect.poll(camera).toBe(savedCamera)
      await chooseViewOption(editor, '业务泳道')
      await pickRole('仓库')
      await click('适应画布全图')
      await searchWholeLibrary(editor)
      await search.fill('采购')
      await search.press('Enter')
      await click('查看节点：自动建立逐行待检 IQC')
      const list = editor.getByLabel('可加入的节点', { exact: true })
      await list.evaluate((element) => { element.scrollTop = 120 })
      const readWorking = () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), workingKey)
      await expect.poll(async () => (await readWorking()).draft.presentation?.viewport?.mode).toBe('fit-all')
      const beforeBlank = { working: await readWorking(), camera: await camera(), scroll: await list.evaluate((element) => element.scrollTop), nodes: await nodePositions() }
      assert(beforeBlank.scroll > 0, '使用已滚动的节点库验证原页不变')
      await click('更多视图操作')
      const newView = page.getByRole('link', { name: '在新标签页新建', exact: true })
      await expect(newView).toHaveAttribute('target', '_blank')
      await expect(newView).toHaveAttribute('rel', 'noopener noreferrer')
      const newPage = page.context().waitForEvent('page')
      await newView.click()
      const blankPage = await newPage
      try {
        startNoWriteAudit(blankPage, writes)
        const blankEditor = blankPage.getByRole('region', { name: '流程探索', exact: true })
        await expect(blankEditor).toBeVisible()
        await expect(blankPage).toHaveURL(/\/__dev\/flow-explorer$/u)
        await expect(blankEditor.locator('[data-design-node]')).toHaveCount(0)
        await expect(blankEditor.getByLabel('当前探索范围', { exact: true })).toHaveText('尚未加载链路')
        await expect(blankEditor.locator('.erp-chain-design__toolbar')).toContainText('尚未加载链路')
        if (process.env.STYLE_L1_OUTPUT_DIR) await blankPage.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/native-blank-tab.png` })
        assert.equal(await blankPage.evaluate(() => window.opener === null), true, '新页使用原生隔离标签，不保留 opener')
        assert.deepEqual((await blankPage.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), workingKey)).draft.nodes, [])
        await expect(page.getByRole('dialog', { name: '替换当前探索？', exact: true })).toHaveCount(0)
        assert.deepEqual(await readWorking(), beforeBlank.working, '新建不改写原标签页草稿')
        await blankEditor.getByRole('button', { name: '加载业务全流程地图', exact: true }).click()
        await expect(blankEditor.locator('[data-design-node^="map:"]')).toHaveCount(11)
        await assertOverviewCardExpansion(blankPage, blankEditor, assert, assertNoHorizontalOverflow)
        await expect(blankEditor.locator('[data-design-node^="map:"]')).toHaveCount(11)
        assert.deepEqual(await readWorking(), beforeBlank.working, '两页各自恢复自己的探索')
        assert.deepEqual(writes.get(blankPage), [], '新页探索和保存不调用业务写接口')
      } finally {
        await blankPage.close()
      }
      assert.deepEqual(await readWorking(), beforeBlank.working, '关闭新标签页后原草稿保持不变')
      assert.equal(await camera(), beforeBlank.camera)
      assert.deepEqual(await nodePositions(), beforeBlank.nodes)
      await expect(card).toContainText('自动建立逐行待检 IQC')
      await expect(search).toHaveValue('采购')
      assert.equal(await list.evaluate((element) => element.scrollTop), beforeBlank.scroll)
      await assertCurrentPageNewView(page, editor, assert, startNoWriteAudit, writes)
      await chooseChainScope(page, '业务全流程地图')
      await expect(viewTrigger(editor)).toContainText('跨链：')
      await click('查看节点：销售受理到生产准备')
      await expect(card).toContainText('用途与交接')
      await assertNoHorizontalOverflow(page)
      await click('关闭画布说明')
      await chooseChainScope(page, '销售受理到生产准备')
      await expect(viewTrigger(editor)).toContainText('业务泳道')
      await chooseViewOption(editor, '阶段排布')
      await click('展开分支')
      const beforeReload = await readWorking()
      await page.reload()
      await expect(viewTrigger(editor)).toContainText('阶段排布')
      await expect(editor.getByRole('button', { name: '收起分支', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(2)
      assert.deepEqual(await readWorking(), beforeReload, '刷新恢复本页的流程范围、排布和分支')
      assert.deepEqual(writes.get(page), [], '流程阅读和模拟示例不调用业务写接口')
    },
  }
}

async function assertOverviewCardExpansion(page, editor, assert, assertNoHorizontalOverflow) {
  await page.setViewportSize({ width: 1280, height: 720 })
  const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
  const surface = canvas.locator('.erp-chain-design__surface')
  const camera = () => surface.evaluate((element) => element.style.transform)
  const zoom = () => surface.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
  const button = (name) => editor.getByRole('button', { name, exact: true })
  const purchase = '采购下单到入库应付'
  const rejection = '采购拒收处置'
  const purchaseStep = button('查看节点：登记采购到货实点')
  const rejectionStep = button('查看节点：创建采购拒收处置')
  const viewDetails = editor.getByRole('dialog', { name: '链路衔接', exact: true })
  const expand = (name) => button(`展开步骤：${name}`)
  const collapse = (name) => button(`收起步骤：${name}`)
  const fitAll = button('适应画布全图')

  await viewTrigger(editor).click()
  const layers = page.getByRole('dialog', { name: '画布视图', exact: true })
  await layers.getByRole('checkbox', { name: '异常与回接', exact: true }).check()
  await layers.getByRole('button', { name: '关闭视图面板', exact: true }).click()
  await expect(layers).toBeHidden()
  await expect(canvas.getByRole('button', { name: /^展开步骤：/u, expanded: false })).toHaveCount(11)
  await expect(purchaseStep).toHaveCount(0)
  await expect(rejectionStep).toHaveCount(0)
  assert(await canvas.getByRole('button', { name: /^展开步骤：/u }).evaluateAll((buttons) => buttons.every((action) => {
    const card = action.parentElement
    const count = card.querySelector('.erp-chain-design__node-type > span:last-child').getBoundingClientRect()
    const title = card.querySelector('strong').getBoundingClientRect()
    const bounds = card.getBoundingClientRect()
    const control = action.getBoundingClientRect()
    return count.right <= control.left && control.bottom <= title.top && title.bottom <= bounds.bottom
  })), '展开入口给步数和最长链名预留空间')

  const handoff = button(`查看连线：${purchase} → ${rejection}`)
  const mapCamera = await camera()
  const mapZoom = await zoom()
  await expand(purchase).click()
  await expect(collapse(purchase)).toHaveAttribute('aria-expanded', 'true')
  await expect(purchaseStep).toHaveCount(1)
  await expect.poll(camera).toBe(mapCamera)
  await expand(rejection).press('Space')
  await expect(collapse(rejection)).toBeFocused()
  await expect(collapse(rejection)).toHaveAttribute('aria-expanded', 'true')
  await expect(purchaseStep).toHaveCount(1)
  await expect(rejectionStep).toHaveCount(1)
  await expect(fitAll).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(camera).toBe(mapCamera)
  if (process.env.STYLE_L1_OUTPUT_DIR) {
    await page.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/overview-card-expansion.png`, animations: 'disabled' })
  }

  await handoff.press('Enter')
  await expect(viewDetails).toBeVisible()
  await expect.poll(camera).toBe(mapCamera)
  await button('关闭画布说明').click()
  await collapse(rejection).click()
  await expect(expand(rejection)).toHaveAttribute('aria-expanded', 'false')
  await expect(collapse(purchase)).toHaveAttribute('aria-expanded', 'true')
  await expect(rejectionStep).toHaveCount(0)
  await expect(purchaseStep).toHaveCount(1)
  await expect.poll(camera).toBe(mapCamera)

  await expand(rejection).click()
  await page.reload()
  await expect(collapse(purchase)).toHaveAttribute('aria-expanded', 'true')
  await expect(collapse(rejection)).toHaveAttribute('aria-expanded', 'true')
  await expect(collapse(rejection)).toBeInViewport()
  await expect.poll(zoom).toBeGreaterThan(mapZoom * 0.9)
  await button('适配画布宽度').click()
  await expect(rejectionStep).toBeInViewport()
  await fitAll.click()
  await expect(fitAll).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(zoom).toBeLessThan(mapZoom)
  await assertNoHorizontalOverflow(page)
}

async function assertCurrentPageNewView(page, editor, assert, startNoWriteAudit, writes) {
  const click = (name) => editor.getByRole('button', { name, exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '替换当前探索？', exact: true })
  const snapshot = () => page.evaluate((workingKey) => ({
    working: JSON.parse(sessionStorage.getItem(workingKey)),
    durable: JSON.parse(localStorage.getItem(workingKey)),
    camera: document.querySelector('.erp-chain-design__surface').style.transform,
    search: document.querySelector('input[aria-label="搜索业务节点"]').value,
    scroll: document.querySelector('.erp-chain-design__library-list').scrollTop,
  }), workingKey)
  const failStorage = (targetKey) => page.evaluate((targetKey) => {
    const original = Storage.prototype.setItem
    window.__restoreFlowViewStorage = () => { Storage.prototype.setItem = original; delete window.__restoreFlowViewStorage }
    Storage.prototype.setItem = function failViewStorage(key, value) {
      if (this === localStorage && key === targetKey) throw new DOMException('Test storage limit', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  }, targetKey)
  const restoreStorage = () => page.evaluate(() => window.__restoreFlowViewStorage?.())
  const assertBlank = async () => {
    await expect(editor.locator('[data-design-node]')).toHaveCount(0)
    await expect(editor.getByLabel('当前探索范围', { exact: true })).toHaveText('尚未加载链路')
    const menu = await openExplorerActions(editor)
    await expect(menu.getByRole('menuitem', { name: '撤销', exact: true })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: '重做', exact: true })).toBeDisabled()
    await click('更多视图操作')
  }
  await expect(editor.getByRole('button', { name: '保存视图', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('status', { name: '视图保存状态', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: '另存一份', exact: true })).toHaveCount(0)
  await click('缩小画布')
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect.poll(async () => {
    const current = await snapshot()
    return current.durable?.draft.presentation?.viewport?.mode
  }).toBe('manual')
  const original = await snapshot()
  assert.deepEqual(original.durable, original.working, '普通浏览自动记录到本浏览器')
  const url = page.url()
  const tabCount = page.context().pages().length
  // New pages have no session cache; reopening must use the durable current exploration.
  for (let attempt = 0; attempt < 2; attempt++) {
    const reopened = await page.context().newPage()
    try {
      startNoWriteAudit(reopened, writes)
      await reopened.goto(url)
      await expect(reopened.getByRole('heading', { name: '流程探索', level: 1 })).toBeVisible()
      const restored = await reopened.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), workingKey)
      assert.deepEqual(restored, original.working, '关闭后重新打开恢复最近的探索')
      assert.deepEqual(writes.get(reopened), [])
    } finally { await reopened.close() }
  }
  await chooseExplorerAction(editor, '新建空白视图')
  await expect(confirm).toContainText('会替换当前探索')
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  assert.deepEqual(await snapshot(), original, '取消替换保留探索、镜头和筛选')
  await chooseExplorerAction(editor, '新建空白视图')
  await confirm.getByRole('button', { name: '直接新建', exact: true }).click()
  await assertBlank()
  assert.equal(page.context().pages().length, tabCount)
  assert.equal(page.url(), url)
  await chooseExplorerAction(editor, '新建空白视图')
  await expect(confirm).toHaveCount(0)

  await chooseChainScope(page, '销售受理到生产准备')
  const beforeReplace = await snapshot()
  await chooseExplorerAction(editor, '新建空白视图')
  await failStorage(workingKey)
  try {
    await confirm.getByRole('button', { name: '直接新建', exact: true }).click()
    await expect(confirm.getByRole('alert')).toContainText('自动保留失败')
    assert.deepEqual(await snapshot(), beforeReplace, '写入失败回滚标签页缓存并保留当前探索')
  } finally { await restoreStorage() }
  await confirm.getByRole('button', { name: '直接新建', exact: true }).click()
  await assertBlank()
  const blank = await snapshot()
  await failStorage(workingKey)
  try {
    await chooseChainScope(page, '采购下单到入库应付')
    await expect(editor.getByRole('button', { name: '重试自动保留', exact: true })).toBeVisible()
    assert.deepEqual((await snapshot()).durable, blank.durable)
    assert.deepEqual((await snapshot()).working, blank.working)
    assert(await editor.locator('[data-design-node]').count() > 0, '记录失败时页面仍保留最新内容')
  } finally { await restoreStorage() }
  await click('重试自动保留')
  await expect(editor.getByRole('button', { name: '重试自动保留', exact: true })).toHaveCount(0)
  const recovered = await snapshot()
  assert(recovered.durable.draft.nodes.length > 0)
  assert.deepEqual(recovered.durable, recovered.working)
  await page.reload()
  await expect(editor.locator('.erp-chain-design__surface')).toBeVisible()
  assert.deepEqual((await snapshot()).working, recovered.working)
}

async function assertCompactExplorerLayout(page, editor, assert, assertNoHorizontalOverflow) {
  const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
  const canvasGeometry = () => canvas.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }
  })
  const search = editor.getByRole('textbox', { name: '搜索业务节点', exact: true })
  const list = editor.getByLabel('可加入的节点', { exact: true })
  const readViews = () => page.evaluate((key) => ({
    durable: localStorage.getItem(key), working: sessionStorage.getItem(key),
  }), workingKey)
  const original = await readViews()
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 816 })
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width)
    const rows = await editor.evaluate((root) => {
      const box = (selector) => root.querySelector(selector).getBoundingClientRect()
      const title = box('h1')
      const search = box('.erp-search-input')
      const scope = box('[data-picker="scope"].erp-chain-design__picker-trigger')
      const display = box('[data-picker="view"].erp-chain-design__picker-trigger')
      const role = box('[data-picker="role"].erp-chain-design__picker-trigger')
      const actions = box('.erp-chain-design__canvas-actions')
      const graph = box('.erp-chain-design__viewport')
      return {
        pickersFit: [...root.querySelectorAll('.erp-chain-design__picker-trigger')].every((button) =>
          button.getBoundingClientRect().right <= button.parentElement.getBoundingClientRect().right + 1
        ),
        sharedSearchRow: title.top < search.bottom && search.top < title.bottom,
        sharedViewRow: scope.top < display.bottom && role.top < scope.bottom && display.top < role.bottom,
        actionsAboveGraph: actions.bottom <= graph.top + 1,
        sharedActionRow: actions.top < scope.bottom,
        lastControlGap: graph.top - actions.bottom,
        height: graph.top - root.getBoundingClientRect().top,
      }
    })
    assert(rows.pickersFit, `${width}px 范围和岗位按钮不压住相邻控件`)
    assert(rows.sharedSearchRow && rows.sharedViewRow, `${width}px 搜索及看图设置各自同排`)
    assert(rows.actionsAboveGraph && rows.lastControlGap <= 8, `${width}px 画布操作紧贴图的上边界`)
    if (width >= 1920) assert(rows.sharedActionRow, '宽屏画布操作与范围同行')
    assert(rows.height <= (rows.sharedActionRow ? 100 : 140), `${width}px 顶部操作最多换一行，实测 ${JSON.stringify(rows)}`)
  }
  await page.setViewportSize({ width: 1920, height: 816 })
  await expect(editor.getByRole('button', { name: '展开节点库' })).toBeVisible()
  await expect(search).toBeVisible()
  const usedWidth = () => canvas.evaluate((element) => ({
    canvas: element.getBoundingClientRect().width,
    workspace: element.closest('.erp-chain-design__workspace').clientWidth,
  }))
  await expect.poll(async () => {
    const { canvas, workspace } = await usedWidth()
    return Math.abs(canvas - workspace)
  }, { message: '初始画布占满工作区' }).toBeLessThanOrEqual(2)
  await editor.getByRole('button', { name: '展开节点库' }).click()
  await expect(list).toBeVisible()
  await expect.poll(async () => {
    const { canvas, workspace } = await usedWidth()
    return workspace - canvas
  }, { message: '打开节点库后为右侧结果留出空间' }).toBeGreaterThan(250)
  const initial = await canvas.boundingBox()
  assert(initial.height >= 560, '常见桌面窗口保留至少 560px 画布，容纳入口及范围两行页头')
  const libraryBox = await editor.getByRole('complementary', { name: '业务节点库', exact: true }).boundingBox()
  const libraryWidth = libraryBox.width
  assert(libraryBox.x >= initial.x + initial.width - 1, '搜索结果在画布右侧展开')
  const visibleItems = await list.evaluate((element) => {
    const area = element.getBoundingClientRect()
    return [...element.children].filter((node) => {
      const box = node.getBoundingClientRect()
      return box.top >= area.top && box.bottom <= area.bottom
    }).length
  })
  assert(visibleItems >= 5, '节点库首屏完整展示至少五项，并保留原字号和搜索筛选')
  await search.fill('采购')
  await search.press('Enter')
  await list.evaluate((element) => { element.scrollTop = 160 })
  const scrollTop = await list.evaluate((element) => element.scrollTop)
  await editor.getByRole('button', { name: '收起节点库', exact: true }).click()
  await expect(search).toBeVisible()
  await expect(list).toBeHidden()
  await expect.poll(async () => (await canvas.boundingBox()).width,
    { message: '收起节点库把横向空间交还画布' }).toBeGreaterThanOrEqual(initial.width + libraryWidth - 1)
  await editor.getByRole('button', { name: '展开节点库', exact: true }).click()
  await expect(search).toHaveValue('采购')
  assert.equal(await list.evaluate((element) => element.scrollTop), scrollTop, '展开后保留节点库滚动位置')
  await search.fill('')
  await search.press('Enter')
  await list.evaluate((element) => { element.scrollTop = 0 })
  for (const size of [
    { width: 1920, height: 816 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size)
    await assertNoHorizontalOverflow(page)
    await expect(editor.getByRole('button', { name: '更多视图操作', exact: true })).toBeInViewport()
    const beforeLegend = await canvasGeometry()
    const trigger = editor.getByRole('button', { name: '图例与操作说明', exact: true })
    await trigger.click()
    const legend = editor.getByRole('dialog', { name: '画布图例', exact: true })
    await expect(legend).toBeVisible()
    await expect(legend.locator('[data-type]')).toHaveCount(9)
    const bounds = await legend.boundingBox()
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height, '图例一键可看且不超出窗口')
    assert.deepEqual(await canvasGeometry(), beforeLegend, '打开图例不挤动画布；短窗口滚动不改变文档内布局')
    await legend.press('Escape')
    await expect(legend).toBeHidden()
    await expect(trigger).toBeFocused()
  }
  assert.deepEqual(await readViews(), original, '布局收起、搜索、图例和窗口变化保留当前探索记录')
  await page.setViewportSize({ width: 1920, height: 1080 })
}
