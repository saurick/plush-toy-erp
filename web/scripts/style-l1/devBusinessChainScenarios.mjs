import { expect } from 'playwright/test'
import { assertFulfillmentChainClickTargets, assertFulfillmentChainGeometry, assertFulfillmentDetailGeometry, openFulfillmentExceptionDirectory, fulfillmentWireCollisions } from './fulfillmentChainAssertions.mjs'
import { assertInactivePrintStylesDoNotHideApp } from './styleIsolationAssertions.mjs'

export function createDevBusinessChainScenarios({ assert, assertNoHorizontalOverflow, expectText, outputDir, path, observatoryPath, startNoWriteAudit }) {
  const verifyDiagram = async (page, diagram) => {
    await expect(diagram).toHaveAttribute('data-graph-status', 'rendered')
    await expect(diagram.locator('[data-graph-wire]').first()).toBeAttached()
    const geometry = await diagram.evaluate((root) => {
      const base = root.getBoundingClientRect()
      return {
        width: root.clientWidth,
        scrollWidth: root.scrollWidth,
        boxes: [...root.querySelectorAll('[data-graph-node],[data-graph-edge]')].map((node) => {
          const box = node.getBoundingClientRect()
          return { key: node.dataset.graphNode || node.dataset.graphEdge, x: box.x - base.x, y: box.y - base.y, width: box.width, height: box.height, clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1 }
        }),
        paths: [...root.querySelectorAll('[data-graph-wire]')].map((node) => ({ key: node.dataset.graphWire, from: node.dataset.from, to: node.dataset.to, d: node.getAttribute('d') })),
      }
    })
    assert(geometry.scrollWidth <= geometry.width + 1, '原生业务图不能挤出容器')
    assert.deepEqual(geometry.boxes.filter((box) => box.clipped), [], '节点与必要条件完整展示')
    assert.deepEqual(fulfillmentWireCollisions(geometry), [], '业务图连线不能穿过其他节点或条件')
    const before = page.url()
    const node = diagram.locator('[data-graph-node]').first()
    await node.focus()
    await node.press('Enter')
    await expect(node).toHaveAttribute('aria-pressed', 'true')
    assert.equal(new URL(page.url()).searchParams.get('view'), new URL(before).searchParams.get('view'), '节点点选不跳页')
    assert.equal(await diagram.locator('button[aria-label*=全屏]').count(), 0)
    await assertNoHorizontalOverflow(page, '原生业务图')
  }
  const verifySelectionRecovery = async (page) => {
      for (const [view, id, key, detail, placeholder] of [
        ['states', 'dev-flow-state-select', 'flow', '[data-selected-flow]', '选择状态对象'],
        ['processes', 'dev-flow-process-select', 'process', '.erp-dev-flow-process-definition', '选择流程定义'],
        ['facts', 'dev-flow-fact-select', 'fact', '[data-selected-fact]', '选择事实定义'],
      ]) {
        await page.goto(new URL(`/__dev/status-flows?view=${view}`, page.url()).href)
        const control = page.locator('.ant-select').filter({ has: page.locator(`#${id}`) })
        await control.locator('.ant-select-clear').click()
        await expect(control.locator('.ant-select-selection-placeholder')).toHaveText(placeholder)
        assert.equal(new URL(page.url()).searchParams.get(key), '')
        assert.equal(await page.locator(detail).count(), 0)
        await page.reload()
        await expect(control.locator('.ant-select-selection-placeholder')).toHaveText(placeholder)
        await control.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        await control.locator('.ant-select-selection-item').waitFor()
        assert.notEqual(new URL(page.url()).searchParams.get(key), '')
      }
      await page.goto(new URL('/__dev/business-topics', page.url()).href)
      const topics = page.locator('[data-business-chain-topics]')
      await topics.locator('[data-topic-diagram]').waitFor()
      assert.equal(new URL(page.url()).searchParams.has('flow_topic'), false)
      await topics.locator('.ant-select-clear').click()
      assert.equal(new URL(page.url()).searchParams.get('flow_topic'), '')
      await topics.getByText('请选择业务专题', { exact: true }).waitFor()
      assert.equal(await topics.locator('[data-topic-diagram]').count(), 0)
      await page.reload()
      await topics.getByText('请选择业务专题', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('flow_topic'), '')
      await topics.getByRole('combobox', { name: '选择业务专题' }).click()
      await page.locator('.ant-select-dropdown:visible').getByRole('option', { name: '销售受理到生产准备', exact: true }).click()
      await topics.locator('[data-topic-diagram]').waitFor()
      await assertNoHorizontalOverflow(page)
  }
  const instanceFixtures = [
    { id: 21, task_status_key: 'ready', discovery: { stage_key: 'shell_quality' } },
    { id: 22, task_status_key: 'done', discovery: { stage_key: 'shell_quality' } },
    { id: 23, task_status_key: 'blocked', exception_id: 4, discovery: { stage_key: 'sewing_exception' } },
    { id: 24, task_status_key: 'ready', discovery: { stage_key: 'not_registered' } },
  ].map((item) => ({ version: 1, task_name: `模拟关联任务 ${item.id}`, task_group: item.exception_id ? 'production_exception' : 'quality', owner_role_key: 'quality', source_type: 'production_wip_batch', source_no: 'QA-DEMO-001', ...item }))
  const instanceReads = new WeakMap()
  const writeRequestsByPage = new WeakMap()
  return [
    {
    name: 'dev-business-chain-reading-and-export',
    path: observatoryPath,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      startNoWriteAudit(page, writeRequestsByPage)
      await page.addInitScript(() => { window.__flowPrintCount = 0; window.print = () => { window.__flowPrintCount += 1 } })
    },
    verify: async (page) => {
        await verifySelectionRecovery(page)
        await page.goto(new URL(observatoryPath, page.url()).href)
      await expectText(page, '业务链路')
      const root = page.locator('[data-dev-flow-state-observatory]')
      let guide = page.locator('#task-fulfillment-guide')
      const views = guide.getByRole('radiogroup', { name: '流程视图' })
      const panel = guide.locator('[aria-label="流程详情"]')
      await expect(root).toBeVisible()
      await expect(page.locator('#dev-flow-task-search')).toHaveCount(0)
      await assertInactivePrintStylesDoNotHideApp(page)
      await assertFulfillmentChainClickTargets(guide.locator('[data-fulfillment-chain]'))
      await guide.getByRole('button', { name: '11 皮套检验', exact: true }).click()
      await verifyDiagram(page, panel.locator('[data-business-flow]'))
      await assertFulfillmentDetailGeometry(panel)
      await guide.locator('[data-stage-exception="cutting_quality"]').click()
      await panel.locator('[data-graph-status="rendered"]').waitFor()
      await panel.locator('[data-graph-node="original_rework"]').click()
      await panel.getByRole('button', { name: '查看此方案', exact: true }).click()
      await panel.locator('[data-exception-plan="original_rework"] [data-graph-status="rendered"]').waitFor()
      await verifyDiagram(page, panel.locator('[data-business-flow]'))
      await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      await assertFulfillmentDetailGeometry(panel)
      await guide.getByRole('button', { name: '业务专题', exact: true }).click()
      guide = page.getByRole('region', { name: '业务专题阅读', exact: true })
      await guide.locator('.ant-select')
        .filter({ has: page.getByRole('combobox', { name: '选择业务专题', exact: true }) })
        .locator('.ant-select-selector').click()
      const topicOptions = page.locator('.ant-select-dropdown:visible')
      await expect(topicOptions.getByRole('option', { name: '销售受理到生产准备', exact: true })).toBeVisible()
      await topicOptions.getByRole('option', { name: '成品出货到应收建立', exact: true }).click()
      await topicOptions.waitFor({ state: 'hidden' })
      await guide.locator('[data-topic-diagram="delivery_to_settlement"] [data-graph-status="rendered"]').waitFor()
      await verifyDiagram(page, guide.locator('[data-topic-diagram="delivery_to_settlement"] [data-business-flow]'))
      await guide.locator('[data-graph-node="shipped"]').click()
      await expect(guide.locator('[data-graph-node="shipped"]')).toHaveAttribute('aria-pressed', 'true')
      await expect(guide.locator('[data-graph-node="shipment_rejected"]')).toBeAttached()
      assert.equal(await guide.locator('[data-graph-wire][data-from="shipment_rejected"]').count(), 0, '拒绝结果不继续发货')
      await guide.getByRole('button', { name: '系统衔接图', exact: true }).click()
      const system = guide.locator('[data-business-chain-system]')
      await verifyDiagram(page, system.locator('[data-business-flow]'))
      await guide.getByRole('button', { name: '返回 成品出货到应收建立', exact: true }).click()
      await expect(system).toHaveCount(0)
      await guide.getByRole('button', { name: '查看规则', exact: true }).click()
      await page.getByRole('tablist', { name: '关联信息类型' }).waitFor()
      await page.getByRole('button', { name: '返回 业务专题', exact: true }).click()
      await guide.locator('[data-topic-diagram="delivery_to_settlement"]').waitFor()
      await page.reload()
      await guide.locator('[data-topic-diagram="delivery_to_settlement"] [data-graph-status="rendered"]').waitFor()
      await guide.locator('.ant-select')
        .filter({ has: page.getByRole('combobox', { name: '选择业务专题', exact: true }) })
        .locator('.ant-select-selector').click()
      await page.locator('.ant-select-dropdown:visible')
        .getByRole('option', { name: '销售受理到生产准备', exact: true }).click()
      await guide.locator('[data-graph-node="material_request"]').click()
      await guide.getByRole('button', { name: '查看规则', exact: true }).click()
      await expect(page.locator('[data-selected-flow]'))
        .toHaveAttribute('data-selected-flow', 'source.engineering_material_request')
      await page.reload()
      await expect(page.locator('[data-selected-flow]'))
        .toHaveAttribute('data-selected-flow', 'source.engineering_material_request')
      await page.getByRole('button', { name: '返回 业务专题', exact: true }).click()
      await expect(guide.locator('[data-graph-node="material_request"]'))
        .toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: '返回 业务结构', exact: true }).click()
      guide = page.locator('#task-fulfillment-guide')
      await openFulfillmentExceptionDirectory(guide)
      await guide.getByRole('combobox', { name: '异常类型', exact: true }).click()
      await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option')).toHaveCount(6)
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '裁片、皮套与成品不合格' }).click()
      await panel.locator('[data-graph-status="rendered"]').waitFor()
      await panel.locator('[data-graph-node="remake"]').click()
      await panel.getByRole('button', { name: '查看此方案', exact: true }).click()
      await panel.locator('[data-exception-plan="remake"] [data-graph-status="rendered"]').waitFor()
      assert.equal(new URL(page.url()).searchParams.has('flow_exception_origin'), false)
      await panel.locator('.ant-select')
        .filter({ has: page.getByRole('combobox', { name: '发生环节', exact: true }) })
        .locator('.ant-select-selector').click()
      const originOptions = page.locator('.ant-select-dropdown:visible')
      await originOptions.getByRole('option', { name: '皮套检验', exact: true }).click()
      await originOptions.waitFor({ state: 'hidden' })
      await expect(page).toHaveURL((url) => url.searchParams.get('flow_decision') === 'remake'
        && url.searchParams.get('flow_exception_origin') === 'shell_quality')
      await panel.locator('[data-graph-status="rendered"]').waitFor()
      await panel.locator('[data-graph-node="end:original"]').click()
      await panel.locator('[data-selected-exception-node="end:original"]').waitFor()
      await assertFulfillmentDetailGeometry(panel)
      await page.getByRole('button', { name: '搜索定义', exact: true }).click()
      const search = page.getByRole('dialog', { name: '搜索定义' })
      await search.waitFor()
      await search.locator('.ant-drawer-close').click()
      await search.waitFor({ state: 'hidden' })
      const primary = page.getByRole('tablist', { name: '业务链路方式' })
      await primary.getByRole('tab', { name: '实例跟踪' }).click()
      await expectText(page, '输入单号或任务，查看实际进度与异常')
      const taskSearch = page.locator('#dev-flow-task-search')
      const inputError = page.locator('#dev-flow-task-input-error')
      const taskFinder = page.locator('.erp-dev-flow-task-finder')
      for (const empty of ['', '   ']) {
        await taskSearch.fill(empty)
        await taskFinder.getByRole('button', { name: '搜索', exact: true }).click()
        await expect(inputError).toHaveText('请输入来源单号、任务名称或编号')
        await expect(taskSearch).toHaveAttribute('aria-invalid', 'true')
        await expect(taskSearch).toBeFocused()
        assert.equal(await taskFinder.locator('.ant-alert-error').count(), 0)
      }
      const inputBox = await taskSearch.boundingBox()
      const errorBox = await inputError.boundingBox()
      assert(errorBox.y >= inputBox.y + inputBox.height, '校验提示应位于输入框下方')
      await taskSearch.fill('来源单号')
      await expect(inputError).toHaveCount(0)
      assert.equal(await taskSearch.getAttribute('aria-invalid'), null)
      await primary.getByRole('tab', { name: '业务结构' }).click()
      await expect(taskSearch).toHaveCount(0)
      await panel.locator('[data-exception-plan="remake"] [data-graph-status="rendered"]').waitFor()
      await primary.getByRole('tab', { name: '查看规则', exact: true }).click()
      for (const [name, view] of [['流程定义', 'processes'], ['事实定义', 'facts'], ['状态与流转规则', 'states']]) {
        await page.getByRole('tablist', { name: '关联信息类型' }).getByRole('tab', { name: new RegExp(`^${name}`) }).click()
        await expect(page).toHaveURL((url) => url.searchParams.get('view') === view)
        await expect(taskSearch).toHaveCount(0)
        if (view === 'processes') await verifyDiagram(page, page.locator('.erp-dev-flow-process-definition [data-business-flow]'))
        if (view === 'states') await verifyDiagram(page, page.locator('[data-selected-flow] [data-business-flow]'))
      }
      await primary.getByRole('tab', { name: '业务结构' }).click()
      await primary.getByRole('tab', { name: '实例跟踪' }).click()
      await expect(taskSearch).toHaveValue('')
      await expect(inputError).toHaveCount(0)
      await taskSearch.fill('')
      await primary.getByRole('tab', { name: '业务结构' }).click()
      await panel.locator('[data-exception-plan="remake"] [data-graph-status="rendered"]').waitFor()
      await page.getByRole('button', { name: '导出', exact: true }).hover()
      await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' }).click()
      await page.waitForFunction(() => window.__flowPrintCount === 1)
      await page.emulateMedia({ media: 'print' })
      assert.equal(await root.getAttribute('data-flow-print-current'), 'true')
      assert.equal(await panel.locator('[data-graph-status="rendered"]').count(), 1)
      assert(await panel.locator('[data-graph-node]').evaluateAll((nodes) => nodes.length > 0 && nodes.every((node) => node.getBoundingClientRect().width > 0)), '打印必须保留原生图节点')
      if (page.context().browser()?.browserType().name() === 'chromium') await page.pdf({ path: path.join(outputDir, 'exception-flow-current.pdf'), preferCSSPageSize: true, printBackground: true })
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
      await page.emulateMedia({ media: 'screen' })
      await views.getByText('订单全流程', { exact: true }).click()
      await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      const branchCount = await guide.locator('[data-stage-exception]').count()
      await page.getByRole('button', { name: '导出', exact: true }).hover()
      await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' }).click()
      await page.waitForFunction(() => window.__flowPrintCount === 2)
      await page.emulateMedia({ media: 'print' })
      assert(branchCount > 0)
      assert.equal(await guide.locator('[data-stage-exception]:visible').count(), branchCount, '总图打印保留专项异常')
      for (const label of ['委外产品回货拒收', '生产超领材料']) {
        await expect(guide.getByRole('button', { name: label, exact: true })).toBeVisible()
      }
      await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      if (page.context().browser()?.browserType().name() === 'chromium') await page.pdf({ path: path.join(outputDir, 'order-current-with-exceptions.pdf'), preferCSSPageSize: true, printBackground: true })
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
      await page.emulateMedia({ media: 'screen' })
      await page.getByRole('button', { name: '导出', exact: true }).hover()
      await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
      const review = page.getByRole('dialog', { name: '客户校对稿' })
      await review.waitFor()
      await review.getByRole('button', { name: /取\s*消/u }).click()
      await review.waitFor({ state: 'hidden' })
      await assertNoHorizontalOverflow(page, 'flow-navigation-and-diagrams')
      await guide.getByRole('button', { name: '11 皮套检验', exact: true }).click()
      await verifyDiagram(page, panel.locator('[data-business-flow]'))
      await page.screenshot({ path: path.join(outputDir, 'business-chain-native-4k.png'), fullPage: true })
      await page.setViewportSize({ width: 1024, height: 768 })
      await verifyDiagram(page, panel.locator('[data-business-flow]'))
      await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      assert.deepEqual(writeRequestsByPage.get(page) || [], [], '结构观察不得发出业务写请求')
    },
  }, {
    name: 'dev-flow-state-observatory-instance',
    path: '/__dev/status-flows?view=tracking&chain=all&task_id=21',
    viewport: { width: 1440, height: 900 },
    auth: 'admin',
    mockAdminRpc: true,
    beforeNavigate: async (page) => {
      const reads = { denied: false, requests: [] }
      instanceReads.set(page, reads)
      await page.route('**/rpc/workflow', async (route) => {
        const rpc = route.request().postDataJSON()
        if (!['get_task', 'get_task_handling_chain'].includes(rpc.method)) return route.fallback()
        reads.requests.push(rpc)
        await route.fulfill({ json: { jsonrpc: '2.0', id: rpc.id, result: reads.denied ? { code: 1, message: '当前账号不能查看该任务链' } : { code: 0, data: rpc.method === 'get_task' ? { task: instanceFixtures.find((item) => item.id === rpc.params.task_id) } : { items: instanceFixtures, truncated: true } } } })
      })
    },
    verify: async (page) => {
      const instance = page.locator('[data-instance-task="21"]')
      await expect(instance).toBeVisible()
      await expect(instance.locator('[data-task-record]')).toHaveCount(4)
      await expect(instance.getByText('环节待核对', { exact: true })).toBeVisible()
      assert((await instance.innerText()).includes('最多展示 100 项'))
      assert.equal(await instance.locator('time').count(), 0, '接口未提供事件时间，不画模拟时间')
      await instance.getByRole('button', { name: /待处理/ }).first().click()
      await expect(instance.locator('[data-task-record]')).toHaveCount(3)
      const primary = page.getByRole('tablist', { name: '业务链路方式' })
      await primary.getByRole('tab', { name: '查看规则', exact: true }).click()
      await expect(page.getByRole('button', { name: /^返回 / })).toHaveCount(0)
      await primary.getByRole('tab', { name: '业务结构', exact: true }).click()
      await primary.getByRole('tab', { name: '实例跟踪', exact: true }).click()
      await expect(instance.locator('[data-task-record]')).toHaveCount(3)
      assert.equal(new URL(page.url()).searchParams.get('task_filter'), 'pending')
      assert.equal(new URL(page.url()).searchParams.get('task_id'), '21')
      await expect(page.getByRole('button', { name: /^返回 / })).toHaveCount(0)
      await page.getByRole('tab', { name: '协同记录', exact: true }).click()
      await page.getByRole('tablist', { name: '关联信息类型' }).waitFor()
      await page.getByRole('tab', { name: '关联任务', exact: true }).click()
      await expect(instance.locator('[data-task-record]')).toHaveCount(3)
      assert.equal(new URL(page.url()).searchParams.get('task_filter'), 'pending')
      await instance.getByRole('button', { name: '查看对应办理流程', exact: true }).click()
      await page.locator('[data-stage-normal="shell_quality"] [data-business-flow]').waitFor()
      await page.getByRole('button', { name: '返回 实例跟踪', exact: true }).click()
      await expect(instance.locator('[data-task-record]')).toHaveCount(3)
      instanceReads.get(page).denied = true
      await page.reload()
      await page.getByText('关联任务读取失败', { exact: true }).waitFor()
      assert.equal(await page.locator('[data-task-record]').count(), 0)
      instanceReads.get(page).denied = false
      await page.getByRole('button', { name: '重新读取', exact: true }).click()
      await expect(instance.locator('[data-task-record]')).toHaveCount(3)
      await page.setViewportSize({ width: 1024, height: 768 })
      await assertNoHorizontalOverflow(page, '实例任务窄窗口')
      await page.screenshot({ path: path.join(outputDir, 'business-chain-instance-fixture.png') })
    },
  }]
}
