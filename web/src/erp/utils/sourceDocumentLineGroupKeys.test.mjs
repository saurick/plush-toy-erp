import assert from 'node:assert/strict'
import test from 'node:test'
import { adjacentLineItemRuns } from './adjacentLineItemRuns.mjs'
import { salesOrderLineGroupKey, purchaseMaterialLineGroupKey, outsourcingOrderLineGroupKey } from './sourceDocumentLineGroupKeys.mjs'

test('销售只按相邻正式产品归组，缺引用与同名不合并，也不重排原行', () => {
  const items = [{ product_id: 1 }, { product_id: 1 }, { product_id: 2 }, { product_id: 1 }, { name: '同名' }, { name: '同名' }]
  assert.deepEqual(adjacentLineItemRuns(items, salesOrderLineGroupKey).map(({ start, count }) => [start, count]), [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1]])
})

test('采购和入库按材料与单位区分，委外按正式对象类型、引用与工序区分', () => {
  assert.notEqual(purchaseMaterialLineGroupKey({ material_id: 1, unit_id: 1 }), purchaseMaterialLineGroupKey({ material_id: 1, unit_id: 2 }))
  assert.equal(purchaseMaterialLineGroupKey({ material_id: 1 }), undefined)
  const product = { subject_type: 'PRODUCT', product_id: 1, material_id: 99, process_id: 1 }
  assert.equal(outsourcingOrderLineGroupKey(product), 'PRODUCT:1:1')
  assert.notEqual(outsourcingOrderLineGroupKey(product), outsourcingOrderLineGroupKey({ ...product, process_id: 2 }))
  assert.notEqual(outsourcingOrderLineGroupKey(product), outsourcingOrderLineGroupKey({ ...product, subject_type: 'MATERIAL', material_id: 1 }))
  assert.equal(outsourcingOrderLineGroupKey({ ...product, subject_type: undefined }), undefined)
  assert.equal(outsourcingOrderLineGroupKey({ ...product, product_id: undefined }), undefined)
})
