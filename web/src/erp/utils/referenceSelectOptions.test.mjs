import assert from 'node:assert/strict'
import test from 'node:test'
import { purchaseMaterialOption } from './purchaseMaterialSupplier.mjs'

import {
  productOption,
  processOption,
  productionReferenceIdentity,
  productSKUOption,
  materialOption,
  customerOption,
  supplierOption,
  unitOption,
  warehouseOptionFromRecord,
  inventoryLotOption,
  inventoryLotStatusLabel,
} from './referenceSelectOptions.mjs'

test('inventory lot choices translate known states and keep unknown states unresolved', () => {
  for (const [status, label] of [['ACTIVE', '可用'], ['HOLD', '冻结'], ['REJECTED', '不合格'], ['DISABLED', '停用']]) {
    assert.deepEqual(inventoryLotOption({ id: 7, lot_no: 'LOT-7', supplier_lot_no: 'SUP-7', status }), { value: 7, label: `LOT-7 SUP-7 ${label}`, identity: { name: 'LOT-7', code: `SUP-7 ${label}` } })
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
      { value: 1, label: 'PARTY-1 晴空品牌', identity: { name: '晴空品牌', code: 'PARTY-1' } }
    )
    assert.deepEqual(
      toOption({
        id: 1,
        code: 'PARTY-1',
        name: '晴空品牌有限公司',
        short_name: '晴空',
      }),
      { value: 1, label: 'PARTY-1 晴空品牌有限公司 晴空', identity: { name: '晴空品牌有限公司', code: 'PARTY-1' } }
    )
    assert.deepEqual(
      toOption({ id: 1, code: 'PARTY-1', name: '晴空品牌', short_name: ' ' }),
      { value: 1, label: 'PARTY-1 晴空品牌', identity: { name: '晴空品牌', code: 'PARTY-1' } }
    )
    assert.deepEqual(toOption({ id: 1, code: 'PARTY-1', short_name: '晴空' }), {
      value: 1,
      label: 'PARTY-1 晴空',
      identity: { name: '晴空', code: 'PARTY-1' },
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
      identity: { name: '核心演示原料仓', code: 'SIM-PLUSH-CORE-RM-WH' },
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
      identity: { name: '一号仓', code: 'WH-01' },
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

test('引用身份来自结构字段，名称含空格或编码不拆分，缺失内容不伪造', () => {
  assert.deepEqual(productOption({ id: 1, code: 'CP 001', name: 'CP 001 小象', style_no: '27016-1' }).identity, { name: 'CP 001 小象', code: 'CP 001' })
  assert.deepEqual(productSKUOption({ id: 2, sku_code: 'GG-001', sku_name: '加大号', color: '白色', size: 'XL' }).identity, { name: '加大号', code: 'GG-001' })
  assert.deepEqual(materialOption({ id: 3, name: '短毛绒', spec: '2 mm', color: '白色' }).identity, { name: '短毛绒', code: '' })
  assert.deepEqual(warehouseOptionFromRecord({ id: 4, code: 'WH 04' }).identity, { name: '', code: 'WH 04' })
})

test('业务候选保留识别信息，选中身份仅取名称字段', () => {
  const material = materialOption({ id: 11, code: 'MAT-11', name: '短毛绒', supplier_name: '甲厂', supplier_item_no: 'A-11', spec: '2 mm', color: '米白' })
  assert.equal(material.identity.name, '短毛绒')
  for (const text of ['MAT-11', '甲厂', 'A-11', '2 mm', '米白']) assert(material.label.includes(text))
  const process = processOption({ id: 12, code: 'PROC-12', name: '绣花', category: '外加工', is_active: true, outsourcing_enabled: true })
  assert.equal(process.identity.name, '绣花')
  assert.equal(process.label, 'PROC-12 绣花 外加工')
  assert.equal(process.disabled, false)
  assert.equal(productSKUOption({ id: 13, sku_code: 'SKU-13', customer_sku: '客户规格甲' }).identity.name, '客户规格甲')
})

test('采购材料复用完整候选信息并保留厂商限制', () => {
  const material = { id: 14, code: 'MAT-14', name: '丝带', supplier_id: 2, supplier_name: '乙厂', supplier_item_no: 'SUP-14', spec: '10mm', color: '色号22' }
  const current = purchaseMaterialOption(material, 2)
  assert.equal(current.identity.name, '丝带')
  assert.equal(current.disabled, false)
  for (const text of ['MAT-14', '乙厂', 'SUP-14', '10mm', '色号22']) assert(current.label.includes(text))
  const other = purchaseMaterialOption(material, 1)
  assert.equal(other.disabled, true)
  assert(other.label.includes('其他厂商，需重选'))
})

test('生产引用使用已提供的名称或业务编号，不拆候选标签', () => {
  assert.deepEqual(productionReferenceIdentity('product', { name: '小熊', code: 'P-1', label: 'P-1 小熊 特殊款' }), { name: '小熊' })
  assert.deepEqual(productionReferenceIdentity('product_sku', { sku_name: '加大号', sku_code: 'SKU-2', color: '白色' }), { name: '加大号' })
  assert.deepEqual(productionReferenceIdentity('sales_order_item', { sales_order_no: 'SO-3', sales_line_no: 2 }), { name: 'SO-3 第 2 行' })
  assert.deepEqual(productionReferenceIdentity('active_bom', { bom_version: 'V3' }), { name: 'V3' })
  assert.equal(productionReferenceIdentity('product', { label: '历史产品描述' }), undefined)
})
