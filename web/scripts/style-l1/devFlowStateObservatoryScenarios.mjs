import { expect } from 'playwright/test'
import { assertFulfillmentChainClickTargets, assertFulfillmentChainGeometry, assertFulfillmentDetailGeometry, openFulfillmentExceptionDirectory } from './fulfillmentChainAssertions.mjs'
import { assertInactivePrintStylesDoNotHideApp } from './styleIsolationAssertions.mjs'
import {
  switchMermaidLayout,
  verifyMermaidViewer,
} from './mermaidViewerAssertions.mjs'

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

export function createDevFlowStateObservatoryScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectText,
  outputDir,
  path,
}) {
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
        await page.addInitScript(() => {
          window.__flowPrintCount = 0
          window.print = () => {
            window.__flowPrintCount += 1
          }
        })
      },
      verify: async (page) => {
        await verifySelectionRecovery(page)
        await page.goto(new URL(DEV_FLOW_STATE_OBSERVATORY_PATH, page.url()).href)
        await expectText(page, '业务链路')
        const root = page.locator('[data-dev-flow-state-observatory]')
        await root.waitFor({ state: 'visible', timeout: 10_000 })
        await expect(page.locator('#dev-flow-task-search')).toHaveCount(0)
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0,
          '业务链路子页不应重复常驻环境事实'
        )
        assert.equal(
          await root.count(),
          1,
          '业务链路页应提供唯一桌面内容根节点'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-desktop-light'
        )
        await assertInactivePrintStylesDoNotHideApp(page)
        await root.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        assert.equal(await root.getByRole('radiogroup', { name: '履约流程视图' }).count(), 0)
        const guide = page.locator('#task-fulfillment-guide')
        const chooseRole = async (label) => {
          const control = guide.locator('.erp-dev-fulfillment-guide__role .ant-select')
          if (label === '全部岗位') {
            await control.hover()
            await control.locator('.ant-select-clear').click()
            await expect(control.locator('.ant-select-selection-item')).toHaveCount(0)
          } else {
            await control.locator('.ant-select-selector').click()
            await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
            await expect(control.locator('.ant-select-selection-item')).toHaveText(label)
          }
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        const exceptionDirectory = guide.locator('.erp-dev-exception-directory')
        await assertFulfillmentChainClickTargets(guide.locator('[data-fulfillment-chain]'))
        await guide.locator('[data-stage-exception="cutting_quality"]').click()
        assert.equal(await guide.locator('[data-exception-handling]').count(), 0)
        await guide.getByRole('button', { name: '原厂 / 本厂返工', exact: true }).click()
        await guide.locator('[data-exception-handling]').waitFor()
        await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
        await assertFulfillmentDetailGeometry(guide.locator('.erp-dev-fulfillment-guide__result'))
        await guide.getByRole('button', { name: '收起详情', exact: true }).click()
        await assertNoHorizontalOverflow(page, '17-stage-role-overview')
        await root.getByRole('button', { name: '按业务查阅', exact: true }).click()
        const topics = root.locator('[data-business-chain-topics]')
        await topics.waitFor({ state: 'visible' })
        const topicSelect = topics.locator('.ant-select')
        const expectTopicOptions = async (count) => {
          await topicSelect.locator('.ant-select-selector').click()
          const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option')
          await expect(options).toHaveCount(count)
          await topicSelect.getByRole('combobox').press('Escape')
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        await expectTopicOptions(11)
        assert.equal(await topics.locator('details').count(), 0, 'business entries must not require nested disclosures')
        await chooseRole('工程')
        await expectTopicOptions(1)
        await topics.locator('[data-topic-diagram="sales_to_production"] [data-mermaid-status="rendered"]').waitFor()
        assert.equal(await guide.locator('[aria-label="流程详情"]').count(), 0, '专题图在原地显示，不再叠加文字详情栏')
        await guide.getByRole('button', { name: '查看单据状态与规则', exact: true }).click()
        await guide.getByRole('heading', { name: '办理环节', exact: true }).waitFor()
        await page.getByRole('button', { name: '返回业务目录', exact: true }).click()
        await topics.locator('[data-topic-diagram="sales_to_production"]').waitFor()
        await page.reload()
        await topics.locator('[data-topic-diagram="sales_to_production"] [data-mermaid-status="rendered"]').waitFor()
        await expectTopicOptions(1)
        await chooseRole('全部岗位')
        await expectTopicOptions(11)
        await topicSelect.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByRole('option', { name: '成品出货到应收建立', exact: true }).click()
        await topics.locator('[data-topic-diagram="delivery_to_settlement"] [data-mermaid-status="rendered"]').waitFor()
        await topics.getByRole('button', { name: '真实出货事实', exact: true }).click()
        assert((await topics.locator('.erp-dev-fulfillment-guide__focus').innerText()).includes('取消出货'))
        await topicSelect.locator('.ant-select-clear').click()
        await topics.getByText('请选择业务专题', { exact: true }).waitFor()
        await topicSelect.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByRole('option', { name: '成品出货到应收建立', exact: true }).click()
        await expect(topics.locator('.erp-dev-fulfillment-guide__focus > strong')).toHaveText('出货单')
        await topics
          .getByRole('button', { name: '系统衔接图', exact: true })
          .click()
        const systemMap = page.getByRole('dialog', {
          name: '系统衔接图',
          exact: true,
        })
        await verifyMermaidViewer(
          page,
          systemMap.locator('.erp-markdown-mermaid'),
          assert
        )
        await systemMap.locator('.ant-drawer-close').click()
        await systemMap.waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page, 'role-business-topics')
        await root.getByRole('button', { name: '返回完整流程', exact: true }).click()
        await root.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        await root.getByRole('button', { name: '按业务查阅', exact: true }).click()
        const tabs = page.getByRole('tablist', { name: '业务链路方式' })
        assert.equal(await tabs.getByRole('tab').count(), 2)
        await tabs.getByRole('tab', { name: '实例跟踪' }).click()
        await expectText(page, '输入单号或任务，查看实际进度与异常')
        const taskSearch = page.locator('#dev-flow-task-search')
        const inputError = page.locator('#dev-flow-task-input-error')
        const taskFinder = page.locator('.erp-dev-flow-task-finder')
        for (const empty of ['', '   ']) {
          await taskSearch.fill(empty)
          await taskFinder.getByRole('button', { name: '定位', exact: true }).click()
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
        await tabs.getByRole('tab', { name: '业务结构' }).click()
        await expect(taskSearch).toHaveCount(0)
        for (const [name, view] of [['查责任与任务', 'workflow'], ['看运行路径', 'runtime']]) {
          await page.getByRole('button', { name: '技术详情' }).click()
          await page.getByRole('menuitem', { name, exact: true }).click()
          await expect(page).toHaveURL((url) => url.searchParams.get('view') === view)
          await expect(taskSearch).toHaveCount(0)
        }
        await tabs.getByRole('tab', { name: '业务结构' }).click()
        await tabs.getByRole('tab', { name: '实例跟踪' }).click()
        await expect(taskSearch).toHaveValue('来源单号')
        await expect(inputError).toHaveCount(0)
        await taskSearch.fill('')
        await tabs.getByRole('tab', { name: '业务结构' }).click()
        await topics.waitFor({ state: 'visible' })
        await root.getByRole('button', { name: '返回完整流程', exact: true }).click()
        await guide.getByRole('button', { name: '1 接单、工程与用料审批', exact: true }).click()
        await guide.locator('[data-stage-normal]').waitFor()
        await page
          .getByRole('button', { name: '搜索定义', exact: true })
          .click()
        await page.getByRole('dialog', { name: '搜索定义' }).waitFor()
        await page
          .getByRole('dialog', { name: '搜索定义' })
          .locator('.ant-drawer-close')
          .click()
        await page.getByRole('dialog', { name: '搜索定义' }).waitFor({ state: 'hidden' })
        const exportButton = page.getByRole('button', {
          name: '导出',
          exact: true,
        })
        for (const [index, mode] of ['normal', 'handling'].entries()) {
          await guide.getByRole('radiogroup', { name: '环节办理方式' }).getByText(mode === 'normal' ? '流程' : '异常', { exact: true }).click()
          await guide.locator(`[data-stage-mode="${mode}"]`).waitFor()
          await exportButton.hover()
          await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' }).click()
          await page.waitForFunction((count) => window.__flowPrintCount === count, index + 1)
          assert.equal(await root.getAttribute('data-flow-print-current'), 'true')
          await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
          await page.emulateMedia({ media: 'print' })
          await guide.locator(`[data-stage-mode="${mode}"]`).waitFor({ state: 'visible' })
          assert.equal(await guide.locator('[data-stage-handling]').count(), mode === 'handling' ? 1 : 0)
          assert.equal(await guide.locator('.erp-dev-fulfillment-guide__subflow').count(), mode === 'normal' ? 1 : 0)
          if (page.context().browser()?.browserType().name() === 'chromium') {
            await page.pdf({ path: path.join(outputDir, `order-role-current-${mode}.pdf`), preferCSSPageSize: true, printBackground: true })
          }
          await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
          await page.waitForFunction(() => !document.querySelector('[data-flow-print-current]'))
          await page.emulateMedia({ media: 'screen' })
        }
        await exportButton.hover()
        await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
        const review = page.getByRole('dialog', { name: '客户校对稿' })
        await review.waitFor()
        await review.getByRole('button', { name: /取\s*消/u }).click()
        assert.equal(
          await page.locator('[data-customer-review-print-root]').count(),
          0
        )
        // 客户校对稿的内容与纸面验证由专用导出场景覆盖。
        await page.goto(
          new URL(
            '/__dev/status-flows?view=states&flow=source.sales_order',
            page.url()
          ).href
        )
        const filters = page.getByRole('group', { name: '状态转换筛选' })
        const graph = page.locator('.erp-dev-flow-state-graph')
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        await switchMermaidLayout(
          page,
          graph.locator('.erp-markdown-mermaid'),
          assert
        )
        await switchMermaidLayout(
          page,
          graph.locator('.erp-markdown-mermaid'),
          assert
        )
        assert.equal(
          await filters
            .getByRole('button', { name: /^正常推进 /u })
            .getAttribute('aria-pressed'),
          'true'
        )
        assert(
          !(
            await graph
              .locator('.erp-markdown-mermaid__canvas > svg')
              .textContent()
          ).includes('取消')
        )
        await filters.getByRole('button', { name: /^全部 /u }).click()
        await graph
          .locator('.erp-markdown-mermaid__canvas > svg')
          .filter({ hasText: '取消' })
          .waitFor()
        assert(
          (
            await graph
              .locator('.erp-markdown-mermaid__canvas > svg')
              .textContent()
          ).includes('取消')
        )
        await filters.getByRole('button', { name: /^异常与纠正 /u }).click()
        await graph
          .locator('.erp-markdown-mermaid__canvas > svg')
          .filter({ hasText: '取消' })
          .waitFor()
        assert(
          (
            await graph
              .locator('.erp-markdown-mermaid__canvas > svg')
              .textContent()
          ).includes('取消')
        )
        await page.getByRole('button', { name: /^草稿，/u }).click()
        await filters
          .getByRole('button', { name: /^当前状态 /u, pressed: true })
          .waitFor()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert.equal(
          await filters
            .getByRole('button', { name: /^当前状态 /u })
            .getAttribute('aria-pressed'),
          'true'
        )
        await filters.getByRole('button', { name: /^正常推进 /u }).click()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        await assertNoHorizontalOverflow(page, 'focused-state-rules')

        await page.goto(
          new URL(
            '/__dev/status-flows?view=chain&chain=purchase_to_inventory',
            page.url()
          ).href
        )
        await guide
          .getByRole('heading', { name: '办理环节', exact: true })
          .waitFor()
        const handoffs = guide.locator('.erp-dev-fulfillment-guide__steps > li')
        assert.equal(
          await handoffs.count(),
          5,
          '采购必须保留来料交接、应付草稿与确认'
        )
        const technical = page.locator('[data-business-chain-technical]')
        assert.equal(await technical.evaluate((element) => element.open), false)
        await chooseRole('仓库')
        assert.equal(await handoffs.evaluateAll((items) => items.filter((item) => item.dataset.roleMatch === 'true').length), 2)
        assert.equal(await handoffs.count(), 5, '岗位关注不可隐藏上下游')
        await guide.getByRole('button', { name: /来料检验与材料入库/u }).click()
        await page.reload()
        const result = guide.locator('.erp-dev-fulfillment-guide__result')
        await result
          .getByRole('heading', { name: '来料检验与入库', exact: true })
          .waitFor()
        assert.match(
          await guide.locator('.erp-dev-fulfillment-guide__role').innerText(),
          /仓库/u
        )
        await result.getByRole('radiogroup', { name: '环节办理方式', exact: true }).getByText('异常', { exact: true }).click()
        await result.getByRole('button', { name: '首次来料不合格', exact: true }).click()
        await guide.locator('[data-exception-guide="purchase_rejection"]').waitFor()
        await chooseRole('采购')
        assert.equal(new URL(page.url()).searchParams.get('flow_stage'), 'incoming_quality')
        await page.reload()
        await guide.locator('[data-exception-guide="purchase_rejection"]').waitFor()
        await result.getByRole('radiogroup', { name: '环节办理方式' }).getByText('流程', { exact: true }).click()
        await result.getByRole('heading', { name: '来料检验与入库', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.has('flow_exception'), false)
        await chooseRole('财务')
        assert.equal(await handoffs.evaluateAll((items) => items.filter((item) => item.dataset.roleMatch === 'true').length), 2)
        await guide.getByRole('button', { name: /财务确认并过账应付/u }).click()
        await result
          .getByRole('heading', { name: '财务确认并过账应付', exact: true })
          .waitFor()
        assert.equal(await result.locator('.erp-dev-fulfillment-guide__owner').innerText(), '财务')
        assert.match(await result.innerText(), /草稿.*已过账/u)
        await result.getByRole('button', { name: '单据与规则' }).click()
        await technical
          .locator('[data-selected-chain-node="purchase_payable_draft"]')
          .waitFor()
        assert.equal(await technical.evaluate((element) => element.open), true)
        await technical.locator('[data-mermaid-status="rendered"]').waitFor()
        const legend = technical.locator('.erp-dev-flow-chain-legend')
        assert.equal(
          await legend.evaluate((element) => getComputedStyle(element).display),
          'flex',
          '图例不能被通用标题样式改成竖列'
        )
        await assertNoHorizontalOverflow(page, 'purchase-role-handoffs')
        await technical.locator(':scope > summary').click()
        await chooseRole('工程')
        await guide
          .getByRole('status')
          .filter({ hasText: '工程参与 0 / 5 个环节' })
          .waitFor()
        assert.equal(await handoffs.count(), 5)
        await page.getByRole('button', { name: '返回订单全流程' }).click()
        await guide
          .getByRole('heading', { name: '订单全流程', exact: true })
          .waitFor()
        assert.match(
          await guide.locator('.erp-dev-fulfillment-guide__role').innerText(),
          /工程/u
        )
        await guide.getByRole('button', { name: '1 接单、工程与用料审批', exact: true }).click()
        await result
          .getByRole('heading', { name: '接单与用料审批', exact: true })
          .waitFor()
        await result.getByRole('button', { name: '单据与规则' }).click()
        await guide
          .getByRole('heading', { name: '办理环节', exact: true })
          .waitFor()
        assert.match(page.url(), /chain=sales_to_production/u)
        await page.goto(
          new URL(
            '/__dev/status-flows?view=chain&chain=purchase_quality_disposition&flow_role=finance',
            page.url()
          ).href
        )
        await guide
          .getByRole('heading', { name: '办理环节', exact: true })
          .waitFor()
        assert.match(await guide.innerText(), /条件分支/u)
        await assertNoHorizontalOverflow(page, 'exception-role-handoffs')

        await page.goto(
          new URL(
            '/__dev/status-flows?view=chain&chain=all&flow_tab=topics&flow_role=warehouse',
            page.url()
          ).href
        )
        await expectTopicOptions(8)
        const selectedTopic = topics.locator('[data-topic-diagram]')
        await selectedTopic.locator('[data-mermaid-status="rendered"]').waitFor()
        const printedTopicKey = await selectedTopic.getAttribute('data-topic-diagram')
        const printedTopicTitle = await topicSelect.locator('.ant-select-selection-item').innerText()
        await exportButton.hover()
        await page
          .getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' })
          .click()
        await page.waitForFunction(() => window.__flowPrintCount === 1)
        await page.emulateMedia({ media: 'print' })
        await expect(topics.locator('[data-topic-diagram]:visible')).toHaveCount(1)
        await expect(topics.locator('[data-topic-diagram]:visible')).toHaveAttribute('data-topic-diagram', printedTopicKey)
        await expect(topics.locator('.erp-dev-chain-topics__print-title')).toHaveText(printedTopicTitle)
        await expect(topics.locator('.erp-dev-chain-topics__print-title')).toBeVisible()
        await expect(selectedTopic.locator('.erp-markdown-mermaid__canvas svg')).toBeVisible()
        assert.equal(
          await topics
            .getByRole('button', { name: '系统衔接图', exact: true })
            .isVisible(),
          false
        )
        if (page.context().browser()?.browserType().name() === 'chromium')
          { await page.pdf({
            path: path.join(outputDir, 'warehouse-business-topics.pdf'),
            preferCSSPageSize: true,
            printBackground: true,
          }) }
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await page.waitForFunction(
          () => !document.querySelector('[data-flow-print-current]')
        )
        await page.emulateMedia({ media: 'screen' })
        await page.mouse.move(0, 0)
        await page
          .getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' })
          .waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(
          page,
          'role-business-topics-print-return'
        )

        await page.goto(new URL(`${DEV_FLOW_STATE_OBSERVATORY_PATH}&flow_stage=financial_settlement&flow_handling=1&flow_role=finance`, page.url()).href)
        for (const width of [800, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await guide.locator('[data-stage-handling="financial_settlement"]').waitFor()
          await assertNoHorizontalOverflow(page, `handling-responsive-${width}`)
          const mode = guide.getByRole('radiogroup', { name: '环节办理方式' })
          assert((await mode.locator('.ant-segmented-item-label').first().evaluate((node) => getComputedStyle(node).fontSize)) === '14px', '视图切换保持正文字号')
          if (width < 768) assert((await mode.locator('.ant-segmented-item-label').first().boundingBox()).height >= 44)
          await mode.getByText('流程', { exact: true }).click()
          await guide.locator('[data-stage-mode="normal"]').waitFor()
          await assertNoHorizontalOverflow(page, `normal-responsive-${width}`)
          await mode.getByText('异常', { exact: true }).click()
          await guide.locator('[data-stage-handling="financial_settlement"]').waitFor()
          await openFulfillmentExceptionDirectory(guide)
          await exceptionDirectory.waitFor()
          await exceptionDirectory.locator('[data-handling-entry="sales_order"]').waitFor()
          await expect(exceptionDirectory.locator('[data-exception-entry]')).toHaveCount(6)
          await assertNoHorizontalOverflow(page, `directory-responsive-${width}`)
          await exceptionDirectory.locator('[data-handling-entry="packaging"] button').click()
          await guide.locator('[data-stage-handling="packaging"]').waitFor()
          await guide.getByRole('button', { name: '返回完整流程', exact: true }).click()
          await guide.locator('[data-stage-exception="financial_settlement"]').click()
          assert.equal(new URL(page.url()).searchParams.get('flow_handling'), '1', '从目录重选当前环节仍恢复问题视图')
        }
        await page.setViewportSize({ width: 1440, height: 900 })

        assert.deepEqual(
          writeRequestsByPage.get(page) || [],
          [],
          '业务链路桌面 smoke 不得发出写请求'
        )
      },
    },
  ]
}
