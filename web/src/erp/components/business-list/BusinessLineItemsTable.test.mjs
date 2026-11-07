import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('自适应列不生成 NaN，明细宽度预算业务列、补充与序号', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Table } = await import('./BusinessLineItemsTable.jsx')
  const diagnostics = []
  const originalError = console.error
  t.mock.method(console, 'error', (...args) => {
    diagnostics.push(args.map(String).join(' '))
    originalError(...args)
  })
  await harness.render(h(Table, { columns: [{ label: '自适应名称' }, { label: '数量', width: 120 }] }))
  assert.equal(document.querySelector('.erp-line-item-table').style.minWidth, '208px')
  assert.deepEqual([...document.querySelectorAll('thead th')].slice(0, 2).map((cell) => cell.textContent), ['补充', '序号'])
  await harness.render(h(Table, {
    columns: [{ label: '手机字段', width: 60 }],
    desktopColumns: [{ label: '桌面名称', width: 180 }, { label: '桌面补充资料' }],
  }))
  assert.equal(document.querySelector('.erp-line-item-table').style.minWidth, '268px', '桌面预算 desktopColumns 和两个辅助列')
  await harness.render(h(Table, { columns: [{ label: '名称', width: 180 }, { label: '数量', width: 120 }] }))
  assert.equal(document.querySelector('.erp-line-item-table').style.minWidth, '388px', '原业务列宽保留，右侧操作列预算移除')
  assert.equal(document.querySelectorAll('.erp-line-item-table__actions').length, 0)
  assert.equal(diagnostics.some((message) => /NaN[\s\S]*minWidth/u.test(message)), false, '不得向 React 样式传递 NaN')
})

test('独立材料分组复用标题交互，不生成表格行且单组保持直接录入', async (t) => {
  const harness = await businessFormHarness(t)
  const { BusinessLineItemGroupHeading: Heading } = await import('./BusinessLineItemsTable.jsx')
  let toggles = 0
  await harness.render(h(Heading, { standalone: true, label: '采购面料', count: 2, collapsed: true, onToggle: () => { toggles += 1 } }, h('div', null, '采购第 1 行 · 采购面料')))
  assert.equal(document.querySelectorAll('tbody, tr, td').length, 0)
  const toggle = document.querySelector('.erp-line-item-disclosure-heading__toggle')
  await act(() => toggle.click())
  assert.equal(toggles, 1)
  await harness.render(h(Heading, { standalone: true, label: '采购面料', count: 1 }, '采购面料'))
  assert.equal(document.querySelectorAll('button').length, 0, '单个材料不增加折叠操作')
  assert.equal(document.querySelector('.erp-line-item-disclosure-heading__title').textContent, '采购面料')
})

test('分组标题使用整行原生按钮，图片预览独立且切换不重建草稿', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: Table, BusinessLineItemGroupHeading: Heading, BusinessLineItemRow: Row }] = await Promise.all([
    import('./BusinessLineItemsTable.jsx'),
  ])
  let previews = 0
  function Example() {
    const [collapsed, setCollapsed] = React.useState(false)
    const title = h('span', null, h('button', { type: 'button', 'data-preview': true, onClick: () => { previews += 1 } }, '查看小熊大图'), '小熊')
    const heading = h(Heading, { columnCount: 3, collapsed, onToggle: () => setCollapsed((value) => !value), label: '小熊', count: 2 }, title)
    const row = h(Row, { index: 0, cells: [h('input', { key: 'quantity', defaultValue: '40', 'aria-label': '数量' })] })
    return h(Table, { columns: [{ label: '数量', width: 160 }] }, heading, row)
  }
  await harness.render(h(Example))
  const heading = document.querySelector('.erp-line-item-disclosure-heading')
  const toggle = heading.querySelector('.erp-line-item-disclosure-heading__toggle')
  const preview = heading.querySelector('[data-preview]')
  const input = document.querySelector('input[aria-label="数量"]')
  assert.equal(toggle.tagName, 'BUTTON')
  assert.equal(toggle.type, 'button', '展开不提交所属表单')
  assert.equal(toggle.textContent, '', '每组不再显示独立的展开或收起文字按钮')
  assert.equal(toggle.getAttribute('aria-label'), '收起小熊')
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(heading.querySelectorAll('button button').length, 0, '产品图片预览不嵌套在展开按钮中')
  await act(() => toggle.click())
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(toggle.getAttribute('aria-label'), '展开小熊')
  await act(() => preview.click())
  assert.equal(previews, 1)
  assert.equal(toggle.getAttribute('aria-expanded'), 'false', '独立预览不切换分组状态')
  await act(() => toggle.click())
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(document.querySelector('input[aria-label="数量"]') === input, true)
  assert.equal(input.value, '40')
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
    return h(Table, { columns: [{ label: '数量', width: 160 }], label: '出货明细' }, h(React.Fragment, { key: 'first' }, heading ? h(Heading, { key: 'identity', columnCount: 3 }, '小熊') : null, h(Row, { key: 'line', index: 0, defaultDetailsOpen: true, cells: [h('input', { key: 'quantity', defaultValue: '40', 'aria-label': '数量' })] }, h('textarea', { defaultValue: '保留此行包装说明' }), createPortal(h('button', { type: 'button', 'data-reader': true }, '完整值'), document.body))), h(Row, { key: 'second', index: 1, cells: [h('input', { key: 'quantity', defaultValue: '5' })] }))
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
