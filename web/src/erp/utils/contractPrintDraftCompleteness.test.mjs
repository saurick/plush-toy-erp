import assert from 'node:assert/strict'
import test from 'node:test'

import {
  completeMaterialPurchaseContractDraft,
  completeProcessingContractDraft,
  mergeSnapshotMissingFields,
} from './contractPrintDraftCompleteness.mjs'

test('contractPrintDraftCompleteness: purchase draft fills missing display fields without internal ids', () => {
  const draft = completeMaterialPurchaseContractDraft({
    contractNo: 'PO-001',
    buyerCompany: '东莞市永绅玩具有限公司',
    lines: [
      {
        materialName: '拉毛布',
        quantity: '10',
        unitPrice: '2.5',
        amount: '25.00',
      },
    ],
  })

  assert.equal(draft.supplierContact, '未维护联系人')
  assert.equal(draft.buyerCompany, '东莞市永绅玩具有限公司')
  assert.equal(draft.buyerContact, '未配置订货人')
  assert.equal(draft.lines[0].contractNo, 'PO-001')
  assert.equal(draft.lines[0].productOrderNo, '未关联产品订单')
  assert.equal(draft.lines[0].productNo, '未关联产品编号')
  assert.equal(draft.lines[0].productName, '未关联产品名称')
  assert.equal(draft.lines[0].unit, '未维护单位')
})

test('contractPrintDraftCompleteness: processing draft fills missing display fields', () => {
  const draft = completeProcessingContractDraft({
    contractNo: 'OUT-001',
    supplierName: '加工厂 A',
    buyerCompany: '东莞市永绅玩具有限公司',
    lines: [
      {
        productNo: 'P-001',
        productName: '抱枕',
        processName: '车缝',
        quantity: '12',
        unitPrice: '3.2',
        amount: '38.4',
      },
    ],
  })

  assert.equal(draft.supplierName, '加工厂 A')
  assert.equal(draft.supplierContact, '未维护联系人')
  assert.equal(draft.buyerContact, '未配置委托人')
  assert.equal(draft.lines[0].supplierAlias, '加工厂 A')
  assert.equal(draft.lines[0].productOrderNo, '未关联产品订单')
  assert.equal(draft.lines[0].processCategory, '未维护工序类别')
})

test('contractPrintDraftCompleteness: live master snapshot only fills blank snapshot fields', () => {
  assert.deepEqual(
    mergeSnapshotMissingFields(
      { name: '下单时供应商', contact_name: '', contact_phone: '旧电话' },
      { name: '当前供应商', contact_name: '王五', contact_phone: '新电话' }
    ),
    { name: '下单时供应商', contact_name: '王五', contact_phone: '旧电话' }
  )
})
