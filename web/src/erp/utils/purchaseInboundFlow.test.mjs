import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildIqcTaskFromArrivalRecord,
  buildPurchaseQualityExceptionTask,
  buildWarehouseInboundTaskFromIqcPass,
  hasActiveIqcTaskForRecord,
  isIqcFailResult,
  isIqcPassResult,
  resolveIqcDueAt,
  resolveInboundPriority,
} from './purchaseInboundFlow.mjs'
import { buildWorkflowTaskAlert } from './workflowDashboardStats.mjs'

const NOW_MS = Date.parse('2026-04-25T08:00:00')
const NOW_SEC = Math.floor(NOW_MS / 1000)
const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

function arrivalRecord(overrides = {}) {
  return {
    id: 66,
    module_key: 'accessories-purchase',
    document_no: 'PUR-ARR-001',
    title: 'PP 棉到货',
    source_no: 'PUR-001',
    supplier_name: '联调供应商',
    material_name: 'PP 棉',
    product_name: '',
    quantity: 120,
    unit: 'kg',
    due_date: '2026-04-28',
    business_status_key: 'material_preparing',
    owner_role_key: 'purchasing',
    payload: {},
    ...overrides,
  }
}

test('purchaseInboundFlow: 到货记录能生成 quality IQC 任务', () => {
  const task = buildIqcTaskFromArrivalRecord(arrivalRecord(), {
    nowMs: NOW_MS,
  })

  assert.equal(task.task_group, 'purchase_iqc')
  assert.equal(task.task_name, 'IQC 来料检验')
  assert.equal(task.source_type, 'accessories-purchase')
  assert.equal(task.source_id, 66)
  assert.equal(task.source_no, 'PUR-ARR-001')
  assert.equal(task.business_status_key, 'iqc_pending')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'quality')
  assert.equal(task.priority, 2)
  assert.equal(task.due_at, NOW_SEC + 4 * 60 * 60)
  assert.equal(task.payload.alert_type, 'qc_pending')
  assert.equal(task.payload.critical_path, true)
  assert.match(task.payload.complete_condition, /来料检验/)
  assert(task.payload.related_documents.some((item) => item.includes('供应商')))
})

test('purchaseInboundFlow: IQC 合格能生成 warehouse 入库任务', () => {
  const iqcTask = buildIqcTaskFromArrivalRecord(arrivalRecord(), {
    nowMs: NOW_MS,
  })
  const task = buildWarehouseInboundTaskFromIqcPass(arrivalRecord(), iqcTask, {
    nowMs: NOW_MS,
  })

  assert.equal(task.task_group, 'warehouse_inbound')
  assert.equal(task.task_name, '确认入库')
  assert.equal(task.business_status_key, 'warehouse_inbound_pending')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'warehouse')
  assert.equal(task.priority, 2)
  assert.equal(task.due_at, NOW_SEC + 4 * 60 * 60)
  assert.equal(task.payload.qc_result, 'pass')
  assert.equal(task.payload.material_name, 'PP 棉')
  assert.equal(task.payload.product_name, '')
  assert.equal(task.payload.quantity, 120)
  assert.equal(task.payload.unit, 'kg')
  assert.equal(Object.hasOwn(task.payload, 'material_id'), false)
  assert.equal(Object.hasOwn(task.payload, 'product_id'), false)
  assert.equal(Object.hasOwn(task.payload, 'unit_id'), false)
  assert.equal(Object.hasOwn(task.payload, 'warehouse_id'), false)
  assert.equal(Object.hasOwn(task.payload, 'lot_id'), false)
  assert.match(task.payload.complete_condition, /确认入库数量/)
  assert(task.payload.related_documents.some((item) => item.includes('IQC')))
})

test('purchaseInboundFlow: IQC 不合格能生成 purchasing 异常处理任务并产生 critical 预警', () => {
  const iqcTask = buildIqcTaskFromArrivalRecord(arrivalRecord(), {
    nowMs: NOW_MS,
  })
  const task = buildPurchaseQualityExceptionTask(
    arrivalRecord(),
    iqcTask,
    '来料破包',
    { nowMs: NOW_MS }
  )
  const alert = buildWorkflowTaskAlert(task, { nowMs: NOW_MS })

  assert.equal(task.task_group, 'purchase_quality_exception')
  assert.equal(task.task_name, '处理来料不良 / 补货 / 退货')
  assert.equal(task.business_status_key, 'qc_failed')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'purchasing')
  assert.equal(task.priority, 3)
  assert.equal(task.payload.notification_type, 'qc_failed')
  assert.equal(task.payload.alert_type, 'qc_failed')
  assert.equal(task.payload.rejected_reason, '来料破包')
  assert.equal(alert?.alert_level, 'critical')
  assert.equal(alert?.alert_type, 'qc_failed')
})

