import test from 'node:test'

import * as flow from './shipmentFinanceFlow.mjs'
import {
  assertServerOwnedTaskMatchers,
  assertSourceOmitsSymbols,
  mobileWorkflowSources,
} from '../../../scripts/test/workflowFlowContract.mjs'

test('shipmentFinanceFlow: 移动端应收和开票完成不再本地派生任务或业务状态', () => {
  assertSourceOmitsSymbols(
    mobileWorkflowSources.actions,
    'useMobileRoleTaskActions',
    [
      'completeReceivableRegistrationTask',
      'completeInvoiceRegistrationTask',
      'buildInvoiceRegistrationTask',
      'buildFinanceBlockedState',
      'upsertWorkflowBusinessState',
      'INVOICE_REGISTRATION_TASK_GROUP',
    ]
  )
})

test('shipmentFinanceFlow: recognizes server tasks without exposing client task builders', () => {
  assertServerOwnedTaskMatchers(flow, [
    {
      matcher: 'isReceivableRegistrationTask',
      sourceType: 'shipment',
      taskGroup: 'receivable_registration',
    },
    {
      matcher: 'isInvoiceRegistrationTask',
      sourceType: 'invoices',
      taskGroup: 'invoice_registration',
    },
  ])
})
