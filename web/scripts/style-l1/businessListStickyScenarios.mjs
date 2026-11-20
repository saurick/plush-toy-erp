import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { prepareUIDesignSandboxSource } from '../../src/dev-workbench/config/devUIDesign.mjs'

export async function assertStickyGeometry(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('.erp-admin-content')
    const toolbar = document.querySelector('.erp-business-operation-panel')
    const header = document.querySelector('.ant-table-sticky-holder')
    const row = document.querySelector('.ant-table-body tr.ant-table-row')
    const headings = [...(header?.querySelectorAll('th') || [])]
    const cells = [...(row?.cells || [])]
    const aligned = headings.length > 0 && headings.length === cells.length && headings.every((cell, index) =>
      Math.abs(cell.getBoundingClientRect().left - cells[index].getBoundingClientRect().left) <= 1 &&
      Math.abs(cell.getBoundingClientRect().width - cells[index].getBoundingClientRect().width) <= 1)
    return root.scrollTop > 50 && header &&
      Math.abs(header.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom) <= 1 && aligned
  })
  const metrics = await page.locator('.erp-business-page-layout').evaluate((node) => {
    const root = node.closest('.erp-admin-content')
    const toolbar = node.querySelector('.erp-business-operation-panel')
    const header = node.querySelector('.ant-table-sticky-holder')
    const body = node.querySelector('.ant-table-body')
    const row = body.querySelector('tr.ant-table-row')
    const cells = [...row.cells].map((cell) => cell.getBoundingClientRect())
    const headings = [...header.querySelectorAll('th')].map((cell) => cell.getBoundingClientRect())
    return {
      top: root.getBoundingClientRect().top,
      toolbarTop: toolbar.getBoundingClientRect().top,
      toolbarBottom: toolbar.getBoundingClientRect().bottom,
      headerTop: header.getBoundingClientRect().top,
      titleBottom: root.querySelector('.erp-business-page-header-card').getBoundingClientRect().bottom,
      columnsAligned: headings.length === cells.length && headings.every((cell, index) =>
        Math.abs(cell.left - cells[index].left) <= 1 && Math.abs(cell.width - cells[index].width) <= 1),
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
    }
  })
  assert(Math.abs(metrics.toolbarTop - metrics.top) <= 1, JSON.stringify(metrics))
  assert(metrics.titleBottom < metrics.top, '模块页头应滚走，操作栏与表头保持吸顶')
  assert(metrics.columnsAligned, `表头和数据列必须对齐: ${JSON.stringify(metrics)}`)
  assert(metrics.documentOverflow <= 1, '页面不能出现横向溢出')
}

