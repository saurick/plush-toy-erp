import { expect as expectLocator } from 'playwright/test'
import assert from 'node:assert/strict'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const pickerLayoutSelectors = [
  ['dialog', '.ant-modal-content'],
  ['toolbar', '.erp-source-import-picker__toolbar'],
  ['selection', '.erp-source-import-picker__selection'],
  ['header', '.ant-table-header'],
  ['table', '.ant-table-body'],
  ['pagination', '.erp-source-import-picker__pagination'],
  ['footer', '.ant-modal-footer'],
  ['confirm', '.erp-source-import-picker__footer-actions .ant-btn-primary'],
]

export async function readImportPickerLayout(picker) {
  return picker.evaluate((root, selectors) => Object.fromEntries(selectors.map(([name, selector]) => {
    const box = root.querySelector(selector).getBoundingClientRect()
    let { width } = box
    if (name === 'header') {
      // Compare the complete column lane, including native scrollbar space.
      const body = root.querySelector('.ant-table-body')
      const reserved = root.querySelector('.ant-table-header .ant-table-cell-scrollbar')?.getBoundingClientRect().width || 0
      width += body.offsetWidth - body.clientWidth - reserved
    }
    return [name, { x: box.x, y: box.y, width, height: box.height }]
  })), pickerLayoutSelectors)
}

export async function assertImportPickerStableLayout(picker, before, label) {
  const after = await readImportPickerLayout(picker)
  for (const [name, box] of Object.entries(before)) {
    for (const property of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(after[name][property] - box[property]) <= 1,
        `${label}: ${name}.${property} must stay stable (${box[property]} -> ${after[name][property]}): ${JSON.stringify({ before, after })}`)
    }
  }
}

export async function assertImportPickerStableDuring(picker, label, action) {
  const before = await readImportPickerLayout(picker)
  await picker.evaluate((root, { before, selectors }) => {
    const probe = { active: true, frames: 0, changed: null }
    root.__sourcePickerLayoutProbe = probe
    const sample = () => {
      if (!probe.active) return
      probe.frames += 1
      for (const [name, selector] of selectors) {
        const box = root.querySelector(selector).getBoundingClientRect()
        let { width } = box
        if (name === 'header') {
          const body = root.querySelector('.ant-table-body')
          const reserved = root.querySelector('.ant-table-header .ant-table-cell-scrollbar')?.getBoundingClientRect().width || 0
          width += body.offsetWidth - body.clientWidth - reserved
        }
        for (const property of ['x', 'y', 'width', 'height']) {
          const after = property === 'width' ? width : box[property]
          if (!probe.changed && Math.abs(after - before[name][property]) > 1) {
            probe.changed = { name, property, before: before[name][property], after }
          }
        }
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, { before, selectors: pickerLayoutSelectors })
  let result
  try {
    await action()
    await picker.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  } finally {
    result = await picker.evaluate((root) => {
      const probe = root.__sourcePickerLayoutProbe
      probe.active = false
      delete root.__sourcePickerLayoutProbe
      return { frames: probe.frames, changed: probe.changed }
    })
  }
  assert.ok(result.frames > 0, `${label}: layout frames were sampled`)
  assert.equal(result.changed, null, `${label}: layout changed during interaction ${JSON.stringify(result)}`)
  await assertImportPickerStableLayout(picker, before, label)
}

async function exerciseImportPickerSelectionStability(picker, label) {
  const onlySelected = picker.getByRole('checkbox', { name: '仅看已选', exact: true })
  // Scroll to the control before measuring so deliberate navigation is not
  // mistaken for a layout change caused by filtering or selection.
  await onlySelected.scrollIntoViewIfNeeded()
  const body = picker.locator('.ant-modal-body')
  const scrollTop = await body.evaluate((node) => node.scrollTop)
  const before = await readImportPickerLayout(picker)
  await assertImportPickerStableDuring(picker, `${label}-empty-selection`, () => onlySelected.check())
  await expectLocator(picker.locator('.ant-table-row')).toHaveCount(0)
  await onlySelected.uncheck()
  await picker.locator('.ant-table-row').first().waitFor()
  await assertImportPickerStableLayout(picker, before, `${label}-restored`)
  const firstSelectable = picker.locator('.ant-table-row input[type="checkbox"]:enabled').first()
  await firstSelectable.scrollIntoViewIfNeeded()
  await assertImportPickerStableDuring(picker, `${label}-select`, () => firstSelectable.check())
  await body.evaluate((node, top) => { node.scrollTop = top }, scrollTop)
  await assertImportPickerStableDuring(picker, `${label}-one-selected`, () => onlySelected.check())
  await expectLocator(picker.locator('.ant-table-row')).toHaveCount(1)
  await onlySelected.uncheck()
  await picker.getByRole('button', { name: '清空已选', exact: true }).click()
  await assertImportPickerStableLayout(picker, before, `${label}-cleared`)
  await body.evaluate((node) => { node.scrollTop = 0 })
}

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
      selectionGroups: [...root.querySelectorAll('.erp-source-import-picker__selection-actions, .erp-source-import-picker__selection-summary')].map((node) => ({
        box: box(node),
        overflow: node.scrollWidth > node.clientWidth + 1,
        controls: [...node.children].map(box),
      })),
      footerActions: root.querySelector('.erp-source-import-picker__footer-actions') ? {
        box: box(root.querySelector('.erp-source-import-picker__footer-actions')),
        buttons: [...root.querySelectorAll('.erp-source-import-picker__footer-actions > button')].map(box),
      } : null,
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
  for (const group of layout.selectionGroups) {
    assert.equal(group.overflow, false, `${label}: selection controls and summaries do not overflow: ${JSON.stringify(group)}`)
    assert.ok(group.controls.every((control) => control.left >= group.box.left - 1 && control.right <= group.box.right + 1), `${label}: selection controls remain contained`)
    for (let index = 1; index < group.controls.length; index++) {
      const previous = group.controls[index - 1]; const current = group.controls[index]
      assert.ok(current.left >= previous.right - 1 || current.top >= previous.bottom - 1, `${label}: selection controls cannot overlap`)
    }
  }
  if (layout.footerActions) {
    const { box, buttons } = layout.footerActions
    assert.ok(buttons.every((button) => button.left >= box.left - 1 && button.right <= box.right + 1), `${label}: import counts and footer actions remain contained`)
  }
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
    if (await picker.locator('.erp-source-import-picker').count()) {
      await exerciseImportPickerSelectionStability(picker, `${label}-${viewport.width}`)
    }
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
