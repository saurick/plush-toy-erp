import { expect } from 'playwright/test'
import { writeFile } from 'node:fs/promises'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'
import { assertBusinessMermaidGraph } from './mermaidGraphAssertions.mjs'
import { switchMermaidLayout, waitForMermaidFit } from './mermaidViewerAssertions.mjs'

export function createDevBusinessTopicsScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  return [{
    name: 'dev-business-topics-navigation-desktop',
    path: '/__dev/business-topics?flow_topic=finance_relations',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const topicMenu = page.getByRole('link', { name: '业务专题', exact: true })
      const chainMenu = page.getByRole('link', { name: '业务链路', exact: true })
      const rulesMenu = page.getByRole('link', { name: '业务规则', exact: true })
      const assertTopicToolbar = async () => {
        const toolbar = page.locator('.erp-dev-chain-topics__toolbar')
        const selector = await toolbar.locator(':scope > .ant-select').boundingBox()
        const filter = await toolbar.getByRole('button', { name: '关联筛选', exact: true }).boundingBox()
        assert(selector && filter, '专题选择与筛选在同一工具栏可见')
        assert(Math.abs(selector.y - filter.y) < 1, '专题选择与筛选顶部对齐')
        assert(filter.x >= selector.x + selector.width + 8, '筛选紧邻专题选择且不重叠')
      }
      await expect(topicMenu).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('heading', { name: '业务专题', exact: true })).toBeVisible()
      await expect(page.getByRole('tablist', { name: '业务链路方式' })).toHaveCount(0)
      await expect(page.locator('.erp-dev-flow-header').getByRole('button', { name: '订单全流程', exact: true })).toHaveCount(0)
      await expect(page.locator('.erp-dev-flow-header').getByRole('link', { name: '查看链路实测报告', exact: true })).toHaveCount(0)
      await page.goto(new URL('/__dev/ui-design?page=workbench&workbenchMode=preview', page.url()).href)
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('navigation', { name: '效能工作台主导航', exact: true })
        .getByRole('button', { name: '业务专题', exact: true }).click()
      const preview = frame.getByRole('region', { name: '业务专题页面说明', exact: true })
      await expect(preview.getByRole('link', { name: '打开当前业务专题', exact: true }))
        .toHaveAttribute('href', '/__dev/business-topics')
      const financeLink = preview.getByRole('link', { name: '查看三行关联概览', exact: true })
      await expect(financeLink).toHaveAttribute('href', '/__dev/business-topics?flow_topic=finance_relations')
      // The design iframe cannot navigate its parent; verify the registered destination in the workbench.
      await page.goto(new URL(await financeLink.getAttribute('href'), page.url()).href)
      await expect(topicMenu).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('heading', { name: '业务怎样连接财务', exact: true })).toBeVisible()
      await topicMenu.click()
      assert.equal(new URL(page.url()).searchParams.get('flow_topic'), 'finance_relations', '重复点击当前菜单保留专题')
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1080 })
        await assertTopicToolbar()
        await assertNoHorizontalOverflow(page)
      }
      await page.getByRole('button', { name: '关联筛选', exact: true }).click()
      await expect(page.getByRole('region', { name: '关联筛选条件', exact: true })).toBeVisible()
      await assertTopicToolbar()
      await page.getByRole('button', { name: '关联筛选', exact: true }).click()
      await chainMenu.click()
      await expect(chainMenu).toHaveAttribute('aria-current', 'page')
      const flowViews = page.getByRole('tablist', { name: '流程视图', exact: true })
      await expect(flowViews.getByRole('tab', { name: '订单全流程', exact: true, selected: true })).toBeVisible()
      await expect(flowViews.getByRole('tab', { name: '异常处理', exact: true })).toBeVisible()
      await expect(flowViews.getByRole('tab', { name: '业务专题', exact: true })).toHaveCount(0)
      await expect(page.locator('#task-fulfillment-guide').getByRole('button', { name: '业务专题', exact: true })).toHaveCount(0)
      await expect(page.locator('.erp-dev-flow-header').getByRole('link', { name: '查看链路实测报告', exact: true })).toHaveCount(0)
      await page.goto(new URL('/__dev/status-flows?flow_stage=incoming_quality&flow_substep=inbound&flow_role=warehouse', page.url()).href)
      const guide = page.locator('#task-fulfillment-guide')
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      const entry = guide.getByRole('button', { name: '查看相关专题', exact: true })
      await entry.scrollIntoViewIfNeeded()
      const scrollBefore = await page.evaluate(() => window.scrollY)
      await entry.click()
      await expect(topicMenu).toHaveAttribute('aria-current', 'page')
      assert.equal(new URL(page.url()).pathname, '/__dev/business-topics')
      assert.equal(new URL(page.url()).searchParams.get('flow_topic'), 'purchase_to_inventory')
      assert.equal(new URL(page.url()).searchParams.get('flow_role'), 'warehouse')
      assert.equal(new URL(page.url()).searchParams.has('flow_stage'), false)
      const topics = page.getByRole('region', { name: '业务专题阅读', exact: true })
      await expect(topics.locator('[data-topic-diagram="purchase_to_inventory"] [data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1080 })
        await assertTopicToolbar()
        await assertNoHorizontalOverflow(page)
      }
      await topics.locator('[data-graph-node="purchase_order"]').click()
      await topics.getByRole('button', { name: '查看规则', exact: true }).click()
      await expect(page.locator('[data-selected-flow]')).toHaveAttribute('data-selected-flow', 'source.purchase_order')
      await expect(rulesMenu).toHaveAttribute('aria-current', 'page')
      assert.equal(new URL(page.url()).pathname, '/__dev/business-rules')
      await page.getByRole('button', { name: '查看全部定义', exact: true }).click()
      await expect(rulesMenu).toHaveAttribute('aria-current', 'page')
      assert.equal(new URL(page.url()).searchParams.has('flow_topic'), false)
      await page.goBack()
      await expect(rulesMenu).toHaveAttribute('aria-current', 'page')
      assert.equal(new URL(page.url()).searchParams.get('chain'), 'purchase_to_inventory')
      assert.equal(new URL(page.url()).searchParams.get('node'), 'purchase_order')
      await expect(page.locator('[data-selected-flow]')).toHaveAttribute('data-selected-flow', 'source.purchase_order')
      await page.getByRole('button', { name: '返回 业务专题', exact: true }).click()
      await expect(topics.locator('[data-graph-node="purchase_order"]')).toHaveAttribute('aria-pressed', 'true')
      await page.reload()
      await expect(topics.locator('[data-graph-node="purchase_order"]')).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: '返回 业务结构', exact: true }).click()
      await expect(chainMenu).toHaveAttribute('aria-current', 'page')
      await expect(guide.locator('[data-selected-substep]')).toHaveAttribute('data-selected-substep', 'inbound')
      assert.equal(new URL(page.url()).searchParams.get('flow_role'), 'warehouse')
      await expect(entry).toBeFocused()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scrollBefore, 0)
      await page.goBack()
      await expect(topicMenu).toHaveAttribute('aria-current', 'page')
      await expect(topics.locator('[data-topic-diagram="purchase_to_inventory"]')).toBeVisible()
      await assertNoHorizontalOverflow(page)
      const { origin } = new URL(page.url())
      const reviewed = []
      await page.setViewportSize({ width: 1920, height: 1080 })
      for (const chain of catalog.businessChains) {
        await page.goto(`${origin}/__dev/business-topics?flow_topic=${encodeURIComponent(chain.key)}`)
        const graph = page.locator('[data-business-flow]')
        await assertBusinessMermaidGraph(graph)
        const viewer = graph.locator('.erp-markdown-mermaid')
        await expect(viewer).toHaveAttribute('data-mermaid-direction', 'LR')
        await waitForMermaidFit(page, viewer)
        await expect(graph.locator('[data-graph-node]')).toHaveCount(chain.nodes.length)
        await expect(graph.locator('[data-graph-wire]')).toHaveCount(chain.edges.length)
        const metrics = await viewer.evaluate((root) => {
          const svg = root.querySelector('.erp-markdown-mermaid__canvas > svg')
          const box = svg.getBoundingClientRect()
          const scale = Math.min(box.width / svg.viewBox.baseVal.width, box.height / svg.viewBox.baseVal.height)
          return { scale, textPixels: parseFloat(getComputedStyle(svg.querySelector('.nodeLabel')).fontSize) * scale }
        })
        reviewed.push({ chain: chain.key, ...metrics })
        if (chain.key === 'production_to_inventory') {
          assert(metrics.textPixels >= 14, '生产专题首次显示的文字保持可读，不把细长全图缩成小字')
          const selected = chain.nodes[1].key
          await graph.locator(`[data-graph-node="${selected}"]`).click()
          await expect(graph.locator(`[data-graph-node="${selected}"]`)).toHaveAttribute('aria-pressed', 'true')
          await switchMermaidLayout(page, viewer, assert)
          await expect(viewer).toHaveAttribute('data-mermaid-direction', 'TB')
          await expect(graph.locator(`[data-graph-node="${selected}"]`)).toHaveAttribute('aria-pressed', 'true')
          await page.reload()
          await expect(viewer).toHaveAttribute('data-mermaid-direction', 'LR')
          await assertBusinessMermaidGraph(graph)
          await expect(graph.locator(`[data-graph-node="${selected}"]`)).toHaveAttribute('aria-pressed', 'true')
          await page.screenshot({ path: path.join(outputDir, 'production-topic-direction-4k.png'), fullPage: false })
        }
        await page.getByRole('button', { name: '系统衔接图', exact: true }).click()
        await assertBusinessMermaidGraph(graph)
        await expect(graph.locator('.erp-markdown-mermaid')).toHaveAttribute('data-mermaid-direction', 'LR')
        await assertNoHorizontalOverflow(page, `${chain.label}与系统衔接`)
      }
      await writeFile(path.join(outputDir, 'mermaid-topic-directions.json'), JSON.stringify(reviewed, null, 2))
    },
  }]
}
