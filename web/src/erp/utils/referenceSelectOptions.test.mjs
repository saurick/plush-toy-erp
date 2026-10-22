import assert from 'node:assert/strict'
import test from 'node:test'

import {
  customerOption,
  supplierOption,
  unitOption,
  warehouseOptionFromRecord,
  inventoryLotOption,
  inventoryLotStatusLabel,
} from './referenceSelectOptions.mjs'

test('inventory lot choices translate known states and keep unknown states unresolved', () => {
  for (const [status, label] of [['ACTIVE', '可用'], ['HOLD', '冻结'], ['REJECTED', '不合格'], ['DISABLED', '停用']]) {
    assert.deepEqual(inventoryLotOption({ id: 7, lot_no: 'LOT-7', supplier_lot_no: 'SUP-7', status }), { value: 7, label: `LOT-7 SUP-7 ${label}` })
    assert.equal(inventoryLotStatusLabel(status), label)
  }
  assert.equal(inventoryLotOption({ id: 7, lot_no: 'LOT-7', status: 'UNKNOWN_INTERNAL_STATE' }).label, 'LOT-7 批次状态待核对')
  assert.equal(inventoryLotOption({ id: 7, lot_no: 'LOT-7' }).label, 'LOT-7')
  assert.equal(inventoryLotOption({ lot_no: 'LOT-7', status: 'ACTIVE' }), null)
})

test('referenceSelectOptions: 客户和供应商的同名简称不重复，独立简称仍可搜索', () => {
  for (const toOption of [customerOption, supplierOption]) {
    assert.deepEqual(
      toOption({
        id: 1,
        code: 'PARTY-1',
        name: '晴空品牌',
        short_name: ' 晴空品牌 ',
      }),
      { value: 1, label: 'PARTY-1 晴空品牌' }
    )
    assert.deepEqual(
      toOption({
        id: 1,
        code: 'PARTY-1',
        name: '晴空品牌有限公司',
        short_name: '晴空',
      }),
      { value: 1, label: 'PARTY-1 晴空品牌有限公司 晴空' }
    )
    assert.deepEqual(
      toOption({ id: 1, code: 'PARTY-1', name: '晴空品牌', short_name: ' ' }),
      { value: 1, label: 'PARTY-1 晴空品牌' }
    )
    assert.deepEqual(toOption({ id: 1, code: 'PARTY-1', short_name: '晴空' }), {
      value: 1,
      label: 'PARTY-1 晴空',
    })
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
      label: '核心演示原料仓 SIM-PLUSH-CORE-RM-WH',
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
      label: '一号仓 WH-01',
    }
  )
})

test('referenceSelectOptions: unit option keeps precision for quantity validation', () => {
  assert.deepEqual(
    unitOption({
      id: 1,
      code: 'EA',
      name: '个',
      precision: 0,
    }),
    {
      value: 1,
      label: '个',
      suffixLabel: '个',
      searchText: '个 EA PCS PC 件',
      title: '个',
      precision: 0,
    }
  )
})
