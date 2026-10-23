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
import { DEFAULT_BUSINESS_PAGE_SIZE } from '../../src/erp/utils/businessPagination.mjs'

const tableSelector = '.erp-business-data-table-card .ant-table-wrapper'
const contentSelector = '.ant-table-content, .ant-table-body'
const rows = Array.from({ length: DEFAULT_BUSINESS_PAGE_SIZE * 2 + 5 }, (_, index) => ({
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
    const content = wrapper.querySelector('.ant-table-content, .ant-table-body')
    const card = wrapper.closest('.erp-business-data-table-card')
    const sticky = card.classList.contains('erp-business-data-table-card--sticky')
    const scroller = sticky ? wrapper.closest('.erp-admin-content') : wrapper
    const pagination = wrapper.querySelector('.ant-pagination')
    const box = wrapper.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    const lastRow = wrapper.querySelector('tr.ant-table-row:last-child')
    const lastBox = lastRow?.getBoundingClientRect()
    const paginationBox = pagination?.getBoundingClientRect()
    return {
      sticky,
      overflowY: getComputedStyle(scroller).overflowY,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      wrapperScrollRange: wrapper.scrollHeight - wrapper.clientHeight,
      scrollLeft: content.scrollLeft,
      horizontalRange: content.scrollWidth - content.clientWidth,
      leftInset: box.left - cardBox.left,
      topInset: box.top - cardBox.top,
      rightInset: cardBox.right - box.right,
      bottomInset: cardBox.bottom - box.bottom,
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
    const wrapper = document.querySelector(selector)
    const node = wrapper.closest('.erp-business-data-table-card--sticky')
      ? wrapper.closest('.erp-admin-content') : wrapper
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
      await page.locator(`tr[data-row-key="${DEFAULT_BUSINESS_PAGE_SIZE}"]`).waitFor()
      assert.equal(await page.locator(`${tableSelector} tr.ant-table-row`).count(), DEFAULT_BUSINESS_PAGE_SIZE, '首屏应完整呈现默认一页数据')
      if (mode === 'dark') await clickERPThemeOption(page, '暗色')
      const initial = await measureScroll(page)
      assert.equal(initial.sticky, mode !== 'mobile', '桌面主表应接入共享吸顶，手机保留原有滚动')
      if (initial.sticky) assert(initial.wrapperScrollRange <= 1, '桌面只由主内容区纵向滚动')
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
        [initial.leftInset, initial.topInset, initial.rightInset, initial.bottomInset]
          .every((inset) => inset >= 0 && inset <= 1.5),
        `表格四边应贴合卡片内侧，仅保留边框: ${JSON.stringify(initial)}`
      )
      await exerciseTableScrollControls(
        page,
        page.locator(tableSelector),
        page.locator(tableSelector).locator(contentSelector)
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
      if (bottom.sticky) {
        const geometry = await page.locator(tableSelector).evaluate((wrapper) => {
          const page = wrapper.closest('.erp-business-page-layout')
          const root = page.closest('.erp-admin-content')
          const toolbar = page.querySelector('.erp-business-operation-panel')
          const header = wrapper.querySelector('.ant-table-sticky-holder')
          const title = page.querySelector('.erp-business-page-header-card')
          return {
            rootTop: root.getBoundingClientRect().top,
            toolbarTop: toolbar.getBoundingClientRect().top,
            toolbarBottom: toolbar.getBoundingClientRect().bottom,
            headerTop: header.getBoundingClientRect().top,
            titleBottom: title?.getBoundingClientRect().bottom,
          }
        })
        assert(Math.abs(geometry.toolbarTop - geometry.rootTop) <= 1, `操作栏应吸顶: ${JSON.stringify(geometry)}`)
        assert(Math.abs(geometry.headerTop - geometry.toolbarBottom) <= 1, `表头应紧接操作栏: ${JSON.stringify(geometry)}`)
        if (geometry.titleBottom != null) assert(geometry.titleBottom < geometry.rootTop, '页名应随正文滚走')
      }
      await assertTableScrollDockVisible(page, page.locator(tableSelector))
      // Locator hover can scroll the last row into view and move pagination.
      // Aim the wheel at the already visible table area without moving it.
      const wheelPoint = await page.locator(tableSelector).locator(contentSelector).evaluate((content) => {
        const box = content.getBoundingClientRect()
        const wrapper = content.closest('.ant-table-wrapper').getBoundingClientRect()
        return {
          x: (Math.max(0, box.left, wrapper.left) + Math.min(innerWidth, box.right, wrapper.right)) / 2,
          y: (Math.max(0, box.top, wrapper.top) + Math.min(innerHeight, box.bottom, wrapper.bottom)) / 2,
        }
      })
      await page.mouse.move(wheelPoint.x, wheelPoint.y)
      await page.mouse.wheel(10000, 0)
      await page.waitForFunction((selector) => {
        const content = document.querySelector(selector).querySelector('.ant-table-content, .ant-table-body')
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
        page.locator(tableSelector).locator(contentSelector)
      )
      if (mode === 'desktop') {
        await page.screenshot({
          path: path.join(outputDir, 'business-table-single-scrollbar-end.png'),
        })
      }
      const paging = await exerciseTableScrollPagination(page, {
        wrapper: page.locator(tableSelector),
        trigger: page.locator(tableSelector).getByRole('button', { name: '下一页', exact: true }),
        ready: page.locator(`tr[data-row-key="${DEFAULT_BUSINESS_PAGE_SIZE * 2}"]`),
        endpoint: '**/rpc/operational_fact',
        method: 'list_shipments',
        offset: DEFAULT_BUSINESS_PAGE_SIZE,
      })
      assert.equal(await page.locator(`${tableSelector} tr.ant-table-row`).count(), DEFAULT_BUSINESS_PAGE_SIZE, '第二页应保留相同记录数以核对滚动位置')
      const secondPage = await scrollToTableEnd(page)

      const search = page.locator('.erp-business-operation-panel').getByRole('textbox')
      await search.fill('NO-SCROLL-MATCH')
      await search.press('Enter')
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
      await search.press('Enter')
      await page.locator(`tr[data-row-key="${DEFAULT_BUSINESS_PAGE_SIZE}"]`).waitFor()
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
