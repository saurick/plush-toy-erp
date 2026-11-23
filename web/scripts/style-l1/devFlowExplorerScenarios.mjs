import fs from 'node:fs/promises'
import { expect } from 'playwright/test'
import { expectCanvasFits } from './devBusinessChainDesignViewportScenarios.mjs'
import { layoutTrigger, grainControl, chooseChainScope, chooseGranularity, chooseLayout, chooseExplorerAction, openExplorerActions, searchWholeLibrary } from './devFlowExplorerControls.mjs'
import { createFlowExplorerExportScenario } from './devFlowExplorerExportScenario.mjs'
import { expectDiagramControlTooltip, verifyDiagramControlTooltips } from './diagramViewControlsAssertions.mjs'

const workingKey = 'plush-workbench:business-chain-design:working'
const recentDraft = {
  nodes: [{ id: 'node:purchase_order', x: 96, y: 80, manual: true }],
  edges: [],
  ideas: [{ text: '保留原来的阅读备注' }],
  presentation: { mode: 'all', highlightedRoles: [] },
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
        await expect(layoutTrigger(editor)).toContainText('阶段排布')
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
        assert.equal(Object.hasOwn(restored, 'ideas'), false, '旧备注随恢复后的视图移除')
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
      await expect(switchLayout).toBeEnabled()
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      const mainlinePositions = await nodePositions()
      const savedMap = () => page.evaluate((key) => {
        const { nodes, edges, map } = JSON.parse(sessionStorage.getItem(key)).draft
        return { nodes, edges, map }
      }, workingKey)
      const beforeDisplay = await savedMap()
      const grain = grainControl(editor)
      await expect(grain.getByRole('radio', { checked: true })).toHaveAccessibleName('业务步骤')
      await chooseGranularity(editor, '节点明细')
      await expect(grain.getByRole('radio', { checked: true })).toHaveAccessibleName('节点明细')
      assert((await nodePositions()).length > mainlinePositions.length, '细档显示已载入的单据和记录')
      const mainline = editor.getByRole('checkbox', { name: '主线与供给', exact: true })
      const exceptions = editor.getByRole('checkbox', { name: '异常与回接', exact: true })
      const rejectedEnds = canvas.locator('[data-design-node$=":sales_order_rejected_end"]')
      await expect(mainline).toBeChecked()
      await expect(rejectedEnds).toHaveCount(0)
      const laneGaps = () => canvas.locator('.erp-chain-design__lane').evaluateAll((lanes) => {
        const boxes = lanes.map((lane) => lane.getBoundingClientRect()).sort((a, b) => a.top - b.top)
        return boxes.slice(1).map((box, index) => box.top - boxes[index].bottom)
      })
      const compactPositions = await nodePositions()
      const gaps = await laneGaps()
      assert.equal(gaps.length, 5)
      assert(gaps.every((gap) => gap > 0 && Math.abs(gap - gaps[0]) < 1), `隐藏异常后六条泳道间距应一致，实际为 ${gaps.join(', ')}`)
      await exceptions.check()
      await expect(rejectedEnds).toHaveCount(1)
      const expandedPositions = await nodePositions()
      await exceptions.uncheck()
      assert.deepEqual(await nodePositions(), compactPositions, '收起分支恢复紧凑坐标')
      await exceptions.check()
      assert.deepEqual(await nodePositions(), expandedPositions, '重新显示分支恢复展开坐标')
      const approval = canvas.getByRole('button', { name: '查看节点：订单审批', exact: true })
      await expect(approval).toHaveCount(1)
      const rejection = canvas.locator('[data-design-edge="exception"][data-edge-to$=":sales_order_rejected_end"]')
      await expect(rejection).toHaveCount(1)
      await approval.click()
      const details = editor.getByRole('dialog', { name: '订单审批', exact: true })
      const direct = '销售订单受理（审批 + PMC）'
      const engineering = '先办工程资料'
      await details.getByRole('button', { name: direct, exact: true }).click()
      await expect(canvas.locator('[data-design-node$=":engineering_data"]')).toHaveCount(0)
      await click('关闭画布说明')
      const variant = editor.locator('button[data-picker="sales-variant"]')
      const chooseVariant = async (label) => {
        await variant.click()
        await page.getByRole('dialog', { name: '选择受理流程' }).getByRole('button', { name: label, exact: true }).click()
      }
      await chooseVariant(engineering)
      await expect(canvas.locator('[data-design-node$=":engineering_data"]')).toHaveCount(1)
      await expect(canvas.locator('[data-edge-from$=":activate_sales_order"][data-edge-to$=":order_review"]')).toHaveCount(0)
      await page.reload()
      await expect(variant).toContainText(engineering)
      await chooseVariant('合并共同步骤')
      await expect(canvas.locator('[data-edge-from$=":activate_sales_order"][data-edge-to$=":order_review"]')).toHaveCount(1)
      await mainline.uncheck()
      await expect(canvas.locator('[data-design-node$=":activate_sales_order"]')).toHaveCount(0)
      await chooseGranularity(editor, '业务步骤')
      await chooseGranularity(editor, '节点明细')
      await expect(exceptions).toBeChecked()
      await expect(mainline).not.toBeChecked()
      await exceptions.uncheck()
      await expect(canvas.locator('[data-design-node]')).toHaveCount(0)
      await mainline.check()
      assert.deepEqual(await savedMap(), beforeDisplay, '切换颗粒度保留范围、节点、坐标和关系')
      await chooseLayout(editor, '阶段排布')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(0)
      await chooseGranularity(editor, '链路概览')
      const trigger = layoutTrigger(editor)
      await expect(trigger).toHaveAccessibleName('展开后布局：阶段排布')
      await chooseLayout(editor, '业务泳道')
      await expect(canvas.locator('[data-design-node]')).toHaveCount(1)
      await trigger.press('Enter')
      const panel = page.getByRole('dialog', { name: '展开后布局', exact: true })
      await expect(panel.getByRole('radio', { name: '业务泳道' })).toBeChecked()
      await panel.getByRole('radio', { name: '业务泳道' }).press('Escape')
      await expect(trigger).toBeFocused()
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(0)
      await click('查看节点：销售受理到生产准备')
      await click('展开这条链路的步骤')
      await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
      await expect(layoutTrigger(editor)).toContainText('业务泳道')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      const overviewPositions = await nodePositions()
      for (const previous of mainlinePositions) assert.deepEqual(overviewPositions.find((node) => node.id === previous.id), previous, '概览展开沿用原步骤位置')
      const scope = editor.locator('[aria-label="当前探索范围"]')
      await expect(scope).toContainText('14 步')
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
      await chooseLayout(editor, '阶段排布')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(0)
      await editor.getByRole('checkbox', { name: '异常与回接', exact: true }).check()
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
      await expect(editor.getByRole('checkbox', { name: '异常与回接', exact: true })).toBeChecked()
      await switchLayout.click()
      await editor.getByRole('checkbox', { name: '异常与回接', exact: true }).uncheck()
      await chooseLayout(editor, '业务泳道')
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
        saved.draft.presentation.viewport = { mode: 'manual', scale: 1, x: 80, y: 350 }
        sessionStorage.setItem(key, JSON.stringify(saved))
      }, workingKey)
      await page.reload()
      await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      await assertSingleChainFit()
      assert.deepEqual(await nodePositions(), rearrangedOverview, '刷新恢复概览的泳道布局与步骤坐标')
      await chooseGranularity(editor, '业务步骤')
      await expect(canvas.locator('.erp-chain-design__lane')).toHaveCount(6)
      await assertNoHorizontalOverflow(page)
      await chooseChainScope(page, '业务全流程地图')
      await chooseGranularity(editor, '业务步骤')
      await editor.getByRole('checkbox', { name: '过账后纠正' }).check()
      const balances = canvas.locator('[data-design-edge]').filter({
        has: page.locator('desc', { hasText: /^撤销抵扣恢复可用余额$/u }),
      })
      const trackCenters = await balances.evaluateAll((relations) => relations.flatMap((relation) => {
        const label = relation.querySelector('text').getBoundingClientRect()
        if (!label.width) return []
        const path = relation.querySelector('.erp-chain-design__edge-hit')
        const point = new DOMPoint(label.x + label.width / 2, label.y + label.height / 2)
          .matrixTransform(path.getScreenCTM().inverse())
        return [{ onOwnLine: path.isPointInStroke(point), y: point.y }]
      }))
      assert(trackCenters.length >= 2 && trackCenters.every(({ onOwnLine }) => onOwnLine), '每条余额说明均落在自己的可点击连线上')
      assert.equal(new Set(trackCenters.map(({ y }) => Math.round(y))).size, trackCenters.length, '密集财务回线分别占用可辨识的横线')
      await chooseGranularity(editor, '节点明细')
      await editor.getByRole('checkbox', { name: '横切影响' }).check()
      for (const zoom of ['适配画布宽度', '重置画布为 100%']) {
        for (const documentName of ['采购退货', '采购入库调整']) {
          await click(zoom)
          const reversal = `冲正${documentName}`
          const short = canvas.getByRole('button', { name: `查看连线：${documentName} → ${reversal}`, exact: true })
          const back = canvas.getByRole('button', { name: `查看连线：${reversal} → 已过账采购入库`, exact: true })
          await expect(short.locator('text')).toBeHidden()
          await expect(short.locator('.erp-chain-design__edge')).toHaveAttribute('marker-end', /url/u)
          await expect(back.locator('text')).toBeVisible()
          assert(await back.locator('text').evaluate((label) => {
            const box = label.getBoundingClientRect()
            const surface = label.closest('.erp-chain-design__surface')
            return [...surface.querySelectorAll('[data-design-node], .erp-chain-design__port')].every((element) => {
              const node = element.getBoundingClientRect()
              return box.right <= node.left || box.left >= node.right || box.bottom <= node.top || box.top >= node.bottom
            })
          }), `${documentName}的回线说明避开所有节点和连接圆点`)
          await short.focus()
          await expect(editor.locator('.erp-chain-design__canvas-status')).toContainText('正式冲正恢复原影响')
          await short.press('Enter')
          await expect(editor.getByRole('dialog', { name: '接入条件' })).toContainText('正式冲正恢复原影响')
          await click('关闭画布说明')
        }
      }
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
      const search = editor.getByRole('textbox', { name: '搜索链路或业务节点', exact: true })
      const crossChain = editor.getByRole('button', { name: '跨链关系', exact: true })
      const crossChainEdges = canvas.locator('[data-design-edge][data-relation-kind]')
      await expect(editor.locator('[data-design-node^="map:"]')).toHaveCount(11)
      const grain = grainControl(editor)
      const assertGrainCards = async () => {
        for (const [name, description] of [
          ['链路概览', '每条链路一张卡'],
          ['业务步骤', '看办理顺序和参与岗位'],
          ['节点明细', '进一步显示单据、记录和结果'],
        ]) {
          const radio = grain.getByRole('radio', { name, exact: true })
          await expect(radio).toHaveAccessibleDescription(description)
          const card = radio.locator('xpath=ancestor::label[1]')
          const caption = card.getByText(description, { exact: true })
          await expect(caption).toBeVisible()
          const bounds = await card.boundingBox()
          const text = await caption.boundingBox()
          assert(text.x >= bounds.x && text.y + text.height <= bounds.y + bounds.height && text.x + text.width <= bounds.x + bounds.width + 1, '说明完整显示在对应卡片内')
        }
      }
      await assertGrainCards()
      if (process.env.STYLE_L1_OUTPUT_DIR) {
        await grain.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/granularity-cards.png` })
      }
      await expect(grain.getByRole('radio', { checked: true })).toHaveAccessibleName('链路概览')
      await chooseGranularity(editor, '业务步骤')
      const fullStepCount = await canvas.locator('[data-design-node]').count()
      const sections = canvas.locator('[data-chain-section]')
      const stepSections = await sections.evaluateAll((items) => items.map((item) => item.dataset.chainSection))
      assert(stepSections.includes('sales_to_production') && stepSections.includes('purchase_to_inventory'))
      await expect(editor.locator('[data-picker="sales-variant"]')).toHaveCount(0)
      await expect(canvas.locator('[data-design-node$=":order_approval"]')).toHaveCount(1)
      await chooseGranularity(editor, '节点明细')
      assert(await canvas.locator('[data-design-node]').count() > fullStepCount, '全流程细档补充各链单据与结果')
      await expect(canvas.locator('[data-design-node$=":purchase_order_approval"]')).toHaveCount(1)
      await expect(canvas.locator('[data-design-node$=":order_approval"]')).toHaveCount(1)
      await page.reload()
      await expect.poll(() => sections.evaluateAll((items) => items.map((item) => item.dataset.chainSection))).toEqual(stepSections)
      const globalImpact = editor.getByRole('checkbox', { name: '横切影响', exact: true })
      const allHandoffs = editor.getByRole('group', { name: '全图关联交接' })
      const handoffSummary = allHandoffs.locator('summary')
      const exceptionLayer = editor.getByRole('checkbox', { name: '异常与回接', exact: true })
      await exceptionLayer.check()
      const horizontalNodes = await nodePositions()
      const lanes = canvas.locator('.erp-chain-design__lane')
      const edgePaths = () => canvas.locator('[data-design-edge] .erp-chain-design__edge').evaluateAll((edges) => edges.map((edge) => edge.getAttribute('d')))
      const horizontalEdges = await edgePaths()
      await click('切换画布为纵向布局')
      await expect(canvas).toHaveAttribute('data-direction', 'TB')
      await expect(editor.getByRole('button', { name: '适应画布全图' })).toHaveAttribute('aria-pressed', 'true')
      for (const key of await sections.evaluateAll((items) => items.map((item) => item.dataset.chainSection))) {
        const columns = await lanes.evaluateAll((items, key) => items.filter((item) => item.dataset.laneChain === key).map((item) => item.getBoundingClientRect().toJSON()).sort((a, b) => a.left - b.left), key)
        assert(columns.length && columns.every((column, index) => !index || column.left >= columns[index - 1].right - 0.01), key + ' 纵向泳道按领域分列')
      }
      const verticalNodes = await nodePositions()
      assert.deepEqual(verticalNodes.map(({ id }) => id), horizontalNodes.map(({ id }) => id))
      assert.notDeepEqual(verticalNodes, horizontalNodes)
      assert.notDeepEqual(await edgePaths(), horizontalEdges)
      await page.reload()
      await expect(canvas).toHaveAttribute('data-direction', 'TB')
      await expect(exceptionLayer).toBeChecked()
      await click('切换画布为横向布局')
      assert.deepEqual(await nodePositions(), horizontalNodes)
      assert.deepEqual(await edgePaths(), horizontalEdges)
      await expect(handoffSummary).toHaveText('跨链交接（13）')
      await expect(allHandoffs.locator('button:visible')).toHaveCount(0)
      const collapsedHeight = (await canvas.boundingBox()).height
      await handoffSummary.press('Enter')
      await expect(allHandoffs.getByRole('button')).toHaveCount(13)
      assert((await canvas.boundingBox()).height < collapsedHeight, '展开交接清单使用画布下方空间')
      await handoffSummary.press('Space')
      await expect.poll(async () => (await canvas.boundingBox()).height).toBe(collapsedHeight)
      await exceptionLayer.uncheck()
      await globalImpact.check()
      await handoffSummary.click()
      await expect(allHandoffs.getByRole('button', { name: /横切修正采购库存/u })).toBeVisible()
      await expect(handoffSummary).toHaveText(`跨链交接（${await allHandoffs.getByRole('button').count()}）`)
      await globalImpact.uncheck()
      await chooseGranularity(editor, '链路概览')
      await expect(canvas.locator('[data-design-node^="map:"]')).toHaveCount(11)
      const scopeSummary = editor.getByRole('status', { name: '当前探索范围', exact: true })
      await expect(scopeSummary).toHaveText('11 个节点')
      await expect(crossChain).toHaveCount(0)
      await expect(editor.getByRole('checkbox', { name: '主线与供给' })).toBeChecked()
      const roleTrigger = editor.getByRole('button', { name: /^岗位高亮：/u })
      const rolePanel = page.getByRole('dialog', { name: '选择高亮岗位', exact: true })
      const clearRole = rolePanel.getByRole('button', { name: '全链路视角', exact: true })
      const pickRoles = async (...names) => {
        await roleTrigger.click()
        await clearRole.click()
        for (const name of names) await rolePanel.getByRole('checkbox', { name, exact: true }).check()
        await page.keyboard.press('Escape')
        await expect(rolePanel).toBeHidden()
        await expect(roleTrigger).toBeFocused()
      }
      await roleTrigger.press('ArrowDown')
      await expect(clearRole).toBeFocused()
      await expect(rolePanel.getByRole('group', { name: '本图有节点' })).toHaveCount(0)
      await expect(rolePanel.getByRole('group', { name: '本图暂无节点' }).getByRole('checkbox', { name: '品质' })).toBeVisible()
      await expect(rolePanel).toContainText('展开一条链路的步骤后，可查看办理岗位。')
      await clearRole.press('Escape')
      await expect(roleTrigger).toBeFocused()
      const legend = editor.getByRole('dialog', { name: '画布图例', exact: true })
      await globalImpact.check()
      await click('图例与操作说明')
      for (const [kind, label] of [['supplies', '供给关系'], ['cross_cuts', '横切影响']]) {
        const sample = legend.locator(`[data-legend-edge="${kind}"]`)
        await expect(sample).toHaveText(label)
        const line = (node) => {
          const path = node.querySelector('.erp-chain-design__edge')
          return { dash: getComputedStyle(path).strokeDasharray, arrow: path.hasAttribute('marker-end') }
        }
        const actual = await canvas.locator(`[data-relation-kind="${kind}"]`).first().evaluate(line)
        assert(actual.arrow && actual.dash !== 'none')
        assert.deepEqual(await sample.evaluate(line), actual)
      }
      await expect(legend.locator('[data-legend-edge="unknown"]')).toHaveText('待核对的参考线')
      await expect(legend.locator('[data-legend-candidate="unknown"] strong')).toHaveText('连接规则待核对')
      await legend.press('Escape')
      await globalImpact.uncheck()
      const normalEdgeCount = await crossChainEdges.count()
      assert(normalEdgeCount > 0, '总图默认显示跨链主线')
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
      await expect(editor.getByRole('group', { name: '显示内容', exact: true })).toBeVisible()
      await normalRelations.click()
      await expect(normalRelations).toBeChecked()
      await expect(crossChainEdges).toHaveCount(normalEdgeCount)
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
      await expect(layoutTrigger(editor)).toBeEnabled()
      await expect(layoutTrigger(editor)).toContainText('业务泳道')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(0)
      await expect(editor.locator('.erp-chain-design__lane')).toHaveCount(6)
      const laneStyles = await editor.locator('.erp-chain-design__lane').evaluateAll((lanes) => lanes.map((lane) => {
        const style = getComputedStyle(lane)
        return { background: style.backgroundColor, border: style.borderTopColor, borderWidth: parseFloat(style.borderTopWidth), labelColor: getComputedStyle(lane.querySelector('strong')).color }
      }))
      assert.equal(new Set(laneStyles.map((lane) => lane.background)).size, 6, '各领域泳道使用各自底色')
      assert(laneStyles.every((lane) => lane.borderWidth >= 1 && lane.background !== lane.border && lane.labelColor !== lane.background), '底色、边界与标题保持可区分的层次')
      await expect(editor.getByRole('button', { name: '适应画布全图', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(editor.getByRole('button', { name: '重置画布为 100%', exact: true })).toHaveAttribute('aria-pressed', 'false')
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
      await editor.getByRole('checkbox', { name: '异常与回接', exact: true }).check()
      await expect(editor.getByRole('checkbox', { name: '过账后纠正', exact: true })).toHaveCount(0)
      await expect(editor.getByRole('checkbox', { name: '横切影响', exact: true })).toHaveCount(0)
      await page.setViewportSize({ width: 390, height: 844 })
      await assertGrainCards()
      for (const radio of await grain.getByRole('radio').all()) {
        const box = await radio.locator('xpath=ancestor::label[1]').boundingBox()
        assert(box && box.x >= 0 && box.x + box.width <= 391, '窄屏每档颗粒度均可直接点击')
      }
      const layerPicker = editor.locator('button[data-picker="layers"]')
      await expect(layerPicker).toHaveText('显示内容（已选 2 项）')
      await layerPicker.click()
      const layerDialog = page.getByRole('dialog', { name: '显示内容', exact: true })
      await expect(layerDialog.getByRole('checkbox')).toHaveCount(2)
      const narrowNormal = layerDialog.getByRole('checkbox', { name: '主线与供给' })
      await narrowNormal.uncheck()
      await expect(layerPicker).toHaveText('显示内容（已选 1 项）')
      await narrowNormal.check()
      await narrowNormal.press('Escape')
      await expect(layerDialog).toBeHidden()
      await expect(layerPicker).toBeFocused()
      await page.setViewportSize({ width: 1920, height: 1080 })
      await expect(layerPicker).toHaveCount(0)
      await expect(editor.getByRole('checkbox', { name: '异常与回接', exact: true })).toBeChecked()
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(1)
      await assertLaneGaps()
      await editor.getByRole('checkbox', { name: '异常与回接', exact: true }).uncheck()
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(0)
      assert.deepEqual(await nodePositions(), mainlinePositions, '展开收起分支不改变主线节点位置')
      await search.fill('入库应付')
      await search.press('Enter')
      await editor.getByRole('group', { name: '匹配链路' }).getByRole('button', { name: '采购下单到入库应付', exact: true }).click()
      await expect(editor.getByRole('complementary', { name: '业务节点库' })).toBeHidden()
      const roleMatches = canvas.locator('[data-role-highlighted]')
      const present = rolePanel.getByRole('group', { name: '本图有节点', exact: true })
      const absent = rolePanel.getByRole('group', { name: '本图暂无节点', exact: true })
      const roleGeometry = () => canvas.evaluate((el) => ({
        camera: el.querySelector('.erp-chain-design__surface').style.transform,
        nodes: [...el.querySelectorAll('[data-design-node]')].map((n) => [n.dataset.designNode, n.style.left, n.style.top]),
        edges: [...el.querySelectorAll('[data-design-edge]')].map((edge) => [edge.dataset.edgeFrom, edge.dataset.edgeTo, edge.querySelector('.erp-chain-design__edge').getAttribute('d')]),
      }))
      const handoffs = editor.getByRole('region', { name: '本链对外交接', exact: true })
      const related = editor.getByRole('group', { name: '本链关联交接', exact: true })
      await expect(editor.getByRole('group', { name: '显示内容', exact: true }).getByRole('checkbox')).toHaveCount(4)
      await click('图例与操作说明')
      await expect(legend.locator('[data-legend-edge]')).toHaveCount(4)
      await legend.press('Escape')
      await expect(related.locator('summary')).toHaveText('本链交接（3）')
      await related.locator('summary').click()
      await expect(related.getByRole('button')).toHaveCount(3)
      await editor.getByRole('checkbox', { name: '过账后纠正' }).check()
      await related.getByRole('button', { name: /过账后退货或调整/u }).click()
      await expect(canvas.getByRole('button', { name: '查看节点：冲正采购退货', exact: true })).toBeVisible()
      await click('返回来处')
      await editor.getByRole('checkbox', { name: '过账后纠正' }).uncheck()
      await editor.getByRole('checkbox', { name: '横切影响' }).check()
      await related.locator('summary').click()
      await expect(related.getByRole('button', { name: /横切修正采购库存/u })).toBeVisible()
      await editor.getByRole('checkbox', { name: '横切影响' }).uncheck()
      await click('跨链交接')
      await expect(handoffs.locator('[data-design-edge]')).toHaveCount(3)
      const exceptions = editor.getByRole('checkbox', { name: '异常与回接', exact: true })
      await exceptions.check()
      await expect(handoffs).toContainText('本链 5 / 7 条交接')
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
      await expect(canvas.locator('[data-design-node$=":reject_purchase_order"]')).toHaveCount(1)
      await expect(canvas.locator('[data-design-node$=":approve_purchase_order"]')).toHaveCount(0)
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
      await click('收起交接图')
      await expect(handoffs).toHaveCount(0)
      await expect.poll(() => canvas.evaluate((area) => {
        const frame = area.getBoundingClientRect()
        const boxes = [...area.querySelectorAll('.erp-chain-design__lane, [data-design-node], [data-design-edge]')].map((node) => node.getBoundingClientRect())
        const top = Math.min(...boxes.map((box) => box.top))
        const bottom = Math.max(...boxes.map((box) => box.bottom))
        return Math.abs((top - frame.top) - (frame.bottom - bottom))
      }), { message: '收起交接图后，全图在恢复的画布高度内居中' }).toBeLessThan(3)
      const beforeRole = await roleGeometry()
      await roleTrigger.click()
      const quality = present.getByRole('checkbox', { name: '品质', exact: true })
      const warehouse = present.getByRole('checkbox', { name: '仓库', exact: true })
      const financeRelease = absent.getByRole('checkbox', { name: '记录财务放行分工', exact: true })
      await expect(quality).toHaveAccessibleDescription('当前画布有 1 个相关节点')
      await expect(warehouse).toHaveAccessibleDescription('当前画布有 3 个相关节点')
      await expect(financeRelease).toBeEnabled()
      await quality.check()
      await expect(roleMatches).toHaveCount(1)
      await warehouse.check()
      await expect(roleMatches).toHaveCount(4)
      await expect(rolePanel).toBeVisible()
      await quality.uncheck()
      await expect(roleMatches).toHaveCount(3)
      await warehouse.uncheck()
      await financeRelease.check()
      await expect(roleMatches).toHaveCount(0)
      await expect(roleTrigger).toContainText('记录财务放行分工 · 0 个节点')
      await clearRole.click()
      await expect(rolePanel.getByRole('checkbox', { checked: true })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(canvas.locator('[data-dimmed]')).toHaveCount(0)
      assert.deepEqual(await roleGeometry(), beforeRole, '岗位选择和清除保留节点、连线及镜头')
      await chooseGranularity(editor, '节点明细')
      await pickRoles('品质', '仓库')
      const sharedNode = canvas.getByRole('button', { name: '查看节点：合格行待入库', exact: true })
      await expect(sharedNode.locator('[data-role-label]')).toHaveText('共同 · 仓库、品质')
      await expect(sharedNode).toHaveAccessibleDescription(/高亮岗位：共同 · 仓库、品质/u)
      await expect(canvas.getByRole('button', { name: '查看节点：IQC 确认本行检验通过', exact: true }).locator('[data-role-label]')).toHaveText('品质')
      await expect(canvas.getByRole('button', { name: '查看节点：仓库确认本次合格行入库', exact: true }).locator('[data-role-label]')).toHaveText('仓库')
      await sharedNode.click()
      await expect(card).toContainText('共同 · 仓库、品质')
      await click('关闭画布说明')
      await chooseGranularity(editor, '业务步骤')
      await pickRoles('品质')
      await editor.getByRole('checkbox', { name: '异常与回接', exact: true }).check()
      const expandedRoleCount = await roleMatches.count()
      assert(expandedRoleCount > 1, '分支包含更多品质节点')
      await roleTrigger.click()
      await expect(quality).toHaveAccessibleDescription(`当前画布有 ${expandedRoleCount} 个相关节点`)
      await clearRole.click()
      await page.keyboard.press('Escape')
      await editor.getByRole('checkbox', { name: '异常与回接', exact: true }).uncheck()
      const rejectEdge = canvas.locator('[data-design-edge][data-edge-to$=":reject_purchase_order"]')
      await chooseGranularity(editor, '链路概览')
      await expect(rejectEdge).toHaveCount(0)
      await click('展开链路步骤')
      await expect(canvas).toHaveAttribute('data-view-mode', 'overview')
      await expect(crossChain).toHaveCount(0)
      await expect(rejectEdge).toHaveCount(0)
      const beforeBranches = await nodePositions()
      await exceptions.focus()
      await exceptions.press('Space')
      await expect(exceptions).toBeFocused()
      await expect(rejectEdge).toHaveCount(1)
      await exceptions.uncheck()
      await expect(rejectEdge).toHaveCount(0)
      assert.deepEqual(await nodePositions(), beforeBranches, '单链概览切换分支不移动主线步骤')
      await chooseGranularity(editor, '业务步骤')
      await click('适应画布全图')
      const normalPositions = await nodePositions()
      await click('查看节点：自动建立逐行待检 IQC')
      await expectCanvasFits(editor)
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
      await click('查看：创建来料纠正检验')
      await expect(canvas).toHaveAttribute('data-view-mode', 'mainline')
      await expect(canvas.getByRole('button', { name: '查看节点：创建来料纠正检验', exact: true })).toHaveCount(0)
      await expectCanvasFits(editor)
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
      await card.getByRole('button', { name: '进入目标链', exact: true }).click()
      await expect(editor.locator('.erp-chain-design__toolbar')).toContainText('采购拒收处置')
      await search.fill('补换')
      await search.press('Enter')
      await click('返回来处')
      await expect(search).toHaveValue('IQC')
      await expectCanvasFits(editor)
      await expect(card).toContainText('质检拒绝进入处置')
      await click('关闭画布说明')
      await pickRoles('品质', '仓库')
      await click('缩小画布')
      await page.reload()
      await expect(editor).toBeVisible()
      await expect(roleTrigger).toHaveAccessibleName('岗位高亮：已选 2 个岗位')
      await expectCanvasFits(editor)
      await chooseLayout(editor, '业务泳道')
      await pickRoles('仓库')
      await click('适应画布全图')
      await searchWholeLibrary(editor)
      await search.fill('采购')
      await search.press('Enter')
      await click('查看节点：自动建立逐行待检 IQC')
      const list = editor.getByLabel('可加入的节点', { exact: true })
      await list.evaluate((element) => { element.scrollTop = 120 })
      const readWorking = () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), workingKey)
      await expectCanvasFits(editor)
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
        await blankPage.reload()
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
      await expect(editor.getByRole('group', { name: '显示内容', exact: true })).toBeVisible()
      await click('查看节点：销售受理到生产准备')
      await expect(card).toContainText('用途与交接')
      await assertNoHorizontalOverflow(page)
      await click('关闭画布说明')
      await chooseChainScope(page, '销售受理到生产准备')
      await expect(layoutTrigger(editor)).toContainText('业务泳道')
      await chooseLayout(editor, '阶段排布')
      await editor.getByRole('checkbox', { name: '异常与回接', exact: true }).check()
      const beforeReload = await readWorking()
      await page.reload()
      await expect(layoutTrigger(editor)).toContainText('阶段排布')
      await expect(editor.getByRole('checkbox', { name: '异常与回接', exact: true })).toBeChecked()
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(1)
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

  await editor.getByRole('button', { name: /^显示内容：/u }).click()
  const layers = page.getByRole('dialog', { name: '显示内容', exact: true })
  await layers.getByRole('checkbox', { name: '异常与回接', exact: true }).check()
  await layers.getByRole('button', { name: '关闭显示内容', exact: true }).click()
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
    search: document.querySelector('input[aria-label="搜索链路或业务节点"]').value,
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
  await chooseGranularity(editor, '节点明细')
  const beforeZoom = await snapshot()
  await click('缩小画布')
  const original = await snapshot()
  assert.deepEqual(original.working, beforeZoom.working, '缩放只作用于当前画面')
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
      await expectCanvasFits(reopened.getByRole('region', { name: '流程探索', exact: true }))
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
  const search = editor.getByRole('textbox', { name: '搜索链路或业务节点', exact: true })
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
      const display = box('.erp-chain-design__granularity')
      const displayElement = root.querySelector('.erp-chain-design__grain-card small')
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
        actionsBelowSettings: actions.top >= Math.max(scope.bottom, display.bottom, role.bottom),
        lastControlGap: graph.top - actions.bottom,
        height: graph.top - root.getBoundingClientRect().top,
        captionLine: parseFloat(getComputedStyle(displayElement).lineHeight),
      }
    })
    assert(rows.pickersFit, `${width}px 范围和岗位按钮不压住相邻控件`)
    assert(rows.sharedSearchRow && rows.sharedViewRow, `${width}px 搜索及看图设置各自同排`)
    assert(rows.actionsAboveGraph && rows.lastControlGap <= 8, `${width}px 画布操作紧贴图的上边界`)
    assert(rows.actionsBelowSettings, '画布操作位于阅读设置下方')
    assert(rows.height <= 140 + rows.captionLine, `${width}px 顶部除常驻说明外最多换一行，实测 ${JSON.stringify(rows)}`)
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
