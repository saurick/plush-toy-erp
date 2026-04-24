import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROCESSING_CONTRACT_DRAFT_VERSION,
  createProcessingContractDraft,
  migrateLegacyProcessingContractDraft,
  normalizeProcessingLine,
  resolveProcessingLineAmount,
} from './processingContractTemplate.mjs'

test('processingContractTemplate: 默认加工合同样例不再预填甲方联系人', () => {
  const draft = createProcessingContractDraft()

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.buyerContact, '')
})

test('FL_processing_contract_legacy_sample__clears_stale_buyer_contact processingContractTemplate: 旧默认样例草稿会自动清理历史甲方联系人残值', () => {
  const migrated = migrateLegacyProcessingContractDraft({
    buyerCompany: '永绅',
    buyerContact: '刘志强',
    buyerPhone: '13694972987',
    buyerAddress: '东莞茶山',
    buyerSignDateText: '2025-06-08',
  })

  assert.equal(migrated.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(migrated.buyerContact, '')
})

test('processingContractTemplate: 非旧默认样例的联系人不做兼容清理', () => {
  const migrated = migrateLegacyProcessingContractDraft({
    buyerCompany: '其他公司',
    buyerContact: '刘志强',
    buyerPhone: '13694972987',
    buyerAddress: '东莞茶山',
    buyerSignDateText: '2025-06-08',
  })

  assert.equal(migrated.draftVersion, undefined)
  assert.equal(migrated.buyerContact, '刘志强')
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
