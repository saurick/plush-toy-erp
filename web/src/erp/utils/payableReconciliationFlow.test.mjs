import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWorkflowTaskAlert } from './workflowDashboardStats.mjs'
import {
  OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP,
  OUTSOURCE_RECONCILIATION_TASK_GROUP,
  PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP,
  PURCHASE_RECONCILIATION_TASK_GROUP,
  buildOutsourcePayableRegistrationTask,
  buildOutsourceReconciliationTask,
  buildPayableBlockedState,
  buildPurchasePayableRegistrationTask,
  buildPurchaseReconciliationTask,
  hasActivePayableRegistrationTaskForRecord,
  hasActiveReconciliationTaskForRecord,
  isOutsourceInboundDoneRecord,
  isOutsourcePayableRegistrationTask,
  isOutsourceReconciliationTask,
  isPurchaseInboundDoneRecord,
  isPurchasePayableRegistrationTask,
  isPurchaseReconciliationTask,
  resolvePayableReconciliationTaskBusinessStatus,
} from './payableReconciliationFlow.mjs'

const NOW_MS = Date.parse('2026-04-25T00:00:00Z')
const NOW_SECONDS = Math.floor(NOW_MS / 1000)

function purchaseRecord(overrides = {}) {
  return {
    id: 71,
    module_key: 'accessories-purchase',
    document_no: 'AP-071',
    title: '辅料采购入库',
    business_status_key: 'inbound_done',
    source_no: 'PO-071',
    supplier_name: '联调供应商',
    material_name: 'PP 棉',
    quantity: 120,
    unit: 'kg',
    amount: 9600,
    payload: {
      inbound_date: '2026-04-24',
      payment_due_date: '2026-04-30',
      tax_rate: '13%',
      tax_amount: 1104.42,
      amount_with_tax: 9600,
      amount_without_tax: 8495.58,
      iqc_result: 'pass',
    },
    ...overrides,
  }
}

function outsourceRecord(overrides = {}) {
  return {
    id: 72,
    module_key: 'processing-contracts',
    document_no: 'PC-072',
    title: '委外加工入库',
    business_status_key: 'inbound_done',
    source_no: 'SO-072',
    supplier_name: '联调加工厂',
    product_name: '兔子挂件',
    quantity: 300,
    unit: '只',
    amount: 15000,
    payload: {
      outsource_processing: true,
      inbound_date: '2026-04-24',
      payment_due_date: '2026-05-05',
      tax_rate: '6%',
      tax_amount: 849.06,
      amount_with_tax: 15000,
      amount_without_tax: 14150.94,
      qc_result: 'pass',
    },
    ...overrides,
  }
}

test('payableReconciliationFlow: inbound_done 的采购记录能生成财务采购应付登记任务', () => {
  const task = buildPurchasePayableRegistrationTask(
    purchaseRecord(),
    { id: 501, priority: 3 },
    { nowMs: NOW_MS }
  )

  assert.equal(isPurchaseInboundDoneRecord(purchaseRecord()), true)
  assert.equal(isPurchasePayableRegistrationTask(task), true)
  assert.equal(task.task_group, PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP)
  assert.equal(task.task_name, '采购应付登记')
  assert.equal(task.business_status_key, 'inbound_done')
  assert.equal(task.owner_role_key, 'finance')
  assert.equal(task.priority, 3)
  assert.equal(
    task.due_at,
    Math.floor(Date.parse('2026-04-30T23:59:59') / 1000)
  )
  assert.equal(task.due_at < NOW_MS, true)
  assert.equal(task.payload.alert_type, 'payable_pending')
  assert.equal(task.payload.payable_type, 'purchase')
  assert.equal(task.payload.next_module_key, 'payables')
})

test('payableReconciliationFlow: inbound_done 的委外记录能生成财务委外应付登记任务', () => {
  const task = buildOutsourcePayableRegistrationTask(
    outsourceRecord(),
    { id: 502, priority: 2 },
    { nowMs: NOW_MS }
  )

  assert.equal(isOutsourceInboundDoneRecord(outsourceRecord()), true)
  assert.equal(isOutsourcePayableRegistrationTask(task), true)
  assert.equal(task.task_group, OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP)
  assert.equal(task.task_name, '委外应付登记')
  assert.equal(task.business_status_key, 'inbound_done')
  assert.equal(task.owner_role_key, 'finance')
  assert.equal(task.payload.alert_type, 'payable_pending')
  assert.equal(task.payload.payable_type, 'outsource')
})

