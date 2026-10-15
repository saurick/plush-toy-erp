import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  exerciseTableScrollControls,
  exerciseTableScrollPagination,
  assertTableScrollDockVisible,
  assertSingleTableScrollbar,
} from './tableScrollControlAssertions.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const tableSelector = '.erp-business-data-table-card .ant-table-wrapper'
const rows = Array.from({ length: 45 }, (_, index) => ({
  id: index + 1,
  shipment_no: `SHIP-SCROLL-${String(index + 1).padStart(3, '0')}`,
  status: 'DRAFT',
  customer_id: 1,
  customer_snapshot: '表格滚动验证客户',
  delivery_snapshot: {
    address: '用于验证长文本换行后仍能滚动查看全部记录的模拟地址。'.repeat(3),
  },
  items: [],
  created_at: 1790430000,
  updated_at: 1790430000,
}))

async function measureScroll(page) {
  return page.locator(tableSelector).evaluate((wrapper) => {
    const content = wrapper.querySelector('.ant-table-content')
    const card = wrapper.closest('.erp-business-data-table-card')
    const pagination = wrapper.querySelector('.ant-pagination')
    const box = wrapper.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    const lastRow = wrapper.querySelector('tr.ant-table-row:last-child')
    const lastBox = lastRow?.getBoundingClientRect()
    const paginationBox = pagination?.getBoundingClientRect()
    return {
      overflowY: getComputedStyle(wrapper).overflowY,
      clientHeight: wrapper.clientHeight,
      scrollHeight: wrapper.scrollHeight,
      scrollTop: wrapper.scrollTop,
      scrollLeft: content.scrollLeft,
      horizontalRange: content.scrollWidth - content.clientWidth,
      leftInset: box.left - cardBox.left,
      topInset: box.top - cardBox.top,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      lastRowVisible: Boolean(
        lastBox && lastBox.bottom <= Math.min(box.bottom, innerHeight) + 1
      ),
      paginationVisible: Boolean(
        paginationBox &&
        paginationBox.top >= box.top &&
        paginationBox.bottom <= Math.min(box.bottom, innerHeight) + 1
      ),
    }
  })
}

async function scrollToTableEnd(page) {
  const wrapper = page.locator(tableSelector)
  await wrapper.hover()
  await page.mouse.wheel(0, 10000)
  await page.waitForFunction((selector) => {
    const node = document.querySelector(selector)
    return (
      node.scrollTop > 0 &&
      node.scrollHeight - node.clientHeight - node.scrollTop <= 1
    )
  }, tableSelector)
  const metrics = await measureScroll(page)
  assert(metrics.lastRowVisible, '滚动后必须能看见本页最后一条记录')
  assert(metrics.paginationVisible, '滚动后必须能到达分页控件')
  return metrics
}

export function createBusinessTableScrollScenarios({
  customerRuntimeEffectiveSession,
  clickERPThemeOption,
  outputDir,
}) {
  return [
    { mode: 'desktop', width: 1440, height: 900 },
    { mode: 'short', width: 1280, height: 600 },
    { mode: 'dark', width: 1440, height: 900 },
    { mode: 'mobile', width: 390, height: 844 },
  ].map(({ mode, width, height }) => ({
    name: `business-table-scroll-${mode}`,
    path: '/erp/warehouse/shipments',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width, height },
    beforeNavigate: async (page) => {
      await page.route('**/rpc/operational_fact', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON() || {}
        if (method !== 'list_shipments') return route.fallback()
        const matching = rows.filter(
          (row) => !params.keyword || row.shipment_no.includes(params.keyword)
        )
        await route.fulfill({
          json: {
            jsonrpc: '2.0',
            id,
            result: styleRpcResult(
              stylePaginatedRpcData(matching, 'shipments', params)
            ),
          },
        })
      })
    },
    verify: async (page) => {
      await page.locator('tr[data-row-key="20"]').waitFor()
      if (mode === 'dark') await clickERPThemeOption(page, '暗色')
      const initial = await measureScroll(page)
      assert(
        initial.scrollHeight > initial.clientHeight + 100,
        '多行数据必须产生真实纵向溢出'
      )
      assert.equal(
        initial.overflowY,
        'auto',
        '表格内容不能被外层裁切，必须允许纵向滚动'
      )
      assert.equal(initial.pageOverflow, false, '宽表不能撑出页面横向滚动')
      assert(initial.horizontalRange > 100, '宽列必须产生表内横向溢出')
      assert(
        initial.leftInset >= 11 && initial.topInset >= 9,
        `表格应留出左上间距: ${JSON.stringify(initial)}`
      )
      await exerciseTableScrollControls(
        page,
        page.locator(tableSelector),
        page.locator(`${tableSelector} .ant-table-content`)
      )
      if (mode === 'desktop') {
        assert.equal(
          await page
            .locator('[data-table-scroll-toolbar] .app-table-scroll-buttons')
            .count(),
          1,
          '主表复用原有工具栏'
        )
        assert.equal(
          await page.locator(`${tableSelector} .app-table-scroll-top`).count(),
          0,
          '主表不另占导航行'
        )
        await page.screenshot({
          path: path.join(outputDir, 'business-table-navigation-desktop.png'),
        })
      }

      const bottom = await scrollToTableEnd(page)
      await assertTableScrollDockVisible(page, page.locator(tableSelector))
      const lastRow = page.locator(`${tableSelector} tr.ant-table-row`).last()
      await lastRow.hover()
      await page.mouse.wheel(10000, 0)
      await page.waitForFunction((selector) => {
        const content = document.querySelector(`${selector} .ant-table-content`)
        return (
          content.scrollLeft > 0 &&
          content.scrollWidth - content.clientWidth - content.scrollLeft <= 1
        )
      }, tableSelector)
      const right = await measureScroll(page)
      assert(right.paginationVisible, '横向滚动后分页仍须可达')
      await page.waitForFunction(
        (node) => node.disabled,
        await page
          .getByRole('button', { name: '向右查看列', exact: true })
          .elementHandle()
      )
      await assertSingleTableScrollbar(
        page.locator(tableSelector),
        page.locator(`${tableSelector} .ant-table-content`)
      )
      if (mode === 'desktop') {
        await page.screenshot({
          path: path.join(outputDir, 'business-table-single-scrollbar-end.png'),
        })
      }
      const paging = await exerciseTableScrollPagination(page, {
        wrapper: page.locator(tableSelector),
        trigger: page.locator(`${tableSelector} .ant-pagination-item-2`),
        ready: page.locator('tr[data-row-key="40"]'),
        endpoint: '**/rpc/operational_fact',
        method: 'list_shipments',
        offset: 20,
      })
      const secondPage = await scrollToTableEnd(page)

      const search = page.locator('.erp-business-operation-panel input').first()
      await search.fill('NO-SCROLL-MATCH')
      await page.getByText('暂无出货单', { exact: true }).waitFor()
      const empty = await measureScroll(page)
      assert.equal(empty.pageOverflow, false)
      assert.equal(
        await page
          .locator('.app-table-scroll-buttons, .app-table-scroll-dock')
          .count(),
        0,
        '空结果不显示横向控件'
      )
      await search.fill('')
      await page.locator('tr[data-row-key="20"]').waitFor()
      const restored = await scrollToTableEnd(page)

      await writeFile(
        path.join(outputDir, `business-table-scroll-${mode}.json`),
        JSON.stringify(
          { initial, bottom, right, paging, secondPage, empty, restored },
          null,
          2
        )
      )
    },
  }))
}
