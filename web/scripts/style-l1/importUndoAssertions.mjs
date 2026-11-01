import assert from 'node:assert/strict'

export async function assertImportUndoPlacement(editor, { narrow = false } = {}) {
  await editor.locator('.erp-business-import-actions').scrollIntoViewIfNeeded()
  const metrics = await editor.locator('.erp-business-import-actions').evaluate((node) => {
    const buttons = [...node.querySelectorAll('button')]
    const box = (element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }
    return {
      inHeader: Boolean(node.closest('.erp-sales-order-lines-form__head, .erp-bom-material-groups__heading')),
      texts: buttons.map((button) => button.textContent.trim()),
      boxes: buttons.map(box),
      viewport: window.innerWidth,
    }
  })
  assert.equal(metrics.inHeader, true, '撤销和导入必须位于明细标题的操作区')
  assert.equal(metrics.texts[0], '撤销本次导入')
  assert.equal(metrics.boxes.length, 2, '撤销与来源导入构成相邻操作组')
  const [undo, source] = metrics.boxes
  assert(undo.right <= source.left + 1 || undo.bottom <= source.top + 1, JSON.stringify(metrics))
  if (!narrow) assert(Math.abs(undo.top - source.top) <= 1, '桌面撤销位于导入左侧，同一基线')
  for (const box of metrics.boxes) assert(box.left >= -1 && box.right <= metrics.viewport + 1, JSON.stringify(metrics))
  assert.equal(await editor.locator('.erp-business-source-summary button').count(), 0, '来源摘要只展示来源，不放撤销操作')
}
