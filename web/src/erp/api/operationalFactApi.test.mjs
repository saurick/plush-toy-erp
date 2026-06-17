import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./operationalFactApi.mjs', import.meta.url)),
  'utf8'
)

test('operationalFactApi: uses dedicated operational fact JSON-RPC domain and admin auth', () => {
  assert.match(source, /url:\s*'operational_fact'/)
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('operationalFactApi: exposes production, outsourcing, shipment, reservation and finance methods', () => {
  for (const methodName of [
    'list_production_facts',
    'create_production_fact',
    'post_production_fact',
    'cancel_production_fact',
    'list_outsourcing_facts',
    'create_outsourcing_fact',
    'post_outsourcing_fact',
    'cancel_outsourcing_fact',
    'list_shipments',
    'create_shipment',
    'add_shipment_item',
    'ship_shipment',
    'cancel_shipment',
    'list_stock_reservations',
    'create_stock_reservation',
    'release_stock_reservation',
    'consume_stock_reservation',
    'list_finance_facts',
    'create_finance_fact',
    'post_finance_fact',
    'settle_finance_fact',
    'cancel_finance_fact',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  for (const forbiddenName of [
    'business_records',
    'workflow_task',
    'generateReceivable',
    'generateInvoice',
    'postGeneralLedger',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbiddenName))
  }
})
