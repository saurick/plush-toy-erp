import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

const columns = [
  { dataIndex: 'number', title: '单号' },
  { dataIndex: 'party', title: '客户' },
  { dataIndex: 'amount', title: '金额', defaultHidden: true },
  { dataIndex: 'note', title: '备注', defaultHidden: true },
]

async function modalHarness(t, initial = {}) {
  const runtime = await createReactTestHarness(t)
  const { ColumnOrderModal } = await import('./ColumnOrderModal.jsx')
  const saves = [], closes = []
  let props = {
    open: true, columns, order: [], hiddenColumns: ['amount', 'note'],
    moduleTitle: '销售订单',
    onChange: async (...settings) => { saves.push(settings); return false },
    onClose: () => closes.push(true),
    ...initial,
  }
  const update = async (patch = {}) => {
    props = { ...props, ...patch }
    await runtime.render(createElement(ColumnOrderModal, props))
    await runtime.flush()
  }
  await update()
  const dialog = () => document.querySelector('.erp-business-action-modal--columns')
  const checkbox = (label) => [...dialog().querySelectorAll('.ant-checkbox-wrapper')]
    .find(node => node.textContent.trim() === label)?.querySelector('input')
  const button = (label) => [...dialog().querySelectorAll('button')]
    .find(node => node.getAttribute('aria-label') === label || node.textContent.replace(/\s/gu, '') === label)
  const click = async (node) => { assert(node, '操作入口存在'); await runtime.act(async () => node.click()); await runtime.flush() }
  const rowOrder = () => [...dialog().querySelectorAll('[data-column-key]')].map(row => row.dataset.columnKey)
  return { ...runtime, update, dialog, checkbox, button, click, rowOrder, saves, closes }
}

test('列设置保留未完成的调整，普通重绘、保存中和失败重试不重置草稿', async (t) => {
  const ui = await modalHarness(t)
  await ui.click(ui.checkbox('金额'))
  await ui.click(ui.checkbox('客户'))
  await ui.click(ui.button('金额 移到最前'))
  assert.equal(ui.saves.length, 0)
  assert.match(ui.dialog().textContent, /已选 2 \/ 4 列/u)
  assert.match(ui.dialog().textContent, /有未保存的调整/u)

  const freshProps = () => ({ columns: columns.map(column => ({ ...column })), order: [], hiddenColumns: ['amount', 'note'] })
  await ui.update({ ...freshProps(), saving: true })
  assert.equal(ui.checkbox('金额').checked, true)
  assert.equal(ui.checkbox('客户').checked, false)
  assert.equal(ui.rowOrder()[0], 'amount')
  assert.equal(ui.button('取消').disabled, true)
  assert.equal(ui.checkbox('金额').disabled, true)
  await ui.update({ ...freshProps(), saving: false })
  await ui.click(ui.button('完成'))
  assert.equal(ui.saves.length, 1)
  assert.deepEqual(ui.saves[0], [['amount', 'number', 'party', 'note'], ['note', 'party']])
  assert.equal(ui.closes.length, 0, '失败时仍可继续调整和重试')
  await ui.update(freshProps())
  assert.equal(ui.checkbox('金额').checked, true)
  assert.equal(ui.rowOrder()[0], 'amount')
})

test('取消与关闭放弃草稿，恢复默认也须点击完成才保存', async (t) => {
  const ui = await modalHarness(t, { order: ['party', 'number', 'amount', 'note'], hiddenColumns: ['note'] })
  await ui.click(ui.checkbox('备注'))
  await ui.click(ui.button('取消'))
  assert.equal(ui.closes.length, 1)
  assert.equal(ui.saves.length, 0)
  await ui.update({ open: false })
  await ui.update({ open: true })
  assert.equal(ui.checkbox('备注').checked, false)
  assert.equal(ui.rowOrder()[0], 'party')

  await ui.click(ui.button('恢复默认'))
  assert.deepEqual(ui.rowOrder(), ['number', 'party', 'amount', 'note'])
  assert.equal(ui.checkbox('金额').checked, false)
  assert.equal(ui.saves.length, 0)
  await ui.click(ui.button('取消'))
  await ui.update({ open: false })
  await ui.update({ open: true })
  assert.equal(ui.checkbox('金额').checked, true)
  assert.equal(ui.rowOrder()[0], 'party', '取消恢复默认应保留原设置')

  await ui.click(ui.button('恢复默认'))
  await ui.click(ui.button('完成'))
  assert.deepEqual(ui.saves[0], [['number', 'party', 'amount', 'note'], ['amount', 'note']])
})

