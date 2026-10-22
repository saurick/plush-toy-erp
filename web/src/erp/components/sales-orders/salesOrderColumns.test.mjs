import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Window } from 'happy-dom'
import { createReactTestHarness, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'
import { filterColumnsByEffectiveFieldPolicy } from '../../utils/adminProfileSync.mjs'
import { applyModuleColumnOrder, applyModuleColumnVisibility, buildModuleColumnOrder, resolveModuleHiddenColumns } from '../../utils/moduleTableColumns.mjs'

registerJSXTestLoader()
const { buildSalesOrderColumns, buildSalesOrderListColumns, buildSalesOrderExportColumns, buildSalesOrderColumnProfile } = await import('./salesOrderColumns.jsx')
const source = buildSalesOrderColumns()
const columns = buildSalesOrderListColumns(source)
const byKey = (key) => columns.find((column) => column.dataIndex === key)
const record = {
  order_no: 'SO/001',
  customer_order_no: 'PO/09',
  customer_snapshot: { name: '示例客户' },
  sales_owner: '林晓',
  lifecycle_status: 'active',
  engineering_material_status: 'APPROVED',
  currency: 'USD',
  order_total: '1200.25',
}

async function cell(key, value) {
  const window = new Window()
  window.document.body.innerHTML = renderToStaticMarkup(byKey(key).render(value?.[key], value))
  const result = {
    lines: [...window.document.querySelector('.erp-business-cell-stack').children].map((node) => node.textContent),
    copies: [...window.document.querySelectorAll('button')].map((node) => node.getAttribute('aria-label')),
  }
  await window.happyDOM.close()
  return result
}

test('销售订单四组信息合并为十四列，原始字段仍完整且两种状态独立标识', async () => {
  assert.equal(source.length, 18)
  assert.equal(columns.length, 14)
  assert.deepEqual(await cell('order_no', record), { lines: ['SO/001', '客户单号：PO/09'], copies: ['复制订单号', '复制客户订单号'] })
  assert.deepEqual(await cell('customer_snapshot', record), { lines: ['示例客户', '跟单：林晓'], copies: ['复制客户', '复制业务员（跟单人）'] })
  assert.deepEqual((await cell('lifecycle_status', record)).lines, ['订单：已生效', '用料：已批准采购'])
  assert.equal(byKey('order_total').render(record.order_total, record), 'USD 1200.25')
  assert.equal(byKey('order_total').align, 'right')
  assert(source.some((column) => column.dataIndex === 'customer_order_no'))
})

test('缺失、清空与长内容不补造值，也不留下旧的补充行和复制入口', async () => {
  assert.deepEqual(await cell('order_no', { order_no: 'SO/002' }), { lines: ['SO/002'], copies: ['复制订单号'] })
  assert.deepEqual(await cell('order_no', { customer_order_no: 'PO/03' }), { lines: ['客户单号：PO/03'], copies: ['复制客户订单号'] })
  assert.deepEqual(await cell('order_no', {}), { lines: ['-'], copies: [] })
  assert.deepEqual((await cell('customer_snapshot', { customer_id: 1, sales_owner: '' })).copies, [])
  const longName = '华南仓储与礼品采购服务中心'.repeat(8)
  assert.equal((await cell('customer_snapshot', { customer_snapshot: { name: longName } })).lines[0], longName)
})

test('字段显示策略先于合并，受限客户单号不进入展示、复制、详情或导出', () => {
  const profile = { effective_session: { field_policies: { 'sales_orders.default': { source_no: { visible: false } } } } }
  const permitted = filterColumnsByEffectiveFieldPolicy(source, profile, 'sales_orders.default')
  const list = buildSalesOrderListColumns(permitted)
  assert(!permitted.some((column) => column.dataIndex === 'customer_order_no'))
  assert(!list.some((column) => column.sourceColumnKeys?.includes('customer_order_no')))
  assert(!buildSalesOrderExportColumns(list, permitted).some((column) => column.dataIndex === 'customer_order_no'))
  assert.equal(list.find((column) => column.dataIndex === 'order_no').copyable, true)
})

test('原列偏好按信息组恢复，部分可见保留可见，合并后的隐藏设置刷新仍有效', () => {
  const profile = {
    id: 7,
    erp_preferences: {
      column_orders: { 'sales-orders': ['customer_order_no', ...buildModuleColumnOrder(source).filter((key) => key !== 'customer_order_no')], customers: ['name'] },
      hidden_columns: { 'sales-orders': ['order_no', 'customer_snapshot', 'sales_owner', 'tax_amount'], customers: ['code'] },
    },
  }
  const before = structuredClone(profile)
  const mapped = buildSalesOrderColumnProfile(profile, columns)
  const order = mapped.erp_preferences.column_orders['sales-orders']
  const hidden = mapped.erp_preferences.hidden_columns['sales-orders']
  assert.equal(order.length, 14)
  assert.equal(order[0], 'order_no')
  assert(!hidden.includes('order_no'), '原客户订单号仍可见时保留合并列')
  assert(hidden.includes('customer_snapshot'))
  assert(hidden.includes('tax_amount'))
  assert.deepEqual(profile, before, '不修改账号原对象或其他列表偏好')
  assert.deepEqual(mapped.erp_preferences.column_orders.customers, ['name'])
  assert.deepEqual(buildSalesOrderColumnProfile(mapped, columns), mapped, '已保存的新设置在刷新时不被重新展开')
  assert.equal(buildSalesOrderColumnProfile({ id: 7 }, columns).id, 7)
})

test('隐藏和重排列只改变列表，导出与详情保留所有原字段及字段原值', () => {
  const ordered = applyModuleColumnOrder(columns, ['order_total', 'customer_snapshot', 'order_no'])
  const displayed = applyModuleColumnVisibility(ordered, ['customer_snapshot', 'order_total'])
  assert(!displayed.some((column) => column.dataIndex === 'customer_snapshot'))
  const exported = buildSalesOrderExportColumns(ordered, source)
  assert.equal(exported.length, 18)
  assert.equal(new Set(exported).size, 18)
  assert.deepEqual(exported.slice(0, 4).map((column) => column.dataIndex), ['order_total', 'currency', 'customer_snapshot', 'sales_owner'])
  for (const key of ['order_no', 'customer_order_no', 'customer_snapshot', 'sales_owner', 'lifecycle_status', 'engineering_material_status', 'currency']) {
    assert(exported.includes(source.find((column) => column.dataIndex === key)))
  }
  assert.equal(exported.find((column) => column.dataIndex === 'order_total').exportValue(record), 'USD 1200.25')
})

test('合并列依次按主字段和补充字段排序，金额保留数值比较', () => {
  assert(byKey('order_no').sorter({ order_no: 'A', customer_order_no: 'Z' }, { order_no: 'B', customer_order_no: 'A' }) < 0)
  assert(byKey('order_no').sorter({ order_no: 'A', customer_order_no: 'A' }, { order_no: 'A', customer_order_no: 'B' }) < 0)
  assert(byKey('customer_snapshot').sorter({ customer_snapshot: { name: '相同客户' }, sales_owner: 'A' }, { customer_snapshot: { name: '相同客户' }, sales_owner: 'B' }) < 0)
  assert(byKey('order_total').sorter({ order_total: '20' }, { order_total: '100' }) < 0)
  assert.equal(byKey('lifecycle_status').sorter(record, record), 0)
})

test('编号分别复制原值，点击与双击不会选中或打开订单', async (t) => {
  const runtime = await createReactTestHarness(t)
  const copied = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => copied.push(value) } })
  let selected = 0
  let opened = 0
  await runtime.render(createElement('div', { onClick: () => { selected += 1 }, onDoubleClick: () => { opened += 1 } }, byKey('order_no').render(record.order_no, record)))
  for (const button of runtime.container.querySelectorAll('button')) {
    await runtime.act(async () => button.click())
    await runtime.act(async () => button.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })))
  }
  assert.deepEqual(copied, ['SO/001', 'PO/09'])
  assert.equal(selected, 0)
  assert.equal(opened, 0)
})

