import assert from 'node:assert/strict'
import test from 'node:test'

import {
  customerOption,
  supplierOption,
  unitOption,
  warehouseOptionFromRecord,
} from './referenceSelectOptions.mjs'

test('referenceSelectOptions: 客户和供应商的同名简称不重复，独立简称仍可搜索', () => {
  for (const toOption of [customerOption, supplierOption]) {
    assert.deepEqual(
      toOption({ id: 1, code: 'PARTY-1', name: '晴空品牌', short_name: ' 晴空品牌 ' }),
      { value: 1, label: 'PARTY-1 / 晴空品牌' }
    )
    assert.deepEqual(
      toOption({ id: 1, code: 'PARTY-1', name: '晴空品牌有限公司', short_name: '晴空' }),
      { value: 1, label: 'PARTY-1 / 晴空品牌有限公司 / 晴空' }
    )
    assert.deepEqual(
      toOption({ id: 1, code: 'PARTY-1', name: '晴空品牌', short_name: ' ' }),
      { value: 1, label: 'PARTY-1 / 晴空品牌' }
    )
    assert.deepEqual(
      toOption({ id: 1, code: 'PARTY-1', short_name: '晴空' }),
      { value: 1, label: 'PARTY-1 / 晴空' }
    )
  }
})

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

test('referenceSelectOptions: unit option keeps precision for quantity validation', () => {
  assert.deepEqual(
    unitOption({
      id: 1,
      code: 'SIM-PLUSH-CORE-PCS',
      name: '核心演示单位-件',
      precision: 0,
    }),
    {
      value: 1,
      label: '件（PCS）',
      suffixLabel: '件（PCS）',
      searchText: '件（PCS） 核心演示单位-件（SIM-PLUSH-CORE-PCS）',
      title: '核心演示单位-件（SIM-PLUSH-CORE-PCS）',
      precision: 0,
    }
  )
})
