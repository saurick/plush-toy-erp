import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROCESSING_CONTRACT_DRAFT_VERSION,
  buildProcessingContractDraftFromOutsourcingFact,
  buildProcessingContractDraftFromOutsourcingOrder,
  createBlankProcessingContractDraft,
  createProcessingContractDraft,
  normalizeProcessingLine,
  resolveProcessingLineAmount,
} from './processingContractTemplate.mjs'

test('processingContractTemplate: 默认加工合同样例使用中性展示字段', () => {
  const draft = createProcessingContractDraft()

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.buyerCompany, '本公司')
  assert.equal(draft.buyerContact, '委外负责人')
  assert.equal(draft.buyerPhone, '公司联系电话')
  assert.equal(draft.buyerAddress, '公司地址')
  assert.equal(draft.buyerSigner, '签字人')
  assert.equal(draft.supplierSigner, '受托方签字人')
  assert.equal(draft.supplierName, '示例加工厂')
  assert.equal(draft.supplierContact, '加工厂联系人')
  assert.equal(draft.supplierPhone, '加工厂联系电话')
  assert.equal(draft.supplierAddress, '加工厂地址')
  assert.equal(draft.supplierSignDateText, '2025-06-08')
  draft.lines.forEach((line) => {
    assert.equal(line.supplierAlias, '示例加工厂')
    assert.notEqual(line.remark, '')
  })
})

test('processingContractTemplate: 空白模板清空字段明细和附件但保留合同条款', () => {
  const blankDraft = createBlankProcessingContractDraft({
    ...createProcessingContractDraft(),
    clauses: {
      delivery: ['保留来货要求'],
      contract: ['保留合同约定'],
      settlement: ['保留结算方式'],
    },
    attachments: {
      'attachment-1': {
        name: 'sample.png',
        dataURL: 'data:image/png;base64,abc',
        mimeType: 'image/png',
      },
    },
  })

  assert.equal(blankDraft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(blankDraft.contractNo, '')
  assert.equal(blankDraft.supplierName, '')
  assert.equal(blankDraft.buyerCompany, '')
  assert.equal(blankDraft.buyerSigner, '')
  assert.equal(blankDraft.supplierSigner, '')
  assert.equal(blankDraft.lines.length, 1)
  assert.deepEqual(blankDraft.lines[0], {
    contractNo: '',
    productOrderNo: '',
    productNo: '',
    productName: '',
    processName: '',
    supplierAlias: '',
    processCategory: '',
    unit: '',
    unitPrice: '',
    quantity: '',
    amount: '',
    remark: '',
  })
  assert.deepEqual(blankDraft.clauses.delivery, ['保留来货要求'])
  assert.deepEqual(blankDraft.clauses.contract, ['保留合同约定'])
  assert.deepEqual(blankDraft.clauses.settlement, ['保留结算方式'])
  assert.equal(blankDraft.attachments['attachment-1'].dataURL, '')
  assert.equal(blankDraft.attachments['attachment-2'].dataURL, '')
  assert.deepEqual(blankDraft.merges, [])
})

test('processingContractTemplate: 委外事实只带入合同打印可确认快照字段', () => {
  const draft = buildProcessingContractDraftFromOutsourcingFact({
    fact_no: ' OUT-F-001 ',
    fact_type: 'MATERIAL_ISSUE',
    subject_type: 'MATERIAL',
    subject_id: 8,
    supplier_name: ' 外协车缝厂 ',
    quantity: '1200',
    unit_id: 3,
    source_type: 'SALES_ORDER',
    source_id: 5,
    note: ' 需先核对工序和单价 ',
  })

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.contractNo, 'OUT-F-001')
  assert.equal(draft.supplierName, '外协车缝厂')
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.lines[0].contractNo, 'OUT-F-001')
  assert.equal(draft.lines[0].supplierAlias, '外协车缝厂')
  assert.equal(draft.lines[0].productNo, '')
  assert.equal(draft.lines[0].productName, '')
  assert.equal(draft.lines[0].processName, '')
  assert.equal(draft.lines[0].processCategory, '')
  assert.equal(draft.lines[0].unit, '')
  assert.equal(draft.lines[0].quantity, '')
  assert.equal(draft.lines[0].unitPrice, '')
  assert.match(draft.lines[0].remark, /事实类型: MATERIAL_ISSUE/u)
  assert.match(draft.lines[0].remark, /对象: MATERIAL #8/u)
  assert.match(draft.lines[0].remark, /来源: SALES_ORDER #5/u)
  assert.match(draft.lines[0].remark, /需先核对工序和单价/u)
})

test('processingContractTemplate: 委外订单按加工合同源单带入工序明细', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-001 ',
      supplier_snapshot: { short_name: ' 外协车缝厂 ', name: '不优先显示' },
      source_order_no: ' SO-26017 ',
      order_date: 1781654400,
      expected_return_date: 1782259200,
    },
    [
      {
        line_status: 'open',
        product_no_snapshot: ' P-001 ',
        product_name_snapshot: ' 毛绒兔半成品 ',
        process_name_snapshot: ' 车缝 ',
        process_category_snapshot: ' 委外车缝 ',
        unit_name_snapshot: ' 只 ',
        outsourcing_quantity: '1200',
        unit_price: '1.5',
        amount: '',
        note: ' 先做头批 ',
      },
    ]
  )

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.contractNo, 'OUT-ORDER-001')
  assert.equal(draft.supplierName, '外协车缝厂')
  assert.equal(draft.orderDateText, '2026-06-17')
  assert.equal(draft.returnDateText, '2026-06-24')
  assert.deepEqual(draft.lines[0], {
    contractNo: 'OUT-ORDER-001',
    productOrderNo: 'SO-26017',
    productNo: 'P-001',
    productName: '毛绒兔半成品',
    processName: '车缝',
    supplierAlias: '外协车缝厂',
    processCategory: '委外车缝',
    unit: '只',
    unitPrice: '1.5',
    quantity: '1200',
    amount: '1800',
    remark: '先做头批',
  })
})

test('FL_processing_contract_amount__derives_default_line_amount_snapshot processingContractTemplate: 默认金额会按数量和单价写入合同快照', () => {
  const draft = createProcessingContractDraft()

  assert.equal(draft.lines[0].amount, '1804.8')
  assert.equal(draft.lines[1].amount, '902.4')
})

test('FL_processing_contract_amount__keeps_manual_line_amount_snapshot processingContractTemplate: 已有委托加工金额快照时优先保留手工值', () => {
  const line = normalizeProcessingLine({
    quantity: '10',
    unitPrice: '2',
    amount: '18.5',
  })

  assert.equal(line.amount, '18.5')
  assert.equal(resolveProcessingLineAmount(line), '18.5')
})
