import { assertInactivePrintStylesDoNotHideApp } from './styleIsolationAssertions.mjs'
import { switchMermaidLayout, verifyMermaidViewer } from './mermaidViewerAssertions.mjs'

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
          window.print = () => { window.__flowPrintCount += 1 }
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
        await root.locator('[data-business-chain-topics] > summary').click()
        await verifyMermaidViewer(page, root.locator('.erp-markdown-mermaid').first(), assert)
        const tabs = page.getByRole('tablist', { name: '业务链观察方式' })
        assert.equal(await tabs.getByRole('tab').count(), 2)
        await tabs.getByRole('tab', { name: '实例跟踪' }).click()
        await expectText(page, '输入单号或任务，查看实际进度与异常')
        await tabs.getByRole('tab', { name: '业务结构' }).click()
        await root.locator('[data-business-chain-topics] > summary').click()
        await root.locator('[data-mermaid-status="rendered"]').first().waitFor()
        await page.getByRole('button', { name: '搜索定义', exact: true }).click()
        await page.getByRole('dialog', { name: '搜索定义' }).waitFor()
        await page.getByRole('dialog', { name: '搜索定义' }).locator('.ant-drawer-close').click()
        const exportButton = page.getByRole('button', { name: '导出', exact: true })
        await exportButton.hover()
        await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' }).click()
        await page.waitForFunction(() => window.__flowPrintCount === 1)
        assert.equal(await root.getAttribute('data-flow-print-current'), 'true')
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await page.waitForFunction(() => !document.querySelector('[data-flow-print-current]'))
        await exportButton.hover()
        await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
        const review = page.getByRole('dialog', { name: '客户校对稿' })
        await review.waitFor()
        await review.getByRole('button', { name: /取\s*消/u }).click()
        assert.equal(await page.locator('[data-customer-review-print-root]').count(), 0)
        await exportButton.hover()
        await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
        await review.getByRole('button', { name: '打印 / 保存 PDF', exact: true }).click()
        await page.waitForFunction(() => window.__flowPrintCount === 2)
        const fulfillmentPrint = page.locator('[data-customer-review-fulfillment]')
        assert.equal(await fulfillmentPrint.locator('tbody tr').count(), 14)
        assert.match(await fulfillmentPrint.innerText(), /正式成品入库[\s\S]*查货与包装[\s\S]*业务显式确认实际发货/u)
        await page.emulateMedia({ media: 'print' })
        assert.equal(await page.locator('#root').evaluate((node) => getComputedStyle(node).display), 'none')
        await fulfillmentPrint.waitFor({ state: 'visible' })
        await page.pdf({ path: path.join(outputDir, 'order-role-flow-customer-review.pdf'), preferCSSPageSize: true, printBackground: true })
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await page.waitForFunction(() => !document.querySelector('[data-customer-review-print-root]'))
        await page.emulateMedia({ media: 'screen' })
        await page.goto(new URL('/__dev/status-flows?view=states&flow=source.sales_order', page.url()).href)
        const filters = page.getByRole('group', { name: '状态转换筛选' })
        const graph = page.locator('.erp-dev-flow-state-graph')
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        await switchMermaidLayout(page, graph.locator('.erp-markdown-mermaid'), assert)
        await switchMermaidLayout(page, graph.locator('.erp-markdown-mermaid'), assert)
        assert.equal(await filters.getByRole('button', { name: /^正常推进 /u }).getAttribute('aria-pressed'), 'true')
        assert(!(await graph.locator('.erp-markdown-mermaid__canvas > svg').textContent()).includes('取消'))
        await filters.getByRole('button', { name: /^全部 /u }).click()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert((await graph.locator('.erp-markdown-mermaid__canvas > svg').textContent()).includes('取消'))
        await filters.getByRole('button', { name: /^异常与纠正 /u }).click()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert((await graph.locator('.erp-markdown-mermaid__canvas > svg').textContent()).includes('取消'))
        await page.getByRole('button', { name: /^草稿，/u }).click()
        await filters.getByRole('button', { name: /^当前状态 /u, pressed: true }).waitFor()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert.equal(await filters.getByRole('button', { name: /^当前状态 /u }).getAttribute('aria-pressed'), 'true')
        await filters.getByRole('button', { name: /^正常推进 /u }).click()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        await assertNoHorizontalOverflow(page, 'focused-state-rules')

        assert.deepEqual(
          writeRequestsByPage.get(page) || [],
          [],
          '业务链观察桌面 smoke 不得发出写请求'
        )
      },
    },
  ]
}
