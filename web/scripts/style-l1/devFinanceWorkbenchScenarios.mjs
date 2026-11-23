import { expect } from 'playwright/test'
import { assertBusinessMermaidGraph } from './mermaidGraphAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { FINANCE_RULES } from '../../src/dev-workbench/config/devFinanceWorkbench.mjs'

export function createDevFinanceWorkbenchScenarios({
  assert,
  assertNoHorizontalOverflow,
  startNoWriteAudit,
  outputDir,
  path,
}) {
  const writes = new WeakMap()
  return [
    {
      name: 'dev-finance-prototype-alignment',
      path: '/__dev/status-flows?flow_tab=finance',
      viewport: { width: 1280, height: 720 },
      beforeNavigate: async (page) => {
        await startNoWriteAudit(page, writes)
        await page.addInitScript(() => {
          window.print = () => { window.__financePrintReady = true }
        })
      },
      verify: async (page) => {
        const finance = page.locator('[data-finance-relationships]')
        const relationFilters = page.locator('#task-fulfillment-guide [data-relation-filters]')
        const overview = finance.locator('[data-finance-overview]')
        const overviewGraph = overview.locator('[data-business-flow]')
        const topics = finance.locator('[data-finance-topic]')
        const details = finance.locator('[data-finance-detail]')
        const sectionTabs = finance.getByRole('tablist', { name: '财务关联视图' })
        const sectionTab = (name) => sectionTabs.getByRole('tab', { name, exact: true })
        const graphs = finance.locator('[data-business-flow]')
        const purchase = finance.locator('[data-finance-topic="purchase"]')
        const terms = finance.locator('[data-finance-topic="terms"]')
        const permissions = finance.locator('[data-finance-topic="permissions"]')
        const toggle = (topic) => finance.locator(`[data-finance-reading-toggle="${topic}"]`)
        await expect(overview).toBeVisible()
        await expect(relationFilters).toHaveCount(0)
        await expect(details).toHaveCount(0)
        await assertBusinessMermaidGraph(overviewGraph)
        const laneTitles = await overview.locator('g.cluster .cluster-label').evaluateAll((titles) =>
          titles.map((title) => ({ label: title.textContent, bottom: title.getBoundingClientRect().bottom }))
        )
        assert.deepEqual(laneTitles.map(({ label }) => label), ['销售与出货', '采购与仓库', '委外与生产'])
        await expect(topics).toHaveCount(0)
        await expect(sectionTab('总览')).toHaveAttribute('aria-selected', 'true')
        const lanes = ['sales', 'purchase', 'outsourcing']
        for (const [laneIndex, key] of lanes.entries()) {
          const row = overview.locator(`[data-finance-lane="${key}"]`)
          await expect(row).toHaveCount(4)
          for (const node of await row.all()) await expect(node).toBeInViewport({ ratio: 1 })
          const steps = await row.evaluateAll((nodes) => nodes.map((node) => {
            const { left, top, height } = node.getBoundingClientRect()
            return { left, top, centerY: top + height / 2 }
          }))
          assert(steps.every((step) => Math.abs(step.centerY - steps[0].centerY) <= 1), `${key} 的四个步骤位于同一行`)
          assert(steps.slice(1).every((step, index) => step.left > steps[index].left), `${key} 的四个步骤从左至右`)
          const titleGap = Math.min(...steps.map((step) => step.top)) - laneTitles[laneIndex].bottom
          assert(titleGap >= 1, `${key} 的标题与最上侧节点间距为 ${titleGap.toFixed(1)} px`)
        }
        await expect(overview.locator('g.cluster').last()).toBeInViewport({ ratio: 1 })
        await expect(overviewGraph.locator('[data-mermaid-zoom]')).toHaveAttribute('data-mermaid-zoom', '100')
        const disclosure = overviewGraph.getByText('图表工具', { exact: true })
        const diagramTools = overviewGraph.getByRole('group', { name: '跨模块财务关系图视图操作' })
        await expect(disclosure).toBeInViewport({ ratio: 1 })
        await expect(diagramTools).toBeHidden()
        for (const tab of await sectionTabs.getByRole('tab').all()) {
          await expect(tab).toBeInViewport({ ratio: 1 })
        }
        assert.equal(await page.evaluate(() => scrollY), 0, '三条主线和专题页签在未滚动的首屏')
        await page.screenshot({ path: path.join(outputDir, 'finance-tabs-overview-1280x720.png'), fullPage: false })

        const initialURL = page.url()
        const historyLength = await page.evaluate(() => history.length)
        const selector = '[aria-label="财务关联视图"]'
        await verifyMobileNavigationMotion(page, assert, selector, 1)
        await expect(purchase).toBeVisible()
        await verifyMobileNavigationMotion(page, assert, selector, 0, true)
        const tabsGeometry = await sectionTabs.boundingBox()
        for (const [name, topic] of [
          ['采购差额', purchase],
          ['月结对账', terms],
          ['审批凭据', permissions],
        ]) {
          await sectionTab(name).click()
          await expect(sectionTab(name)).toHaveAttribute('aria-selected', 'true')
          await expect(finance.getByRole('tabpanel', { name, exact: true })).toBeVisible()
          await expect(topic.getByRole('heading', { level: 2 })).toBeInViewport({ ratio: 1 })
          await expect(relationFilters).toHaveCount(0)
          await expect(overview).toHaveCount(0)
          await expect(topics).toHaveCount(1)
          await expect(graphs).toHaveCount(1)
          await expect(details).toHaveCount(0)
          assert.deepEqual(await sectionTabs.boundingBox(), tabsGeometry, '专题切换保持页签位置')
          await assertBusinessMermaidGraph(graphs)
          if (name === '采购差额') {
            await waitForFiniteAnimations(page, { selector })
            await page.screenshot({ path: path.join(outputDir, 'finance-tabs-purchase-1280x720.png'), fullPage: false })
          }
        }
        await sectionTab('审批凭据').press('ArrowRight')
        await expect(sectionTab('总览')).toBeFocused()
        await expect(sectionTab('总览')).toHaveAttribute('aria-selected', 'true')
        await expect(overview).toBeVisible()
        assert.equal(page.url(), initialURL, '回到总览后恢复原查询条件')

        await disclosure.press('Enter')
        await expect(diagramTools).toBeVisible()
        await diagramTools.getByRole('button', { name: '全屏查看跨模块财务关系图', exact: true }).click()
        await expect(overviewGraph.locator('[data-mermaid-fullscreen="true"]')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(disclosure).toBeFocused()
        await expect(diagramTools).toBeHidden()

        for (const width of [1920, 1024]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page)
          await assertBusinessMermaidGraph(overviewGraph)
        }
        await page.setViewportSize({ width: 1280, height: 720 })
        const overviewHeight = await overview.evaluate((node) => node.offsetHeight)
        for (const key of await overview
          .locator('[data-finance-node]')
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.financeNode))) {
          const node = overview.locator(`[data-finance-node="${key}"]`)
          await node.click()
          await expect(page.locator(`#finance-note-${key}`)).toBeVisible()
          assert.equal(page.url(), initialURL, '短说明不改变 URL')
          assert.equal(await overview.evaluate((node) => node.offsetHeight), overviewHeight, '短说明不挤动总览')
          await node.press('Escape')
          await expect(node).toHaveAttribute('aria-expanded', 'false')
          await expect(node).toBeFocused()
        }
        const sales = overview.locator('[data-finance-node="sales-order"]')
        await sales.click()
        await page.locator('#finance-note-sales-order')
          .getByRole('button', { name: '展开说明与规则', exact: true }).click()
        const salesDetail = finance.locator('[data-finance-topic="sales"]')
        await expect(salesDetail.locator('[data-finance-detail="sales"]')).toBeVisible()
        await expect(toggle('sales')).toBeFocused()
        await toggle('sales').click()
        await expect(salesDetail).toHaveCount(0)
        await expect(sales).toBeFocused()

        const purchaseOrder = overview.locator('[data-finance-node="purchase-order"]')
        await purchaseOrder.click()
        await page.locator('#finance-note-purchase-order')
          .getByRole('button', { name: '展开说明与规则', exact: true }).click()
        await expect(sectionTab('采购差额')).toHaveAttribute('aria-selected', 'true')
        await expect(purchase.locator('[data-finance-detail="purchase"]')).toBeVisible()
        await expect(toggle('purchase')).toBeFocused()
        await toggle('purchase').click()
        const sourceChoices = purchase.locator('[aria-label="来源变化"]')
        const outcome = purchase.locator('[data-purchase-scenario-result]')
        const purchaseGraph = purchase.locator('[data-business-flow]')
        const conditionLabels = purchaseGraph.getByRole('button', { name: /^查看条件：/u })
        await expect(sourceChoices.getByRole('radio')).toHaveCount(3)
        for (const source of ['采购退货', '数量调增', '移库或批次修正']) {
          await expect(sourceChoices.getByText(source, { exact: true })).toBeInViewport({ ratio: 1 })
        }
        await expect(purchase.getByRole('combobox', { name: '来源变化', exact: true })).toHaveCount(0)
        await purchase.getByText('草稿', { exact: true }).click()
        await expect(outcome).toContainText('草稿 ＋ 采购退货')
        await verifyMobileNavigationMotion(page, assert, '[aria-label="来源变化"]', 1)
        await expect(outcome).toContainText('草稿 ＋ 数量调增')
        await expect(purchase.getByRole('button', { name: '数量调增过账', exact: true })).toBeVisible()
        await verifyMobileNavigationMotion(page, assert, '[aria-label="来源变化"]', 2, true)
        await expect(outcome).toContainText('草稿 ＋ 移库或批次修正')
        await expect(outcome).toContainText('先取消应付草稿，再办理库存修正')
        await expect(purchase.getByRole('button', { name: '取消应付草稿', exact: true })).toBeVisible()
        await expect(conditionLabels).toHaveCount(0)
        await waitForFiniteAnimations(page, { selector: '[aria-label="来源变化"]' })
        await page.screenshot({ path: path.join(outputDir, 'finance-purchase-scenario-1280x720.png'), fullPage: false })
        await expect(purchase.locator('[data-finance-detail]')).toHaveCount(0)
        const purchaseStep = purchase.locator('[data-finance-node="purchase-2"]')
        await purchaseStep.click()
        await expect(purchase.locator('[data-finance-detail]')).toContainText('仓库通过采购入库调整修正库存位置或批次')
        await expect(purchaseStep).toHaveAttribute('aria-pressed', 'true')
        assert.equal(await page.evaluate(() => history.length), historyLength, '查阅操作不堆积返回历史')

        await page.reload()
        await expect(purchaseStep).toHaveAttribute('aria-pressed', 'true')
        await expect(toggle('purchase')).toBeFocused()
        const nav = purchase.getByRole('tablist', { name: '财务专题内容' })
        const navGeometry = () => nav.evaluate((node) => {
          const { left, top, width, height } = node.getBoundingClientRect()
          return [left, top + scrollY, width, height]
        })
        const before = await navGeometry()
        await purchase.getByRole('button', { name: '查看采购差额规则' }).click()
        await expect(purchase.locator('[data-finance-rules]')).toBeVisible()
        assert.equal(new URL(page.url()).searchParams.get('view'), 'chain')
        assert.deepEqual(await navGeometry(), before, '财务说明页签位置稳定')
        await expect(graphs).toHaveCount(1)
        await expect(purchase.locator('[data-finance-detail] a[href]')).toHaveCount(0)
        await toggle('purchase').click()
        await expect(details).toHaveCount(0)
        await expect(toggle('purchase')).toBeFocused()
        await expect(purchaseStep).toHaveAttribute('aria-pressed', 'false')
        await sectionTab('月结对账').click()
        await sectionTab('采购差额').click()
        await expect(purchase.getByRole('radio', { name: '草稿', exact: true })).toBeChecked()
        await expect(sourceChoices.getByRole('radio', { name: '移库或批次修正', exact: true })).toBeChecked()
        await purchase.getByText('已过账或结清', { exact: true }).click()
        await expect(outcome).toContainText('已过账或结清 ＋ 移库或批次修正')
        await expect(purchase.getByRole('button', { name: '账款差额为零', exact: true })).toBeVisible()
        await expect(purchase.getByRole('button', { name: '取消应付草稿', exact: true })).toHaveCount(0)
        await expect(conditionLabels).toHaveCount(0)
        for (const [source, condition] of [
          ['数量调增', '本次差额尚未确认'],
          ['采购退货', '未核销余额足够'],
        ]) {
          await sourceChoices.getByText(source, { exact: true }).click()
          await expect(purchaseGraph.getByRole('button', { name: `查看条件：${condition}`, exact: true })).toBeVisible()
          await expect(conditionLabels).toHaveCount(1)
          await expect(purchaseGraph).not.toContainText('办理顺序')
          await assertBusinessMermaidGraph(purchaseGraph)
        }
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, 'finance-purchase-conditions-1280x720.png'), fullPage: false })

        await sectionTab('月结对账').click()
        await expect(terms.locator('[data-graph-wire]')).toHaveCount(2)
        const dueDate = terms.locator('[data-finance-node="terms-1"]')
        const dueDateNote = page.locator('#finance-note-terms-1')
        await dueDate.hover()
        await expect(dueDateNote).toBeVisible()
        await dueDate.press('Enter')
        await expect(dueDateNote).toBeHidden()
        await terms.getByRole('button', { name: '查看月结到期日规则' }).click()
        await expect(terms.locator('[data-finance-rules]')).toContainText('到期时间以服务端冻结记录为准')
        await terms.locator('[data-finance-node="terms-3"]').click()
        await terms.getByRole('button', { name: '查看期间对账规则' }).click()
        await expect(terms.locator('[data-finance-rules]')).toContainText('往来净余额')
        await toggle('terms').click()
        await expect(dueDateNote).toBeHidden()
        await expect(toggle('terms')).toBeFocused()

        await sectionTab('审批凭据').click()
        const permissionsGraph = permissions.locator('[data-business-flow]')
        await assertBusinessMermaidGraph(permissionsGraph)
        await expect(permissionsGraph.getByRole('button', { name: /^查看条件：/u })).toHaveCount(1)
        await expect(permissionsGraph).not.toContainText('办理顺序')
        await permissionsGraph.getByRole('button', { name: '查看条件：审批通过', exact: true }).click()
        await expect(permissions.locator('[data-finance-detail]')).toContainText('审批责任以生效客户配置和流程冻结结果为准')
        await expect(permissions.locator('[data-finance-detail]')).toContainText('审批通过后，由财务显式过账')
        await expect(graphs).toHaveCount(1)
        await expect(page.locator('.ant-drawer-open')).toHaveCount(0)
        await assertNoHorizontalOverflow(page)

        await page.getByRole('button', { name: '导出', exact: true }).hover()
        await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' }).click()
        await page.waitForFunction(() => window.__financePrintReady === true)
        await expect(overview.locator('[data-flow-print-part]')).toHaveCount(3)
        await expect(topics.locator('[data-flow-print-part]')).toHaveCount(3)
        await expect(purchaseGraph.locator('.erp-dev-business-flow__print-conditions dd')).toHaveText([
          '调减金额超过未核销余额时，先撤销足额核销记录。',
        ])
        await expect(permissionsGraph.locator('.erp-dev-business-flow__print-conditions dd')).toHaveText([
          '审批责任以生效客户配置和流程冻结结果为准。审批通过后，由财务显式过账。',
        ])
        await expect(sectionTabs).toBeHidden()
        await expect(details).toBeHidden()
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await expect(permissions.locator('[data-finance-detail]')).toBeVisible()
        await expect(sectionTab('审批凭据')).toHaveAttribute('aria-selected', 'true')
        await expect(graphs).toHaveCount(1)
        assert.deepEqual(writes.get(page), [], '财务阅读与关系页没有业务写入')
      },
    },
    {
      name: 'dev-finance-rules-reading-desktop',
      path: '/__dev/business-rules?view=finance_rules&finance_rule=sources',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const rules = page.locator('[data-finance-rules]')
        await expect(rules).toContainText('来源缺失或冲突时拒绝')
        await expect(rules).toContainText('重复请求复用原草稿')
        await expect(rules).toContainText('六位小数')
        await expect(rules).toContainText('清空单价同步清空金额')
        await expect(rules).toContainText('不把未知金额补成零')
        const selector = page.locator('.ant-select').filter({
          has: page.getByRole('combobox', { name: '财务口径类型', exact: true }),
        })
        for (const rule of FINANCE_RULES) {
          await selector.locator('.ant-select-selector').click()
          await page.locator('.ant-select-dropdown:visible').getByText(rule.label, { exact: true }).click()
          await expect(rules.getByRole('region', { name: rule.label, exact: true })).toBeVisible()
          await expect(rules.locator('[data-source-reference]')).toHaveCount(0)
          await expect(rules).not.toContainText(/Test[A-Z]|规则依据与验证|查看规则依据/u)
          if (rule.key === 'corrections') {
            await expect(rules).toContainText('核销不得超过当前可用余额')
            await expect(rules).toContainText('取消或冲销失败整体回滚')
          }
          await assertNoHorizontalOverflow(page, rule.label)
        }
        await selector.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('来源与金额', { exact: true }).click()
        for (const width of [1024, 1280, 1920]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page, `财务规则 ${width}`)
        }
        assert.deepEqual(writes.get(page), [], '财务规则阅读没有业务写入')
      },
    },
  ]
}
