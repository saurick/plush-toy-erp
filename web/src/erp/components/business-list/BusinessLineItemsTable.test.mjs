import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('自适应列不生成 NaN，明细最小宽度保留数值列、序号与操作栏预算', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Table } = await import('./BusinessLineItemsTable.jsx')
  const diagnostics = []
  const originalError = console.error
  t.mock.method(console, 'error', (...args) => {
    diagnostics.push(args.map(String).join(' '))
    originalError(...args)
  })
  await harness.render(h(Table, { columns: [{ label: '自适应名称' }, { label: '数量', width: 120 }] }))
  assert.equal(document.querySelector('.erp-line-item-table').style.minWidth, '324px')
  await harness.render(h(Table, {
    columns: [{ label: '手机字段', width: 60 }],
    desktopColumns: [{ label: '桌面名称', width: 180 }, { label: '桌面补充资料' }],
    actionsWidth: 80,
  }))
  assert.equal(document.querySelector('.erp-line-item-table').style.minWidth, '304px', '桌面沿用 desktopColumns 和实际操作栏宽度')
  await harness.render(h(Table, { columns: [{ label: '名称', width: 180 }, { label: '数量', width: 120 }] }))
  assert.equal(document.querySelector('.erp-line-item-table').style.minWidth, '504px', '已有固定列宽预算不变')
  assert.equal(diagnostics.some((message) => /NaN[\s\S]*minWidth/u.test(message)), false, '不得向 React 样式传递 NaN')
})

test('product headings can change without remounting a draft row, and portal focus belongs to that row', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: Table, BusinessLineItemGroupHeading: Heading, BusinessLineItemRow: Row }, { createPortal }] = await Promise.all([
    import('./BusinessLineItemsTable.jsx'), import('react-dom'),
  ])
  let setHeading
  function Example() {
    const [heading, update] = React.useState(true)
    setHeading = update
    return h(Table, { columns: [{ label: '数量', width: 160 }], label: '出货明细' }, h(React.Fragment, { key: 'first' }, heading ? h(Heading, { key: 'identity', columnCount: 3 }, '小熊') : null, h(Row, { key: 'line', index: 0, cells: [h('input', { key: 'quantity', defaultValue: '40', 'aria-label': '数量' })] }, h('textarea', { defaultValue: '保留此行包装说明' }), createPortal(h('button', { type: 'button', 'data-reader': true }, '完整值'), document.body))), h(Row, { key: 'second', index: 1, cells: [h('input', { key: 'quantity', defaultValue: '5' })] }))
  }
  await harness.render(h(Example))
  const input = document.querySelector('input[aria-label="数量"]')
  const row = input.closest('tbody')
  await act(() => input.focus())
  await act(() => setHeading(false))
  assert.ok(document.querySelector('input[aria-label="数量"]') === input)
  assert.ok(document.activeElement === input)
  assert.equal(input.value, '40')
  assert.equal(row.querySelector('textarea').value, '保留此行包装说明')
  assert.equal(row.querySelector('.erp-editable-line-group__sequence').rowSpan, 2)
  await act(() => document.querySelector('[data-reader]').focus())
  assert.equal(row.dataset.lineActive, 'true', '完整值浮层内的焦点仍属于原明细')
  const second = document.querySelectorAll('.erp-editable-line-group')[1]
  await act(() => second.querySelector('input').focus())
  assert.equal(row.dataset.lineActive, undefined)
  assert.equal(second.dataset.lineActive, 'true')
})
