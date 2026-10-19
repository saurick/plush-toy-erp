import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('手机业务资料保留所有有值字段、数值零和否，缺值可展开，字段权限沿用共享映射', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Details } = await import('../../components/business-list/BusinessRecordDetails.jsx')
  const columns = [
    { title: '单号', dataIndex: 'no', copyable: true, detailCopyable: true },
    { title: '数量（个）', dataIndex: 'quantity' },
    { title: '金额（USD）', dataIndex: 'amount' },
    { title: '冻结', dataIndex: 'frozen' },
    { title: '包装要求', dataIndex: 'packaging' },
    { title: '无权读取的字段', dataIndex: 'secret', hiddenByEffectiveFieldPolicy: true },
  ]
  const record = { no: 'SHIP-LONG-20261019-000000000000001', quantity: 0, amount: '0.00', frozen: false, packaging: null, secret: '不可泄露' }
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record }))
  assert.equal(document.querySelector('.ant-descriptions'), null)
  const fields = [...document.querySelectorAll('.mobile-task-facts > dl > div')]
  assert.deepEqual(fields.map((field) => field.querySelector('dt').textContent), ['单号', '数量（个）', '金额（USD）', '冻结'])
  assert.deepEqual(fields.slice(1).map((field) => field.querySelector('dd').textContent), ['0', '0.00', '否'])
  assert.ok(fields[0].classList.contains('mobile-task-facts__field--wide'))
  assert.doesNotMatch(document.body.textContent, /无权读取|不可泄露/u)
  const more = document.querySelector('.mobile-task-facts__empty')
  assert.equal(more.open, false)
  await harness.click(more.querySelector('summary'))
  assert.equal(more.open, true)
  assert.match(more.textContent, /包装要求/u)
  await harness.render(h(Details, { columns, record }))
  assert.ok(document.querySelector('.ant-descriptions'))
  assert.match(document.body.textContent, /包装要求/u)
  assert.doesNotMatch(document.body.textContent, /不可泄露/u)
})

test('出货净重缺失与最终重量口径保持默认可见，不并入空信息', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: Details }, { buildShipmentColumns }, { ShipmentStatus }] = await Promise.all([
    import('../../components/business-list/BusinessRecordDetails.jsx'),
    import('../../components/shipments/shipmentColumns.jsx'),
    import('../../../common/consts/statuses.generated.mjs'),
  ])
  const column = buildShipmentColumns({ salesOrdersByID: new Map() }).find((item) => item.dataIndex === 'total_net_weight_g')
  for (const [status, total_net_weight_g, expected] of [
    [ShipmentStatus.DRAFT, null, '待确认'],
    [ShipmentStatus.SHIPPED, null, '未记录'],
    [ShipmentStatus.SHIPPED, '1500', '最终 1500 克'],
    [ShipmentStatus.DRAFT, '0', '实际 0 克'],
  ]) {
    await harness.render(h(Details, { presentation: 'mobile-task', columns: [column], record: { status, total_net_weight_g } }))
    assert.equal(document.querySelector('.mobile-task-facts__empty'), null)
    assert.match(document.querySelector('.mobile-task-facts > dl').textContent, /总净重（克）/u)
    assert.equal(document.querySelector('.mobile-task-facts dd').textContent, expected)
  }
})
