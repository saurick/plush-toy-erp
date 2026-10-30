import { expect as expectLocator } from 'playwright/test'
import assert from 'node:assert/strict'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertImportToolbarLayout(page, picker, label) {
  const layout = await picker.evaluate((root) => {
    const toolbar = root.querySelector('.erp-source-import-picker__toolbar')
    const box = (node) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const search = toolbar.querySelector('.erp-search-input')
    const clear = toolbar.querySelector('.erp-source-import-picker__clear-filter')
    return {
      toolbar: box(toolbar),
      search: box(search),
      clear: box(clear),
      controls: [...toolbar.querySelectorAll('.ant-select'), search, clear].map(box),
      selection: root.querySelector('.erp-source-import-picker__selection') ? box(root.querySelector('.erp-source-import-picker__selection')) : null,
      overflow: toolbar.scrollWidth > toolbar.clientWidth + 1,
    }
  })
  assert.equal(layout.overflow, false, `${label}: toolbar must stay within the modal`)
  assert.ok(layout.controls.every((box) => box.width > 0 && box.height >= 32 && box.left >= layout.toolbar.left - 1 && box.right <= layout.toolbar.right + 1), `${label}: controls remain readable and contained: ${JSON.stringify(layout)}`)
  assert.ok(Math.abs(layout.search.top - layout.clear.top) <= 1, `${label}: search and reset stay on the same row`)
  assert.ok(layout.search.width >= 160, `${label}: search must not shrink to an unusable width`)
  if (page.viewportSize().width >= 1280) {
    assert.ok(layout.controls.every((box) => Math.abs(box.top - layout.search.top) <= 1), `${label}: desktop filters and search share one row: ${JSON.stringify(layout)}`)
  }
  if (layout.selection) assert.ok(layout.selection.top >= layout.toolbar.bottom - 1, `${label}: selections stay below the filter toolbar`)
  console.log(`[import-toolbar] ${label} viewport=${page.viewportSize().width} height=${layout.toolbar.height} searchWidth=${layout.search.width}`)
  return layout
}

export async function assertImportPickerGeometry(page, picker, label) {
  const originalViewport = page.viewportSize()
  for (const viewport of [{ width: 3840, height: 2160 }, { width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 736, height: 480 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await waitForFiniteAnimations(page)
    await assertBusinessModalViewport(page, picker, { label: `${label}-${viewport.width}` })
    await assertImportToolbarLayout(page, picker, `${label}-${viewport.width}`)
    for (const end of [false, true]) {
      await picker.evaluate((root, end) => {
        const scroller = root.querySelector('.ant-table-body, .ant-table-content')
        scroller.scrollLeft = end ? scroller.scrollWidth : 0
        scroller.scrollTop = end ? scroller.scrollHeight : 0
      }, end)
      await picker.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const geometry = await picker.evaluate((root) => {
        const table = root.querySelector('.app-table')
        const headers = [...table.querySelectorAll('.ant-table-thead > tr > th')].filter((node) => node.getBoundingClientRect().height > 0)
        const cells = [...table.querySelector('.ant-table-tbody > tr.ant-table-row').children]
        return cells.map((cell, index) => {
          const a = headers[index].getBoundingClientRect(); const
b = cell.getBoundingClientRect()
          return { title: headers[index].textContent.trim(), width: Math.abs(a.width - b.width), left: Math.abs(a.left - b.left) }
        })
      })
      assert.ok(geometry.every((column) => column.width <= 1.5 && column.left <= 1.5), `${label} ${viewport.width} scroll=${end}: ${JSON.stringify(geometry)}`)
      console.log(`[import-columns] ${label} ${viewport.width} scroll=${end} maxDelta=${Math.max(...geometry.flatMap((column) => [column.width, column.left]))}`)
    }
  }
  await page.setViewportSize(originalViewport)
  await picker.evaluate((root) => {
    root.querySelectorAll('.ant-table-body, .ant-table-content, .ant-modal-body').forEach((node) => { node.scrollTop = 0; node.scrollLeft = 0 })
  })
  await waitForFiniteAnimations(page)
}

export async function assertImportFilterPrompt(page, picker, name, placeholder, emptyOptions = []) {
  const input = page.getByRole('combobox', { name, exact: true })
  const control = picker.locator('.ant-select').filter({ has: input })
  assert.equal(await control.locator('.ant-select-selection-placeholder').innerText(), placeholder)
  await control.locator('.ant-select-selector').click()
  await waitForFiniteAnimations(page)
  const labels = await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').allTextContents()
  for (const label of emptyOptions) assert.ok(!labels.includes(label), `${name}: 空条件通过清空表达`)
  await input.press('Escape')
  await expectLocator(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}
