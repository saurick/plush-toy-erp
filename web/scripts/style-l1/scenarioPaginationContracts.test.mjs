import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const financeSource = readFileSync(
  new URL('./financeBusinessSourceScenarios.mjs', import.meta.url),
  'utf8'
)
const outsourcingSource = readFileSync(
  new URL('./outsourcingSourceFactScenarios.mjs', import.meta.url),
  'utf8'
)

test('finance source scenarios use the shared paging contract', () => {
  for (const [method, recordKey] of [
    ['list_shipments', 'shipments'],
    ['list_quality_inspections', 'quality_inspections'],
  ]) {
    const methodIndex = financeSource.indexOf(`method !== '${method}'`)
    const routeCase = financeSource.slice(methodIndex, methodIndex + 2_400)
    assert.ok(methodIndex >= 0, method)
    assert.match(routeCase, /stylePaginatedRpcData/u)
    assert.match(routeCase, new RegExp(`'${recordKey}'`, 'u'))
    assert.match(routeCase, /body\.params \|\| \{\}/u)
    assert.doesNotMatch(routeCase, /limit:\s*\d+|offset:\s*0/u)
  }
})

test('outsourcing source scenario preserves order scope and requested slices', () => {
  const listCases = outsourcingSource.slice(
    outsourcingSource.indexOf("method === 'list_outsourcing_orders'"),
    outsourcingSource.indexOf(
      'await route.fulfill',
      outsourcingSource.indexOf("method === 'list_outsourcing_orders'")
    )
  )
  assert.match(listCases, /stylePaginatedRpcData/u)
  assert.match(listCases, /'outsourcing_orders'/u)
  assert.match(listCases, /'outsourcing_order_items'/u)
  assert.match(listCases, /params\.outsourcing_order_id/u)
  assert.match(listCases, /\bparams\b/u)
  assert.doesNotMatch(listCases, /limit:\s*\d+|offset:\s*0/u)
})
