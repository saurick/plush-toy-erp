import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import {
  createWorkflowTask,
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  upsertWorkflowBusinessState,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import {
  listBusinessRecords,
  updateBusinessRecord,
} from '../../api/businessRecordApi.mjs'
import { getBusinessModule } from '../../config/businessModules.mjs'
import { getBusinessRecordDefinition } from '../../config/businessRecordDefinitions.mjs'
import { buildBusinessRecordStatusUpdateParams } from '../../utils/businessRecordForm.mjs'
import {
  buildMobileTaskListForRole,
  buildMobileTaskSummary,
  formatMobileTaskTime,
} from '../../utils/mobileTaskView.mjs'
import {
  buildMobileWorkflowTaskQueryPlan,
  mergeWorkflowTaskResults,
} from '../../utils/mobileTaskQueries.mjs'
import { isRoleKeyMatch, normalizeRoleKey } from '../../utils/roleKeys.mjs'
import {
  ORDER_APPROVAL_STATUS_KEY,
  ORDER_APPROVED_STATUS_KEY,
  isOrderApprovalTask,
} from '../../utils/orderApprovalFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY,
  IQC_PENDING_STATUS_KEY,
  QC_FAILED_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  isPurchaseIqcTask,
  isWarehouseInboundTask,
} from '../../utils/purchaseInboundFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY as OUTSOURCE_INBOUND_DONE_STATUS_KEY,
  PRODUCTION_PROCESSING_STATUS_KEY as OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_FAILED_STATUS_KEY as OUTSOURCE_QC_FAILED_STATUS_KEY,
  QC_PENDING_STATUS_KEY as OUTSOURCE_QC_PENDING_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY as OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  OUTSOURCE_RETURN_QC_TASK_GROUP,
  buildOutsourceReturnQcTask,
  isOutsourceReturnQcTask,
  isOutsourceReturnTrackingTask,
  isOutsourceReworkTask,
  isOutsourceWarehouseInboundTask,
} from '../../utils/outsourceReturnFlow.mjs'
import {
  PRODUCTION_PROCESSING_STATUS_KEY as FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_FAILED_STATUS_KEY as FINISHED_GOODS_QC_FAILED_STATUS_KEY,
  SHIPPED_STATUS_KEY as FINISHED_GOODS_SHIPPED_STATUS_KEY,
  isFinishedGoodsInboundTask,
  isFinishedGoodsQcTask,
  isFinishedGoodsReworkTask,
  isShipmentReleaseTask,
  resolveFinishedGoodsTaskBusinessStatus,
} from '../../utils/finishedGoodsFlow.mjs'
import {
  INVOICE_REGISTRATION_TASK_GROUP,
  RECEIVABLE_REGISTRATION_TASK_GROUP,
  RECONCILING_STATUS_KEY as FINANCE_RECONCILING_STATUS_KEY,
  SHIPPED_STATUS_KEY as FINANCE_SHIPPED_STATUS_KEY,
  buildFinanceBlockedState,
  buildInvoiceRegistrationTask,
  buildReceivableRegistrationTask,
  isInvoiceRegistrationTask,
  isReceivableRegistrationTask,
  resolveShipmentFinanceTaskBusinessStatus,
} from '../../utils/shipmentFinanceFlow.mjs'
import {
  OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP,
  OUTSOURCE_RECONCILIATION_TASK_GROUP,
  PURCHASE_RECONCILIATION_TASK_GROUP,
  RECONCILING_STATUS_KEY as PAYABLE_RECONCILING_STATUS_KEY,
  SETTLED_STATUS_KEY as PAYABLE_SETTLED_STATUS_KEY,
  buildOutsourcePayableRegistrationTask,
  buildOutsourceReconciliationTask,
  buildPayableBlockedState,
  buildPurchaseReconciliationTask,
  isOutsourcePayableRegistrationTask,
  isPayableRegistrationTask,
  isPayableReconciliationTask,
  resolvePayableReconciliationTaskBusinessStatus,
} from '../../utils/payableReconciliationFlow.mjs'
import { mobileTheme } from '../theme'

const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'closed', 'cancelled'])
function resolveOrderApprovalBusinessStatus(task, taskStatusKey) {
  if (!isOrderApprovalTask(task)) {
    return task.business_status_key || undefined
  }
  if (taskStatusKey === 'done') return ORDER_APPROVED_STATUS_KEY
  if (taskStatusKey === 'blocked') return 'blocked'
  if (taskStatusKey === 'rejected') return ORDER_APPROVAL_STATUS_KEY
  return task.business_status_key || ORDER_APPROVAL_STATUS_KEY
}

