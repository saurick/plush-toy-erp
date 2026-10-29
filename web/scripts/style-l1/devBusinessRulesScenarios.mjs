import { expect } from 'playwright/test'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'

async function choose(page, label, text) {
  const input = page.getByRole('combobox', { name: label, exact: true })
  await page.locator('.ant-select').filter({ has: input }).locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible').getByText(text, { exact: true }).click()
}

export function createDevBusinessRulesScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  return [{
    name: 'dev-business-rules-navigation-desktop',
    path: '/__dev/status-flows',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    auth: 'admin',
    mockAdminRpc: true,
    verify: async (page) => {
      const { origin } = new URL(page.url())
      const primary = page.getByRole('tablist', { name: '业务链路方式' })
      await expect(primary.getByRole('tab')).toHaveText(['业务结构', '实例跟踪'])
      await page.getByRole('link', { name: '业务规则', exact: true }).click()
      await expect(page.getByRole('heading', { name: '业务规则', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: '业务规则', exact: true })).toHaveAttribute('aria-current', 'page')
      assert.equal(new URL(page.url()).pathname, '/__dev/business-rules')
      await expect(primary).toHaveCount(0)
      const tabs = page.getByRole('tablist', { name: '关联信息类型' })
      await expect(tabs.getByRole('tab')).toHaveText(['状态流转', '流程定义', '事实规则', '财务口径'])
      await expect(tabs.getByRole('tab', { name: '状态流转', exact: true })).toHaveAttribute('aria-selected', 'true')
      const strip = await tabs.elementHandle()
      const stripBox = await tabs.boundingBox()
      for (const label of ['流程定义', '事实规则', '财务口径', '状态流转']) {
        await tabs.getByRole('tab', { name: label, exact: true }).click()
        assert.equal(new URL(page.url()).pathname, '/__dev/business-rules')
        assert(await strip.evaluate((node) => node.isConnected), '分类切换保留同一页签条')
        const next = await tabs.boundingBox()
        assert(Math.abs(stripBox.x - next.x) <= 1 && Math.abs(stripBox.y - next.y) <= 1, '分类切换不推动页签条')
      }
      await verifyMobileNavigationMotion(page, assert, '[aria-label="关联信息类型"]', 1)
      await tabs.getByRole('tab', { name: '状态流转', exact: true }).click()
      await choose(page, '选择状态对象', '销售订单')
      const reader = page.locator('[data-selected-flow="source.sales_order"]')
      const graph = reader.locator('[data-business-flow]')
      await expect(graph).toHaveAttribute('data-graph-status', 'rendered')
      await expect(graph.locator('[data-graph-node]')).toHaveCount(5)
      await graph.locator('[data-graph-node="active"]').click()
      await expect(reader.locator('[data-action-rules]')).toContainText('正常关单或短结')
      await expect(reader.locator('[data-action-rules]')).toContainText('不补造出货、收款或发票')
      await expect(graph.locator('[data-graph-node]')).toHaveCount(5)
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1080 })
        await assertNoHorizontalOverflow(page, `业务规则 ${width}`)
      }
      await page.screenshot({ path: path.join(outputDir, 'business-rules-sales-order-4k.png'), fullPage: true })
      for (const [label, key] of [['财务红冲单', 'fact.finance_credit_note'], ['财务核销记录', 'fact.finance_allocation']]) {
        await choose(page, '选择状态对象', label)
        assert.equal(new URL(page.url()).searchParams.has('state'), false, '切换对象清理旧选中状态')
        const record = page.locator(`[data-selected-flow="${key}"]`)
        await expect(record).toHaveAttribute('data-record-reference', 'true')
        await expect(record.locator('[data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
        await expect(record.locator('[data-graph-node]')).toHaveCount(2)
        await expect(record.locator('[data-graph-wire]')).toHaveCount(1)
        await expect(record.locator('[data-graph-wire]')).toHaveAttribute('data-from', 'REVERSED')
        await expect(record.locator('[data-graph-wire]')).toHaveAttribute('data-to', 'POSTED')
        await expect(record.locator('.erp-dev-flow-transition-toolbar')).toHaveCount(0)
        await expect(record).toContainText('不修改原行状态')
        await record.locator('[data-graph-node="REVERSED"]').click()
        await page.reload()
        await expect(record.locator('[data-graph-node="REVERSED"]')).toHaveAttribute('aria-pressed', 'true')
        await assertNoHorizontalOverflow(page, label)
        if (key === 'fact.finance_credit_note') await page.screenshot({ path: path.join(outputDir, 'business-rules-credit-note-4k.png'), fullPage: true })
      }
      for (const [label, key, count, names] of [
        ['工程与打样', 'source.sales_order_engineering', 5, ['开始打样', '确认样品', '返单复用样品', '退回准备', '重新准备样品']],
        ['工程用料审批', 'source.engineering_material_request', 4, ['老板批准用料', '老板退回用料', '财务批准采购', '财务退回用料']],
      ]) {
        await choose(page, '选择状态对象', label)
        const reader = page.locator(`[data-selected-flow="${key}"]`)
        const graph = reader.locator('[data-business-flow]')
        await expect(graph.locator('[data-graph-wire]')).toHaveCount(count)
        for (const name of names) await expect(graph).toContainText(name)
        await reader.getByRole('button', { name: '异常与纠正 2', exact: true }).click()
        await expect(graph.locator('[data-graph-wire]')).toHaveCount(2)
      }
      await choose(page, '选择状态对象', '生产事实')
      const production = page.locator('[data-selected-flow="fact.production"]')
      await production.getByRole('button', { name: '正常推进 1', exact: true }).click()
      await expect(production.locator('[data-graph-wire]')).toHaveCount(1)
      await expect(production.locator('[data-business-flow]')).toContainText('过账')
      await choose(page, '选择状态对象', 'ProcessRuntime 实例')
      const runtime = page.locator('[data-selected-flow="process.instance"]')
      await runtime.locator('[data-graph-node="completed"]').click()
      await expect(runtime.locator('[data-path-group="outcome"]')).toHaveCount(2)
      await expect(runtime).toContainText('已结束')
      await expect(runtime).toContainText('补偿结束')
      await expect(runtime).toContainText('结束不代表成功')
      await choose(page, '选择状态对象', '质量检验')
      const quality = page.locator('[data-selected-flow="fact.quality_inspection"]')
      await page.getByRole('combobox', { name: '选择状态对象', exact: true }).press('Escape')
      await quality.locator('[data-graph-node="PASSED"]').click()
      await page.mouse.move(0, 0)
      await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
      await expect(quality.locator('[data-action-rules]')).toContainText('不把原记录改回待检')
      await expect(quality.locator('[data-action-rules]')).toContainText('生产在制批次检验不适用')
      await page.screenshot({ path: path.join(outputDir, 'business-rules-quality-correction-4k.png'), fullPage: false })
      await quality.getByRole('button', { name: '关联查看', exact: true }).click()
      const chain = catalog.businessChains.find((item) => item.key === 'purchase_to_inventory')
      await page.getByRole('menuitem', { name: `${chain.label} / 纠正后新待检记录`, exact: true }).click()
      await expect.poll(() => new URL(page.url()).searchParams.get('node')).toBe('purchase_quality_correction')
      await expect(page.locator('[data-business-chain-technical]')).toHaveAttribute('open', '')
      const correctionGraph = page.locator('[data-business-flow]').filter({ hasText: '纠正后新待检记录' })
      await expect(correctionGraph).toBeVisible()
      await expect(correctionGraph).toHaveAttribute('data-graph-status', 'rendered')
      await expect(correctionGraph.locator('[data-graph-node="purchase_quality_correction"]')).toHaveAttribute('aria-pressed', 'true')
      for (const width of [1024, 1920]) {
        await page.setViewportSize({ width, height: 1080 })
        await assertNoHorizontalOverflow(page, `质检纠正关联 ${width}`)
      }
      await correctionGraph.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(outputDir, 'business-chain-quality-correction-4k.png'), fullPage: false })
      await page.goto(`${origin}/__dev/status-flows?view=states&flow=source.sales_order&state=active`)
      await expect(page.locator('[data-selected-flow="source.sales_order"]')).toBeVisible()
      assert.equal(new URL(page.url()).pathname, '/__dev/business-rules', '规则深链落在唯一入口')
      await page.goto(`${origin}/__dev/business-rules?flow=unknown-rule`)
      await expect(page.getByRole('alert')).toContainText('无效或过期深链接')
      await expect(page.locator('[data-selected-flow]')).toHaveCount(0)
    },
  }, {
    name: 'dev-business-rules-selection-recovery-desktop',
    path: '/__dev/business-rules',
    viewport: { width: 1920, height: 1080 },
    auth: 'admin',
    mockAdminRpc: true,
    verify: async (page) => {
      const shipment = catalog.flows.find((flow) => flow.key === 'fact.shipment')
      const cancellation = shipment.actionRules.find((rule) => rule.key === 'cancel')
      const tabs = page.getByRole('tablist', { name: '关联信息类型' })
      await choose(page, '选择状态对象', shipment.label)
      await choose(page, '办理动作', cancellation.label)
      assert.equal(new URL(page.url()).searchParams.get('rule_action'), cancellation.key)
      await tabs.getByRole('tab', { name: '事实规则', exact: true }).click()
      await page.reload()
      await tabs.getByRole('tab', { name: '状态流转', exact: true }).click()
      const reader = page.locator('[data-selected-flow="fact.shipment"]')
      await expect(tabs.getByRole('tab', { name: '状态流转', exact: true })).toBeFocused()
      await expect(reader).toBeVisible()
      await expect(reader.locator('[data-action-rules]')).toContainText(cancellation.condition)
      const action = page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '办理动作', exact: true }) })
      await expect(action.locator('.ant-select-selection-item')).toHaveText(cancellation.label)
      await action.locator('.ant-select-clear').click()
      await expect(action.locator('.ant-select-selection-placeholder')).toHaveText('选择办理动作')
      await expect(reader.locator('.erp-dev-flow-rule-detail')).toHaveCount(0)
      await page.reload()
      await expect(action.locator('.ant-select-selection-placeholder')).toHaveText('选择办理动作')
      await tabs.getByRole('tab', { name: '事实规则', exact: true }).click()
      await tabs.getByRole('tab', { name: '状态流转', exact: true }).click()
      await expect(action.locator('.ant-select-selection-placeholder')).toHaveText('选择办理动作')
      const object = page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '选择状态对象', exact: true }) })
      await object.locator('.ant-select-clear').click()
      await expect(page.locator('[data-selected-flow]')).toHaveCount(0)
      await page.reload()
      await expect(object.locator('.ant-select-selection-placeholder')).toHaveText('选择状态对象')
      await choose(page, '选择状态对象', shipment.label)
      await expect(action.locator('.ant-select-selection-item')).toHaveText(shipment.actionRules[0].label)
      const { origin } = new URL(page.url())
      await page.goto(`${origin}/__dev/business-rules?flow=fact.shipment&rule_action=unknown`)
      await expect(page.getByRole('alert')).toContainText('办理动作不属于当前对象')
      await expect(page.locator('[data-selected-flow]')).toHaveCount(0)
      await assertNoHorizontalOverflow(page)
    },
  }, {
    name: 'dev-business-rules-context-return-desktop',
    path: '/__dev/status-flows?flow_stage=incoming_quality&flow_substep=inbound&flow_role=warehouse',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    auth: 'admin',
    mockAdminRpc: true,
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      const entry = guide.getByRole('button', { name: '查看动作规则', exact: true })
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      await entry.scrollIntoViewIfNeeded()
      const source = page.url()
      const scroll = await page.evaluate(() => window.scrollY)
      await entry.click()
      await expect(page.getByRole('link', { name: '业务规则', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('[data-selected-flow]')).toHaveAttribute('data-selected-flow', 'fact.purchase_receipt')
      assert.equal(new URL(page.url()).searchParams.get('flow_role'), 'warehouse')
      await page.reload()
      await expect(page.locator('[data-selected-flow]')).toHaveAttribute('data-selected-flow', 'fact.purchase_receipt')
      await page.getByRole('button', { name: '返回 业务结构', exact: true }).click()
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      assert.equal(page.url(), source, '返回恢复完整筛选及子步骤')
      await expect(entry).toBeFocused()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0)
      await entry.click()
      await expect(page.locator('[data-selected-flow]')).toBeVisible()
      await page.goBack()
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      await expect(entry).toBeFocused()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0)
      await page.screenshot({ path: path.join(outputDir, 'business-rules-return-restored-4k.png'), fullPage: true })
      await assertNoHorizontalOverflow(page)
    },
  }]
}
