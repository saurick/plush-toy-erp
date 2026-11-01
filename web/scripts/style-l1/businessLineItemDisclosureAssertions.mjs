import assert from 'node:assert/strict'

export async function assertBusinessLineItemDisclosure(page, editor) {
  const rows = editor.locator('.erp-editable-line-group')
  const first = editor.getByLabel('第 1 条材料名称', { exact: true })
  const second = editor.getByLabel('第 2 条材料名称', { exact: true })
  const firstNode = await first.elementHandle()
  const secondValue = await second.inputValue()
  const note = editor.getByLabel('第 2 条备注', { exact: true })
  const noteValue = await note.inputValue()
  await second.fill('')
  await editor.getByRole('button', { name: '全部收起', exact: true }).click()
  assert.equal(await rows.count(), 2, '折叠保留所有表单行')
  assert.equal(await rows.first().isVisible(), false)
  assert.equal(await rows.last().isVisible(), false)
  assert.equal(await first.inputValue(), '短毛绒')
  assert.equal(await note.inputValue(), noteValue)
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await second.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '第 2 条材料名称', undefined, { timeout: 5000 })
  assert(await second.evaluate((node) => node === document.activeElement), '整单校验展开并聚焦隐藏组中的错误')
  assert.equal(await rows.first().isVisible(), false, '错误定位不展开无关组')
  await second.fill(secondValue)
  await editor.getByRole('button', { name: '全部展开', exact: true }).click()
  assert.equal(await firstNode.evaluate((node) => node.isConnected), true, '折叠和错误恢复不重建输入节点')
  assert.equal(await note.inputValue(), noteValue)
  await firstNode.dispose()

  const target = page.viewportSize().width >= 768 ? 60 : 8
  for (let index = 3; index <= target; index += 1) {
    await editor.getByRole('button', { name: '添加明细', exact: true }).click()
    await editor.getByLabel(`第 ${index} 条材料名称`, { exact: true }).fill(`演示长单材料 ${index}`)
  }
  assert.equal(await rows.count(), target)
  await editor.getByRole('button', { name: '全部收起', exact: true }).click()
  const hiddenCount = await rows.evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display === 'none').length)
  assert.equal(hiddenCount, target, '长单所有组均可收起，字段仍注册')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  assert.equal(overflow, 0, '分组标题和操作不造成整页横向溢出')
  await editor.getByRole('button', { name: '全部展开', exact: true }).click()
  for (let index = target; index >= 3; index -= 1) {
    await editor.getByRole('button', { name: `移除第 ${index} 条明细`, exact: true }).click()
  }
  assert.equal(await rows.count(), 2)
  assert.equal(await first.inputValue(), '短毛绒')
  assert.equal(await second.inputValue(), secondValue)
  assert.equal(await note.inputValue(), noteValue)
}
