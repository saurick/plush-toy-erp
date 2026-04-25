import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWorkflowTaskAlert } from './workflowDashboardStats.mjs'
import {
  INVOICE_REGISTRATION_TASK_GROUP,
  RECEIVABLE_REGISTRATION_TASK_GROUP,
  buildFinanceBlockedState,
  buildInvoiceRegistrationTask,
  buildReceivableRegistrationTask,
  hasActiveInvoiceRegistrationTaskForRecord,
  hasActiveReceivableRegistrationTaskForRecord,
  isInvoiceRegistrationTask,
  isReceivableRegistrationTask,
  isShipmentCompletedRecord,
  resolveShipmentFinanceTaskBusinessStatus,
} from './shipmentFinanceFlow.mjs'

const NOW_MS = Date.parse('2026-04-25T00:00:00Z')
const NOW_SECONDS = Math.floor(NOW_MS / 1000)

function shipmentRecord(overrides = {}) {
  return {
    id: 56,
    module_key: 'outbound',
    document_no: 'OUT-056',
    title: '小熊公仔出货',
    business_status_key: 'shipped',
    source_no: 'SO-2026-056',
    customer_name: '联调客户',
    product_name: '小熊公仔',
    quantity: 600,
    unit: '只',
    amount: 36000,
    payload: {
      shipment_date: '2026-04-25',
      payment_due_date: '2026-04-30',
      invoice_due_date: '2026-05-02',
      tax_rate: '13%',
      tax_amount: 4141.59,
      amount_with_tax: 36000,
      amount_without_tax: 31858.41,
      contract_no: 'CT-056',
    },
    ...overrides,
  }
}

test('shipmentFinanceFlow: shipped 记录能生成财务应收登记任务', () => {
  const task = buildReceivableRegistrationTask(
    shipmentRecord(),
    { id: 88, priority: 3 },
    { nowMs: NOW_MS }
  )

  assert.equal(isShipmentCompletedRecord(shipmentRecord()), true)
  assert.equal(isReceivableRegistrationTask(task), true)
  assert.equal(task.task_group, RECEIVABLE_REGISTRATION_TASK_GROUP)
  assert.equal(task.task_name, '应收登记')
  assert.equal(task.business_status_key, 'shipped')
  assert.equal(task.owner_role_key, 'finance')
  assert.equal(task.priority, 3)
  assert.equal(
    task.due_at,
    Math.floor(Date.parse('2026-04-30T23:59:59') / 1000)
  )
  assert.equal(task.due_at < NOW_MS, true)
  assert.equal(task.payload.alert_type, 'finance_pending')
  assert.equal(task.payload.next_module_key, 'receivables')
})

test('shipmentFinanceFlow: 应收登记完成后能生成开票登记任务', () => {
  const receivableTask = buildReceivableRegistrationTask(
    shipmentRecord(),
    { id: 88 },
    { nowMs: NOW_MS }
  )
  const invoiceTask = buildInvoiceRegistrationTask(
    shipmentRecord(),
    { ...receivableTask, id: 99, priority: 3 },
    { nowMs: NOW_MS }
  )

  assert.equal(isInvoiceRegistrationTask(invoiceTask), true)
  assert.equal(invoiceTask.task_group, INVOICE_REGISTRATION_TASK_GROUP)
  assert.equal(invoiceTask.task_name, '开票登记')
  assert.equal(invoiceTask.business_status_key, 'reconciling')
  assert.equal(invoiceTask.owner_role_key, 'finance')
  assert.equal(invoiceTask.priority, 3)
  assert.equal(invoiceTask.payload.alert_type, 'invoice_pending')
  assert.equal(invoiceTask.payload.next_module_key, 'invoices')
})

test('shipmentFinanceFlow: 开票登记完成后业务状态进入 reconciling', () => {
  const invoiceTask = buildInvoiceRegistrationTask(
    shipmentRecord(),
    { id: 99 },
    { nowMs: NOW_MS }
  )

  assert.equal(
    resolveShipmentFinanceTaskBusinessStatus(invoiceTask, 'done'),
    'reconciling'
  )
  assert.equal(
    resolveShipmentFinanceTaskBusinessStatus(invoiceTask, 'blocked'),
    'blocked'
  )
})

test('shipmentFinanceFlow: 财务任务阻塞能形成预警状态', () => {
  const record = shipmentRecord()
  const task = buildReceivableRegistrationTask(
    record,
    { id: 88 },
    { nowMs: NOW_MS }
  )
  const state = buildFinanceBlockedState(record, task, '客户金额未确认')
  const alert = buildWorkflowTaskAlert(
    {
      ...task,
      task_status_key: 'blocked',
      blocked_reason: '客户金额未确认',
    },
    { nowMs: NOW_MS }
  )

  assert.equal(state.business_status_key, 'blocked')
  assert.equal(state.owner_role_key, 'finance')
  assert.equal(state.blocked_reason, '客户金额未确认')
  assert.equal(alert.alert_level, 'critical')
})

test('shipmentFinanceFlow: overdue 应收或开票任务进入 finance_overdue', () => {
  const overdueTask = buildReceivableRegistrationTask(
    shipmentRecord({
      payload: {
        payment_due_date: '2026-04-24',
      },
    }),
    null,
    { nowMs: NOW_MS }
  )
  const alert = buildWorkflowTaskAlert(overdueTask, { nowMs: NOW_MS })

  assert.equal(alert.alert_type, 'finance_overdue')
  assert.equal(alert.alert_level, 'critical')
})

test('shipmentFinanceFlow: 缺 source_no / document_no 时不崩溃', () => {
  const task = buildReceivableRegistrationTask(
    shipmentRecord({
      document_no: '',
      source_no: '',
      title: '',
    }),
    null,
    { nowMs: NOW_MS }
  )

  assert.equal(task.source_no, '56')
  assert.equal(
    task.payload.related_documents.some((item) => item.includes('56')),
    true
  )
})

test('shipmentFinanceFlow: 非出货 / 应收 / 开票模块不误触发', () => {
  assert.equal(
    buildReceivableRegistrationTask({
      id: 1,
      module_key: 'accessories-purchase',
      business_status_key: 'shipped',
    }),
    null
  )
  assert.equal(
    buildInvoiceRegistrationTask({
      id: 1,
      module_key: 'accessories-purchase',
    }),
    null
  )
})

test('shipmentFinanceFlow: 已存在未完成应收或开票任务时按记录去重', () => {
  const record = shipmentRecord()
  const receivableTask = buildReceivableRegistrationTask(record, null, {
    nowMs: NOW_MS,
  })
  const invoiceTask = buildInvoiceRegistrationTask(record, receivableTask, {
    nowMs: NOW_MS,
  })

  assert.equal(
    hasActiveReceivableRegistrationTaskForRecord([receivableTask], record),
    true
  )
  assert.equal(
    hasActiveInvoiceRegistrationTaskForRecord([invoiceTask], record),
    true
  )
  assert.equal(
    hasActiveReceivableRegistrationTaskForRecord(
      [{ ...receivableTask, task_status_key: 'done' }],
      record
    ),
    false
  )
})
