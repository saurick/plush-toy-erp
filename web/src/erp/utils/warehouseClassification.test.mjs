import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  warehouseAcceptsSubject,
  materialWarehouseOptions,
  recommendedMaterialWarehouse,
} from './warehouseClassification.mjs'
import { buildMasterDataParams } from './masterDataParams.mjs'

test('material categories and products select different warehouse purposes', () => {
  const warehouses = [
    { id: 1, type: 'MAIN_MATERIAL', is_active: true },
    { id: 2, type: 'AUXILIARY_MATERIAL', is_active: true },
    { id: 3, type: 'FINISHED_GOODS', is_active: true },
    { id: 4, type: 'MATERIAL', is_active: true },
    { id: 5, type: 'MAIN_MATERIAL', is_active: false },
  ]
  assert.deepEqual(
    materialWarehouseOptions(warehouses, { stock_category: 'MAIN' }).map(
      (item) => item.id
    ),
    [1, 4]
  )
  assert.deepEqual(
    materialWarehouseOptions(warehouses, { stock_category: 'UNCLASSIFIED' }),
    []
  )
  assert.equal(warehouseAcceptsSubject(warehouses[2], 'PRODUCT'), true)
  assert.equal(warehouseAcceptsSubject(warehouses[0], 'PRODUCT'), false)
  assert.equal(
    recommendedMaterialWarehouse(
      { stock_category: 'MAIN', default_warehouse_id: 1 },
      warehouses
    ),
    1
  )
  assert.equal(
    recommendedMaterialWarehouse(
      { stock_category: 'AUXILIARY', default_warehouse_id: 1 },
      warehouses
    ),
    undefined
  )
  assert.equal(
    recommendedMaterialWarehouse(
      { stock_category: 'MAIN', default_warehouse_id: 5 },
      warehouses
    ),
    undefined
  )
})

test('material full replacement clears a removed default warehouse and keeps fine classification', () => {
  const params = buildMasterDataParams({
    code: 'M1',
    name: '短毛绒',
    category: '面料',
    stock_category: 'MAIN',
    default_warehouse_id: undefined,
    default_unit_id: 1,
  })
  assert.equal(params.stock_category, 'MAIN')
  assert.equal(params.category, '面料')
  assert.equal('default_warehouse_id' in params, false)
})
