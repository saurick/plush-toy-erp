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
    'finance.receivable.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('PAYABLE'), [
    'finance.payable.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('PAYMENT'), [
    'finance.receivable.confirm',
    'finance.payable.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('RECONCILIATION'), [
    'finance.receivable.confirm',
    'finance.payable.confirm',
  ])
  assert.deepEqual(financeFactConfirmPermissions('unknown'), [])
})

test('shared finance facts require both effective permissions', () => {
  const receivableOnly = adminWithActions('finance.receivable.confirm')
  const payableOnly = adminWithActions('finance.payable.confirm')
  const both = adminWithActions(
    'finance.receivable.confirm',
    'finance.payable.confirm'
  )

  assert.equal(canConfirmFinanceFact(receivableOnly, 'RECEIVABLE'), true)
  assert.equal(canConfirmFinanceFact(receivableOnly, 'PAYABLE'), false)
  assert.equal(canConfirmFinanceFact(payableOnly, 'PAYABLE'), true)
  assert.equal(canConfirmFinanceFact(payableOnly, 'INVOICE'), false)
  assert.equal(canConfirmFinanceFact(receivableOnly, 'RECONCILIATION'), false)
  assert.equal(canConfirmFinanceFact(payableOnly, 'PAYMENT'), false)
  assert.equal(canConfirmFinanceFact(both, 'RECONCILIATION'), true)
})

test('customer config action projection remains part of the frontend guard', () => {
  const projectedOut = {
    permissions: ['finance.receivable.confirm'],
    effective_session: { actions: [] },
  }

  assert.equal(canConfirmFinanceFact(projectedOut, 'RECEIVABLE'), false)
})
