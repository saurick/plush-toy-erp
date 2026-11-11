import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { selectWarehouseView } from './warehouseNavigationActions.mjs'
import { getNavigationSections } from '../../src/erp/config/seedData.mjs'
import { WAREHOUSE_HANDLING_VIEWS } from '../../src/erp/utils/warehouseViews.mjs'
import { createOutsourcingSummaryScenarios } from './outsourcingSummaryScenarios.mjs'
import { createWorkbenchSummaryScenarios } from './workbenchSummaryScenarios.mjs'
import { createBusinessProgressScenarios } from './businessProgressScenarios.mjs'
import { createBusinessStatisticsScenarios } from './businessStatisticsScenarios.mjs'
import { assertStickyGeometry } from './businessListStickyScenarios.mjs'
import { createWorkCenterTableScenarios } from './workCenterTableScenarios.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const extraViews = [
  { key: 'outsourcing-items', path: '/erp/purchase/processing-contracts?view=items' },
  { key: 'workbench-sales-summary', path: '/erp/dashboard?view=summary&summary=sales-orders' },
  { key: 'workbench-materials-summary', path: '/erp/dashboard?view=summary&summary=materials' },
  { key: 'progress-production', path: '/erp/business-dashboard?view=production' },
  { key: 'progress-statistics', path: '/erp/business-dashboard?view=statistics&display=table' },
  { key: 'progress-receivables', path: '/erp/business-dashboard?view=statistics&report=receivables&display=table' },
  { key: 'inventory-lots', path: '/erp/warehouse/inventory', tab: '库存批次' },
  { key: 'inventory-transactions', path: '/erp/warehouse/inventory', tab: '库存变动记录' },
  { key: 'finance-credit-notes', path: '/erp/finance/receivables?workspace=credits', selectedTab: '账款调整' },
  { key: 'purchase-arrival', path: '/erp/purchase/accessories', tab: '采购跟进' },
  { key: 'product-specifications', path: '/erp/master/products?catalog=product_skus' },
  { key: 'product-catalog', path: '/erp/master/products?catalog=products' },
  { key: 'permission-accounts', path: '/erp/system/permissions?tab=admins' },
  { key: 'permission-approvals', path: '/erp/system/permissions?tab=approvals' },
  { key: 'permission-navigation', path: '/erp/system/permissions?tab=navigation' },
  { key: 'permission-page-access', path: '/erp/system/permissions?tab=navigation', tab: '页面访问' },
  { key: 'permission-role-impact', path: '/erp/system/permissions?tab=navigation', tab: '页面访问', impact: true },
  { key: 'history', path: '/erp/history' },
  { key: 'help', path: '/erp/help-center' },
]

const widthReviewViews = [
  { key: 'task-tracking', path: '/erp/task-board?tracking=visible' },
  { key: 'progress-statistics-products', path: '/erp/business-dashboard?view=statistics&display=table&group=product' },
  { key: 'inventory-operations', path: '/erp/warehouse/inventory?workspace=operations' },
  { key: 'receivables-due', path: '/erp/finance/receivables?workspace=due', selectedTab: '到期顺序' },
  { key: 'payables-due', path: '/erp/finance/payables?workspace=due', selectedTab: '到期顺序' },
  { key: 'payables-credits', path: '/erp/finance/payables?workspace=credits', selectedTab: '账款调整' },
  { key: 'payables-source-adjustments', path: '/erp/finance/payables?workspace=source-adjustments', selectedTab: '采购待调整' },
  { key: 'reconciliation-statement', path: '/erp/finance/reconciliation?workspace=statement', selectedTab: '期间对账' },
  ...Object.entries(WAREHOUSE_HANDLING_VIEWS).flatMap(([direction, views]) =>
    views.slice(1).map(({ key, label }) => ({
      key: `warehouse-${direction}-${key}`,
      path: `/erp/warehouse/${direction}?warehouse_view=${key}`,
      selectedTab: label,
    }))
  ),
].map((entry) => ({ ...entry, widthOnly: true }))

