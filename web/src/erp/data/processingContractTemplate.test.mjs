import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROCESSING_CONTRACT_DRAFT_VERSION,
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
