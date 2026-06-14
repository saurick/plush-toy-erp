import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCustomerSnapshot,
  buildMasterDataParams,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  formatUnixDateTime,
  hasActionPermission,
  statusText,
  unixToDateInputValue,
} from './masterDataOrderView.mjs'

test('masterDataOrderView: action permissions keep super admin shortcut', () => {
  assert.equal(
    hasActionPermission({ is_super_admin: true }, 'sales_order.create'),
    true
  )
  assert.equal(
    hasActionPermission(
      { permissions: ['sales_order.read', 'sales_order.update'] },
      'sales_order.update'
    ),
    true
  )
  assert.equal(
    hasActionPermission(
      { permissions: ['sales_order.read'] },
      'contact.create'
    ),
    false
  )
})

test('masterDataOrderView: params trim optional values without adding facts', () => {
  assert.deepEqual(
    buildMasterDataParams({
      code: ' C001 ',
      name: ' 客户 A ',
      short_name: ' ',
      tax_no: '',
      note: ' 备注 ',
    }),
    { code: 'C001', name: '客户 A', note: '备注' }
  )

  assert.deepEqual(
    buildSalesOrderParams({
      order_no: ' SO001 ',
      customer_id: '3',
      order_date: '2026-05-31',
      planned_delivery_date: '',
      customer_snapshot: { id: 3, name: '客户 A' },
    }),
    {
      order_no: 'SO001',
      customer_id: 3,
      customer_snapshot: { id: 3, name: '客户 A' },
      order_date: '2026-05-31',
    }
  )

  assert.deepEqual(
    buildSalesOrderItemParams({
      line_no: '2',
      product_id: '5',
      unit_id: '1',
      product_name_snapshot: ' 玩具 ',
      ordered_quantity: '12.50',
      unit_price: '',
    }),
    {
      line_no: 2,
      product_id: 5,
      unit_id: 1,
      product_name_snapshot: '玩具',
      ordered_quantity: '12.50',
    }
  )
})

test('masterDataOrderView: status display and snapshots are read models only', () => {
  assert.equal(statusText('active', { active: '已生效' }), '已生效')
  assert.deepEqual(
    buildCustomerSnapshot({
      id: 9,
      code: ' C009 ',
      name: ' 客户九 ',
      short_name: '',
      tax_no: 'not-copied',
    }),
    { id: 9, code: 'C009', name: '客户九' }
  )
  assert.equal(unixToDateInputValue(1780185600), '2026-05-31')
  assert.equal(formatUnixDateTime(0), '-')
  assert.match(formatUnixDateTime(1780185600), /2026.*05.*31/)
})
