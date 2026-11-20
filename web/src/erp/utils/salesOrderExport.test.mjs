import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSalesOrderExport } from './salesOrderExport.mjs'
import { SalesOrderExportPolicy } from '../../common/consts/policies.generated.mjs'

test('sales export accepts one complete snapshot beyond a normal list page and empty results', () => {
  const rows = Array.from({ length: 401 }, (_, index) => ({ id: index + 1 }))
  assert.equal(validateSalesOrderExport({ sales_orders: rows, total: 401 }), rows)
  assert.deepEqual(validateSalesOrderExport({ sales_orders: [], total: 0 }), [])
})

test('sales export rejects truncated, duplicate, invalid and oversized responses', () => {
  for (const data of [
    {},
    { sales_orders: [{ id: 1 }], total: 2 },
    { sales_orders: [{ id: 1 }, { id: 1 }], total: 2 },
    { sales_orders: [{ id: 0 }], total: 1 },
    { sales_orders: [{ id: '1' }], total: 1 },
    { sales_orders: [{ id: Number.MAX_SAFE_INTEGER + 1 }], total: 1 },
    { sales_orders: [], total: '0' },
    { sales_orders: Array.from({ length: SalesOrderExportPolicy.maxRows + 1 }, (_, index) => ({ id: index + 1 })), total: SalesOrderExportPolicy.maxRows + 1 },
    { sales_orders: [{ id: 1, note: '中'.repeat(Math.floor(SalesOrderExportPolicy.maxBytes / 3) + 1) }], total: 1 },
  ]) {
    assert.throws(() => validateSalesOrderExport(data), (error) => error.isInvalidResponse === true)
  }
})
