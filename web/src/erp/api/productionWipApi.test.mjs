import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./productionWipApi.mjs', import.meta.url),
  'utf8'
)

test('production WIP API uses one canonical domain and the three approved methods', () => {
  assert.match(source, /url:\s*'production_wip'/u)
  for (const method of [
    'get_production_wip',
    'initialize_production_wip',
    'execute_production_wip_action',
  ]) {
    assert.match(source, new RegExp(`['"]${method}['"]`, 'u'))
  }
  assert.doesNotMatch(source, /create_production_wip|update_production_wip/u)
})

test('production WIP API validates every response against the selected production order', () => {
  assert.match(source, /validateProductionWipAggregate/u)
  assert.match(source, /productionOrderID:\s*normalizedOrderID/u)
  assert.match(source, /productionOrderID:\s*params\.production_order_id/u)
  assert.match(source, /buildProductionWipActionParams\(action, values\)/u)
})

test('production WIP initialization keeps route selection server-owned and uses an idempotent write key', () => {
  assert.match(source, /idempotencyKey\s*=\s*productionWipUUID\(\)/u)
  assert.match(source, /idempotency_key:\s*normalizedIdempotencyKey/u)
  assert.match(source, /initialize_production_wip[\s\S]*?options/u)
  assert.doesNotMatch(source, /route_key|routeKey/u)
})