const businessColumnFit = {
  customers: {
    compact: { 状态: 90, 付款条件: 180 },
    growing: ['编号', '名称'],
  },
  processes: {
    compact: { 状态: 90, 可委外: 90, 可内制: 90 },
    growing: ['环节编号', '环节名称'],
  },
  history: {
    compact: { 历史状态: 120, 最后更新: 180 },
    growing: ['编号 / 名称', '名称 / 往来方', '摘要'],
  },
}

function assertFocusedColumnFit(entry, widths) {
  const rule = businessColumnFit[entry.key]
  if (!rule && !entry.impact) return

  const lookup = (table, label) => {
    const column = table.columns.find((item) => item.label === label)
    assert(column, `${entry.key} 缺少列：${label}`)
    assert(Number.isFinite(column.bodyWidth) && Math.abs(column.bodyWidth - column.width) <= 1, `${entry.key} 的 ${label} 表头应与表体对齐`)
    return column.width
  }
  const tables = widths.map((sample) => {
    assert(sample.pageOverflow <= 1, `${entry.key} 在 ${sample.viewport}px 应只在表内滚动`)
    const table = sample.tables.find((item) => entry.impact
      ? item.columns.some(({ label }) => label === '适用页面')
      : item.kind === 'business-list')
    assert(table?.rows > 0, `${entry.key} 需要可测量的表格数据行`)
    assert(Math.abs(table.headerWidth - table.tableWidth) <= 1, `${entry.key} 表头与表体应等宽`)
    return table
  })
  const [wide, narrow] = tables
  assert(Math.abs(wide.tableWidth - wide.availableWidth) <= 1 && wide.scrollRange <= 1, `${entry.key} 宽屏应铺满且无需横向滚动`)
  assert(narrow.scrollRange > 1, `${entry.key} 窄窗应保留列宽并在表内滚动`)
  if (entry.impact) {
    for (const table of tables) {
      assert(lookup(table, '适用页面') >= 219, '适用页面须保留可读列宽')
      assert(lookup(table, '使用限制') >= 259, '使用限制须保留可读列宽')
    }
  } else {
    for (const [label, budget] of Object.entries(rule.compact)) {
      for (const table of tables) {
        assert(Math.abs(lookup(table, label) - budget) <= 1, `${entry.key} 的 ${label} 应保持紧凑`)
      }
    }
    for (const label of rule.growing) {
      assert(lookup(wide, label) > lookup(narrow, label) + 1, `${entry.key} 的 ${label} 应分享宽屏余宽`)
    }
  }
}