test('共享列设置保存合并列后，刷新恢复显隐且导出字段数量保持完整', async (t) => {
  const runtime = await createReactTestHarness(t)
  const { useBusinessColumnOrder } = await import('../business-list/BusinessListToolbarActions.jsx')
  let preferences = { column_orders: { 'sales-orders': buildModuleColumnOrder(source) }, hidden_columns: {} }
  let controls
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.equal(request.method, 'set_erp_column_order')
    const { order, hidden_columns: hidden } = request.params
    assert.equal(order.length, 14)
    preferences = { column_orders: { 'sales-orders': order }, hidden_columns: { 'sales-orders': hidden } }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { code: 0, data: { erp_preferences: preferences } } }))
  })
  function Probe() {
    const profile = buildSalesOrderColumnProfile({ id: 7, is_super_admin: true, erp_preferences: preferences }, columns)
    controls = useBusinessColumnOrder({ adminProfile: profile, moduleKey: 'sales-orders', moduleTitle: '销售订单', columns })
    return null
  }
  localStorage.setItem('admin_access_token', 'test-sales-column-order')
  await runtime.render(createElement(Probe, { key: 'initial' }))
  assert.equal(controls.tableColumns.length, 14)
  const order = ['order_total', ...buildModuleColumnOrder(columns).filter((key) => key !== 'order_total')]
  await runtime.act(async () => assert.equal(await controls.columnOrderModal.props.onChange(order, ['customer_snapshot']), true))
  await runtime.render(createElement(Probe, { key: 'reload' }))
  assert.equal(controls.tableColumns[0].dataIndex, 'order_total')
  assert(!controls.tableColumns.some((column) => column.dataIndex === 'customer_snapshot'))
  assert.equal(buildSalesOrderExportColumns(controls.exportColumns, source).length, 18)
  assert.deepEqual(resolveModuleHiddenColumns(order, ['customer_snapshot'], columns), ['customer_snapshot'])
})
