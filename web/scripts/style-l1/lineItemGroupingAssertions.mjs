import assert from 'node:assert/strict'

export async function assertLineItemGrouping(table) {
  const groups = table.locator('.erp-editable-line-group')
  assert.ok(await groups.count() >= 2, '分组验证需要相邻两条真实明细')
  const layout = await groups.evaluateAll((nodes) => nodes.map((node) => {
    const bounds = node.getBoundingClientRect()
    const sequence = node.querySelector('.erp-editable-line-group__sequence')
    const sequenceBounds = sequence?.getBoundingClientRect()
    const supplement = node.querySelector('.erp-line-item-supplement')
    const style = getComputedStyle(node)
    return {
      background: style.backgroundColor,
      height: bounds.height,
      sequenceHeight: sequenceBounds?.height,
      sequenceRight: sequenceBounds?.right,
      sequenceSpan: sequence?.rowSpan,
      supplementLeft: supplement?.getBoundingClientRect().left,
      display: style.display,
      separator: style.borderTopWidth,
      cellSeparators: [...node.querySelector('tr').children].map((cell) => getComputedStyle(cell).borderTopWidth),
    }
  }))
  assert.notEqual(layout[0].background, layout[1].background, '相邻明细应有整组交替底色')
  for (const row of layout) {
    assert.equal(row.sequenceSpan, 2, '序号覆盖主行与补充字段')
    assert.ok(Math.abs(row.sequenceHeight - row.height) <= 3, `序号栏覆盖整组高度：${JSON.stringify(row)}`)
    if (row.supplementLeft !== undefined) {
      assert.ok(row.supplementLeft >= row.sequenceRight, '补充字段保持在序号栏右侧')
    }
  }
  assert.ok(parseFloat(layout[1].separator) >= 2, '组间边界应强于组内边界')
  if (layout[1].display === 'block') {
    assert.ok(layout[1].cellSeparators.every((border) => parseFloat(border) === 0), '窄屏只分隔整组，不在内部字段重复绘制横线')
  }

  const note = groups.nth(1).getByRole('textbox').last()
  const original = await note.inputValue()
  await note.fill('整条明细归属核对，长备注保持在当前分组。'.repeat(3))
  const focused = await groups.evaluateAll((nodes) => nodes.map((node) => ({
    focused: node.matches(':focus-within'),
    outline: getComputedStyle(node).outlineStyle,
    outlineWidth: getComputedStyle(node).outlineWidth,
    numberBackground: getComputedStyle(node.querySelector('.erp-editable-line-group__number')).backgroundColor,
  })))
  assert.equal(focused[0].focused, false)
  assert.equal(focused[1].focused, true)
  assert.equal(focused[1].outline, 'solid')
  assert.equal(focused[1].outlineWidth, '1px')
  assert.notEqual(focused[0].numberBackground, focused[1].numberBackground, '当前明细序号跟随输入焦点')
  await note.fill(original)
  await groups.first().getByRole('textbox').first().click()
  assert.equal(await groups.nth(1).evaluate((node) => getComputedStyle(node).outlineStyle), 'none', '离开后清除上一条焦点提示')
  return layout
}
