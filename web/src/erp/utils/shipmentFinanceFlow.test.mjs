import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import test from 'node:test'

import * as flow from './shipmentFinanceFlow.mjs'

test('shipmentFinanceFlow: 移动端应收和开票完成不再本地派生任务或业务状态', () => {
  const hookSource = readFileSync(
    new URL('../mobile/hooks/useMobileRoleTaskActions.js', import.meta.url),
    'utf8'
  )

  assert.equal(hookSource.includes('completeReceivableRegistrationTask'), false)
  assert.equal(hookSource.includes('completeInvoiceRegistrationTask'), false)
  assert.equal(hookSource.includes('buildInvoiceRegistrationTask'), false)
  assert.equal(hookSource.includes('buildFinanceBlockedState'), false)
  assert.equal(hookSource.includes('upsertWorkflowBusinessState'), false)
  assert.equal(hookSource.includes('INVOICE_REGISTRATION_TASK_GROUP'), false)
})

test('shipmentFinanceFlow: recognizes server tasks without exposing client task builders', () => {
  assert.equal(
    Object.keys(flow).some((name) => name.startsWith('build')),
    false
  )
  for (const [matcher, sourceType, taskGroup] of [
    ['isReceivableRegistrationTask', 'shipment', 'receivable_registration'],
    ['isInvoiceRegistrationTask', 'invoices', 'invoice_registration'],
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
