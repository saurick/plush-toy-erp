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
        const chooseRole = async (label) => {
          const control = guide.locator('.erp-dev-fulfillment-guide__role .ant-select')
          if (label === '全部岗位') { await control.hover(); await control.locator('.ant-select-clear').click() }
          else { await control.locator('.ant-select-selector').click(); await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click() }
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
        await guide.locator('.erp-dev-fulfillment-guide__topic-nodes').waitFor()
        await guide.getByRole('button', { name: '单据与规则', exact: true }).click()
        await guide.getByRole('heading', { name: '办理环节', exact: true }).waitFor()
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
        await chooseRole('全部岗位')
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
        await guide.locator('[data-stage-normal]').waitFor()
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
          .getByRole('heading', { name: '接单、工程与用料审批', exact: true })
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
          assert.equal(await exceptionDirectory.locator('[data-exception-entry]').count(), 6)
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
          '业务链观察桌面 smoke 不得发出写请求'
        )
      },
    },
  ]
}
