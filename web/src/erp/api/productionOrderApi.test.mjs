import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./productionOrderApi.mjs', import.meta.url),
  'utf8'
)

test('production order API uses canonical domain and all eight canonical methods', () => {
  assert.match(source, /url:\s*'production_order'/u)
  for (const method of [
    'create_production_order',
    'save_production_order',
    'release_production_order',
    'close_production_order',
    'cancel_production_order',
    'get_production_order',
    'list_production_orders',
    'list_production_order_reference_options',
  ]) {
    assert.match(source, new RegExp(`['"]${method}['"]`, 'u'))
  }
  assert.doesNotMatch(
    source,
    /rpc\.call\(\s*['"](?:createProductionOrder|saveProductionOrder)/u
  )
  assert.doesNotMatch(source, /params\.id\b/u)
})

test('production order mutation wrappers fail closed before clearing attempts', () => {
  assert.match(source, /requireProductionOrderKey\(params\.idempotency_key\)/u)
  assert.match(source, /positiveSafeInteger\(params\.production_order_id\)/u)
  assert.match(source, /positiveSafeInteger\(params\.expected_version\)/u)
  assert.match(source, /validateProductionOrderAggregate/u)
})

test('production order reference API binds response pagination to the request', () => {
  assert.match(
    source,
    /validateProductionOrderOptions\(dataOf\(result\), referenceType, \{/u
  )
  assert.match(source, /limit: params\.limit/u)
  assert.match(source, /offset: params\.offset/u)
})