async function verifyPermissionImpactScroll(page) {
  const viewport = page.viewportSize()
  const details = page.locator('.erp-role-permission-impact')
  const body = details.locator('.ant-table-body')
  const summary = details.locator(':scope > summary')
  try {
    await page.setViewportSize({ ...viewport, width: 1024 })
    await details.getByRole('button', { name: '向右查看列', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.erp-role-permission-impact .ant-table-body')?.scrollLeft > 0)
    await body.evaluate((node) => { node.scrollLeft = node.scrollWidth })
    await page.waitForFunction(() => {
      const panel = document.querySelector('.erp-role-permission-impact')
      const scroller = panel?.querySelector('.ant-table-body')
      const column = panel?.querySelector('.ant-table-header th:last-child')
      const cell = scroller?.querySelector('.ant-table-row td:last-child')
      if (!scroller || !column || !cell) return false
      const headerBox = column.getBoundingClientRect()
      const cellBox = cell.getBoundingClientRect()
      return cellBox.width >= 259 &&
        Math.abs(headerBox.right - cellBox.right) <= 1 &&
        cellBox.right <= scroller.getBoundingClientRect().right + 1
    })
    await summary.click()
    await body.waitFor({ state: 'hidden' })
    await summary.click()
    await body.waitFor({ state: 'visible' })
    const limits = details.getByRole('columnheader', { name: '使用限制', exact: true })
    assert(await limits.evaluate((node) => node.getBoundingClientRect().width >= 259), '重新展开仍保留限制列')
  } finally {
    await page.setViewportSize(viewport)
  }
}

async function collectWidthEvidence(page) {
  const viewport = page.viewportSize()
  const results = []
  for (const width of [1920, 1024]) {
    await page.setViewportSize({ ...viewport, width })
    results.push(await page.locator('.erp-admin-content').evaluate(async (root) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const tables = []
      const round = (value) => Math.round(value * 10) / 10
      for (const table of root.querySelectorAll('table')) {
        if (!table.checkVisibility() || !table.tBodies.length ||
          table.closest('[role="dialog"], .erp-business-form-page, [data-table-lines="fixed"]')) continue
        const wrapper = table.closest('.ant-table-wrapper')
        const scroller = table.closest('.ant-table-body, .ant-table-content') ||
          (() => {
            for (let node = table.parentElement; node && node !== root; node = node.parentElement) {
              if (/auto|scroll/u.test(getComputedStyle(node).overflowX)) return node
            }
            return table.parentElement
          })()
        const headerTable = wrapper?.querySelector('.ant-table-header > table') || table
        const headerRow = headerTable.tHead?.rows[0]
        const dataRows = [...table.tBodies].flatMap((body) => [...body.rows]).filter((row) =>
          !row.matches('.ant-table-measure-row, .ant-table-placeholder'))
        const dataRow = dataRows[0]
        const declaredWidths = [...table.querySelectorAll(':scope > colgroup > col')].map((col) => col.style.width)
        const columns = Array.from(headerRow?.cells || []).filter((cell) =>
          !cell.matches('.ant-table-cell-scrollbar')).map((cell) => {
          const bounds = cell.getBoundingClientRect()
          return {
            label: cell.textContent.trim(),
            width: round(bounds.width),
            declaredWidth: declaredWidths[cell.cellIndex] || null,
            bodyWidth: dataRow?.cells.length === headerRow.cells.length
              ? round(dataRow.cells[cell.cellIndex].getBoundingClientRect().width)
              : null,
            overflow: Math.max(0, cell.scrollWidth - cell.clientWidth),
          }
        })
        tables.push({
          kind: wrapper?.closest('.erp-business-data-table-card') ? 'business-list' : wrapper ? 'app-table' : 'native',
          rows: dataRows.length,
          availableWidth: scroller.clientWidth,
          tableWidth: round(table.getBoundingClientRect().width),
          headerWidth: round(headerTable.getBoundingClientRect().width),
          scrollRange: scroller.scrollWidth - scroller.clientWidth,
          columns,
        })
      }
      return {
        viewport: innerWidth,
        pageOverflow: Math.max(0, root.scrollWidth - root.clientWidth, document.documentElement.scrollWidth - innerWidth),
        tables,
      }
    }))
  }
  await page.setViewportSize(viewport)
  return results
}

export function createDesktopListStickyScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  const deps = { assert, customerRuntimeEffectiveSession, outputDir }
  const outsourcing = createOutsourcingSummaryScenarios(deps)[0]
  const summaries = createWorkbenchSummaryScenarios(deps)[0]
  const progress = createBusinessProgressScenarios(deps)[0]
  const statistics = createBusinessStatisticsScenarios(deps)[0]
  const workCenter = createWorkCenterTableScenarios({ ...deps, path })
  const fixtures = {
    'global-dashboard': workCenter.find(({ name }) => name === 'work-center-table-workbench'),
    'task-board': workCenter.find(({ name }) => name === 'work-center-table-tasks-light'),
    'task-tracking': workCenter.find(({ name }) => name === 'work-center-table-tracking'),
    'outsourcing-items': outsourcing,
    'workbench-sales-summary': summaries,
    'workbench-materials-summary': summaries,
    'business-dashboard': progress,
    'progress-production': progress,
    'progress-statistics': statistics,
    'progress-statistics-products': statistics,
    'progress-receivables': statistics,
  }
  const pages = getNavigationSections().flatMap((section) => section.items || [])
    .filter((item) => item.path?.startsWith('/erp/')).concat(extraViews, widthReviewViews)
  const scans = pages.map((entry) => ({
    name: `desktop-list-sticky-${entry.key}`,
    path: entry.path,
    auth: 'admin',
    effectiveSession: fixtures[entry.key]?.effectiveSession || customerRuntimeEffectiveSession,
    adminProfile: fixtures[entry.key]?.adminProfile,
    workflowTaskFixtures: fixtures[entry.key]?.workflowTaskFixtures,
    beforeNavigate: fixtures[entry.key]?.beforeNavigate,
    viewport: { width: 1440, height: entry.key.startsWith('progress-statistics') || entry.key === 'progress-receivables' || entry.impact ? 600 : 900 },
    verify: async (page) => {
      await page.locator('.erp-admin-content').waitFor()
      if (entry.tab) {
        if (entry.path.startsWith('/erp/warehouse/inventory')) await selectWarehouseView(page, entry.tab)
        else await page.getByRole('tab', { name: entry.tab, exact: true }).click()
      }
      if (entry.selectedTab) await page.getByRole('tab', { name: entry.selectedTab, exact: true, selected: true }).waitFor()
      if (entry.impact) await page.locator('.erp-role-permission-impact > summary').click()
      await page.waitForFunction(() => [...document.querySelectorAll('.erp-admin-content .ant-spin-spinning, .erp-admin-content [aria-busy="true"]')].every((node) => !node.checkVisibility()))
      if (fixtures[entry.key]) await page.locator('.erp-admin-content tbody tr:not(.ant-table-measure-row)').first().waitFor()
      const tables = page.locator('.erp-admin-content .ant-table-wrapper, .erp-admin-content table:not(.ant-table-wrapper table)')
      const results = []
      for (let index = 0; !entry.widthOnly && index < await tables.count(); index += 1) {
        const table = tables.nth(index)
        if (!await table.isVisible()) continue
        const result = await table.evaluate((node) => {
          if (node.closest('[role="dialog"], .erp-business-form-page') || node.matches('[data-table-lines="fixed"]')) return null
          const header = node.querySelector('.ant-table-sticky-holder') || node.querySelector('thead th')
          const scrollers = []
          for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            if (/(auto|scroll)/u.test(getComputedStyle(parent).overflowY)) scrollers.push(parent)
          }
          const scroller = scrollers.find((parent) => parent.scrollHeight > parent.clientHeight + 2) || scrollers[0]
          return {
            className: node.className,
            header: Boolean(header),
            sticky: header ? getComputedStyle(header).position === 'sticky' : false,
            rows: node.querySelectorAll('tbody tr').length,
            scroller: scroller?.className || '',
            scrollRange: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
          }
        })
        if (!result?.header) continue
        if (result.scrollRange > 50) {
          const geometry = await table.evaluate(async (node) => {
            const header = node.querySelector('.ant-table-sticky-holder') || node.querySelector('thead th')
            let scroller = node.parentElement
            while (scroller && !(/(auto|scroll)/u.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight + 2)) scroller = scroller.parentElement
            const scope = node.closest('[data-page-table-region], .erp-business-page-layout')
            const toolbar = scroller.matches('.erp-admin-content')
              ? scope?.querySelector('[data-page-table-toolbar], :scope > .erp-business-operation-panel') : null
            const beforeHeader = header.getBoundingClientRect().top
            const beforeToolbar = toolbar?.getBoundingClientRect().top
            scroller.scrollTop = Math.min(400, scroller.scrollHeight - scroller.clientHeight)
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const root = scroller.getBoundingClientRect()
            const box = header.getBoundingClientRect()
            const toolbarBox = toolbar?.getBoundingClientRect()
            const value = {
              scrollTop: scroller.scrollTop,
              rootTop: root.top,
              rootBottom: root.bottom,
              headerTop: box.top,
              headerBottom: box.bottom,
              toolbarTop: toolbarBox?.top,
              toolbarBottom: toolbarBox?.bottom,
              expectedToolbarTop: toolbar ? Math.max(root.top, beforeToolbar - scroller.scrollTop) : null,
              expectedHeaderTop: toolbar ? Math.max(toolbarBox.bottom, beforeHeader - scroller.scrollTop) : null,
            }
            scroller.scrollTop = 0
            return value
          })
          result.geometry = geometry
          result.sticky = result.sticky && geometry.headerTop >= geometry.rootTop - 1 && geometry.headerBottom <= geometry.rootBottom + 1
          if (geometry.expectedToolbarTop != null) result.sticky = result.sticky && Math.abs(geometry.toolbarTop - geometry.expectedToolbarTop) <= 1 && Math.abs(geometry.headerTop - geometry.expectedHeaderTop) <= 1
        }
        results.push(result)
      }
      const widths = await collectWidthEvidence(page)
      await writeFile(path.join(outputDir, `desktop-list-sticky-${entry.key}.json`), JSON.stringify({ path: entry.path, tables: results, widths }, null, 2))
      assertFocusedColumnFit(entry, widths)
      if (entry.impact) await verifyPermissionImpactScroll(page)
      if (entry.widthOnly) return
      assert(results.every((result) => result.sticky), `${entry.path} 仍有未固定表头: ${JSON.stringify(results.filter((result) => !result.sticky))}`)
      assert(await page.locator('.erp-admin-content').evaluate((node) => node.scrollWidth <= node.clientWidth + 1), `${entry.path} 页面横向溢出`)
    },
  }))
  const longLists = ['outsourcing-light', 'outsourcing-dark', 'inventory'].map((kind) => {
    const inventory = kind === 'inventory'
    return {
      ...(!inventory ? outsourcing : {}),
      name: `desktop-list-sticky-scroll-${kind}`,
      path: inventory ? '/erp/warehouse/inventory' : '/erp/purchase/processing-contracts?view=items',
      auth: 'admin',
      effectiveSession: inventory ? customerRuntimeEffectiveSession : outsourcing.effectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      themeMode: kind.endsWith('dark') ? 'dark' : 'light',
      beforeNavigate: inventory ? async (page) => {
        const rows = Array.from({ length: 45 }, (_, index) => ({
          id: 301 + index,
          subject_type: 'PRODUCT',
          subject_id: 1,
          product_sku_id: 1,
          warehouse_id: 1,
          lot_id: 402,
          unit_id: 1,
          quantity: '12.5',
          active_reserved_quantity: '4',
          available_quantity: '8.5',
          updated_at: 1790430000,
        }))
        await page.route('**/rpc/inventory', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_inventory_balances') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData(params.keyword ? [] : rows, 'inventory_balances', params)) } })
        })
      } : outsourcing.beforeNavigate,
      verify: async (page) => {
        const table = page.locator('.erp-business-data-table-card--sticky')
        const root = page.locator('.erp-admin-content')
        await table.locator('tr.ant-table-row').last().waitFor()
        if (inventory) {
          const lastRow = table.locator('tr.ant-table-row').last()
          await lastRow.getByRole('checkbox').check()
          assert((await lastRow.getAttribute('class')).includes('ant-table-row-selected'), '库存余额多选后保留选中行')
        }
        await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await assertStickyGeometry(page)
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        const filter = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await filter.waitFor()
        await page.keyboard.press('Escape')
        await filter.waitFor({ state: 'hidden' })
        await assertStickyGeometry(page)
        await page.screenshot({ path: path.join(outputDir, `desktop-list-sticky-${kind}-scrolled-4k.png`) })
        await page.setViewportSize({ width: 1280, height: 600 })
        await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await assertStickyGeometry(page)
        await table.locator('.ant-table-body').evaluate((node) => { node.scrollLeft = node.scrollWidth })
        await assertStickyGeometry(page)
        await page.setViewportSize({ width: 1280, height: 480 })
        await page.waitForFunction(() => !document.querySelector('.ant-table-sticky-holder'))
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(await page.locator('.ant-table-sticky-holder').count(), 0)
        await page.setViewportSize({ width: 1440, height: 900 })
        await table.waitFor()
        await root.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await assertStickyGeometry(page)
        await root.evaluate((node) => { node.scrollTop = 0 })
      },
    }
  })
  return [...scans, ...longLists]
}