function resolvePurchaseInboundBusinessStatus(task, taskStatusKey) {
  if (isPurchaseIqcTask(task)) {
    if (taskStatusKey === 'done') return WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || IQC_PENDING_STATUS_KEY
  }
  if (isWarehouseInboundTask(task)) {
    if (taskStatusKey === 'done') return INBOUND_DONE_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return task.business_status_key || WAREHOUSE_INBOUND_PENDING_STATUS_KEY
  }
  return null
}

function resolveOutsourceReturnBusinessStatus(task, taskStatusKey) {
  if (isOutsourceReturnTrackingTask(task)) {
    if (taskStatusKey === 'done') return OUTSOURCE_QC_PENDING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return (
      task.business_status_key || OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY
    )
  }
  if (isOutsourceReturnQcTask(task)) {
    if (taskStatusKey === 'done') {
      return OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    }
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return OUTSOURCE_QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || OUTSOURCE_QC_PENDING_STATUS_KEY
  }
  if (isOutsourceWarehouseInboundTask(task)) {
    if (taskStatusKey === 'done') return OUTSOURCE_INBOUND_DONE_STATUS_KEY
    return (
      task.business_status_key || OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    )
  }
  if (isOutsourceReworkTask(task)) {
    if (taskStatusKey === 'done') {
      return OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY
    }
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return OUTSOURCE_QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || OUTSOURCE_QC_FAILED_STATUS_KEY
  }
  return null
}

function resolveMobileTaskBusinessStatus(task, taskStatusKey) {
  return (
    resolvePurchaseInboundBusinessStatus(task, taskStatusKey) ||
    resolveOutsourceReturnBusinessStatus(task, taskStatusKey) ||
    resolveFinishedGoodsTaskBusinessStatus(task, taskStatusKey) ||
    resolveShipmentFinanceTaskBusinessStatus(task, taskStatusKey) ||
    resolvePayableReconciliationTaskBusinessStatus(task, taskStatusKey) ||
    resolveOrderApprovalBusinessStatus(task, taskStatusKey)
  )
}

function supportsRejectedAction(roleKey, task) {
  return (
    (roleKey === 'boss' && isOrderApprovalTask(task)) ||
    (roleKey === 'quality' &&
      (isPurchaseIqcTask(task) ||
        isOutsourceReturnQcTask(task) ||
        isFinishedGoodsQcTask(task))) ||
    (roleKey === 'warehouse' &&
      (isWarehouseInboundTask(task) || isFinishedGoodsInboundTask(task))) ||
    (roleKey === 'finance' &&
      (isReceivableRegistrationTask(task) ||
        isInvoiceRegistrationTask(task) ||
        isPayableRegistrationTask(task) ||
        isPayableReconciliationTask(task)))
  )
}

function canOperateTask(roleKey, task) {
  return isRoleKeyMatch(task.owner_role_key, roleKey)
}

function isRiskTaskForUrge(task = {}) {
  return (
    ['blocked', 'rejected'].includes(
      String(task.task_status_key || '').trim()
    ) ||
    task.due_status === 'overdue' ||
    task.alert_level === 'critical' ||
    task.priority >= 3 ||
    task.payload?.critical_path === true ||
    task.is_escalated === true
  )
}

function resolveMobileUrgeAction(roleKey, task = {}) {
  if (roleKey === 'boss') return 'escalate_to_boss'
  if (
    roleKey !== 'pmc' &&
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  ) {
    return 'escalate_to_pmc'
  }
  return 'urge_task'
}

function canUrgeTask(roleKey, task = {}) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  const taskOwnerRoleKey = normalizeRoleKey(task.owner_role_key)
  const confirmRoleKey = normalizeRoleKey(task.payload?.confirm_role_key)
  if (
    TERMINAL_TASK_STATUS_KEYS.has(String(task.task_status_key || '').trim())
  ) {
    return false
  }
  if (normalizedRoleKey === 'pmc') return isRiskTaskForUrge(task)
  if (normalizedRoleKey === 'boss') {
    return (
      task.priority >= 3 ||
      task.due_status === 'overdue' ||
      task.alert_level === 'critical' ||
      taskOwnerRoleKey === 'finance' ||
      task.is_escalated === true
    )
  }
  if (normalizedRoleKey === 'business') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      confirmRoleKey === normalizedRoleKey ||
      ['project-orders', 'shipping-release', 'outbound'].includes(
        task.source_type
      )
    )
  }
  if (normalizedRoleKey === 'production') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      ['processing-contracts', 'production-progress'].includes(
        task.source_type
      ) ||
      String(task.task_group || '').includes('rework') ||
      String(task.task_group || '').includes('outsource')
    )
  }
  if (normalizedRoleKey === 'finance') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      ['receivables', 'invoices', 'payables', 'reconciliation'].includes(
        task.source_type
      )
    )
  }
  return (
    taskOwnerRoleKey === normalizedRoleKey &&
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  )
}

