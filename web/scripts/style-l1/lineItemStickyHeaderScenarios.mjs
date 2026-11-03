import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import { createBOMMaterialGroupsScenarios } from './bomMaterialGroupsScenarios.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { assertTableStickyHeaderAlignment } from './tableStickyHeaderAssertions.mjs'

function geometry(node) {
  const scope = node.closest('.erp-bom-material-groups')
  const toolbar = scope.querySelector('[data-line-items-toolbar]')
  const host = node.querySelector('[data-table-sticky-header]')
  let scroller = node.parentElement
  while (scroller && !/(auto|scroll)/u.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  const box = (target) => {
    const rect = target.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, height: rect.height }
  }
  const readingTop = scroller.getBoundingClientRect().top + scroller.clientTop + parseFloat(getComputedStyle(scroller).paddingTop)
  return { toolbar: box(toolbar), header: box(host), region: box(node), scope: box(scope), scroller: box(scroller), readingTop, stickyToolbar: toolbar.dataset.tableStickyToolbar, offset: parseFloat(getComputedStyle(toolbar).top) || 0, scrollTop: scroller.scrollTop }
}

async function scrollWithin(region, target) {
  await region.evaluate((node, destination) => {
    let scroller = node.parentElement
    while (scroller && !/(auto|scroll)/u.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    const source = node.querySelector(':scope > [data-table-scroll-id]')
    const row = destination === 'next-group'
      ? source.querySelectorAll('.erp-line-item-disclosure-heading')[1]
      : null
    const top = row ? row.getBoundingClientRect().top : node.getBoundingClientRect().top
    scroller.scrollTop = destination === 'end' ? scroller.scrollHeight : top - scroller.getBoundingClientRect().top + scroller.scrollTop + (row ? -120 : 240)
  }, target)
}

export function createLineItemStickyHeaderScenarios(deps) {
  const base = createBOMMaterialGroupsScenarios(deps)[0]
  return [
    { name: 'line-items-sticky-desktop', viewport: { width: 1440, height: 900 } },
    { name: 'line-items-sticky-dark', viewport: { width: 1440, height: 900 }, themeMode: 'dark' },
    { name: 'line-items-sticky-mobile', viewport: { width: 390, height: 844 }, stickyToolbar: false },
    { name: 'line-items-sticky-wrapped', viewport: { width: 820, height: 900 }, stickyToolbar: false },
    { name: 'line-items-sticky-short-window', viewport: { width: 1440, height: 480 }, stickyToolbar: false, stickyHeader: false },
    { name: 'line-items-sticky-section', viewport: { width: 1440, height: 900 }, sectionMode: true },
    { name: 'line-items-sticky-4k', viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 },
  ].map((options) => ({
    ...base,
    ...options,
    verify: async (page) => {
      await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      if (options.sectionMode) {
        await editor.getByRole('radio', { name: '页签', exact: true }).locator('..').click()
        await editor.getByRole('tab', { name: '材料分析明细表', exact: true }).click()
      }
      await editor.getByLabel('部位 1', { exact: true }).waitFor()
      await editor.getByRole('button', { name: '全部展开', exact: true }).click()
      await editor.getByLabel('部位 1', { exact: true }).evaluate((input) => {
        const data = new DataTransfer()
        data.setData('text/plain', Array.from({ length: 80 }, (_, index) => `部位${index + 1}\t1\t0.1\t5\t裁片\t激光\t备注`).join('\n'))
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      })
      const region = editor.locator('.app-table-sticky-region')
      const input = editor.getByLabel('部位 25', { exact: true })
      const identity = await input.elementHandle()
      const draft = await input.inputValue()
      const tabs = editor.getByRole('tablist', { name: '表单页签', exact: true })
      const navigationBefore = options.sectionMode ? await tabs.boundingBox() : null
      await scrollWithin(region, 'middle')
      if (options.sectionMode) {
        const navigationAfter = await tabs.boundingBox()
        assert.ok(Math.abs(navigationBefore.y - navigationAfter.y) <= 1, '滚动长明细时页签保持在表单顶部')
        assert.equal(await editor.getByRole('tab', { selected: true }).textContent(), '材料分析明细表')
      }
      console.log(`[style:l1] line-items-sticky-initial=${JSON.stringify({ scenario: options.name, ...(await region.evaluate(geometry)) })}`)
      const toolbarSticks = options.stickyToolbar !== false
      await expect.poll(async () => {
        const current = await region.evaluate(geometry)
        return toolbarSticks ? Math.abs(current.toolbar.top - current.readingTop - current.offset) <= 1 : current.toolbar.bottom < current.readingTop
      }).toBe(true)
      const first = await region.evaluate(geometry)
      assert.equal(first.stickyToolbar, String(toolbarSticks))
      if (options.name === 'line-items-sticky-wrapped') assert.ok(first.toolbar.height > 64, '覆盖多排按钮的实际布局')
      const headerEnabled = options.stickyHeader !== false
      if (headerEnabled) assert.ok(Math.abs(first.header.top - (toolbarSticks ? first.toolbar.bottom : first.readingTop)) <= 1, `列名接在工具栏或阅读区顶部：${JSON.stringify(first)}`)
      else await expect(region.locator('[data-table-sticky-header]')).toBeHidden()
      await assertTableStickyHeaderAlignment(editor)
      const source = region.locator(':scope > [data-table-scroll-id]')
      if (headerEnabled) {
        await source.evaluate((node) => {
          node.dataset.stickyPointerCount = '0'
          node.addEventListener('pointerdown', () => { node.dataset.stickyPointerCount = String(Number(node.dataset.stickyPointerCount) + 1) }, { once: true })
        })
        const label = await region.locator('[data-table-sticky-header] th').first().boundingBox()
        await page.mouse.click(label.x + Math.min(label.width / 2, 60), label.y + label.height / 2)
        assert.equal(await source.getAttribute('data-sticky-pointer-count'), '0', '点击吸顶列名不能穿透到下方数据行')
        await source.evaluate((node) => { node.scrollLeft = node.scrollWidth - node.clientWidth })
        await expect.poll(() => region.evaluate((node) => Math.abs(node.querySelector(':scope > [data-table-scroll-id]').scrollLeft - node.querySelector('.app-table-sticky-header__viewport').scrollLeft))).toBeLessThanOrEqual(1)
        await assertTableStickyHeaderAlignment(editor)
        await source.evaluate((node) => { node.scrollLeft = 0 })
      }
      await input.focus()
      await input.press('Tab')
      const focused = await region.evaluate((node) => {
        const target = document.activeElement
        const header = node.querySelector('[data-table-sticky-header]').getBoundingClientRect()
        return { inside: node.contains(target), top: target.getBoundingClientRect().top, headerBottom: header.bottom }
      })
      assert.equal(focused.inside, true)
      assert.ok(focused.top >= focused.headerBottom - 1, `键盘录入不被列名遮住：${JSON.stringify(focused)}`)
      const quantity = editor.getByLabel('单位用量 25', { exact: true })
      const originalQuantity = await quantity.inputValue()
      await quantity.fill('')
      await editor.getByRole('button', { name: '全部收起', exact: true }).click()
      await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
      await expect.poll(() => quantity.evaluate((node) => document.activeElement === node)).toBe(true)
      const errorPosition = await quantity.evaluate((node) => {
        const box = node.getBoundingClientRect()
        const header = node.closest('.app-table-sticky-region').querySelector('[data-table-sticky-header]').getBoundingClientRect()
        return { top: box.top, height: box.height, headerBottom: header.bottom }
      })
      assert.ok(errorPosition.height > 0 && errorPosition.top >= errorPosition.headerBottom - 1, `展开错误分组后定位不被吸顶区遮住：${JSON.stringify(errorPosition)}`)
      await quantity.fill(originalQuantity)
      await editor.getByRole('button', { name: '全部展开', exact: true }).click()
      await scrollWithin(region, 'next-group')
      const next = await region.evaluate(geometry)
      if (headerEnabled) assert.ok(Math.abs(next.header.top - (toolbarSticks ? next.toolbar.bottom : next.readingTop)) <= 1, `跨材料分组继续吸顶：${JSON.stringify(next)}`)
      else await expect(region.locator('[data-table-sticky-header]')).toBeHidden()
      assert.equal(await identity.evaluate((node) => node.isConnected), true)
      assert.equal(await input.inputValue(), draft)
      await identity.dispose()
      if (options.sectionMode) {
        await editor.getByRole('tab', { name: '备注与附件', exact: true }).click()
        await expect(region).toBeHidden()
        await editor.getByRole('tab', { name: '材料分析明细表', exact: true }).click()
        await expect(region).toBeVisible()
        await expect(region.locator('[data-table-sticky-header]')).toBeVisible()
        await assertTableStickyHeaderAlignment(editor)
        assert.equal(await input.inputValue(), draft, '页签往返保留明细草稿')
      } else if (options.viewport.width >= 768 && options.viewport.width < 3000) {
        await page.setViewportSize({ width: options.viewport.width, height: 620 })
        await scrollWithin(region, 'end')
        const end = await region.evaluate(geometry)
        assert.ok(end.toolbar.bottom <= end.scope.bottom + 1 && end.header.bottom <= end.region.bottom + 1, `吸顶不越过所属明细底部：${JSON.stringify(end)}`)
        assert.ok(end.header.bottom <= end.scroller.top + 1, `进入后续章节后列名退出：${JSON.stringify(end)}`)
        await page.setViewportSize(options.viewport)
      }
      await scrollWithin(region, 'middle')
      console.log(`[style:l1] line-items-sticky=${JSON.stringify({ scenario: options.name, ...(await region.evaluate(geometry)) })}`)
      if (options.name === 'line-items-sticky-4k') await page.screenshot({ path: `${deps.outputDir}/line-items-sticky-editor-4k.png` })
      await closeBusinessFormPage(page, editor)
    },
  }))
}
