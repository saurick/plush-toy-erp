import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('紧凑出货资料保留字段、额外资料、复制和图片入口，完整单据沿用原布局', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: Details }, { buildShipmentColumns }] = await Promise.all([
    import('./BusinessRecordDetails.jsx'),
    import('../shipments/shipmentColumns.jsx'),
  ])
  const labels = ['出货单号', '状态', '财务审批', '来源单据', '客户', '明细行', '总净重（克）', '备注']
  const columns = buildShipmentColumns({ salesOrdersByID: new Map([[1, { order_no: 'YS8-XD-013' }]]) })
    .filter((column) => labels.includes(column.title))
  let opened = 0
  columns.unshift({ key: 'product_gallery', title: '产品图片', taskDetailRole: 'media', render: () => h('button', { onClick: () => { opened += 1 } }, '查看 18 款产品图片') })
  columns.push({ title: '额外参考', dataIndex: 'reference', taskDetailRole: 'unrecognized' })
  const record = { shipment_no: 'TEST-YS-260927V8-CK901', status: 'DRAFT', finance_release_status: 'PENDING', sales_order_id: 1, customer_snapshot: '模拟客户', total_net_weight_g: null, note: '分批出货', items: Array.from({ length: 25 }, () => ({})), reference: '独立业务资料' }
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record }))
  const card = document.querySelector('.mobile-task-facts')
  assert.deepEqual([...card.querySelectorAll('dt')].map((node) => node.textContent).sort(), [...labels, '产品图片', '额外参考'].sort())
  assert.match(card.querySelector('.mobile-task-facts__identity').textContent, /出货单号TEST-YS-260927V8-CK901/u)
  assert.equal(card.querySelector('.mobile-task-facts__state dd').textContent, '草稿')
  assert.deepEqual([...card.querySelectorAll('.mobile-task-facts__grid dt')].map((node) => node.textContent), ['来源单据', '客户', '总净重（克）', '财务审批', '明细行', '备注', '额外参考'])
  assert.match(card.textContent, /待确认.*待放行.*25.*分批出货.*独立业务资料/su)
  await harness.click(harness.button('查看 18 款产品图片'))
  assert.equal(opened, 1)
  const writes = []
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { writes.push(value) } } })
  try {
    await harness.click(card.querySelector('[aria-label="复制来源单据"]'))
    assert.deepEqual(writes, ['YS8-XD-013'])
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor)
    else delete navigator.clipboard
  }
  await harness.render(h(Details, { columns, record }))
  assert.equal(document.querySelector('.mobile-task-facts') === null, true)
  assert.equal(Boolean(document.querySelector('.ant-descriptions')), true)
  assert.match(document.querySelector('.ant-descriptions').textContent, /额外参考.*独立业务资料/su)
})

test('字段角色不越过显示权限，零值和否保留，切换对象清除旧身份与图片入口', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Details } = await import('./BusinessRecordDetails.jsx')
  const columns = [
    { title: '单号', dataIndex: 'number', taskDetailRole: 'identity' },
    { title: '状态', dataIndex: 'status', taskDetailRole: 'status' },
    { title: '产品图片', taskDetailRole: 'media', render: () => h('button', null, '查看图片') },
    { title: '数量', dataIndex: 'quantity' },
    { title: '冻结', dataIndex: 'frozen' },
  ]
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { number: 'SIM-OLD', status: '草稿', quantity: 0, frozen: false } }))
  assert.deepEqual([...document.querySelectorAll('.mobile-task-facts__grid dd')].map((node) => node.textContent), ['0', '否'])
  await harness.render(h(Details, { presentation: 'mobile-task', columns: columns.map((column, index) => index < 3 ? { ...column, hiddenByEffectiveFieldPolicy: true } : column), record: { number: '不可读取的新单号', status: '未放行', quantity: 0, frozen: false } }))
  assert.doesNotMatch(document.querySelector('.mobile-task-facts').textContent, /SIM-OLD|不可读取|未放行|产品图片|查看图片/u)
  assert.equal(document.querySelectorAll('.mobile-task-facts__identity, .mobile-task-facts__state, .mobile-task-facts__media').length, 0)
  assert.deepEqual([...document.querySelectorAll('.mobile-task-facts dd')].map((node) => node.textContent), ['0', '否'])
})

test('短复制值与短缺值提示可并排，长文字和缺值原因完整展示并随新值清除', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Details } = await import('./BusinessRecordDetails.jsx')
  const columns = [
    { title: '来源单据', dataIndex: 'source', detailCopyable: true },
    { title: '资料确认', dataIndex: 'confirmed', taskDetailEmptyValue: (record) => record.confirmed == null ? { text: '待确认', reason: record.reason } : null },
    { title: '备注', dataIndex: 'note' },
  ]
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { source: 'SIM-01', confirmed: null } }))
  assert.equal(document.querySelectorAll('.mobile-task-facts__field--wide').length, 0)
  const note = '完整保留收货、包装、唛头和每批出货的核对要求。'.repeat(8)
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { source: 'SIM-02', confirmed: null, reason: '收货信息尚待确认', note } }))
  assert.equal(document.querySelectorAll('.mobile-task-facts__field--wide').length, 2)
  assert.equal(document.querySelector('[data-field-key="note"] dd').textContent, note)
  assert.equal(document.querySelector('.mobile-task-facts__note').textContent, '收货信息尚待确认')
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { source: 'SIM-03', confirmed: false } }))
  assert.match(document.querySelector('.mobile-task-facts').textContent, /SIM-03.*资料确认否/su)
  assert.doesNotMatch(document.querySelector('.mobile-task-facts').textContent, /SIM-01|SIM-02|待确认|收货信息|备注/u)
})