function hasFinanceAmountPayload(task) {
  const payload = task?.payload || {}
  return [
    'amount',
    'tax_rate',
    'tax_amount',
    'amount_with_tax',
    'amount_without_tax',
  ].some((key) => payload[key] !== undefined && payload[key] !== '')
}

export default function MobileRoleTasksPage() {
  const { activeRoleKey } = useERPWorkspace()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatingID, setUpdatingID] = useState(null)
  const [urgingID, setUrgingID] = useState(null)
  const [blockedReasonByTaskID, setBlockedReasonByTaskID] = useState({})
  const [urgeReasonByTaskID, setUrgeReasonByTaskID] = useState({})

  const taskViews = useMemo(
    () => buildMobileTaskListForRole(tasks, activeRoleKey),
    [activeRoleKey, tasks]
  )
  const activeTasks = useMemo(
    () =>
      taskViews.filter(
        (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [taskViews]
  )
  const warningTasks = useMemo(
    () => activeTasks.filter((task) => task.alert_level !== 'info'),
    [activeTasks]
  )
  const noticeTasks = useMemo(() => activeTasks.slice(0, 8), [activeTasks])
  const taskSummary = useMemo(
    () => buildMobileTaskSummary(taskViews),
    [taskViews]
  )
  const progressTotal =
    taskSummary.pending +
    taskSummary.processing +
    taskSummary.blockedProgress +
    taskSummary.done
  const progressPercent =
    progressTotal === 0
      ? 0
      : Math.round((taskSummary.done / progressTotal) * 100)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const queryResults = await Promise.all(
        buildMobileWorkflowTaskQueryPlan(activeRoleKey).map((query) =>
          listWorkflowTasks(query)
        )
      )
      setTasks(mergeWorkflowTaskResults(queryResults))
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '加载移动端任务失败，请稍后重试')
      )
    } finally {
      setLoading(false)
    }
  }, [activeRoleKey])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const loadBusinessRecordForTask = async (task) => {
    const sourceType = String(task.source_type || '').trim()
    if (!sourceType) return null
    const data = await listBusinessRecords({
      module_key: sourceType,
      limit: 200,
    })
    return (
      (data.records || []).find(
        (record) => String(record.id) === String(task.source_id)
      ) || null
    )
  }

  const updateBusinessRecordStatusForTask = async (
    task,
    record,
    nextStatusKey,
    reason
  ) => {
    const sourceType = String(task.source_type || '').trim()
    const moduleItem = getBusinessModule(sourceType) || {
      key: sourceType,
      title: sourceType,
      sectionKey: '',
    }
    const definition = getBusinessRecordDefinition(sourceType) || {}
    const params = buildBusinessRecordStatusUpdateParams(
      record,
      nextStatusKey,
      moduleItem,
      definition,
      { reason }
    )
    if (!params) return null
    return updateBusinessRecord(params)
  }

  const hasActiveTaskForSource = async (task, taskGroup) => {
    const data = await listWorkflowTasks({
      source_type: task.source_type,
      source_id: task.source_id,
      limit: 200,
    })
    return (data.tasks || []).some(
      (item) =>
        item.task_group === taskGroup &&
        !TERMINAL_TASK_STATUS_KEYS.has(item.task_status_key)
    )
  }

  const completeOutsourceReturnTrackingTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_QC_PENDING_STATUS_KEY,
        reason || '委外已回货，转品质检验'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_QC_PENDING_STATUS_KEY,
      owner_role_key: 'quality',
      payload: {
        record_title: savedRecord.title,
        return_task_id: task.id,
        notification_type: 'task_created',
        alert_type: 'outsource_return_qc_pending',
        critical_path: true,
        outsource_processing: true,
      },
    })
    const hasQcTask = await hasActiveTaskForSource(
      task,
      OUTSOURCE_RETURN_QC_TASK_GROUP
    )
    const qcTask = buildOutsourceReturnQcTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task
    )
    if (qcTask && !hasQcTask) {
      await createWorkflowTask(qcTask)
    }
  }

  const completeOutsourceWarehouseInboundTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_INBOUND_DONE_STATUS_KEY,
        reason || '仓库已确认委外回货入库'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_INBOUND_DONE_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        warehouse_task_id: task.id,
        inbound_result: 'done',
        inventory_balance_deferred: true,
        critical_path: true,
        outsource_processing: true,
      },
    })
    const payableRecord = {
      ...savedRecord,
      module_key: task.source_type,
      payload: {
        ...(savedRecord.payload || {}),
        inbound_result: 'done',
        payable_type: 'outsource',
        outsource_processing: true,
      },
    }
    const hasPayableTask = await hasActiveTaskForSource(
      task,
      OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP
    )
    const payableTask = buildOutsourcePayableRegistrationTask(
      payableRecord,
      task
    )
    let createdPayableTask = null
    if (payableTask && !hasPayableTask) {
      createdPayableTask = await createWorkflowTask(payableTask)
    }
    if (payableTask) {
      await upsertWorkflowBusinessState({
        source_type: task.source_type,
        source_id: savedRecord.id,
        source_no: savedRecord.document_no || task.source_no,
        business_status_key: OUTSOURCE_INBOUND_DONE_STATUS_KEY,
        owner_role_key: 'finance',
        payload: {
          record_title: savedRecord.title,
          warehouse_task_id: task.id,
          payable_task_id: createdPayableTask?.id,
          inbound_result: 'done',
          notification_type: 'finance_pending',
          alert_type: 'payable_pending',
          next_module_key: 'payables',
          payable_type: 'outsource',
          outsource_processing: true,
        },
      })
    }
  }

  const completeOutsourceReworkTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
        reason || '委外返工 / 补做安排已确认'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
      owner_role_key: 'production',
      payload: {
        record_title: savedRecord.title,
        rework_task_id: task.id,
        rework_result: 'arranged',
        critical_path: true,
        outsource_processing: true,
      },
    })
  }

  const completeShipmentReleaseTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应生产进度或出货放行记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINISHED_GOODS_SHIPPED_STATUS_KEY,
        reason || '仓库已确认出货'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINISHED_GOODS_SHIPPED_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        shipment_task_id: task.id,
        shipment_result: 'shipped',
        critical_path: true,
        finished_goods: true,
      },
    })
    const receivableRecord = {
      ...savedRecord,
      module_key: task.source_type,
      payload: {
        ...(savedRecord.payload || {}),
        shipment_result: FINANCE_SHIPPED_STATUS_KEY,
        shipped: true,
      },
    }
    const hasReceivableTask = await hasActiveTaskForSource(
      task,
      RECEIVABLE_REGISTRATION_TASK_GROUP
    )
    const receivableTask = buildReceivableRegistrationTask(
      receivableRecord,
      task
    )
    let createdReceivableTask = null
    if (receivableTask && !hasReceivableTask) {
      createdReceivableTask = await createWorkflowTask(receivableTask)
    }
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINANCE_SHIPPED_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        shipment_task_id: task.id,
        receivable_task_id: createdReceivableTask?.id,
        shipment_result: 'shipped',
        notification_type: 'finance_pending',
        alert_type: 'finance_pending',
        critical_path: true,
        next_module_key: 'receivables',
      },
    })
  }

  const completeFinishedGoodsReworkTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应生产进度记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
        reason || '成品返工安排已确认'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
      owner_role_key: 'production',
      payload: {
        record_title: savedRecord.title,
        rework_task_id: task.id,
        rework_result: 'arranged',
        critical_path: true,
        finished_goods: true,
      },
    })
  }

  const completeReceivableRegistrationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应出货或应收登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINANCE_RECONCILING_STATUS_KEY,
        reason || '应收登记已完成'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINANCE_RECONCILING_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        receivable_task_id: task.id,
        receivable_result: 'registered',
        notification_type: 'finance_pending',
        alert_type: 'invoice_pending',
        critical_path: false,
        next_module_key: 'invoices',
      },
    })
    const hasInvoiceTask = await hasActiveTaskForSource(
      task,
      INVOICE_REGISTRATION_TASK_GROUP
    )
    const invoiceTask = buildInvoiceRegistrationTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task
    )
    if (invoiceTask && !hasInvoiceTask) {
      await createWorkflowTask(invoiceTask)
    }
  }

  const completeInvoiceRegistrationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应应收或开票登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINANCE_RECONCILING_STATUS_KEY,
        reason || '开票登记已完成，进入对账中'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINANCE_RECONCILING_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        invoice_task_id: task.id,
        invoice_result: 'registered',
        critical_path: false,
        next_module_key: 'reconciliation',
      },
    })
  }

  const completePayableRegistrationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应采购、委外或应付登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        PAYABLE_RECONCILING_STATUS_KEY,
        reason || '应付登记已完成，进入对账'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: PAYABLE_RECONCILING_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        payable_task_id: task.id,
        payable_result: 'registered',
        notification_type: 'finance_pending',
        alert_type: 'reconciliation_pending',
        critical_path: false,
        next_module_key: 'reconciliation',
        payable_type: task.payload?.payable_type,
      },
    })

    const isOutsource = isOutsourcePayableRegistrationTask(task)
    const taskGroup = isOutsource
      ? OUTSOURCE_RECONCILIATION_TASK_GROUP
      : PURCHASE_RECONCILIATION_TASK_GROUP
    const hasReconciliationTask = await hasActiveTaskForSource(task, taskGroup)
    const reconciliationRecord = {
      ...savedRecord,
      module_key: task.source_type,
      payload: {
        ...(savedRecord.payload || {}),
        payable_type: isOutsource ? 'outsource' : 'purchase',
      },
    }
    const reconciliationTask = isOutsource
      ? buildOutsourceReconciliationTask(reconciliationRecord, task)
      : buildPurchaseReconciliationTask(reconciliationRecord, task)
    if (reconciliationTask && !hasReconciliationTask) {
      await createWorkflowTask(reconciliationTask)
    }
  }

  const completePayableReconciliationTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应采购、委外或对账记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        PAYABLE_SETTLED_STATUS_KEY,
        reason || '财务对账已完成'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: PAYABLE_SETTLED_STATUS_KEY,
      owner_role_key: 'finance',
      payload: {
        record_title: savedRecord.title,
        reconciliation_task_id: task.id,
        reconciliation_result: 'settled',
        payable_type: task.payload?.payable_type,
      },
    })
  }

  const blockFinanceTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应财务登记记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        'blocked',
        reason
      )) || record
    const state = buildFinanceBlockedState(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task,
      reason
    )
    if (state) {
      await upsertWorkflowBusinessState(state)
    }
  }

  const blockPayableFinanceTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应应付或对账记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        'blocked',
        reason
      )) || record
    const state = buildPayableBlockedState(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task,
      reason
    )
    if (state) {
      await upsertWorkflowBusinessState(state)
    }
  }

  const runOutsourceReturnFollowUp = async (
    task,
    taskStatusKey,
    reason = ''
  ) => {
    if (
      activeRoleKey === 'production' &&
      isOutsourceReturnTrackingTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeOutsourceReturnTrackingTask(task, reason)
      return
    }

    if (
      activeRoleKey === 'warehouse' &&
      isOutsourceWarehouseInboundTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeOutsourceWarehouseInboundTask(task, reason)
      return
    }

    if (
      activeRoleKey === 'production' &&
      isOutsourceReworkTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeOutsourceReworkTask(task, reason)
    }
  }

  const runFinishedGoodsFollowUp = async (task, taskStatusKey, reason = '') => {
    if (activeRoleKey === 'quality' && isFinishedGoodsQcTask(task)) {
      return
    }

    if (activeRoleKey === 'warehouse' && isFinishedGoodsInboundTask(task)) {
      return
    }

    if (
      activeRoleKey === 'warehouse' &&
      isShipmentReleaseTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeShipmentReleaseTask(task, reason)
      return
    }

    if (
      activeRoleKey === 'production' &&
      isFinishedGoodsReworkTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeFinishedGoodsReworkTask(task, reason)
    }
  }

  const runShipmentFinanceFollowUp = async (
    task,
    taskStatusKey,
    reason = ''
  ) => {
    if (
      activeRoleKey !== 'finance' ||
      (!isReceivableRegistrationTask(task) && !isInvoiceRegistrationTask(task))
    ) {
      return
    }

    if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
      await blockFinanceTask(task, reason)
      return
    }

    if (isReceivableRegistrationTask(task) && taskStatusKey === 'done') {
      await completeReceivableRegistrationTask(task, reason)
      return
    }

    if (isInvoiceRegistrationTask(task) && taskStatusKey === 'done') {
      await completeInvoiceRegistrationTask(task, reason)
    }
  }

  const runPayableReconciliationFollowUp = async (
    task,
    taskStatusKey,
    reason = ''
  ) => {
    if (
      activeRoleKey !== 'finance' ||
      (!isPayableRegistrationTask(task) && !isPayableReconciliationTask(task))
    ) {
      return
    }

    if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
      await blockPayableFinanceTask(task, reason)
      return
    }

    if (isPayableRegistrationTask(task) && taskStatusKey === 'done') {
      await completePayableRegistrationTask(task, reason)
      return
    }

    if (isPayableReconciliationTask(task) && taskStatusKey === 'done') {
      await completePayableReconciliationTask(task, reason)
    }
  }

  const runTaskFollowUp = async (task, taskStatusKey, reason = '') => {
    await runOutsourceReturnFollowUp(task, taskStatusKey, reason)
    await runFinishedGoodsFollowUp(task, taskStatusKey, reason)
    await runShipmentFinanceFollowUp(task, taskStatusKey, reason)
    await runPayableReconciliationFollowUp(task, taskStatusKey, reason)
  }

  const moveTask = async (task, taskStatusKey) => {
    if (!canOperateTask(activeRoleKey, task)) {
      message.warning('当前角色只能查看该任务，不能代办完成')
      return
    }
    const blockedReason = String(
      blockedReasonByTaskID[task.id] ?? task.blocked_reason ?? ''
    ).trim()
    const reasonRequired = ['blocked', 'rejected'].includes(taskStatusKey)
    if (reasonRequired && !blockedReason) {
      message.warning('请先填写阻塞或退回原因')
      return
    }
    const nextBusinessStatusKey = resolveMobileTaskBusinessStatus(
      task,
      taskStatusKey
    )

    setUpdatingID(task.id)
    try {
      const updatedTask = await updateWorkflowTaskStatus({
        id: task.id,
        task_status_key: taskStatusKey,
        business_status_key: nextBusinessStatusKey,
        actor_role_key: activeRoleKey,
        reason: reasonRequired ? blockedReason : '',
        payload: {
          ...(task.payload || {}),
          mobile_role_key: activeRoleKey,
          approval_result:
            isOrderApprovalTask(task) && taskStatusKey === 'done'
              ? 'approved'
              : undefined,
          qc_result:
            (isPurchaseIqcTask(task) ||
              isOutsourceReturnQcTask(task) ||
              isFinishedGoodsQcTask(task)) &&
            taskStatusKey === 'done'
              ? 'pass'
              : undefined,
          shipment_result:
            isShipmentReleaseTask(task) && taskStatusKey === 'done'
              ? 'shipped'
              : undefined,
          receivable_result:
            isReceivableRegistrationTask(task) && taskStatusKey === 'done'
              ? 'registered'
              : undefined,
          invoice_result:
            isInvoiceRegistrationTask(task) && taskStatusKey === 'done'
              ? 'registered'
              : undefined,
          payable_result:
            isPayableRegistrationTask(task) && taskStatusKey === 'done'
              ? 'registered'
              : undefined,
          reconciliation_result:
            isPayableReconciliationTask(task) && taskStatusKey === 'done'
              ? 'settled'
              : undefined,
          rejected_reason:
            (isOrderApprovalTask(task) ||
              isPurchaseIqcTask(task) ||
              isOutsourceReturnQcTask(task) ||
              isFinishedGoodsQcTask(task) ||
              isReceivableRegistrationTask(task) ||
              isInvoiceRegistrationTask(task) ||
              isPayableRegistrationTask(task) ||
              isPayableReconciliationTask(task)) &&
            reasonRequired
              ? blockedReason
              : undefined,
        },
      })
      await runTaskFollowUp(
        updatedTask || {
          ...task,
          task_status_key: taskStatusKey,
          business_status_key: nextBusinessStatusKey,
        },
        taskStatusKey,
        reasonRequired ? blockedReason : ''
      )
      setBlockedReasonByTaskID((current) => {
        const next = { ...current }
        if (reasonRequired) {
          next[task.id] = blockedReason
        } else {
          delete next[task.id]
        }
        return next
      })
      message.success('任务状态已更新')
      await loadTasks()
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '更新任务状态失败，请稍后重试')
      )
    } finally {
      setUpdatingID(null)
    }
  }

  const urgeTask = async (task) => {
    if (!canUrgeTask(activeRoleKey, task)) {
      message.warning('当前角色没有催办该任务的权限')
      return
    }
    const reason = String(urgeReasonByTaskID[task.id] || '').trim()
    if (!reason) {
      message.warning('请先填写催办原因')
      return
    }

    setUrgingID(task.id)
    try {
      await urgeWorkflowTask({
        task_id: task.id,
        action: resolveMobileUrgeAction(activeRoleKey, task),
        reason,
        actor_role_key: activeRoleKey,
        payload: {
          source_type: task.source_type,
          source_id: task.source_id,
          source_no: task.source_no,
          mobile_role_key: activeRoleKey,
        },
      })
      setUrgeReasonByTaskID((current) => {
        const next = { ...current }
        delete next[task.id]
        return next
      })
      message.success('催办已记录')
      await loadTasks()
    } catch (error) {
      message.error(getActionErrorMessage(error, '催办失败，请稍后重试'))
    } finally {
      setUrgingID(null)
    }
  }

  return (
    <div className="mobile-role-tasks-page space-y-4">
      <SurfacePanel className="p-4 sm:p-5 md:p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2 md:gap-3">
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {taskSummary.alerts}
              </div>
              <div className={mobileTheme.metricLabel}>我的预警</div>
            </div>
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {taskSummary.overdue}
              </div>
              <div className={mobileTheme.metricLabel}>已超时</div>
            </div>
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {taskSummary.dueSoon}
              </div>
              <div className={mobileTheme.metricLabel}>即将超时</div>
            </div>
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {taskSummary.blocked}/{taskSummary.highPriority}
              </div>
              <div className={mobileTheme.metricLabel}>阻塞/高优先</div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className={mobileTheme.actionButton}
              onClick={loadTasks}
              disabled={loading}
            >
              {loading ? '刷新中' : '刷新'}
            </button>
          </div>

          <div className="mobile-role-tasks-page__sections grid gap-4 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.28fr)] md:items-start">
            <div className="space-y-4">
              <section className="space-y-2">
                <div className={mobileTheme.sectionTitle}>进度</div>
                <div className={mobileTheme.listItem}>
                  <div className={mobileTheme.progressTrack}>
                    <div
                      className={mobileTheme.progressFill}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <div className={mobileTheme.progressStat}>
                      <div>{taskSummary.pending}</div>
                      <span>待处理</span>
                    </div>
                    <div className={mobileTheme.progressStat}>
                      <div>{taskSummary.processing}</div>
                      <span>处理中</span>
                    </div>
                    <div className={mobileTheme.progressStat}>
                      <div>{taskSummary.blockedProgress}</div>
                      <span>卡住</span>
                    </div>
                    <div className={mobileTheme.progressStat}>
                      <div>{taskSummary.done}</div>
                      <span>完成</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className={mobileTheme.sectionTitle}>预警</div>
                {warningTasks.length === 0 ? (
                  <div className={mobileTheme.warningItem}>暂无预警</div>
                ) : (
                  <div className="space-y-2">
                    {warningTasks.map((task) => (
                      <div key={task.id} className={mobileTheme.warningItem}>
                        <div className="text-sm font-semibold">
                          {task.alert_label || task.due_status_label}
                        </div>
                        <div className="mt-1 text-sm">{task.task_name}</div>
                        <div className="mt-1 text-xs">
                          {task.source_no ||
                            `${task.source_type} #${task.source_id}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className={mobileTheme.sectionTitle}>通知</div>
                {noticeTasks.length === 0 ? (
                  <div className={mobileTheme.listItem}>暂无通知</div>
                ) : (
                  <div className="space-y-2">
                    {noticeTasks.map((task) => (
                      <div key={task.id} className={mobileTheme.listItem}>
                        <div className="font-semibold text-slate-900">
                          {task.task_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {task.task_status_label}
                          {' / '}
                          {formatMobileTaskTime(task.updated_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="space-y-2">
              <div className={mobileTheme.sectionTitle}>任务</div>
              {activeTasks.length === 0 ? (
                <div className={mobileTheme.warningItem}>暂无任务</div>
              ) : (
                <div className="space-y-3">
                  {activeTasks.map((task) => (
                    <div key={task.id} className={mobileTheme.highlightCard}>
                      <div className={mobileTheme.sectionEyebrow}>
                        {task.source_no ||
                          `${task.source_type} #${task.source_id}`}
                      </div>
                      <div className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                        {task.task_name}
                      </div>
                      <div className={mobileTheme.highlightNote}>
                        状态：
                        {task.task_status_label}
                        {' / '}
                        更新：{formatMobileTaskTime(task.updated_at)}
                      </div>
                      <div className={mobileTheme.highlightNote}>
                        业务：
                        {task.business_status_label}
                      </div>
                      <div className={mobileTheme.highlightNote}>
                        分组：{task.task_group || '-'} / 优先级：
                        {task.priority} / 截止：{task.due_at_label}
                      </div>
                      {task.payload?.customer_name ||
                      task.payload?.style_no ||
                      task.payload?.due_date ? (
                        <div className={mobileTheme.highlightNote}>
                          客户/款式/交期：
                          {task.payload?.customer_name || '-'}
                          {' / '}
                          {task.payload?.style_no ||
                            task.payload?.product_name ||
                            '-'}
                          {' / '}
                          {task.payload?.due_date || '-'}
                        </div>
                      ) : null}
                      {task.payload?.supplier_name ||
                      task.payload?.material_name ||
                      task.payload?.quantity ? (
                        <div className={mobileTheme.highlightNote}>
                          供应/物料/数量：
                          {task.payload?.supplier_name || '-'}
                          {' / '}
                          {task.payload?.material_name ||
                            task.payload?.product_name ||
                            '-'}
                          {' / '}
                          {task.payload?.quantity || '-'}
                          {task.payload?.unit || ''}
                        </div>
                      ) : null}
                      {task.payload?.qc_result ? (
                        <div className={mobileTheme.highlightNote}>
                          IQC 结果：{task.payload.qc_result}
                        </div>
                      ) : null}
                      {hasFinanceAmountPayload(task) ? (
                        <div className={mobileTheme.highlightNote}>
                          金额/税率：
                          {task.payload?.amount || '-'}
                          {' / '}
                          {task.payload?.tax_rate || '-'}
                          {' / 税额 '}
                          {task.payload?.tax_amount || '-'}
                          {' / 含税 '}
                          {task.payload?.amount_with_tax || '-'}
                          {' / 不含税 '}
                          {task.payload?.amount_without_tax || '-'}
                        </div>
                      ) : null}
                      {task.payload?.payable_type ? (
                        <div className={mobileTheme.highlightNote}>
                          应付类型：{task.payload.payable_type}
                        </div>
                      ) : null}
                      <div className={mobileTheme.highlightNote}>
                        预警：
                        {task.alert_label || task.due_status_label} / 等级：
                        {task.alert_level}
                      </div>
                      {task.blocked_reason ? (
                        <div className={mobileTheme.warningItem}>
                          阻塞原因：{task.blocked_reason}
                        </div>
                      ) : null}
                      {task.complete_condition ? (
                        <div className={mobileTheme.highlightNote}>
                          完成条件：{task.complete_condition}
                        </div>
                      ) : null}
                      {task.related_documents.length > 0 ? (
                        <div className={mobileTheme.highlightNote}>
                          关联单据：{task.related_documents.join(' / ')}
                        </div>
                      ) : null}
                      {task.is_urged ? (
                        <div className={mobileTheme.warningItem}>
                          已催办 {task.urge_count || 1} 次
                          {task.last_urge_reason
                            ? ` / 最近原因：${task.last_urge_reason}`
                            : ''}
                          {task.last_urge_at
                            ? ` / ${task.last_urge_at_label}`
                            : ''}
                        </div>
                      ) : null}
                      {task.is_escalated ? (
                        <div className={mobileTheme.warningItem}>
                          已升级：
                          {task.escalate_target_role_key || '关注角色'}
                        </div>
                      ) : null}
                      <textarea
                        aria-label={`任务阻塞原因 ${task.id}`}
                        className="mt-3 h-20 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        disabled={!canOperateTask(activeRoleKey, task)}
                        maxLength={300}
                        placeholder="阻塞原因"
                        value={
                          blockedReasonByTaskID[task.id] ??
                          task.blocked_reason ??
                          ''
                        }
                        onChange={(event) => {
                          setBlockedReasonByTaskID((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }))
                        }}
                      />
                      {canUrgeTask(activeRoleKey, task) ? (
                        <textarea
                          aria-label={`任务催办原因 ${task.id}`}
                          className="mt-3 h-20 w-full resize-none rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          disabled={urgingID === task.id}
                          maxLength={300}
                          placeholder="催办原因（必填）"
                          value={urgeReasonByTaskID[task.id] || ''}
                          onChange={(event) => {
                            setUrgeReasonByTaskID((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }}
                        />
                      ) : null}
                      <div
                        className={`mt-3 grid gap-2 ${
                          supportsRejectedAction(activeRoleKey, task)
                            ? 'grid-cols-4'
                            : 'grid-cols-3'
                        }`}
                      >
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={
                            updatingID === task.id ||
                            !canOperateTask(activeRoleKey, task)
                          }
                          onClick={() => moveTask(task, 'processing')}
                        >
                          处理
                        </button>
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={
                            updatingID === task.id ||
                            !canOperateTask(activeRoleKey, task)
                          }
                          onClick={() => moveTask(task, 'blocked')}
                        >
                          阻塞
                        </button>
                        {supportsRejectedAction(activeRoleKey, task) ? (
                          <button
                            type="button"
                            className={mobileTheme.actionButton}
                            disabled={
                              updatingID === task.id ||
                              !canOperateTask(activeRoleKey, task)
                            }
                            onClick={() => moveTask(task, 'rejected')}
                          >
                            退回
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={
                            updatingID === task.id ||
                            !canOperateTask(activeRoleKey, task)
                          }
                          onClick={() => moveTask(task, 'done')}
                        >
                          完成
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={
                            urgingID === task.id ||
                            !canUrgeTask(activeRoleKey, task)
                          }
                          onClick={() => urgeTask(task)}
                        >
                          {resolveMobileUrgeAction(activeRoleKey, task) ===
                          'escalate_to_boss'
                            ? '升级'
                            : '催办'}
                        </button>
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled
                        >
                          查看日志待接入
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
