import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import test from 'node:test'

import * as flow from './payableReconciliationFlow.mjs'

test('payableReconciliationFlow: 移动端应付和对账完成不再本地派生任务或业务状态', () => {
  const hookSource = readFileSync(
    new URL('../mobile/hooks/useMobileRoleTaskActions.js', import.meta.url),
    'utf8'
  )

  assert.equal(hookSource.includes('completePayableRegistrationTask'), false)
  assert.equal(hookSource.includes('completePayableReconciliationTask'), false)
  assert.equal(hookSource.includes('buildPurchaseReconciliationTask'), false)
  assert.equal(hookSource.includes('buildOutsourceReconciliationTask'), false)
  assert.equal(hookSource.includes('buildPayableBlockedState'), false)
  assert.equal(hookSource.includes('upsertWorkflowBusinessState'), false)
  assert.equal(hookSource.includes('PURCHASE_RECONCILIATION_TASK_GROUP'), false)
  assert.equal(
    hookSource.includes('OUTSOURCE_RECONCILIATION_TASK_GROUP'),
    false
  )
})

test('payableReconciliationFlow: recognizes server tasks without exposing client task builders', () => {
  assert.equal(
    Object.keys(flow).some((name) => name.startsWith('build')),
    false
  )
  for (const [matcher, sourceType, taskGroup] of [
    [
      'isPayableRegistrationTask',
      'accessories-purchase',
      'purchase_payable_registration',
    ],
    [
      'isPayableRegistrationTask',
      'processing-contracts',
      'outsource_payable_registration',
    ],
    ['isPayableReconciliationTask', 'payables', 'purchase_reconciliation'],
    ['isPayableReconciliationTask', 'payables', 'outsource_reconciliation'],
  ]) {
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: taskGroup }),
      true
    )
    assert.equal(
      flow[matcher]({ source_type: 'unrelated', task_group: taskGroup }),
      false
    )
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: 'unrelated' }),
      false
    )
    assert.equal(flow[matcher]({}), false)
  }
})
