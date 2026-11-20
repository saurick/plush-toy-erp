import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('动态显示联系人主联系人列时保留草稿字段、焦点和表头语义', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Table } = await import('./BusinessLineTable.jsx')
  let setMultiple
  function Example() {
    const [multiple, update] = React.useState(false)
    setMultiple = update
    const nameCell = h('td', null, h('input', { 'aria-label': '联系人姓名', defaultValue: '演示联系人' }))
    const primaryCell = multiple ? h('td', null, h('input', { type: 'radio', 'aria-label': '设为主联系人' })) : null
    return h(Table, {
      label: '联系人',
      header: h('div', { 'data-test-header': true }, '联系人'),
      columns: [{ key: 'name', label: '联系人', required: true, hint: '填写联系人姓名' }, ...(multiple ? [{ key: 'primary', label: '主联系人' }] : [])],
    }, h('tbody', null, h('tr', null, nameCell, primaryCell)))
  }
  await harness.render(h(Example))
  const name = document.querySelector('input[aria-label="联系人姓名"]')
  assert.equal(document.querySelector('[data-test-header]').nextElementSibling === document.querySelector('table').parentElement, true, '标题与表框在同一基础组件内直接相邻')
  name.value = '未保存的联系人'
  name.focus()
  const updateMultiple = setMultiple
  for (const multiple of [true, false, true]) {
    await act(() => updateMultiple(multiple))
    assert.equal(document.querySelector('input[aria-label="联系人姓名"]') === name, true)
    assert.equal(document.activeElement === name, true)
    assert.equal(name.value, '未保存的联系人')
    assert.equal(document.querySelectorAll('thead th').length, multiple ? 2 : 1)
    assert.equal(document.querySelectorAll('thead input, thead button').length, 0, '列头不复制输入或业务动作')
    assert.equal(document.querySelector('thead th').scope, 'col')
    assert.equal(document.querySelector('thead th').title, '填写联系人姓名')
    assert.equal(document.querySelector('thead th span').getAttribute('aria-hidden'), 'true')
  }
})
