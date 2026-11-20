import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMaterialPurchaseContractDraftFromPurchaseOrder } from './purchaseOrderPrintDraft.mjs'
import {
  buildMaterialPurchaseContractBusinessDraft,
  buildBlankMaterialPurchaseContractDraft,
} from './materialPurchaseContractEditor.mjs'
import {
  buildProcessingContractDraftFromOutsourcingOrder,
  createProcessingContractBusinessDraft,
  createBlankProcessingContractDraft,
} from '../data/processingContractTemplate.mjs'

test('business data consistency: contract currency and source snapshots survive printing', () => {
  const source = {
    material_id: 1,
    unit_id: 2,
    material_name_snapshot: '原材料',
    material_spec_snapshot: '原规格',
    supplier_item_no_snapshot: '原料号',
    unit_name_snapshot: '米',
    purchased_quantity: '2',
    unit_price: '0.123456',
  }
  for (const currency of ['CNY', 'USD', 'HKD', '']) {
    const draft = buildMaterialPurchaseContractDraftFromPurchaseOrder(
      { purchase_order_no: 'PO-1', currency },
      [source],
      {
        materials: [
          { id: 1, name: '现材料', spec: '现规格', supplier_item_no: '现料号' },
        ],
        units: [{ id: 2, name: '现单位' }],
      }
    )
    const printable = buildMaterialPurchaseContractBusinessDraft(draft)
    assert.equal(printable.currency, currency)
    assert.equal(printable.lines[0].materialName, '原材料')
    assert.equal(printable.lines[0].spec, '原规格')
    assert.equal(printable.lines[0].vendorCode, '原料号')
    assert.equal(printable.lines[0].unit, '米')
    const processing = buildProcessingContractDraftFromOutsourcingOrder(
      { currency },
      [
        {
          subject_type: 'PRODUCT',
          outsourcing_quantity: '2',
          unit_price: '0.123456',
        },
      ]
    )
    assert.equal(
      createProcessingContractBusinessDraft(processing).currency,
      currency
    )
  }
  const unknown = buildMaterialPurchaseContractDraftFromPurchaseOrder(
    {},
    [{ material_id: 1, unit_id: 2, amount: '4.5' }],
    {
      materials: [
        { id: 1, name: '现材料', spec: '现规格', supplier_item_no: '现料号' },
      ],
      units: [{ id: 2, name: '现单位' }],
    }
  ).lines[0]
  for (const key of ['materialName', 'spec', 'vendorCode', 'unit'])
    { assert.equal(unknown[key], undefined, key) }
  assert.equal(unknown.amount, '4.5')
  assert.equal(
    buildBlankMaterialPurchaseContractDraft({ currency: 'USD' }).currency,
    ''
  )
  assert.equal(
    createBlankProcessingContractDraft({ currency: 'USD' }).currency,
    ''
  )
})
