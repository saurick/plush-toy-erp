import { WorkflowTaskDiscoveryCatalog as taskCatalog } from '../../src/common/consts/workflowTaskDiscovery.generated.mjs'
import { DEV_FLOW_STATE_CATALOG } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'
import { assertInactivePrintStylesDoNotHideApp } from './styleIsolationAssertions.mjs'
import { DEV_FLOW_STATE_OBSERVATORY_PATH, startNoWriteAudit } from './devFlowStateObservatoryScenarios.mjs'

export function createDevBusinessChainPrintScenarios({ assert, assertNoHorizontalOverflow, expectText, outputDir, path }) {
  const writeRequestsByPage = new WeakMap()
  return [
    {
      name: 'dev-business-chain-customer-review-print',
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
        await page.locator('[data-catalog-status="ready"]').waitFor()
        const openExport = async () => {
          await page.getByRole('button', { name: '导出', exact: true }).hover()
          await page.getByRole('menuitem', { name: '客户校对稿…' }).click()
          const dialog = page.getByRole('dialog', { name: '客户校对稿', exact: true })
          await dialog.waitFor()
          return dialog
        }
        const dialog = await openExport()
        await dialog.getByRole('button', { name: /取\s*消/u }).click()
        assert.equal(await page.locator('[data-customer-review-print-root]').count(), 0)
        await page.goto(new URL('/__dev/status-flows?view=chain&chain=production_exception', page.url()).href)
        await page.locator('[data-catalog-status="ready"]').waitFor()
        // 图加载失败时阻止打印，重试后仍可导出。
        await page.evaluate(() => {
          window.__reviewRenderFailure = new MutationObserver(() => {
            const diagram = document.querySelectorAll('[data-customer-review-print-root] [data-customer-review-diagram] .erp-markdown-mermaid')[0]
            if (diagram && diagram.dataset.mermaidStatus !== 'error') diagram.dataset.mermaidStatus = 'error'
          })
          window.__reviewRenderFailure.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mermaid-status'] })
        })
        try {
          const failingReview = await openExport()
          await failingReview.getByRole('button', { name: '打印 / 保存 PDF', exact: true }).click()
          await page.getByText('业务链图尚未生成，请稍后重新导出', { exact: true }).waitFor()
          await page.waitForFunction(() => !document.querySelector('[data-customer-review-print-root]'))
          assert.equal(await page.evaluate(() => window.__flowPrintCount), 0)
        } finally {
          await page.evaluate(() => { window.__reviewRenderFailure.disconnect(); delete window.__reviewRenderFailure })
        }
        for (const chain of ['all', ...DEV_FLOW_STATE_CATALOG.businessChains.map((item) => item.key)]) {
          await page.goto(new URL(`/__dev/status-flows?view=chain&chain=${chain}`, page.url()).href)
          await page.locator('[data-catalog-status="ready"]').waitFor()
          const review = await openExport()
          await review.getByRole('button', { name: '打印 / 保存 PDF', exact: true }).click()
          await page.waitForFunction(() => window.__flowPrintCount > 0)
          const printRoot = page.locator('[data-customer-review-print-root]')
          const diagrams = printRoot.locator('[data-customer-review-diagram] .erp-markdown-mermaid')
          assert.equal(await diagrams.count(), chain === 'all' ? 0 : 1)
          assert.deepEqual(await diagrams.evaluateAll((nodes) => nodes.map((node) => node.dataset.mermaidStatus)), Array(chain === 'all' ? 0 : 1).fill('rendered'), '全部图渲染完成后才能打印')
          const printText = await printRoot.innerText()
          for (const copy of ['按问题查阅', '图册阅读顺序', '适用范围', '完成边界', '业务衔接 ·']) assert(!printText.includes(copy), `导出仍带有冗余说明：${copy}`)
          if (chain === 'all') {
            assert.equal(await printRoot.locator('[data-customer-review-stage]').count(), 17)
            for (const step of taskCatalog.fulfillment_flow) {
              const card = printRoot.locator(`[data-customer-review-stage="${step.stage}"]`)
              assert((await card.innerText()).includes(step.role))
              assert((await card.innerText()).includes(step.result))
              assert.equal(await card.getAttribute('data-conditional'), step.branch ? 'true' : null)
            }
            assert.equal(await printRoot.locator('[data-customer-review-exception]').count(), taskCatalog.exception_guides.length)
            for (const guide of taskCatalog.exception_guides) {
              for (const plan of guide.plans) {
                const text = await printRoot.locator(`[data-customer-review-exception="${guide.key}"] [data-customer-review-plan="${plan.key}"]`).innerText()
                for (const value of [plan.label, plan.continuation.label, plan.continuation.original_terminal, plan.continuation.reentry?.label].filter(Boolean)) assert(text.includes(value), `缺少异常出口：${value}`)
              }
            }
          } else {
            assert.equal(await printRoot.locator('[data-customer-review-overview]').count(), 0, '单专题导出不夹带总览或其他专题')
          }
          await page.emulateMedia({ media: 'print' })
          await page.setViewportSize({ width: 718, height: 1024 })
          assert.equal(await page.locator('#root').evaluate((node) => getComputedStyle(node).display), 'none')
          const metrics = await printRoot.evaluate((node) => ({
            width: node.clientWidth,
            scrollWidth: node.scrollWidth,
            diagrams: [...node.querySelectorAll('[data-customer-review-diagram] svg')].map((svg) => {
              const box = svg.getBoundingClientRect()
              const viewBox = svg.viewBox.baseVal
              const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height)
              return { width: box.width, height: box.height, minText: Math.min(...[...svg.querySelectorAll('text')].map((text) => parseFloat(getComputedStyle(text).fontSize) * scale)) }
            }),
          }))
          assert(metrics.scrollWidth <= metrics.width + 1, `${chain} 打印正文横向溢出`)
          assert.equal(await printRoot.locator('table').count(), 0, '流程节点不再重复生成长表')
          for (const diagram of metrics.diagrams) {
            assert(diagram.minText >= 11, `${chain} 图内文字过小: ${JSON.stringify(diagram)}`)
          }
          if (chain === 'all') {
            const cards = await printRoot.locator('[data-customer-review-stage]').evaluateAll((nodes) => nodes.map((node) => ({
              font: parseFloat(getComputedStyle(node).fontSize), width: node.clientWidth, scrollWidth: node.scrollWidth,
            })))
            assert(cards.every((card) => card.font >= 12 && card.scrollWidth <= card.width + 1), '主流程节点保持可读字号且不裁切内容')
          } else if (chain === 'finance_payment_and_reversal') {
            const conditions = await printRoot.locator('[data-customer-review-conditions]').innerText()
            for (const value of ['金额不超过可用余额', '币种匹配', '首款还须匹配同一订单', '剩余未结金额为零', '剩余未结金额大于零']) assert(conditions.includes(value), `精简后遗漏关键财务条件：${value}`)
          }
          await page.screenshot({ path: path.join(outputDir, `customer-review-${chain}-print.png`), fullPage: false })
          if (page.context().browser()?.browserType().name() === 'chromium') {
            await page.pdf({ path: path.join(outputDir, `customer-review-${chain}.pdf`), preferCSSPageSize: true, printBackground: true })
          }
          await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
          await page.waitForFunction(() => !document.querySelector('[data-customer-review-print-root]'))
          await page.emulateMedia({ media: 'screen' })
          await page.setViewportSize({ width: 1440, height: 900 })
          await assertInactivePrintStylesDoNotHideApp(page)
          await assertNoHorizontalOverflow(page, `customer-review-${chain}-restored`)
        }
        const printCount = await page.evaluate(() => window.__flowPrintCount)
        await page.getByRole('button', { name: '导出', exact: true }).hover()
        await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF' }).click()
        await page.waitForFunction((count) => window.__flowPrintCount === count + 1, printCount)
        assert.equal(await page.locator('[data-flow-print-current="true"]').count(), 1)
        assert.equal(await page.locator('[data-customer-review-print-root]').count(), 0)
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await page.waitForFunction(() => !document.querySelector('[data-flow-print-current]'))
        assert.deepEqual(writeRequestsByPage.get(page), [], '图册导出不得写入业务数据')
      },
    },
  ]
}