test('purchaseInboundFlow: 移动端 IQC 状态动作不再本地创建下游任务', () => {
  assert.equal(
    mobileRoleTasksPageSource.includes('buildWarehouseInboundTaskFromIqcPass'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildPurchaseQualityExceptionTask'),
    false
  )
  assert.equal(mobileRoleTasksPageSource.includes('passIqcTask'), false)
  assert.equal(mobileRoleTasksPageSource.includes('failIqcTask'), false)
  assert.equal(
    mobileRoleTasksPageSource.includes('runPurchaseInboundFollowUp'),
    false
  )
  assert.match(mobileRoleTasksPageSource, /await loadTasks\(\)/)
})

test('purchaseInboundFlow: 移动端采购 warehouse_inbound 状态动作交给后端', () => {
  assert.equal(
    mobileRoleTasksPageSource.includes('completeWarehouseInboundTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildPurchasePayableRegistrationTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes(
      'PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP'
    ),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('runPurchaseInboundFollowUp'),
    false
  )
  assert.match(
    mobileRoleTasksPageSource,
    /if \(isWarehouseInboundTask\(task\)\) {[\s\S]{0,220}if \(taskStatusKey === 'done'\) return INBOUND_DONE_STATUS_KEY[\s\S]{0,220}if \(\['blocked', 'rejected'\]\.includes\(taskStatusKey\)\) return 'blocked'/
  )
})

test('purchaseInboundFlow: due_at 使用 Unix 秒，due_date 当天更紧急', () => {
  assert.equal(
    resolveIqcDueAt(arrivalRecord(), { nowMs: NOW_MS }),
    NOW_SEC + 4 * 60 * 60
  )
  assert.equal(
    resolveIqcDueAt(arrivalRecord({ due_date: '2026-04-25' }), {
      nowMs: NOW_MS,
    }),
    NOW_SEC + 2 * 60 * 60
  )
  assert(resolveIqcDueAt(arrivalRecord(), { nowMs: NOW_MS }) < NOW_MS)
})

test('purchaseInboundFlow: priority 默认 2，显式 priority 和近交期可提升', () => {
  assert.equal(resolveInboundPriority(arrivalRecord(), { nowMs: NOW_MS }), 2)
  assert.equal(
    resolveInboundPriority(arrivalRecord({ payload: { priority: 4 } }), {
      nowMs: NOW_MS,
    }),
    4
  )
  assert.equal(
    resolveInboundPriority(arrivalRecord({ due_date: '2026-04-25' }), {
      nowMs: NOW_MS,
    }),
    4
  )
})

test('purchaseInboundFlow: 缺 source_no/document_no 不崩溃，非到货模块不误触发', () => {
  const task = buildIqcTaskFromArrivalRecord(
    arrivalRecord({ document_no: '', source_no: '', title: '标题兜底' }),
    { nowMs: NOW_MS }
  )
  const nonArrivalTask = buildIqcTaskFromArrivalRecord(
    arrivalRecord({ module_key: 'project-orders' }),
    { nowMs: NOW_MS }
  )

  assert.equal(task.source_no, '标题兜底')
  assert.equal(nonArrivalTask, null)
})

test('purchaseInboundFlow: IQC 结果判断覆盖合格和不合格常见值', () => {
  assert.equal(isIqcPassResult('pass'), true)
  assert.equal(isIqcPassResult('qualified'), true)
  assert.equal(isIqcPassResult('让步接收'), true)
  assert.equal(isIqcFailResult('fail'), true)
  assert.equal(isIqcFailResult('rejected'), true)
  assert.equal(isIqcFailResult('不合格'), true)
})

test('purchaseInboundFlow: 已存在未完成 IQC 任务时可识别并避免重复创建', () => {
  const record = arrivalRecord()
  const activeTask = buildIqcTaskFromArrivalRecord(record, { nowMs: NOW_MS })
  const doneTask = {
    ...activeTask,
    id: 99,
    task_status_key: 'done',
  }

  assert.equal(hasActiveIqcTaskForRecord([activeTask], record), true)
  assert.equal(hasActiveIqcTaskForRecord([doneTask], record), false)
  assert.equal(
    hasActiveIqcTaskForRecord([activeTask], { ...record, id: 67 }),
    false
  )
})
