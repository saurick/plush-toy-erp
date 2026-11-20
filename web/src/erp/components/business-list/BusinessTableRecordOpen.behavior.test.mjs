import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('原生双击遇到选择工具栏位移时只打开原记录，并拒绝交互控件、失效或歧义来源', async (t) => {
  const { render, act } = await createReactTestHarness(t)
  const { useBusinessTableRecordOpen } = await import('./BusinessListLayout.jsx')
  let top = 100
  let rows = [{ id: 1, number: '原记录' }]
  const opened = []
  let selected = 0
  let headerClicks = 0
  function Table() {
    const interaction = useBusinessTableRecordOpen({ dataSource: rows, rowKey: 'id', onRow: () => ({ onClick: () => { selected += 1 } }), onOpenRecord: (record) => opened.push(record) })
    return createElement('div', { onClickCapture: interaction.onClickCapture, onDoubleClickCapture: interaction.onDoubleClickCapture }, createElement('button', { id: 'header', onClick: () => { headerClicks += 1 } }, '排序'), createElement('div', { id: 'row', ...interaction.onRow(rows[0]) }, createElement('span', { id: 'cell' }, '原记录'), createElement('button', { id: 'action' }, '行操作')))
  }
  await render(createElement(Table))
  const row = document.getElementById('row')
  row.getBoundingClientRect = () => ({ top })
  row.getClientRects = () => [{ top }]
  const click = async (id, detail, x = 40) => act(async () => document.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, detail, clientX: x, clientY: 120 })))
  const arm = async () => { top = 100; await click('cell', 1); top = 139 }
  await arm()
  rows = [{ id: 1, number: '当前版本' }]
  await render(createElement(Table))
  await click('header', 2)
  assert.deepEqual(opened, [rows[0]], '使用相同唯一键的当前记录，不能打开旧快照或误排表头')
  assert.equal(headerClicks, 0)
  assert.equal(selected, 1)
  await act(async () => document.getElementById('cell').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2, clientX: 40, clientY: 120 })))
  assert.equal(opened.length, 1, '后续原生 dblclick 不能再次打开落点处记录')

  await click('cell', 1)
  await click('header', 2)
  assert.equal(opened.length, 1, '没有位移时不截获原生表头点击')
  assert.equal(headerClicks, 1)
  await arm()
  await click('header', 2, 50)
  assert.equal(opened.length, 1, '用户改变落点后不能打开原记录')
  await click('action', 1)
  top = 178
  await click('header', 2)
  assert.equal(opened.length, 1, '行操作不产生记录打开意图')

  await arm()
  rows = [{ id: 2, number: '其他记录' }]
  await render(createElement(Table))
  await click('header', 2)
  assert.equal(opened.length, 1, '原键已移出结果时不打开其他记录')
  await arm()
  rows = [rows[0], { ...rows[0] }]
  await render(createElement(Table))
  await click('header', 2)
  assert.equal(opened.length, 1, '重复键不能猜测记录')
})
