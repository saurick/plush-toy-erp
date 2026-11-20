import assert from 'node:assert/strict'
import test from 'node:test'
import { shipmentApprovalPath, shipmentApprovalState } from './shipmentApproval.mjs'

test('shipment approval displays authoritative release states without inventing submission or shipment facts', () => {
  for (const [status, label] of [['PENDING', '待放行'], ['APPROVED', '已放行'], ['REJECTED', '已退回']]) {
    assert.equal(shipmentApprovalState({ finance_release_status: status }).label, label)
  }
  assert.equal(shipmentApprovalState({ status: 'SHIPPED' }).label, '待核对')
  assert.equal(shipmentApprovalState({ finance_release_status: 'unknown' }).label, '待核对')
})

test('shipment approval links preserve the exact shipment and optional process for task management', () => {
  const pending = new URL(shipmentApprovalPath({ id: 21, sales_order_id: 9 }), 'http://localhost')
  assert.equal(pending.pathname, '/erp/task-board')
  assert.equal(pending.searchParams.get('tracking'), 'visible')
  assert.equal(pending.searchParams.get('track_source_type'), 'shipment')
  assert.equal(pending.searchParams.get('track_source_id'), '21')
  assert.equal(pending.searchParams.has('track_id'), false)
  const approved = new URL(shipmentApprovalPath({ id: 22, finance_release_process_instance_id: 7 }), 'http://localhost')
  assert.equal(approved.searchParams.get('track_source_id'), '22')
  assert.equal(approved.searchParams.get('track_kind'), 'process')
  assert.equal(approved.searchParams.get('track_id'), '7')
  for (const record of [null, {}, { id: 0 }, { id: '21' }]) assert.equal(shipmentApprovalPath(record), '')
})
