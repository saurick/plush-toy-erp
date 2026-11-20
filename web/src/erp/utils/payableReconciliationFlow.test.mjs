import test from 'node:test'

import * as flow from './payableReconciliationFlow.mjs'
import {
  assertServerOwnedTaskMatchers,
  assertSourceOmitsSymbols,
  mobileWorkflowSources,
} from '../../../scripts/test/workflowFlowContract.mjs'

test('payableReconciliationFlow: 移动端应付和对账完成不再本地派生任务或业务状态', () => {
  assertSourceOmitsSymbols(
    mobileWorkflowSources.actions,
    'useMobileRoleTaskActions',
    [
      'completePayableRegistrationTask',
      'completePayableReconciliationTask',
      'buildPurchaseReconciliationTask',
      'buildOutsourceReconciliationTask',
      'buildPayableBlockedState',
      'upsertWorkflowBusinessState',
      'PURCHASE_RECONCILIATION_TASK_GROUP',
      'OUTSOURCE_RECONCILIATION_TASK_GROUP',
    ]
  )
})

test('payableReconciliationFlow: recognizes server tasks without exposing client task builders', () => {
  assertServerOwnedTaskMatchers(flow, [
    {
      matcher: 'isPayableRegistrationTask',
      sourceType: 'accessories-purchase',
      taskGroup: 'purchase_payable_registration',
    },
    {
      matcher: 'isPayableRegistrationTask',
      sourceType: 'processing-contracts',
      taskGroup: 'outsource_payable_registration',
    },
    {
      matcher: 'isPayableReconciliationTask',
      sourceType: 'payables',
      taskGroup: 'purchase_reconciliation',
    },
    {
      matcher: 'isPayableReconciliationTask',
      sourceType: 'payables',
      taskGroup: 'outsource_reconciliation',
    },
  ])
})
