import assert from 'node:assert/strict'
import test from 'node:test'

import {
  financeCollectionTypeText,
  financeInvoiceCategoryText,
  financePaymentTermText,
} from './financeFactDisplay.mjs'

const collectionLabels = { ACCOUNTS_RECEIVABLE: '应收款' }
const paymentLabels = { EOM_30: '月结 30 天' }
const invoiceLabels = { VAT_SPECIAL_13: '增值税专用发票 13%' }

test('finance applicable enum fields distinguish history gaps and unknown values', () => {
  assert.equal(financeCollectionTypeText(null, collectionLabels), '历史未记录')
  assert.equal(
    financeCollectionTypeText('ACCOUNTS_RECEIVABLE', collectionLabels),
    '应收款'
  )
  assert.equal(financeCollectionTypeText('UNKNOWN', collectionLabels), '待核对')
  assert.equal(financeInvoiceCategoryText('', invoiceLabels), '历史未记录')
  assert.equal(
    financeInvoiceCategoryText('VAT_SPECIAL_13', invoiceLabels),
    '增值税专用发票 13%'
  )
})

test('finance payment terms preserve exact custom days without guessing an enum', () => {
  assert.equal(financePaymentTermText({}, paymentLabels), '历史未记录')
  assert.equal(
    financePaymentTermText({ payment_term_days: 60 }, paymentLabels),
    '自定义账期 / 60 天'
  )
  assert.equal(
    financePaymentTermText(
      { payment_term: 'EOM_30', payment_term_days: 30 },
      paymentLabels
    ),
    '月结 30 天 / 30 天'
  )
  assert.equal(
    financePaymentTermText(
      { payment_term: 'UNKNOWN', payment_term_days: 30 },
      paymentLabels
    ),
    '待核对 / 30 天'
  )
})
