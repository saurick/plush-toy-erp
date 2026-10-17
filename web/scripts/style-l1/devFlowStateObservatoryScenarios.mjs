import { assertFulfillmentChainGeometry } from './fulfillmentChainAssertions.mjs'
import { WorkflowTaskDiscoveryCatalog as taskCatalog } from '../../src/common/consts/workflowTaskDiscovery.generated.mjs'
import { assertInactivePrintStylesDoNotHideApp } from './styleIsolationAssertions.mjs'
import {
  switchMermaidLayout,
  verifyMermaidViewer,
} from './mermaidViewerAssertions.mjs'

const DEV_FLOW_STATE_OBSERVATORY_PATH =
  '/__dev/status-flows?view=chain&chain=all'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function startNoWriteAudit(page, store) {
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
        await expectText(page, '业务链观察')
        const root = page.locator('[data-dev-flow-state-observatory]')
        await root.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0,
          '业务链观察子页不应重复常驻环境事实'
        )
        assert.equal(
          await root.count(),
          1,
          '业务链观察页应提供唯一桌面内容根节点'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-desktop-light'
        )
        await assertInactivePrintStylesDoNotHideApp(page)
        await root.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        assert.equal(await root.getByRole('radiogroup', { name: '履约流程视图' }).count(), 0)
        const guide = page.locator('#task-fulfillment-guide')
        const chooseRole = async (name) => {
          const control = guide.getByRole('combobox', { name: '关注岗位', exact: true })
          await control.waitFor()
          await guide.locator('.erp-dev-fulfillment-guide__role .ant-select-selector').click()
          assert.equal(await control.getAttribute('aria-expanded'), 'true')
          await page.getByRole('option', { name, exact: true }).click()
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        const selectExceptionPlan = async (name) => {
          const control = guide.getByRole('combobox', { name: '异常处理方案', exact: true })
          await control.locator('xpath=ancestor::div[contains(@class,"ant-select-selector")][1]').click()
          await page.getByRole('option', { name, exact: true }).click()
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        const stages = guide.locator('[data-fulfillment-stage]')
        assert.equal(await stages.count(), 17)
        assert.equal(await guide.locator('[data-chain-phase]').count(), 3)
        assert.equal(await guide.locator('[data-chain-stage][data-conditional]').count(), 2)
        assert.equal(await guide.locator('.erp-dev-fulfillment-guide__result').count(), 0, '总图初始不展开详情')
        await chooseRole('仓库')
        assert.equal(await stages.filter({ has: page.locator('[aria-expanded="true"]') }).count(), 0)
        assert.equal(await guide.locator('[data-fulfillment-stage][data-role-match="true"]').count(), 8)
        assert.equal(await stages.count(), 17, '岗位关注保留全部位置')
        const exceptionDirectory = page.getByRole('dialog', { name: '异常流程', exact: true })
        for (const source of ['over_issue', 'outsourcing_rejection', 'posted_purchase']) {
          await guide.getByRole('button', { name: '异常流程', exact: true }).click()
          await exceptionDirectory.waitFor()
          assert.equal(await exceptionDirectory.locator('[data-exception-entry]').count(), taskCatalog.exception_guides.length)
          await exceptionDirectory.locator(`[data-exception-entry="${source}"] button`).click()
          await guide.locator(`[data-exception-guide="${source}"]`).waitFor()
          assert.equal(new URL(page.url()).searchParams.has('flow_stage'), false, '全局异常入口不补造来源环节')
          await guide.getByRole('button', { name: '收起异常分支', exact: true }).click()
          assert.equal(await guide.locator('.erp-dev-fulfillment-guide__result').count(), 0)
        }
        await guide.getByRole('button', { name: '7 发料外发裁片', exact: true }).click()
        const issueResult = guide.locator('.erp-dev-fulfillment-guide__result')
        await issueResult.locator('[data-selected-substep="issue"]').waitFor()
        assert.equal(await issueResult.locator('[data-substep-instruction]').count(), 1)
        assert.equal(await issueResult.getByText('完整交接与审批说明', { exact: true }).count(), 0)
        assert.equal(await issueResult.getByText('按文字选择子步骤', { exact: true }).count(), 0)
        const substepControl = issueResult.getByRole('combobox', { name: '查看子步骤', exact: true })
        await substepControl.locator('xpath=ancestor::div[contains(@class,"ant-select-selector")][1]').click()
        assert.equal(await substepControl.getAttribute('aria-expanded'), 'true')
        await page.getByRole('option', { name: '确认加工合同', exact: true }).click()
        await issueResult.locator('[data-selected-substep="contract"]').waitFor()
        await guide.getByRole('button', { name: '异常流程', exact: true }).click()
        await exceptionDirectory.locator('[data-exception-entry="over_issue"] button').click()
        await guide.locator('[data-exception-guide="over_issue"]').waitFor()
        await guide.getByRole('button', { name: '收起异常分支', exact: true }).click()
        await issueResult.locator('[data-selected-substep="contract"]').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('flow_stage'), 'cutting_issue')
        await guide.getByRole('button', { name: '6 来料检验与材料入库', exact: true }).click()
        const incomingCanvas = guide.getByRole('region', { name: '来料检验与材料入库子流程画布', exact: true })
        await incomingCanvas.getByRole('button', { name: '采购退厂或补换', exact: true }).click()
        await guide.locator('[data-exception-guide="purchase_rejection"]').waitFor()
        await selectExceptionPlan('供应商补换')
        await guide.locator('[data-chain-wire="exception-return"][data-return-stage="purchase_count"]').waitFor()
        await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
        await guide.getByRole('button', { name: '收起异常分支', exact: true }).click()
        await issueResult.locator('[data-selected-substep="exception"]').waitFor()
        await guide.getByRole('button', { name: '9 颜色与尺寸规格检验', exact: true }).click()
        await guide.getByRole('button', { name: '查看第9环节异常分支', exact: true }).click()
        await guide.locator('[data-chain-stage="cutting_quality"][data-origin][data-return]').waitFor()
        await guide.locator('[data-chain-wire="exception-return"][data-return-stage="cutting_quality"]').waitFor()
        assert.equal(await stages.count(), 17, '异常保留整条主链')
        assert.equal(await guide.getByRole('heading', { name: '异常处理', exact: true }).count(), 0, '不切换独立异常主视图')
        await guide.getByRole('button', { name: '查看第11环节异常分支', exact: true }).click()
        await guide.locator('[data-chain-stage="shell_quality"][data-origin][data-return]').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('flow_stage'), 'cutting_quality', '分出点不覆盖导航位置')
        await selectExceptionPlan('补料重做')
        await guide.locator('[data-chain-stage="cutting_issue"][data-reentry]').waitFor()
        await guide.locator('[data-chain-wire="exception-return"][data-return-stage="cutting_issue"]').waitFor()
        await guide.locator('[data-chain-terminal]').filter({ hasText: '原批终止' }).waitFor()
        await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
        assert.equal(await guide.locator('[data-exception-handling]').count(), 0)
        await guide.getByRole('button', { name: '展开补料重做处理步骤', exact: true }).click()
        await guide.locator('[data-exception-handling]').getByText('重新安排合同与发料', { exact: true }).click()
        await guide.locator('[data-selected-exception-node="issue"]').waitFor()
        await selectExceptionPlan('报废放弃')
        await guide.locator('[data-exception-outcome="stop"]').waitFor()
        assert.equal(await guide.locator('[data-exception-handling]').count(), 1, '切换方案保留展开分工')
        await guide.locator('[data-selected-exception-node="execute"]').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('flow_exception_step'), 'execute', '新方案不残留重做发料步骤')
        assert.equal(await guide.locator('[data-chain-wire="exception-return"]').count(), 0, '报废不接回主链')
        await selectExceptionPlan('在制品让步')
        await guide.locator('[data-chain-wire="exception-return"][data-return-stage="handwork_execute"]').waitFor()
        await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
        await selectExceptionPlan('报废放弃')
        await page.reload()
        await guide.locator('[data-chain-stage="shell_quality"][data-origin]').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('flow_decision'), 'scrap')
        await guide.getByRole('button', { name: '收起异常分支', exact: true }).click()
        assert.equal(new URL(page.url()).searchParams.has('flow_exception_origin'), false)
        await guide.getByRole('button', { name: '10 安排车缝 · 本厂 / 委外', exact: true }).click()
        const subflow = guide.getByRole('region', { name: '当前环节的子流程', exact: true })
        await subflow.locator('[data-mermaid-status="rendered"]').waitFor()
        await subflow.locator('[data-selected-substep="issue"]').waitFor()
        assert.equal(await subflow.locator('xpath=ancestor::div[contains(@class,"erp-dev-chain__inline")]').count(), 1, '子流程在总链对应行原地展开')
        assert.equal(await subflow.locator('.fulfillmentRoleMatch').count(), 2)
        assert.match(await subflow.innerText(), /本厂[\s\S]*委外/u)
        await chooseRole('生产经理')
        assert.equal(new URL(page.url()).searchParams.get('flow_stage'), 'sewing_execute', '比较岗位保留当前主环节')
        await subflow.locator('[data-selected-substep="route"]').waitFor()
        await subflow.getByRole('region', { name: '安排车缝 · 本厂 / 委外子流程画布' }).getByRole('button', { name: '确认委外合同', exact: true }).click()
        await subflow.locator('[data-selected-substep="contract"]').waitFor()
        await page.reload()
        await subflow.locator('[data-selected-substep="contract"]').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('flow_stage'), 'sewing_execute')
        await guide.getByRole('button', { name: '收起环节', exact: true }).click()
        await guide.locator('.erp-dev-fulfillment-guide__result').waitFor({ state: 'detached' })
        await page.waitForFunction(() => document.activeElement?.closest('[data-fulfillment-stage]')?.dataset.fulfillmentStage === 'sewing_execute')
        assert.equal(await guide.locator('.erp-dev-fulfillment-guide__result').count(), 0)
        assert.match(await guide.locator('.erp-dev-fulfillment-guide__role').innerText(), /生产经理/u)
        await chooseRole('全部岗位')
        await assertNoHorizontalOverflow(page, '17-stage-role-overview')
        await root.getByRole('button', { name: '按业务查阅', exact: true }).click()
        const topics = root.locator('[data-business-chain-topics]')
        await topics.waitFor({ state: 'visible' })
        assert.equal(await topics.locator('[data-overview-chain]').count(), 11)
        assert.equal(
          await topics.locator('details').count(),
          0,
          'business entries must not require nested disclosures'
        )
        await page
          .locator('.erp-dev-fulfillment-guide__role .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('工程', { exact: true })
          .click()
        await topics
          .getByRole('status')
          .filter({ hasText: '工程参与 1 条业务流程' })
          .waitFor()
        assert.equal(await topics.locator('[data-overview-chain]').count(), 1)
        await topics
          .getByRole('button', { name: '查看业务链：销售受理到生产准备' })
          .click()
        await page
          .getByRole('heading', { name: '岗位分工与交接', exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '返回业务目录', exact: true })
          .click()
        await topics
          .getByRole('status')
          .filter({ hasText: '工程参与 1 条业务流程' })
          .waitFor()
        await page.reload()
        await topics
          .getByRole('status')
          .filter({ hasText: '工程参与 1 条业务流程' })
          .waitFor()
        await page
          .locator('.erp-dev-fulfillment-guide__role .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('全部岗位', { exact: true })
          .click()
        await topics
          .getByRole('status')
          .filter({ hasText: '全部 11 条业务流程' })
          .waitFor()
        assert.equal(await topics.locator('[data-overview-chain]').count(), 11)
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
        const tabs = page.getByRole('tablist', { name: '业务链观察方式' })
        assert.equal(await tabs.getByRole('tab').count(), 2)
        await tabs.getByRole('tab', { name: '实例跟踪' }).click()
        await expectText(page, '输入单号或任务，查看实际进度与异常')
        await tabs.getByRole('tab', { name: '业务结构' }).click()
        await topics.waitFor({ state: 'visible' })
        await root.getByRole('button', { name: '返回完整流程', exact: true }).click()
        await guide.getByRole('button', { name: '1 接单、工程与用料审批', exact: true }).click()
        await root.locator('[data-mermaid-status="rendered"]').first().waitFor()
        await page
          .getByRole('button', { name: '搜索定义', exact: true })
          .click()
        await page.getByRole('dialog', { name: '搜索定义' }).waitFor()
        await page
          .getByRole('dialog', { name: '搜索定义' })
          .locator('.ant-drawer-close')
          .click()
        const exportButton = page.getByRole('button', {
          name: '导出',
          exact: true,
        })
        await exportButton.hover()
        await page
          .getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' })
          .click()
        await page.waitForFunction(() => window.__flowPrintCount === 1)
        assert.equal(await root.getAttribute('data-flow-print-current'), 'true')
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await page.waitForFunction(
          () => !document.querySelector('[data-flow-print-current]')
        )
        await exportButton.hover()
        await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
        const review = page.getByRole('dialog', { name: '客户校对稿' })
        await review.waitFor()
        await review.getByRole('button', { name: /取\s*消/u }).click()
        assert.equal(
          await page.locator('[data-customer-review-print-root]').count(),
          0
        )
        await exportButton.hover()
        await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
        await review
          .getByRole('button', { name: '打印 / 保存 PDF', exact: true })
          .click()
        await page.waitForFunction(() => window.__flowPrintCount === 2)
        const fulfillmentPrint = page.locator(
          '[data-customer-review-fulfillment]'
        )
        assert.equal(
          await fulfillmentPrint.locator('tbody tr').count(),
          taskCatalog.fulfillment_flow.length
        )
        assert.match(
          await fulfillmentPrint.innerText(),
          /正式成品入库[\s\S]*查货与包装[\s\S]*业务显式确认实际发货/u
        )
        const exceptionPrint = page.locator('[data-customer-review-exception]')
        assert.equal(
          await exceptionPrint.count(),
          taskCatalog.exception_guides.length
        )
        assert.equal(
          await page
            .locator(
              '[data-customer-review-exception="production_quality"] tbody tr'
            )
            .count(),
          5
        )
        assert.match(
          await page
            .locator(
              '[data-customer-review-exception="production_quality"] tbody tr'
            )
            .filter({ hasText: '报废放弃' })
            .innerText(),
          /终止流转/u
        )
        await page.emulateMedia({ media: 'print' })
        assert.equal(
          await page
            .locator('#root')
            .evaluate((node) => getComputedStyle(node).display),
          'none'
        )
        await fulfillmentPrint.waitFor({ state: 'visible' })
        if (page.context().browser()?.browserType().name() === 'chromium')
          { await page.pdf({
            path: path.join(outputDir, 'order-role-flow-customer-review.pdf'),
            preferCSSPageSize: true,
            printBackground: true,
          }) }
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await page.waitForFunction(
          () => !document.querySelector('[data-customer-review-print-root]')
        )
        await page.emulateMedia({ media: 'screen' })
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
          .getByRole('heading', { name: '岗位分工与交接', exact: true })
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
        assert.equal(await guide.locator('[data-role-match="true"]').count(), 2)
        assert.equal(await handoffs.count(), 5, '岗位关注不可隐藏上下游')
        await guide.getByRole('button', { name: /来料检验与材料入库/u }).click()
        await page.reload()
        const result = guide.locator('.erp-dev-fulfillment-guide__result')
        await result
          .getByRole('heading', { name: '来料检验与材料入库', exact: true })
          .waitFor()
        assert.match(
          await guide.locator('.erp-dev-fulfillment-guide__role').innerText(),
          /仓库/u
        )
        await result.getByRole('button', { name: '本环节异常', exact: true }).click()
        await exceptionDirectory.locator('[data-exception-entry="purchase_rejection"] button').click()
        await guide.locator('[data-exception-guide="purchase_rejection"]').waitFor()
        await chooseRole('采购')
        assert.equal(new URL(page.url()).searchParams.get('flow_stage'), 'incoming_quality')
        await page.reload()
        await guide.locator('[data-exception-guide="purchase_rejection"]').waitFor()
        await guide.getByRole('button', { name: '收起异常分支', exact: true }).click()
        await result.getByRole('heading', { name: '来料检验与材料入库', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.has('flow_exception'), false)
        await chooseRole('财务')
        assert.equal(await guide.locator('[data-role-match="true"]').count(), 2)
        await guide.getByRole('button', { name: /财务确认并过账应付/u }).click()
        await result
          .getByRole('heading', { name: '财务确认并过账应付', exact: true })
          .waitFor()
        assert.match(await result.innerText(), /办理岗位：财务/u)
        assert.match(await result.innerText(), /草稿.*已过账/u)
        await result.getByRole('button', { name: '查看相关单据与规则' }).click()
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
          .filter({ hasText: '该流程没有登记该岗位的办理环节' })
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
          .getByRole('heading', { name: '接单、工程与用料审批', exact: true })
          .waitFor()
        await result.getByRole('button', { name: '查看相关单据与规则' }).click()
        await guide
          .getByRole('heading', { name: '岗位分工与交接', exact: true })
          .waitFor()
        assert.match(page.url(), /chain=sales_to_production/u)
        await page.goto(
          new URL(
            '/__dev/status-flows?view=chain&chain=purchase_quality_disposition&flow_role=finance',
            page.url()
          ).href
        )
        await guide
          .getByRole('heading', { name: '岗位分工与交接', exact: true })
          .waitFor()
        assert.match(await guide.innerText(), /条件分支/u)
        await assertNoHorizontalOverflow(page, 'exception-role-handoffs')

        await page.goto(
          new URL(
            '/__dev/status-flows?view=chain&chain=all&flow_tab=topics&flow_role=warehouse',
            page.url()
          ).href
        )
        await topics
          .getByRole('status')
          .filter({ hasText: '仓库参与 8 条业务流程' })
          .waitFor()
        await exportButton.hover()
        await page
          .getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' })
          .click()
        await page.waitForFunction(() => window.__flowPrintCount === 1)
        await page.emulateMedia({ media: 'print' })
        const printedTopics = topics.locator('[data-overview-chain]:visible')
        assert.equal(
          await printedTopics.count(),
          8,
          '打印专题时必须保留当前岗位的全部专题内容'
        )
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

        assert.deepEqual(
          writeRequestsByPage.get(page) || [],
          [],
          '业务链观察桌面 smoke 不得发出写请求'
        )
      },
    },
  ]
}
