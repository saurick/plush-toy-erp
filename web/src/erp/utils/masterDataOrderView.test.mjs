import assert from 'node:assert/strict'
import test from 'node:test'

import {
  V1_ROUTE_PATHS,
  buildCustomerSnapshot,
  buildMasterDataParams,
  buildProductParams,
  buildPurchaseOrderItemParams,
  buildPurchaseOrderParams,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  deriveSalesOrderItemAmount,
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
  assert.equal(V1_ROUTE_PATHS.materials, '/erp/master/materials')

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
    buildMasterDataParams({
      code: ' MAT001 ',
      name: ' 面料 ',
      category: ' fabric ',
      spec: ' 75D ',
      color: ' 米白 ',
      default_unit_id: '2',
      tax_no: ' ',
      note: '',
    }),
    {
      code: 'MAT001',
      name: '面料',
      category: 'fabric',
      spec: '75D',
      color: '米白',
      default_unit_id: 2,
    }
  )

  assert.deepEqual(
    buildProductParams({
      code: ' P001 ',
      name: ' 毛绒熊 ',
      style_no: ' BEAR-BASE ',
      customer_style_no: '',
      default_unit_id: '2',
    }),
    {
      code: 'P001',
      name: '毛绒熊',
      style_no: 'BEAR-BASE',
      default_unit_id: 2,
    }
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
      product_sku_id: '8',
      unit_id: '1',
      product_name_snapshot: ' 玩具 ',
      ordered_quantity: '12.50',
      unit_price: ' 3.20 ',
    }),
    {
      line_no: 2,
      product_id: 5,
      product_sku_id: 8,
      unit_id: 1,
      product_name_snapshot: '玩具',
      ordered_quantity: '12.50',
      unit_price: '3.20',
      amount: '40.00',
    }
  )

  assert.deepEqual(
    buildPurchaseOrderParams({
      purchase_order_no: ' PO001 ',
      supplier_id: '7',
      supplier_purchase_order_no: '',
      supplier_snapshot: { id: 7, name: '供应商 A' },
      purchase_date: '2026-06-16',
      expected_arrival_date: '',
    }),
    {
      purchase_order_no: 'PO001',
      supplier_id: 7,
      supplier_snapshot: { id: 7, name: '供应商 A' },
      purchase_date: '2026-06-16',
    }
  )

  assert.deepEqual(
    buildPurchaseOrderItemParams({
      line_no: '1',
      material_id: '12',
      unit_id: '2',
      material_name_snapshot: ' 面料 ',
      purchased_quantity: '10',
      unit_price: '',
      amount: '',
      expected_arrival_date: '',
    }),
    {
      line_no: 1,
      material_id: 12,
      unit_id: 2,
      material_name_snapshot: '面料',
      purchased_quantity: '10',
    }
  )
})

test('masterDataOrderView: sales order item amount derives from quantity and unit price', () => {
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '12.5',
      unit_price: '3.2',
      amount: '999',
    }),
    '40.00'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '',
      unit_price: '3.2',
      amount: ' 88 ',
    }),
    '88'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '-1',
      unit_price: '3.2',
      amount: '',
    }),
    undefined
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