test('列权限与新增列变化保留有效草稿，新增可选列可开启，至少保留一列', async (t) => {
  const ui = await modalHarness(t)
  await ui.click(ui.checkbox('金额'))
  await ui.click(ui.button('客户 移到最前'))
  await ui.update({ columns: [...columns.map(column => ({ ...column, hiddenByEffectiveFieldPolicy: column.dataIndex === 'amount' })), { dataIndex: 'phone', title: '电话', defaultHidden: true }] })
  assert.equal(ui.checkbox('金额'), undefined, '个人设置不能开放受限列')
  assert.equal(ui.rowOrder()[0], 'party')
  assert.equal(ui.checkbox('电话').checked, false)
  await ui.click(ui.checkbox('电话'))
  assert.equal(ui.checkbox('电话').checked, true)
  await ui.click(ui.checkbox('单号'))
  await ui.click(ui.checkbox('电话'))
  assert.equal(ui.checkbox('客户').disabled, true)
  assert.match(ui.dialog().textContent, /已选 1 \/ 4 列/u)
})

test('共享列设置通过既有 RPC 按账号和列表保存，重新挂载从账号偏好恢复', async (t) => {
  const runtime = await createReactTestHarness(t)
  const { useBusinessColumnOrder } = await import('./BusinessListToolbarActions.jsx')
  const preferences = { 1: { column_orders: {}, hidden_columns: {} }, 2: { column_orders: {}, hidden_columns: {} } }
  const requests = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.equal(request.method, 'set_erp_column_order')
    assert.deepEqual(Object.keys(request.params).sort(), ['hidden_columns', 'module_key', 'order'])
    const account = options.headers.Authorization.slice('Bearer account-'.length)
    const stored = preferences[account]
    const { module_key: module, order, hidden_columns: hidden } = request.params
    if (order.length) stored.column_orders[module] = order
    else delete stored.column_orders[module]
    if (hidden.length) stored.hidden_columns[module] = hidden
    else delete stored.hidden_columns[module]
    requests.push({ account, module })
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { code: 0, data: { erp_preferences: structuredClone(stored) } } }), { status: 200 })
  })
  let controls, mount = 0
  function Probe({ profile, module }) {
    controls = useBusinessColumnOrder({ adminProfile: profile, moduleKey: module, moduleTitle: '订单', columns })
    return null
  }
  const enter = async (account, module, refresh = false) => {
    localStorage.setItem('admin_access_token', `account-${account}`)
    await runtime.render(createElement(Probe, { key: refresh ? ++mount : mount, profile: { id: account, is_super_admin: true, erp_preferences: structuredClone(preferences[account]) }, module }))
  }
  const visible = () => controls.tableColumns.map(column => column.dataIndex)
  const save = async (order, hidden) => runtime.act(async () => assert.equal(await controls.columnOrderModal.props.onChange(order, hidden), true))
  await enter(1, 'customers')
  await save(['party', 'number', 'amount', 'note'], ['amount', 'note'])
  assert.deepEqual(visible(), ['party', 'number'])
  await enter(1, 'suppliers')
  assert.deepEqual(visible(), ['number', 'party'])
  await save(['note', 'number', 'party', 'amount'], ['amount'])
  await enter(2, 'customers')
  assert.deepEqual(visible(), ['number', 'party'], '另一个账号采用自己的推荐列')
  await save(['amount', 'number', 'party', 'note'], ['note'])
  await enter(1, 'customers', true)
  assert.deepEqual(visible(), ['party', 'number'], '刷新后恢复该账号该列表的显隐和顺序')
  await save(['number', 'party', 'amount', 'note'], ['amount', 'note'])
  assert.deepEqual(preferences[1].column_orders.customers, undefined)
  assert.deepEqual(preferences[1].hidden_columns.customers, undefined)
  assert.deepEqual(preferences[1].column_orders.suppliers, ['note', 'number', 'party', 'amount'])
  assert.deepEqual(preferences[2].column_orders.customers, ['amount', 'number', 'party', 'note'])
  assert.equal(requests.length, 4)
})

test('账号切换后，旧账号尚未完成的列设置响应不得覆盖当前列表', async (t) => {
  const runtime = await createReactTestHarness(t)
  const { useBusinessColumnOrder } = await import('./BusinessListToolbarActions.jsx')
  let finish, request, controls, pendingSave
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    request = JSON.parse(options.body)
    return new Promise(resolve => { finish = resolve })
  })
  function Probe({ account }) {
    controls = useBusinessColumnOrder({ adminProfile: { id: account, erp_preferences: { column_orders: {}, hidden_columns: {} } }, moduleKey: 'customers', columns })
    return null
  }
  localStorage.setItem('admin_access_token', 'account-1')
  await runtime.render(createElement(Probe, { account: 1 }))
  await runtime.act(async () => { pendingSave = controls.columnOrderModal.props.onChange(['amount', 'party', 'number', 'note'], ['note']) })
  localStorage.setItem('admin_access_token', 'account-2')
  await runtime.render(createElement(Probe, { account: 2 }))
  await runtime.act(async () => {
    finish(new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { code: 0, data: { erp_preferences: { column_orders: { customers: ['amount', 'party', 'number', 'note'] }, hidden_columns: { customers: ['note'] } } } } }), { status: 200 }))
    assert.equal(await pendingSave, false)
  })
  assert.deepEqual(controls.tableColumns.map(column => column.dataIndex), ['number', 'party'])
})
