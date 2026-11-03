import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import {
  applyModuleColumnVisibility,
  buildDefaultModuleHiddenColumns,
  getModuleColumnKey,
} from './moduleTableColumns.mjs'

registerJSXTestLoader()
let shipmentColumns
let inventoryColumns
before(async () => {
  const shipment = await import('../components/shipments/shipmentColumns.jsx')
  const inventory =
    await import('../components/inventory/inventoryLedgerPresentation.jsx')
  shipmentColumns = shipment.buildShipmentColumns({
    salesOrdersByID: new Map(),
  })
  inventoryColumns = (activeView) =>
    inventory.createInventoryLedgerColumns({ activeView })
})
const visibleKeys = (columns) =>
  applyModuleColumnVisibility(
    columns,
    buildDefaultModuleHiddenColumns(columns)
  ).map(getModuleColumnKey)

test('shipment defaults keep recipient, approval, weight and instructions while optional logistics remain exportable', () => {
  const visible = visibleKeys(shipmentColumns)
  for (const key of [
    'shipment_no',
    'status',
    'finance_release_status',
    'sales_order_id',
    'delivery_snapshot',
    'total_net_weight_g',
    'note',
  ]) {
    assert.ok(visible.includes(key), `出货默认保留 ${key}`)
  }
  for (const key of ['transport', 'package_summary', 'freight']) {
    const column = shipmentColumns.find(
      (entry) => getModuleColumnKey(entry) === key
    )
    assert.equal(visible.includes(key), false, `补充字段 ${key} 按需展示`)
    assert.equal(typeof column.render, 'function')
    assert.equal(typeof column.exportValue, 'function')
    assert.notEqual(column.exportable, false)
  }
  assert.equal(
    shipmentColumns
      .find((column) => column.key === 'transport')
      .exportValue({ carrier_name: '模拟承运商', tracking_no: 'TRACK-001' })
      .includes('TRACK-001'),
    true
  )
})

test('inventory balances retain every published quantity and the batch identity', () => {
  const columns = inventoryColumns('balances')
  const visible = visibleKeys(columns)
  for (const key of [
    'subject_id',
    'product_sku_id',
    'warehouse_id',
    'lot_id',
    'unit_id',
    'quantity',
    'active_reserved_quantity',
    'available_quantity',
    'issuable_quantity',
    'restricted_quantity',
    'pending_inspection_quantity',
    'pending_packaging_quantity',
    'ready_to_ship_quantity',
  ]) {
    assert.ok(visible.includes(key), `库存默认保留 ${key}`)
  }
  assert.equal(visible.includes('id'), false)
  assert.equal(visible.includes('subject_type'), false)
  assert.ok(
    columns.some((column) => column.dataIndex === 'id' && column.exportValue)
  )
  assert.ok(
    columns.some(
      (column) => column.dataIndex === 'subject_type' && column.exportValue
    )
  )
})

test('inventory transactions retain optional reference fields and full source export', () => {
  const columns = inventoryColumns('txns')
  const visible = visibleKeys(columns)
  for (const key of [
    'occurred_at',
    'subject_id',
    'product_sku_id',
    'direction',
    'quantity',
    'unit_id',
    'warehouse_id',
    'lot_id',
    'txn_type',
    'source_document',
    'note',
  ]) {
    assert.ok(visible.includes(key), key)
  }
  for (const key of [
    'id',
    'subject_type',
    'source_type_label',
    'source_line_id',
    'reversal_of_txn_id',
  ]) {
    assert.equal(visible.includes(key), false, key)
    assert.ok(
      columns.find((column) => getModuleColumnKey(column) === key)?.exportValue,
      key
    )
  }
  const source = columns.find((column) => column.key === 'source_document')
  const record = { source_type: 'PURCHASE_RETURN', source_no: 'RETURN-001' }
  assert.equal(source.exportValue(record), 'RETURN-001')
  assert.equal(source.copyable.resolveValue(null, record), 'RETURN-001')
})
