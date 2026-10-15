export async function assertMobileFilterConsistency({ assert, quick, applied }) {
  await applied.waitFor()
  await applied.page().evaluate(() => document.fonts.ready)
  const quickBox = await quick.boundingBox()
  const appliedBox = await applied.boundingBox()
  assert(quickBox.y + quickBox.height <= appliedBox.y + 1, '已选条件应在快捷筛选下方')
  assert(Math.abs(quickBox.x - appliedBox.x) <= 1, '两组筛选左侧对齐')
  const readStyle = (node) => {
    const style = getComputedStyle(node)
    return Object.fromEntries(['fontSize', 'fontWeight', 'borderRadius', 'borderColor', 'backgroundColor', 'color', 'padding'].map((key) => [key, style[key]]))
  }
  const selected = quick.locator('button[aria-pressed="true"]').first()
  const expected = await selected.evaluate(readStyle)
  for (const chip of await applied.getByRole('button').all()) {
    assert.deepEqual(await chip.evaluate(readStyle), expected, '已选条件复用快捷筛选的选中样式')
    assert.equal(await chip.locator('.erp-filter-chip__clear').count(), 1)
    const metrics = await chip.evaluate((node) => {
      const box = node.getBoundingClientRect()
      const close = node.querySelector('.erp-filter-chip__clear').getBoundingClientRect()
      return { height: box.height, overflow: node.scrollWidth - node.clientWidth, closeInside: close.left >= box.left && close.right <= box.right && close.bottom <= box.bottom }
    })
    assert(metrics.height >= 44 && metrics.overflow <= 1 && metrics.closeInside, JSON.stringify(metrics))
  }
}
