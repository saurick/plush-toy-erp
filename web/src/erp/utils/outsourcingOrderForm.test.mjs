import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveOutsourcingOrderItemAmount,
  summarizeOutsourcingOrderFormLines,
} from './sourceOrderAmounts.mjs'
import {
  buildOutsourcingOrderItemSourceValuesFromProduct,
  buildOutsourcingOrderItemSourceValuesFromMaterial,
  buildOutsourcingOrderItemSourceValuesFromProductSKU,
} from './sourceOrderLineValues.mjs'
import { buildOutsourcingOrderItemParams } from './sourceOrderParams.mjs'
import {
  readOutsourcingSummaryFilters,
  updateOutsourcingSummarySearch,
  outsourcingSummarySubjectCode,
  outsourcingSummarySubjectName,
} from './outsourcingOrderSummary.mjs'

test('clearing a saved line price or quantity removes its displayed amount instead of restoring its old amount', () => {
  const saved = { outsourcing_quantity: '12', unit_price: '2.5', amount: '30' }
  assert.equal(deriveOutsourcingOrderItemAmount(saved), '30.00')
  for (const cleared of [
    { unit_price: '' },
    { unit_price: null },
    { outsourcing_quantity: '' },
    { outsourcing_quantity: 'invalid' },
  ]) {
    assert.equal(
      deriveOutsourcingOrderItemAmount({ ...saved, ...cleared }),
      undefined
    )
  }
  assert.equal(
    deriveOutsourcingOrderItemAmount({ ...saved, unit_price: '0' }),
    '0.00'
  )
  assert.equal(
    deriveOutsourcingOrderItemAmount({
      outsourcing_quantity: '0.000001',
      unit_price: '0.5',
    }),
    '0.000001'
  )
  const params = buildOutsourcingOrderItemParams({ ...saved, unit_price: '' })
  assert.equal(params.unit_price, undefined)
  assert.equal(Object.hasOwn(params, 'amount'), false)
})

test('form totals keep mixed units separate and identify unpriced rows', () => {
  assert.deepEqual(
    summarizeOutsourcingOrderFormLines([
      {
        unit_id: 1,
        unit_name_snapshot: '件',
        outsourcing_quantity: '10',
        unit_price: '2',
      },
      {
        unit_id: 2,
        unit_name_snapshot: '米',
        outsourcing_quantity: '3.25',
        amount: '999',
      },
      {
        unit_id: 1,
        unit_name_snapshot: '件',
        outsourcing_quantity: '2',
        unit_price: '0',
      },
    ]),
    {
      quantityGroups: [
        { unit: '件', quantity: '12' },
        { unit: '米', quantity: '3.25' },
      ],
      amount: '20',
      unpricedCount: 1,
    }
  )
})

test('product number follows the canonical style number and switching subjects clears old identities', () => {
  const source = {
    product_order_no_snapshot: 'SO-KEEP',
    material_id: 9,
    material_code_snapshot: 'OLD',
    product_sku_id: 8,
    sku_code_snapshot: 'OLD-SKU',
  }
  const product = {
    ...source,
    ...buildOutsourcingOrderItemSourceValuesFromProduct(
      {
        id: 1,
        code: 'INTERNAL',
        style_no: ' 22040 ',
        name: '模拟产品',
        default_unit_id: 3,
      },
      { id: 3, name: '件' }
    ),
  }
  assert.equal(product.product_no_snapshot, '22040')
  assert.equal(product.product_order_no_snapshot, 'SO-KEEP')
  assert.equal(product.material_id, undefined)
  assert.equal(product.sku_code_snapshot, '')
  assert.equal(product.product_sku_id, undefined)
  assert.equal(
    buildOutsourcingOrderItemSourceValuesFromProduct({
      id: 1,
      code: 'INTERNAL',
      style_no: ' ',
    }).product_no_snapshot,
    'INTERNAL'
  )
  const material = {
    ...product,
    ...buildOutsourcingOrderItemSourceValuesFromMaterial(
      { id: 9, code: 'MAT', name: '布料', default_unit_id: 4 },
      { name: '米' }
    ),
  }
  assert.equal(material.product_id, undefined)
  assert.equal(material.product_no_snapshot, '')
  assert.equal(material.product_order_no_snapshot, 'SO-KEEP')
  assert.equal(outsourcingSummarySubjectCode(material), 'MAT')
  assert.equal(outsourcingSummarySubjectName(material), '布料')
  assert.equal(
    buildOutsourcingOrderItemSourceValuesFromProductSKU(undefined, {
      id: 3,
      name: '件',
    }).unit_id,
    3
  )
  assert.equal(
    buildOutsourcingOrderItemSourceValuesFromProduct().unit_id,
    undefined
  )
})

test('summary filters preserve source context and reset pagination after a filter changes', () => {
  const params = new URLSearchParams(
    'view=items&outsourcing_order_id=15&outsourcing.page=3&outsourcing.supplier=8&outsourcing.from=2026-09-01&outsourcing.to=2026-09-17'
  )
  const initial = readOutsourcingSummaryFilters(params)
  assert.equal(initial.offset, 40)
  assert.equal(initial.supplier_id, 8)
  assert.equal(initial.date_to, '2026-09-17T23:59:59+08:00')
  const updated = updateOutsourcingSummarySearch(params, {
    q: '耳*2',
    supplier: '',
  })
  assert.equal(updated.get('outsourcing_order_id'), '15')
  assert.equal(readOutsourcingSummaryFilters(updated).offset, 0)
  assert.equal(readOutsourcingSummaryFilters(updated).keyword, '耳*2')
  assert.equal(readOutsourcingSummaryFilters(updated).supplier_id, undefined)
  const invalid = readOutsourcingSummaryFilters(
    new URLSearchParams(
      'outsourcing.page=-1&outsourcing.process=1.5&outsourcing.from=2026-02-30&outsourcing.status=unknown'
    )
  )
  assert.equal(invalid.offset, 0)
  assert.equal(invalid.date_from, undefined)
  assert.equal(invalid.process_id, undefined)
  assert.equal(invalid.lifecycle_status, '')
})
