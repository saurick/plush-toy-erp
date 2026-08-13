import assert from 'node:assert/strict'
import test from 'node:test'

import {
  financeCollectionTypeText,
  financeInvoiceCategoryText,
  financePaymentTermText,
} from './financeFactDisplay.mjs'

const collectionLabels = { ACCOUNTS_RECEIVABLE: '应收款' }
const paymentLabels = {
  DUE_ON_OCCURRENCE: '发生即到期',
  EOM_DAYS: '月结',
}
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

test('finance payment terms require a coherent occurrence or month-end snapshot', () => {
  assert.equal(financePaymentTermText({}, paymentLabels), '历史未记录')
  assert.equal(
    financePaymentTermText({ payment_term_days: 60 }, paymentLabels),
    '待核对'
  )
  assert.equal(
    financePaymentTermText(
      { payment_term: 'DUE_ON_OCCURRENCE', payment_term_days: 0 },
      paymentLabels
    ),
    '发生即到期'
  )
  assert.equal(
    financePaymentTermText(
      { payment_term: 'EOM_DAYS', payment_term_days: 30 },
      paymentLabels
    ),
    '月结 30 天'
  )
  assert.equal(
    financePaymentTermText(
      { payment_term: 'UNKNOWN', payment_term_days: 30 },
      paymentLabels
    ),
    '待核对'
  )
  assert.equal(
    financePaymentTermText(
      { payment_term: 'DUE_ON_OCCURRENCE', payment_term_days: 30 },
      paymentLabels
    ),
    '待核对'
  )
  assert.equal(
    financePaymentTermText(
      { payment_term: 'EOM_DAYS', payment_term_days: 0 },
      paymentLabels
    ),
    '待核对'
  )
})
