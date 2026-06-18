import assert from 'node:assert/strict'
import test from 'node:test'

import { warehouseOptionFromRecord } from './referenceSelectOptions.mjs'

test('referenceSelectOptions: warehouse option supports master data records', () => {
  assert.deepEqual(
    warehouseOptionFromRecord({
      id: 7,
      code: 'SIM-PLUSH-CORE-RM-WH',
      name: '核心演示原料仓',
    }),
    {
      value: 7,
      label: '核心演示原料仓 / SIM-PLUSH-CORE-RM-WH',
    }
  )
})

test('referenceSelectOptions: warehouse option keeps fact snapshot records', () => {
  assert.deepEqual(
    warehouseOptionFromRecord({
      warehouse_id: 8,
      warehouse_code: 'WH-01',
      warehouse_name: '一号仓',
    }),
    {
      value: 8,
      label: '一号仓 / WH-01',
    }
  )
})
