import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildShipmentFinanceSourcePayload,
  localDateTimeInputValue,
  shipmentFinanceSourceActionConfig,
} from './shipmentFinanceSourceAction.mjs'

test('shipment finance action config keeps receivable and invoice drafts explicit', () => {
  assert.deepEqual(
    {
      factType: shipmentFinanceSourceActionConfig('receivable').factType,
      prefix: shipmentFinanceSourceActionConfig('receivable').factNoPrefix,
      invoiceFactType: shipmentFinanceSourceActionConfig('invoice').factType,
    },
    { factType: 'RECEIVABLE', prefix: 'AR', invoiceFactType: 'INVOICE' }
  )
  assert.throws(() => shipmentFinanceSourceActionConfig('payment'))
})

test('shipment finance payload only submits operator-owned fields', () => {
  const payload = buildShipmentFinanceSourcePayload(
    {
      occurred_at: '2026-07-14T15:30:00.000Z',
      note: '  客户账款复核  ',
      amount: '999999',
      currency: 'USD',
      counterparty_id: 88,
      source_type: 'FORGED',
      fact_type: 'PAYABLE',
      idempotency_key: 'caller-owned',
    },
    { id: 7, shipment_no: 'SHIP-007', status: 'SHIPPED' }
  )
  assert.deepEqual(payload, {
    shipment_id: 7,
    occurred_at: '2026-07-14T15:30:00.000Z',
    note: '客户账款复核',
  })
})

test('shipment finance payload rejects stale source state and invalid time', () => {
  assert.throws(
    () =>
      buildShipmentFinanceSourcePayload(
        {},
        { id: 7, shipment_no: 'SHIP-007', status: 'DRAFT' }
      ),
    /仅已确认出货/u
  )
  assert.throws(
    () =>
      buildShipmentFinanceSourcePayload(
        { occurred_at: 'not-a-date' },
        { id: 7, shipment_no: 'SHIP-007', status: 'SHIPPED' }
      ),
    /发生时间无效/u
  )
})

test('local datetime input omits the timezone suffix expected by the control', () => {
  const value = localDateTimeInputValue(new Date('2026-07-14T15:30:00+08:00'))
  assert.match(value, /^2026-07-14T\d{2}:30$/u)
  assert.equal(value.length, 16)
})
