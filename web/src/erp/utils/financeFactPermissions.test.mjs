import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canConfirmFinanceFact,
  financeFactConfirmPermissions,
} from './financeFactPermissions.mjs'

function adminWithActions(...actions) {
  return {
    permissions: actions,
    effective_session: { actions },
  }
}

test('finance fact confirm permissions match the backend fact families', () => {
  assert.deepEqual(financeFactConfirmPermissions('RECEIVABLE'), [
    'finance.receivable.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('INVOICE'), [
    'finance.invoice.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('PAYABLE'), [
    'finance.payable.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('PAYMENT'), [])
  assert.deepEqual(financeFactConfirmPermissions('RECONCILIATION'), [
    'finance.reconciliation.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('unknown'), [])
})

test('each mutable finance family requires its exact effective permission', () => {
  const receivableOnly = adminWithActions('finance.receivable.confirm')
  const payableOnly = adminWithActions('finance.payable.confirm')
  const invoiceOnly = adminWithActions('finance.invoice.confirm')
  const reconciliationOnly = adminWithActions('finance.reconciliation.confirm')

  assert.equal(canConfirmFinanceFact(receivableOnly, 'RECEIVABLE'), true)
  assert.equal(canConfirmFinanceFact(receivableOnly, 'PAYABLE'), false)
  assert.equal(canConfirmFinanceFact(payableOnly, 'PAYABLE'), true)
  assert.equal(canConfirmFinanceFact(payableOnly, 'INVOICE'), false)
  assert.equal(canConfirmFinanceFact(invoiceOnly, 'INVOICE'), true)
  assert.equal(canConfirmFinanceFact(receivableOnly, 'RECONCILIATION'), false)
  assert.equal(canConfirmFinanceFact(payableOnly, 'PAYMENT'), false)
  assert.equal(
    canConfirmFinanceFact(reconciliationOnly, 'RECONCILIATION'),
    true
  )
})

test('customer config action projection remains part of the frontend guard', () => {
  const projectedOut = {
    permissions: ['finance.receivable.confirm'],
    effective_session: { actions: [] },
  }

  assert.equal(canConfirmFinanceFact(projectedOut, 'RECEIVABLE'), false)
})