test('payableReconciliationFlow: 应付登记完成后能生成采购或委外对账任务', () => {
  const purchasePayableTask = buildPurchasePayableRegistrationTask(
    purchaseRecord(),
    { id: 501 },
    { nowMs: NOW_MS }
  )
  const purchaseReconciliationTask = buildPurchaseReconciliationTask(
    purchaseRecord(),
    { ...purchasePayableTask, id: 601, priority: 3 },
    { nowMs: NOW_MS }
  )
  const outsourcePayableTask = buildOutsourcePayableRegistrationTask(
    outsourceRecord(),
    { id: 502 },
    { nowMs: NOW_MS }
  )
  const outsourceReconciliationTask = buildOutsourceReconciliationTask(
    outsourceRecord(),
    { ...outsourcePayableTask, id: 602, priority: 2 },
    { nowMs: NOW_MS }
  )

  assert.equal(isPurchaseReconciliationTask(purchaseReconciliationTask), true)
  assert.equal(
    purchaseReconciliationTask.task_group,
    PURCHASE_RECONCILIATION_TASK_GROUP
  )
  assert.equal(purchaseReconciliationTask.task_name, '采购对账')
  assert.equal(purchaseReconciliationTask.business_status_key, 'reconciling')
  assert.equal(purchaseReconciliationTask.priority, 3)
  assert.equal(
    purchaseReconciliationTask.due_at,
    NOW_SECONDS + 2 * 24 * 60 * 60
  )
  assert.equal(
    purchaseReconciliationTask.payload.alert_type,
    'reconciliation_pending'
  )

  assert.equal(isOutsourceReconciliationTask(outsourceReconciliationTask), true)
  assert.equal(
    outsourceReconciliationTask.task_group,
    OUTSOURCE_RECONCILIATION_TASK_GROUP
  )
  assert.equal(outsourceReconciliationTask.task_name, '委外对账')
  assert.equal(outsourceReconciliationTask.business_status_key, 'reconciling')
  assert.equal(outsourceReconciliationTask.payload.payable_type, 'outsource')
})

test('payableReconciliationFlow: 对账完成后进入 settled', () => {
  const purchaseReconciliationTask = buildPurchaseReconciliationTask(
    purchaseRecord(),
    { id: 601 },
    { nowMs: NOW_MS }
  )
  const outsourceReconciliationTask = buildOutsourceReconciliationTask(
    outsourceRecord(),
    { id: 602 },
    { nowMs: NOW_MS }
  )

  assert.equal(
    resolvePayableReconciliationTaskBusinessStatus(
      purchaseReconciliationTask,
      'done'
    ),
    'settled'
  )
  assert.equal(
    resolvePayableReconciliationTaskBusinessStatus(
      outsourceReconciliationTask,
      'done'
    ),
    'settled'
  )
  assert.equal(
    resolvePayableReconciliationTaskBusinessStatus(
      purchaseReconciliationTask,
      'blocked'
    ),
    'blocked'
  )
})

test('payableReconciliationFlow: 应付或对账阻塞能形成财务预警', () => {
  const task = buildPurchasePayableRegistrationTask(
    purchaseRecord(),
    { id: 501 },
    { nowMs: NOW_MS }
  )
  const state = buildPayableBlockedState(
    purchaseRecord(),
    task,
    '供应商金额未确认'
  )
  const alert = buildWorkflowTaskAlert(
    {
      ...task,
      task_status_key: 'blocked',
      blocked_reason: '供应商金额未确认',
    },
    { nowMs: NOW_MS }
  )

  assert.equal(state.business_status_key, 'blocked')
  assert.equal(state.owner_role_key, 'finance')
  assert.equal(state.blocked_reason, '供应商金额未确认')
  assert.equal(alert.alert_level, 'critical')
})

test('payableReconciliationFlow: overdue 应付或对账任务进入 finance_overdue', () => {
  const overdueTask = buildOutsourcePayableRegistrationTask(
    outsourceRecord({
      payload: {
        outsource_processing: true,
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

test('payableReconciliationFlow: 缺 source_no / document_no 时不崩溃', () => {
  const task = buildPurchasePayableRegistrationTask(
    purchaseRecord({
      document_no: '',
      source_no: '',
      title: '',
    }),
    null,
    { nowMs: NOW_MS }
  )

  assert.equal(task.source_no, '71')
  assert.equal(
    task.payload.related_documents.some((item) => item.includes('71')),
    true
  )
})

test('payableReconciliationFlow: 非采购 委外 入库 应付 对账模块不误触发', () => {
  assert.equal(
    buildPurchasePayableRegistrationTask({
      id: 1,
      module_key: 'project-orders',
      business_status_key: 'inbound_done',
    }),
    null
  )
  assert.equal(
    buildOutsourcePayableRegistrationTask({
      id: 1,
      module_key: 'project-orders',
      business_status_key: 'inbound_done',
    }),
    null
  )
  assert.equal(
    buildPurchaseReconciliationTask({
      id: 1,
      module_key: 'project-orders',
    }),
    null
  )
})

test('payableReconciliationFlow: 已存在未完成应付或对账任务时按记录去重', () => {
  const record = purchaseRecord()
  const payableTask = buildPurchasePayableRegistrationTask(record, null, {
    nowMs: NOW_MS,
  })
  const reconciliationTask = buildPurchaseReconciliationTask(
    record,
    payableTask,
    {
      nowMs: NOW_MS,
    }
  )

  assert.equal(
    hasActivePayableRegistrationTaskForRecord([payableTask], record),
    true
  )
  assert.equal(
    hasActiveReconciliationTaskForRecord([reconciliationTask], record),
    true
  )
  assert.equal(
    hasActivePayableRegistrationTaskForRecord(
      [{ ...payableTask, task_status_key: 'done' }],
      record
    ),
    false
  )
})