export function createBusinessListStickyScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  return ['purchase', 'sales'].map((kind) => {
    const purchase = kind === 'purchase'
    const endpoint = `**/rpc/${kind}_order`
    const listKey = `${kind}_orders`
    const numberKey = purchase ? 'purchase_order_no' : 'order_no'
    const prefix = purchase ? 'PO' : 'SO'
    const rows = Array.from({ length: 45 }, (_, index) => ({
      id: index + 1,
      [numberKey]: `${prefix}-STICKY-${String(index + 1).padStart(3, '0')}`,
      customer_id: 1,
      supplier_id: 1,
      customer_snapshot: { id: 1, name: '用于核对长名称和操作栏换行的模拟客户' },
      supplier_snapshot: { id: 1, name: '用于核对长名称和操作栏换行的模拟供应商' },
      lifecycle_status: 'draft',
      currency: 'CNY',
      version: 1,
      item_count: 1,
      created_at: 1790430000,
      updated_at: 1790430000,
    }))
    return {
      name: `business-list-sticky-${kind}`,
      path: purchase ? '/erp/purchase/accessories' : '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route(endpoint, async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== `list_${listKey}`) return route.fallback()
          const matching = rows.filter((row) => !params.keyword || row[numberKey].includes(params.keyword))
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(stylePaginatedRpcData(matching, listKey, params)),
            },
          })
        })
      },
      verify: async (page) => {
        const root = page.locator('.erp-admin-content')
        const table = page.locator('.erp-business-data-table-card--sticky')
        const actions = page.locator('.erp-business-selection-action-bar')
        await table.locator('tr[data-row-key="20"]').waitFor()
        await table.locator('tr[data-row-key="20"] input').check()
        await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await assertStickyGeometry(page)
        assert((await actions.innerText()).includes(`${prefix}-STICKY-020`), '吸顶栏必须保留选中单号')

        await page.getByRole('button', { name: '筛选', exact: true }).click()
        const filter = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await filter.waitFor({ state: 'visible' })
        const filterBox = await filter.boundingBox()
        assert(filterBox.y >= 0 && filterBox.y + filterBox.height <= 1081, '吸顶后的筛选内容须可达')
        await page.keyboard.press('Escape')
        await filter.waitFor({ state: 'hidden' })

        await actions.locator('[data-business-action-key="related-tasks"]').click()
        const tasks = page.getByRole('dialog', { name: '相关任务', exact: true })
        await tasks.waitFor({ state: 'visible' })
        await tasks.getByRole('button', { name: '关闭', exact: true }).click()
        await tasks.waitFor({ state: 'hidden' })
        await assertStickyGeometry(page)
        await page.screenshot({ path: path.join(outputDir, `business-list-sticky-${kind}-scrolled.png`) })

        await page.setViewportSize({ width: 1280, height: 600 })
        await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await assertStickyGeometry(page)
        const body = table.locator('.ant-table-body')
        await body.evaluate((node) => { node.scrollLeft = node.scrollWidth })
        await assertStickyGeometry(page)

        await page.setViewportSize({ width: 1280, height: 480 })
        await page.waitForFunction(() => !document.querySelector('.ant-table-sticky-holder'))
        assert((await actions.innerText()).includes(`${prefix}-STICKY-020`), '短窗口切换保留选择')
        await page.setViewportSize({ width: 1440, height: 900 })
        await table.waitFor()
        await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await assertStickyGeometry(page)
        await actions.getByRole('button', { name: /^清空(?:已选)?$/u }).click()
        assert(await actions.locator('[data-business-action-key="related-tasks"]').isDisabled())
        const search = page.locator('.erp-business-operation-panel').getByRole('textbox')
        await search.fill('NO-STICKY-MATCH')
        await search.press('Enter')
        await table.locator('.ant-empty').waitFor()
        assert.equal(await page.locator('tr.ant-table-row').count(), 0)
        await search.fill('')
        await search.press('Enter')
        await table.locator('tr[data-row-key="20"]').waitFor()
        await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await assertStickyGeometry(page)
        await root.evaluate((node) => { node.scrollTop = 0 })
        assert(await page.getByRole('heading', { name: purchase ? '采购订单' : '销售订单', exact: true }).isVisible())
      },
    }
  }).concat({
    name: 'business-list-sticky-design',
    path: '/__style-l1/sticky-list-design',
    viewport: { width: 1440, height: 540 },
    beforeNavigate: async (page) => {
      const source = prepareUIDesignSandboxSource(await readFile(new URL('../../../docs/product/ui-design/index.html', import.meta.url), 'utf8'))
      const srcdoc = source.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      await page.route('**/__style-l1/sticky-list-design', (route) => route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto minmax(0,1fr)}h1{margin:0;font:14px system-ui}iframe{width:100%;height:100%;border:0}</style></head><body><h1>列表滚动设计</h1><iframe title="列表滚动设计" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe></body></html>`,
      }))
    },
    verify: async (page) => {
      const frame = page.frameLocator('iframe')
      await frame.getByRole('button', { name: '采购管理', exact: true }).click()
      await frame.locator('.list-sticky-preview').waitFor()
      const root = frame.locator('.main')
      await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
      const metrics = await root.evaluate(async (node) => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const toolbar = node.querySelector('.operation-surface').getBoundingClientRect()
        const head = node.querySelector('[data-list-scroll] thead').getBoundingClientRect()
        return { scroll: node.scrollTop, toolbarTop: toolbar.top, top: node.getBoundingClientRect().top, toolbarBottom: toolbar.bottom, headerTop: head.top }
      })
      assert(metrics.scroll > 0, '设计样例需要真实纵向滚动')
      assert(Math.abs(metrics.toolbarTop - metrics.top) <= 1, JSON.stringify(metrics))
      assert(Math.abs(metrics.headerTop - metrics.toolbarBottom) <= 1, JSON.stringify(metrics))
      await page.setViewportSize({ width: 390, height: 844 })
      await frame.locator('.list-sticky-preview').waitFor({ state: 'detached' })
      await page.setViewportSize({ width: 1440, height: 540 })
      await frame.locator('.list-sticky-preview').waitFor()
    },
  })
}
