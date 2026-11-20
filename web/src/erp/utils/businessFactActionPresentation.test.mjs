import assert from 'node:assert/strict'
import test from 'node:test'
import {
  operationalFactActionPresentation,
  inventoryOperationActionPresentation,
  purchaseFactActionPresentation,
  financePaymentActionPresentation,
} from './businessFactActionPresentation.mjs'

test('outsourcing issue and return describe opposite inventory effects', () => {
  const issue = operationalFactActionPresentation('outsourcing', { fact_type: 'MATERIAL_ISSUE', status: 'DRAFT' })
  const receipt = operationalFactActionPresentation('outsourcing', { fact_type: 'RETURN_RECEIPT', status: 'DRAFT' })
  assert.equal(issue.label, '确认委外发料')
  assert.match(issue.description, /扣减/u)
  assert.equal(receipt.label, '确认回货入库')
  assert.match(receipt.description, /增加/u)
  assert.match(receipt.description, /质检与应付继续/u)
})

test('voiding drafts and reversing confirmed stock retain different consequences', () => {
  for (const [scope, fact_type] of [['production', 'MATERIAL_ISSUE'], ['production', 'FINISHED_GOODS_RECEIPT'], ['outsourcing', 'MATERIAL_ISSUE'], ['outsourcing', 'RETURN_RECEIPT']]) {
    const draft = operationalFactActionPresentation(scope, { fact_type, status: 'DRAFT' }, 'cancel')
    const posted = operationalFactActionPresentation(scope, { fact_type, status: 'POSTED' }, 'cancel')
    assert.match(draft.label, /^作废/u)
    assert.match(draft.description, /不会改变库存/u)
    assert.doesNotMatch(draft.success, /恢复/u)
    assert.match(posted.label, /^撤销/u)
    assert.match(posted.description, /本次.*库存影响/u)
    assert.doesNotMatch(posted.description, /恢复至.*前库存/u)
  }
})

test('purchase return and adjustment distinguish draft void from confirmed reversal', () => {
  for (const [kind, name] of [['return', '采购退货'], ['adjustment', '入库调整']]) {
    const draft = purchaseFactActionPresentation(kind, { status: 'DRAFT' }, 'cancel')
    const posted = purchaseFactActionPresentation(kind, { status: 'POSTED' }, 'cancel')
    assert.equal(draft.label, `作废${name}草稿`)
    assert.match(draft.description, /不会改变库存；原记录继续保留/u)
    assert.equal(draft.success, `${name}草稿已作废，库存未发生变动`)
    assert.equal(posted.label, `撤销${name}`)
    assert.match(posted.description, /本次.*库存影响，保留.*反向记录/u)
    assert.equal(posted.success, `${name}已撤销，本次库存影响已恢复`)
  }
})

test('approved inventory work is not described as already executed when cancelled', () => {
  const operation = { operation_type: 'CYCLE_COUNT', status: 'APPROVED' }
  assert.match(inventoryOperationActionPresentation(operation).description, /零差异也保留/u)
  const cancelled = inventoryOperationActionPresentation(operation, 'cancel')
  assert.match(cancelled.description, /尚未更新库存/u)
  assert.doesNotMatch(cancelled.success, /已恢复/u)
  assert.match(inventoryOperationActionPresentation({ ...operation, status: 'POSTED' }, 'cancel').description, /撤销本次盘点差异/u)
})

test('partial purchase inbound keeps the remaining inspection work visible', () => {
  const partial = purchaseFactActionPresentation('receipt', { status: 'POSTED', pending_inbound_lines: 2 })
  const complete = purchaseFactActionPresentation('receipt', { status: 'POSTED', pending_inbound_lines: 0 })
  assert.match(partial.success, /其余明细继续检验或处置/u)
  assert.equal(complete.success, '本次合格材料已入库')
  assert.equal(partial.label, complete.label)
})

test('financial records never claim cancellation changed inventory or refunded money', () => {
  for (const fact_type of ['RECEIVABLE', 'PAYABLE', 'INVOICE', 'RECONCILIATION']) {
    const draft = operationalFactActionPresentation('finance', { fact_type, status: 'DRAFT' }, 'cancel')
    const posted = operationalFactActionPresentation('finance', { fact_type, status: 'POSTED' }, 'cancel')
    assert.match(draft.description, /不会产生正式财务结果或库存变动/u)
    assert.match(posted.description, /不代表实际退款或库存变动/u)
    assert.doesNotMatch(posted.success, /库存.*恢复|退款已完成/u)
  }
})

test('payment copy distinguishes direction, allocation and reversal without claiming a bank transfer', () => {
  const payment = { direction: 'DISBURSEMENT', status: 'APPROVED' }
  const cashOnly = financePaymentActionPresentation(payment, 'post', { cashOnly: true })
  const allocated = financePaymentActionPresentation(payment)
  assert.equal(cashOnly.label, '确认付款入账')
  assert.equal(allocated.label, '确认入账并核销')
  assert.doesNotMatch(cashOnly.success, /完成核销/u)
  assert.match(allocated.success, /完成核销/u)
  assert.match(cashOnly.description, /不会发起银行转账/u)
  assert.match(financePaymentActionPresentation(payment, 'reverse').description, /实际退款另行/u)
  assert.equal(financePaymentActionPresentation({ direction: 'RECEIPT' }, 'post', { cashOnly: true }).label, '确认收款入账')
})

test('unknown record types cannot borrow a misleading stock action', () => {
  assert.throws(() => operationalFactActionPresentation('outsourcing', { fact_type: 'UNKNOWN' }), /未登记/u)
  assert.throws(() => inventoryOperationActionPresentation({ operation_type: 'UNKNOWN' }), /未登记/u)
  assert.throws(() => purchaseFactActionPresentation('UNKNOWN', {}), /未登记/u)
})
