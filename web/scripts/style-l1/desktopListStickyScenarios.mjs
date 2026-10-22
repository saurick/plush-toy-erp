import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getNavigationSections } from '../../src/erp/config/seedData.mjs'
import { createOutsourcingSummaryScenarios } from './outsourcingSummaryScenarios.mjs'
import { createWorkbenchSummaryScenarios } from './workbenchSummaryScenarios.mjs'
import { createBusinessProgressScenarios } from './businessProgressScenarios.mjs'
import { createBusinessStatisticsScenarios } from './businessStatisticsScenarios.mjs'
import { assertStickyGeometry } from './businessListStickyScenarios.mjs'
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
  { key: 'finance-credit-notes', path: '/erp/finance/payments', tab: '红冲记录' },
  { key: 'purchase-arrival', path: '/erp/purchase/accessories', tab: '到货计划' },
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

export function createDesktopListStickyScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  const deps = { assert, customerRuntimeEffectiveSession, outputDir }
  const outsourcing = createOutsourcingSummaryScenarios(deps)[0]
  const summaries = createWorkbenchSummaryScenarios(deps)[0]
  const progress = createBusinessProgressScenarios(deps)[0]
  const statistics = createBusinessStatisticsScenarios(deps)[0]
  const fixtures = {
    'outsourcing-items': outsourcing,
    'workbench-sales-summary': summaries,
    'workbench-materials-summary': summaries,
    'business-dashboard': progress,
    'progress-production': progress,
    'progress-statistics': statistics,
    'progress-receivables': statistics,
  }
  const pages = getNavigationSections().flatMap((section) => section.items || [])
    .filter((item) => item.path?.startsWith('/erp/')).concat(extraViews)
  const scans = pages.map((entry) => ({
    name: `desktop-list-sticky-${entry.key}`,
    path: entry.path,
    auth: 'admin',
    effectiveSession: fixtures[entry.key]?.effectiveSession || customerRuntimeEffectiveSession,
    adminProfile: fixtures[entry.key]?.adminProfile,
    beforeNavigate: fixtures[entry.key]?.beforeNavigate,
    viewport: { width: 1440, height: entry.key.startsWith('progress-statistics') || entry.key === 'progress-receivables' || entry.impact ? 600 : 900 },
    verify: async (page) => {
      await page.locator('.erp-admin-content').waitFor()
      if (entry.tab) await page.getByRole('tab', { name: entry.tab, exact: true }).click()
      if (entry.impact) await page.locator('.erp-role-permission-impact > summary').click()
      await page.waitForFunction(() => [...document.querySelectorAll('.erp-admin-content .ant-spin-spinning, .erp-admin-content [aria-busy="true"]')].every((node) => !node.checkVisibility()))
      if (fixtures[entry.key]) await page.locator('.erp-admin-content tbody tr:not(.ant-table-measure-row)').first().waitFor()
      const tables = page.locator('.erp-admin-content .ant-table-wrapper, .erp-admin-content table:not(.ant-table-wrapper table)')
      const results = []
      for (let index = 0; index < await tables.count(); index += 1) {
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
      await writeFile(path.join(outputDir, `desktop-list-sticky-${entry.key}.json`), JSON.stringify({ path: entry.path, tables: results }, null, 2))
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
        if (inventory) await table.locator('tr.ant-table-row').last().getByRole('radio').check()
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
