import { expect } from 'playwright/test'
import { assertFulfillmentChainClickTargets, assertFulfillmentChainGeometry, assertFulfillmentDetailGeometry, openFulfillmentExceptionDirectory } from './fulfillmentChainAssertions.mjs'
import { assertInactivePrintStylesDoNotHideApp } from './styleIsolationAssertions.mjs'

export const DEV_FLOW_STATE_OBSERVATORY_PATH =
  '/__dev/status-flows?view=chain&chain=all'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function startNoWriteAudit(page, store) {
  const requests = []
  store.set(page, requests)
  page.on('request', (request) => {
    if (WRITE_METHODS.has(request.method().toUpperCase())) {
      requests.push({ method: request.method(), url: request.url() })
    }
  })
}

export function createDevFlowStateObservatoryScenarios({ assert, assertNoHorizontalOverflow, expectText, outputDir, path }) {
  const verifySelectionRecovery = async (page) => {
      for (const [view, id, key, detail, placeholder] of [
        ['states', 'dev-flow-state-select', 'flow', '[data-selected-flow]', '选择状态对象'],
        ['runtime', 'dev-flow-process-select', 'process', '.erp-dev-flow-process-definition', '选择流程定义'],
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
      await page.goto(new URL('/__dev/status-flows?view=chain&chain=all&flow_tab=topics', page.url()).href)
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
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
      await topics.locator('[data-topic-diagram]').waitFor()
      await assertNoHorizontalOverflow(page)
  }
  const writeRequestsByPage = new WeakMap()
  return [
    {
    name: 'dev-flow-state-observatory-desktop-light',
    path: DEV_FLOW_STATE_OBSERVATORY_PATH,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      startNoWriteAudit(page, writeRequestsByPage)
      await page.addInitScript(() => { window.__flowPrintCount = 0; window.print = () => { window.__flowPrintCount += 1 } })
    },
    verify: async (page) => {
        await verifySelectionRecovery(page)
        await page.goto(new URL(DEV_FLOW_STATE_OBSERVATORY_PATH, page.url()).href)
      await expectText(page, '业务链路')
      const root = page.locator('[data-dev-flow-state-observatory]')
      const guide = page.locator('#task-fulfillment-guide')
      const views = guide.getByRole('radiogroup', { name: '流程视图' })
      const panel = guide.locator('[aria-label="流程详情"]')
      await expect(root).toBeVisible()
      await expect(page.locator('#dev-flow-task-search')).toHaveCount(0)
      await assertInactivePrintStylesDoNotHideApp(page)
      await assertFulfillmentChainClickTargets(guide.locator('[data-fulfillment-chain]'))
      await guide.locator('[data-stage-exception="cutting_quality"]').click()
      await panel.locator('[data-mermaid-status="rendered"]').waitFor()
      await panel.getByRole('button', { name: '原厂 / 本厂返工', exact: true }).click()
      await panel.locator('[data-exception-plan="original_rework"] [data-mermaid-status="rendered"]').waitFor()
      await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      await assertFulfillmentDetailGeometry(panel)
      await views.getByText('业务专题', { exact: true }).click()
      await guide.locator('.ant-select')
        .filter({ has: page.getByRole('combobox', { name: '选择业务专题', exact: true }) })
        .locator('.ant-select-selector').click()
      const topicOptions = page.locator('.ant-select-dropdown:visible')
      await expect(topicOptions.getByRole('option')).toHaveCount(11)
      await topicOptions.getByRole('option', { name: '成品出货到应收建立', exact: true }).click()
      await topicOptions.waitFor({ state: 'hidden' })
      await guide.locator('[data-topic-diagram="delivery_to_settlement"] [data-mermaid-status="rendered"]').waitFor()
      await guide.getByRole('button', { name: '真实出货事实', exact: true }).click()
      assert((await guide.locator('.erp-dev-fulfillment-guide__focus').innerText()).includes('取消出货'))
      await guide.getByRole('button', { name: '系统衔接图', exact: true }).click()
      const system = page.getByRole('dialog', { name: '系统衔接图' })
      await system.locator('[data-mermaid-status="rendered"]').waitFor()
      await system.locator('.ant-drawer-close').click()
      await system.waitFor({ state: 'hidden' })
      await guide.getByRole('button', { name: '查看单据状态与规则', exact: true }).click()
      await guide.getByRole('heading', { name: '办理环节', exact: true }).waitFor()
      await page.getByRole('button', { name: '返回业务专题', exact: true }).click()
      await guide.locator('[data-topic-diagram="delivery_to_settlement"]').waitFor()
      await page.reload()
      await guide.locator('[data-topic-diagram="delivery_to_settlement"] [data-mermaid-status="rendered"]').waitFor()
      await openFulfillmentExceptionDirectory(guide)
      await expect(guide.locator('[data-exception-entry]')).toHaveCount(6)
      await guide.locator('[data-exception-entry="production_quality"]').click()
      await panel.locator('[data-mermaid-status="rendered"]').waitFor()
      await panel.getByRole('button', { name: '补料重做', exact: true }).click()
      await panel.locator('[data-exception-plan="remake"] [data-mermaid-status="rendered"]').waitFor()
      assert.equal(new URL(page.url()).searchParams.has('flow_exception_origin'), false)
      await panel.locator('.ant-select')
        .filter({ has: page.getByRole('combobox', { name: '发生环节', exact: true }) })
        .locator('.ant-select-selector').click()
      const originOptions = page.locator('.ant-select-dropdown:visible')
      await originOptions.getByRole('option', { name: '皮套检验', exact: true }).click()
      await originOptions.waitFor({ state: 'hidden' })
      await expect(page).toHaveURL((url) => url.searchParams.get('flow_decision') === 'remake'
        && url.searchParams.get('flow_exception_origin') === 'shell_quality')
      await panel.locator('[data-mermaid-status="rendered"]').waitFor()
      await panel.getByRole('button', { name: '原问题批次终止', exact: true }).click()
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
      await panel.locator('[data-exception-plan="remake"] [data-mermaid-status="rendered"]').waitFor()
      for (const [name, view] of [['查责任与任务', 'workflow'], ['看运行路径', 'runtime']]) {
        await page.getByRole('button', { name: '技术详情' }).click()
        await page.getByRole('menuitem', { name, exact: true }).click()
        await expect(page).toHaveURL((url) => url.searchParams.get('view') === view)
        await expect(taskSearch).toHaveCount(0)
      }
      await primary.getByRole('tab', { name: '业务结构' }).click()
      await primary.getByRole('tab', { name: '实例跟踪' }).click()
      await expect(taskSearch).toHaveValue('')
      await expect(inputError).toHaveCount(0)
      await taskSearch.fill('')
      await primary.getByRole('tab', { name: '业务结构' }).click()
      await panel.locator('[data-exception-plan="remake"] [data-mermaid-status="rendered"]').waitFor()
      await page.getByRole('button', { name: '导出', exact: true }).hover()
      await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' }).click()
      await page.waitForFunction(() => window.__flowPrintCount === 1)
      await page.emulateMedia({ media: 'print' })
      assert.equal(await root.getAttribute('data-flow-print-current'), 'true')
      assert.equal(await panel.locator('[data-mermaid-status="rendered"]').count(), 1)
      if (page.context().browser()?.browserType().name() === 'chromium') await page.pdf({ path: path.join(outputDir, 'exception-flow-current.pdf'), preferCSSPageSize: true, printBackground: true })
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
      await page.emulateMedia({ media: 'screen' })
      await views.getByText('订单全流程', { exact: true }).click()
      await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      await page.getByRole('button', { name: '导出', exact: true }).hover()
      await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
      const review = page.getByRole('dialog', { name: '客户校对稿' })
      await review.waitFor()
      await review.getByRole('button', { name: /取\s*消/u }).click()
      await review.waitFor({ state: 'hidden' })
      await assertNoHorizontalOverflow(page, 'flow-navigation-and-diagrams')
      assert.deepEqual(writeRequestsByPage.get(page) || [], [], '结构观察不得发出业务写请求')
    },
  }]
}
