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
    buyerCompany: '永绅',
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
  assert.equal(draft.buyerCompany, '永绅')
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
    buyerCompany: '永绅',
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

test('contractPrintDraftCompleteness: configured party fields stay visible after completion', () => {
  const purchaseDraft = completeMaterialPurchaseContractDraft({
    contractNo: 'PO-YOYO-CONFIG',
    supplierName: '振鼎包装材料',
    supplierContact: '叶先生',
    supplierPhone: '13802376786',
    supplierAddress: '东莞虎门富民皮料市场A216号',
    buyerCompany: '永绅',
    buyerContact: '试用采购负责人',
    buyerPhone: '0769-00000001',
    buyerAddress: '东莞-茶山',
    buyerSigner: '试用采购负责人',
  })
  assert.equal(purchaseDraft.buyerContact, '试用采购负责人')
  assert.equal(purchaseDraft.buyerPhone, '0769-00000001')
  assert.equal(purchaseDraft.buyerAddress, '东莞-茶山')
  assert.equal(purchaseDraft.buyerSigner, '试用采购负责人')
  assert.equal(purchaseDraft.supplierAddress, '东莞虎门富民皮料市场A216号')

  const processingDraft = completeProcessingContractDraft({
    contractNo: 'OUT-YOYO-CONFIG',
    supplierName: '东莞市茶山富尔达电脑绣花店',
    supplierContact: '黄先生',
    supplierPhone: '0769-86862121',
    supplierAddress: '东莞市茶山镇',
    buyerCompany: '永绅',
    buyerContact: '试用委外负责人',
    buyerPhone: '0769-00000002',
    buyerAddress: '东莞茶山',
    buyerSigner: '试用委外负责人',
  })
  assert.equal(processingDraft.buyerContact, '试用委外负责人')
  assert.equal(processingDraft.buyerPhone, '0769-00000002')
  assert.equal(processingDraft.buyerAddress, '东莞茶山')
  assert.equal(processingDraft.buyerSigner, '试用委外负责人')
  assert.equal(processingDraft.supplierAddress, '东莞市茶山镇')
})
