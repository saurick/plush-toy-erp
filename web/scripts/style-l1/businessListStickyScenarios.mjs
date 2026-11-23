import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { expect } from 'playwright/test'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { prepareUIDesignSandboxSource } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { isTransparentColor, parseRgb } from './colorAssertions.mjs'

export async function assertStickyToolbarSurfaces(page, required = false) {
  const toolbars = page.locator('.erp-admin-content :is([data-page-table-toolbar], .erp-business-operation-panel.ant-card):visible')
  const surfaces = await toolbars.evaluateAll((nodes) => nodes
    .filter((node) => getComputedStyle(node).position === 'sticky')
    .map((toolbar) => {
      const panelSelector = '.erp-business-operation-panel.ant-card'
      const panel = toolbar.matches(panelSelector) ? toolbar : toolbar.querySelector(panelSelector)
      if (!panel) return { toolbar: toolbar.className, panel: null }

      const wrappers = []
      for (let node = panel.parentElement; node && toolbar.contains(node); node = node.parentElement) {
        const style = getComputedStyle(node)
        wrappers.push({ background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow })
      }
      const style = getComputedStyle(panel)
      return {
        toolbar: toolbar.className,
        wrappers,
        panel: {
          background: style.backgroundColor,
          shadow: style.boxShadow,
          radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius],
        },
      }
    }))

  if (required) assert(surfaces.length > 0, `${page.url()} 应有可见的吸顶工具栏`)
  for (const { toolbar, wrappers, panel } of surfaces) {
    assert(panel, `${page.url()} 的吸顶工具栏 ${toolbar} 应使用共享圆角面板`)
    assert(wrappers.every(({ background, image, shadow }) => isTransparentColor(background) && image === 'none' && shadow === 'none'),
      `${page.url()} 的吸顶外层应透出圆角：${JSON.stringify(wrappers)}`)
    assert(panel.radii.every((radius) => Number.parseFloat(radius) > 0) && parseRgb(panel.background)?.[3] === 1 && panel.shadow !== 'none',
      `${page.url()} 的圆角面板应绘制完整底色和阴影：${JSON.stringify(panel)}`)
  }
  return surfaces
}

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
  await assertStickyToolbarSurfaces(page, true)
}

export async function verifyStickyToolbarFilter(page) {
  const trigger = page.getByRole('button', { name: '筛选', exact: true })
  await trigger.press('Enter')
  const filter = page.getByRole('dialog', { name: '筛选条件', exact: true })
  await expect(filter).toBeFocused()
  const bounds = await filter.boundingBox()
  assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height + 1, '吸顶后的筛选内容须可达')
  await page.keyboard.press('Escape')
  await filter.waitFor({ state: 'hidden' })
  await expect(trigger).toBeFocused()
  return trigger
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

        const filterButton = await verifyStickyToolbarFilter(page)

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
        const tabKey = process.platform === 'darwin' && page.context().browser().browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab'
        await filterButton.press(`Shift+${tabKey}`)
        assert(await filterButton.evaluate((node) => {
          const toolbar = node.closest('.erp-business-operation-panel')
          return toolbar.contains(document.activeElement) && document.activeElement.matches(':focus-visible')
        }), '窄窗吸顶时可用键盘返回前一个工具栏控件')
        await page.keyboard.press(tabKey)
        assert(await filterButton.evaluate((node) => document.activeElement === node && node.matches(':focus-visible')), '正向 Tab 返回可见的筛选焦点')
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
