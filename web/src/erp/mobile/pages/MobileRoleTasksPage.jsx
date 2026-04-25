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
import {
  ENGINEERING_DATA_TASK_GROUP,
  ORDER_APPROVAL_STATUS_KEY,
  ORDER_APPROVED_STATUS_KEY,
  ORDER_REVISION_TASK_GROUP,
  PROJECT_ORDER_MODULE_KEY,
  buildEngineeringTaskFromApprovedOrder,
  buildRevisionTaskFromRejectedOrder,
  isOrderApprovalTask,
} from '../../utils/orderApprovalFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY,
  IQC_PENDING_STATUS_KEY,
  PURCHASE_QUALITY_EXCEPTION_TASK_GROUP,
  QC_FAILED_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  WAREHOUSE_INBOUND_TASK_GROUP,
  buildPurchaseQualityExceptionTask,
  buildWarehouseInboundTaskFromIqcPass,
  isPurchaseIqcTask,
  isWarehouseInboundTask,
} from '../../utils/purchaseInboundFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY as OUTSOURCE_INBOUND_DONE_STATUS_KEY,
  PRODUCTION_PROCESSING_STATUS_KEY as OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_FAILED_STATUS_KEY as OUTSOURCE_QC_FAILED_STATUS_KEY,
  QC_PENDING_STATUS_KEY as OUTSOURCE_QC_PENDING_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY as OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  OUTSOURCE_REWORK_TASK_GROUP,
  OUTSOURCE_RETURN_QC_TASK_GROUP,
  OUTSOURCE_WAREHOUSE_INBOUND_TASK_GROUP,
  buildOutsourceReturnQcTask,
  buildOutsourceReworkTask,
  buildOutsourceWarehouseInboundTask,
  isOutsourceReturnQcTask,
  isOutsourceReturnTrackingTask,
  isOutsourceReworkTask,
  isOutsourceWarehouseInboundTask,
} from '../../utils/outsourceReturnFlow.mjs'
import {
  FINISHED_GOODS_INBOUND_TASK_GROUP,
  FINISHED_GOODS_REWORK_TASK_GROUP,
  SHIPMENT_RELEASE_TASK_GROUP,
  INBOUND_DONE_STATUS_KEY as FINISHED_GOODS_INBOUND_DONE_STATUS_KEY,
  PRODUCTION_PROCESSING_STATUS_KEY as FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_FAILED_STATUS_KEY as FINISHED_GOODS_QC_FAILED_STATUS_KEY,
  SHIPPED_STATUS_KEY as FINISHED_GOODS_SHIPPED_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY as FINISHED_GOODS_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  buildFinishedGoodsInboundTask,
  buildFinishedGoodsReworkTask,
  buildShipmentReleaseTask,
  isFinishedGoodsInboundTask,
  isFinishedGoodsQcTask,
  isFinishedGoodsReworkTask,
  isShipmentReleaseTask,
  resolveFinishedGoodsTaskBusinessStatus,
} from '../../utils/finishedGoodsFlow.mjs'
import { mobileTheme } from '../theme'

const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'closed', 'cancelled'])
const PROJECT_ORDER_MODULE = getBusinessModule(PROJECT_ORDER_MODULE_KEY) || {
  key: PROJECT_ORDER_MODULE_KEY,
  title: '客户/款式立项',
  sectionKey: 'sales',
}
const PROJECT_ORDER_DEFINITION =
  getBusinessRecordDefinition(PROJECT_ORDER_MODULE_KEY) || {}

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
    resolveOrderApprovalBusinessStatus(task, taskStatusKey)
  )
}

function supportsRejectedAction(roleKey, task) {
  return (
    (roleKey === 'boss' && isOrderApprovalTask(task)) ||
    (roleKey === 'quality' &&
      (isPurchaseIqcTask(task) ||
        isOutsourceReturnQcTask(task) ||
        isFinishedGoodsQcTask(task)))
  )
}

export default function MobileRoleTasksPage() {
  const { activeRoleKey } = useERPWorkspace()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatingID, setUpdatingID] = useState(null)
  const [blockedReasonByTaskID, setBlockedReasonByTaskID] = useState({})

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

  const loadProjectOrderRecord = async (task) => {
    const data = await listBusinessRecords({
      module_key: PROJECT_ORDER_MODULE_KEY,
      limit: 200,
    })
    return (
      (data.records || []).find(
        (record) => String(record.id) === String(task.source_id)
      ) || null
    )
  }

  const updateProjectOrderStatus = async (record, nextStatusKey, reason) => {
    const params = buildBusinessRecordStatusUpdateParams(
      record,
      nextStatusKey,
      PROJECT_ORDER_MODULE,
      PROJECT_ORDER_DEFINITION,
      { reason }
    )
    if (!params) return null
    return updateBusinessRecord(params)
  }

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

  const hasActiveProjectOrderTask = async (sourceID, taskGroup) => {
    const data = await listWorkflowTasks({
      source_type: PROJECT_ORDER_MODULE_KEY,
      source_id: sourceID,
      limit: 200,
    })
    return (data.tasks || []).some(
      (item) =>
        item.task_group === taskGroup &&
        !TERMINAL_TASK_STATUS_KEYS.has(item.task_status_key)
    )
  }

  const approveOrderTask = async (task, reason) => {
    const record = await loadProjectOrderRecord(task)
    if (!record) {
      throw new Error('未找到对应客户/款式立项记录')
    }
    const savedRecord =
      (await updateProjectOrderStatus(
        record,
        ORDER_APPROVED_STATUS_KEY,
        reason || '老板审批通过'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: PROJECT_ORDER_MODULE_KEY,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: ORDER_APPROVED_STATUS_KEY,
      owner_role_key: 'engineering',
      payload: {
        record_title: savedRecord.title,
        approval_task_id: task.id,
        approval_result: 'approved',
        critical_path: true,
      },
    })
    const engineeringTask = buildEngineeringTaskFromApprovedOrder({
      ...savedRecord,
      module_key: PROJECT_ORDER_MODULE_KEY,
    })
    const hasEngineeringTask = await hasActiveProjectOrderTask(
      savedRecord.id,
      ENGINEERING_DATA_TASK_GROUP
    )
    if (engineeringTask && !hasEngineeringTask) {
      await createWorkflowTask(engineeringTask)
    }
  }

  const rejectOrderTask = async (task, taskStatusKey, reason) => {
    const record = await loadProjectOrderRecord(task)
    if (!record) {
      throw new Error('未找到对应客户/款式立项记录')
    }
    const nextBusinessStatusKey =
      taskStatusKey === 'blocked' ? 'blocked' : ORDER_APPROVAL_STATUS_KEY
    const savedRecord =
      (await updateProjectOrderStatus(record, nextBusinessStatusKey, reason)) ||
      record
    await upsertWorkflowBusinessState({
      source_type: PROJECT_ORDER_MODULE_KEY,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: nextBusinessStatusKey,
      owner_role_key: 'merchandiser',
      blocked_reason: reason,
      payload: {
        record_title: savedRecord.title,
        approval_task_id: task.id,
        approval_result: 'rejected',
        rejected_reason: reason,
        critical_path: true,
      },
    })
    const revisionTask = buildRevisionTaskFromRejectedOrder(
      {
        ...savedRecord,
        module_key: PROJECT_ORDER_MODULE_KEY,
      },
      reason
    )
    const hasRevisionTask = await hasActiveProjectOrderTask(
      savedRecord.id,
      ORDER_REVISION_TASK_GROUP
    )
    if (revisionTask && !hasRevisionTask) {
      await createWorkflowTask(revisionTask)
    }
  }

  const passIqcTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应采购到货或入库通知记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
        reason || 'IQC 合格'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        iqc_task_id: task.id,
        qc_result: 'pass',
        critical_path: true,
      },
    })
    const hasWarehouseTask = await hasActiveTaskForSource(
      task,
      WAREHOUSE_INBOUND_TASK_GROUP
    )
    const warehouseTask = buildWarehouseInboundTaskFromIqcPass(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      {
        ...task,
        payload: {
          ...(task.payload || {}),
          qc_result: 'pass',
        },
      }
    )
    if (warehouseTask && !hasWarehouseTask) {
      await createWorkflowTask(warehouseTask)
    }
  }

  const failIqcTask = async (task, taskStatusKey, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应采购到货或入库通知记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        QC_FAILED_STATUS_KEY,
        reason
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: QC_FAILED_STATUS_KEY,
      owner_role_key: 'purchasing',
      blocked_reason: reason,
      payload: {
        record_title: savedRecord.title,
        iqc_task_id: task.id,
        qc_result: taskStatusKey === 'rejected' ? 'rejected' : 'fail',
        rejected_reason: reason,
        critical_path: true,
      },
    })
    const hasExceptionTask = await hasActiveTaskForSource(
      task,
      PURCHASE_QUALITY_EXCEPTION_TASK_GROUP
    )
    const exceptionTask = buildPurchaseQualityExceptionTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task,
      reason
    )
    if (exceptionTask && !hasExceptionTask) {
      await createWorkflowTask(exceptionTask)
    }
  }

  const completeWarehouseInboundTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应采购到货或入库通知记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        INBOUND_DONE_STATUS_KEY,
        reason || '仓库已确认入库'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: INBOUND_DONE_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        warehouse_task_id: task.id,
        inbound_result: 'done',
        inventory_balance_deferred: true,
        critical_path: true,
      },
    })
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

  const passOutsourceReturnQcTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
        reason || '委外回货检验合格'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        qc_task_id: task.id,
        qc_result: 'pass',
        notification_type: 'task_created',
        alert_type: 'inbound_pending',
        critical_path: true,
        outsource_processing: true,
      },
    })
    const hasWarehouseTask = await hasActiveTaskForSource(
      task,
      OUTSOURCE_WAREHOUSE_INBOUND_TASK_GROUP
    )
    const warehouseTask = buildOutsourceWarehouseInboundTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      {
        ...task,
        payload: {
          ...(task.payload || {}),
          qc_result: 'pass',
        },
      }
    )
    if (warehouseTask && !hasWarehouseTask) {
      await createWorkflowTask(warehouseTask)
    }
  }

  const failOutsourceReturnQcTask = async (task, taskStatusKey, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        OUTSOURCE_QC_FAILED_STATUS_KEY,
        reason
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: OUTSOURCE_QC_FAILED_STATUS_KEY,
      owner_role_key: 'production',
      blocked_reason: reason,
      payload: {
        record_title: savedRecord.title,
        qc_task_id: task.id,
        qc_result: taskStatusKey === 'rejected' ? 'rejected' : 'fail',
        rejected_reason: reason,
        notification_type: 'qc_failed',
        alert_type: 'qc_failed',
        critical_path: true,
        outsource_processing: true,
      },
    })
    const hasReworkTask = await hasActiveTaskForSource(
      task,
      OUTSOURCE_REWORK_TASK_GROUP
    )
    const reworkTask = buildOutsourceReworkTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task,
      reason
    )
    if (reworkTask && !hasReworkTask) {
      await createWorkflowTask(reworkTask)
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

  const passFinishedGoodsQcTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应生产进度记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINISHED_GOODS_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
        reason || '成品抽检合格'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINISHED_GOODS_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        qc_task_id: task.id,
        qc_result: 'pass',
        notification_type: 'task_created',
        alert_type: 'finished_goods_inbound_pending',
        critical_path: true,
        finished_goods: true,
      },
    })
    const hasInboundTask = await hasActiveTaskForSource(
      task,
      FINISHED_GOODS_INBOUND_TASK_GROUP
    )
    const inboundTask = buildFinishedGoodsInboundTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      {
        ...task,
        payload: {
          ...(task.payload || {}),
          qc_result: 'pass',
        },
      }
    )
    if (inboundTask && !hasInboundTask) {
      await createWorkflowTask(inboundTask)
    }
  }

  const failFinishedGoodsQcTask = async (task, taskStatusKey, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应生产进度记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINISHED_GOODS_QC_FAILED_STATUS_KEY,
        reason
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINISHED_GOODS_QC_FAILED_STATUS_KEY,
      owner_role_key: 'production',
      blocked_reason: reason,
      payload: {
        record_title: savedRecord.title,
        qc_task_id: task.id,
        qc_result: taskStatusKey === 'rejected' ? 'rejected' : 'fail',
        rejected_reason: reason,
        notification_type: 'qc_failed',
        alert_type: 'qc_failed',
        critical_path: true,
        finished_goods: true,
      },
    })
    const hasReworkTask = await hasActiveTaskForSource(
      task,
      FINISHED_GOODS_REWORK_TASK_GROUP
    )
    const reworkTask = buildFinishedGoodsReworkTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task,
      reason
    )
    if (reworkTask && !hasReworkTask) {
      await createWorkflowTask(reworkTask)
    }
  }

  const completeFinishedGoodsInboundTask = async (task, reason) => {
    const record = await loadBusinessRecordForTask(task)
    if (!record) {
      throw new Error('未找到对应生产进度或成品入库记录')
    }
    const savedRecord =
      (await updateBusinessRecordStatusForTask(
        task,
        record,
        FINISHED_GOODS_INBOUND_DONE_STATUS_KEY,
        reason || '仓库已确认成品入库'
      )) || record
    await upsertWorkflowBusinessState({
      source_type: task.source_type,
      source_id: savedRecord.id,
      source_no: savedRecord.document_no || task.source_no,
      business_status_key: FINISHED_GOODS_INBOUND_DONE_STATUS_KEY,
      owner_role_key: 'warehouse',
      payload: {
        record_title: savedRecord.title,
        inbound_task_id: task.id,
        inbound_result: 'done',
        inventory_balance_deferred: true,
        critical_path: true,
        finished_goods: true,
      },
    })
    const hasShipmentTask = await hasActiveTaskForSource(
      task,
      SHIPMENT_RELEASE_TASK_GROUP
    )
    const shipmentTask = buildShipmentReleaseTask(
      {
        ...savedRecord,
        module_key: task.source_type,
      },
      task
    )
    if (shipmentTask && !hasShipmentTask) {
      await createWorkflowTask(shipmentTask)
    }
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

  const runOrderApprovalFollowUp = async (task, taskStatusKey, reason = '') => {
    if (activeRoleKey !== 'boss' || !isOrderApprovalTask(task)) return
    if (taskStatusKey === 'done') {
      await approveOrderTask(task, reason)
      return
    }
    if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
      await rejectOrderTask(task, taskStatusKey, reason)
    }
  }

  const runPurchaseInboundFollowUp = async (
    task,
    taskStatusKey,
    reason = ''
  ) => {
    if (activeRoleKey === 'quality' && isPurchaseIqcTask(task)) {
      if (taskStatusKey === 'done') {
        await passIqcTask(task, reason)
        return
      }
      if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
        await failIqcTask(task, taskStatusKey, reason)
      }
      return
    }

    if (
      activeRoleKey === 'warehouse' &&
      isWarehouseInboundTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeWarehouseInboundTask(task, reason)
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

    if (activeRoleKey === 'quality' && isOutsourceReturnQcTask(task)) {
      if (taskStatusKey === 'done') {
        await passOutsourceReturnQcTask(task, reason)
        return
      }
      if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
        await failOutsourceReturnQcTask(task, taskStatusKey, reason)
      }
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
      if (taskStatusKey === 'done') {
        await passFinishedGoodsQcTask(task, reason)
        return
      }
      if (taskStatusKey === 'blocked' || taskStatusKey === 'rejected') {
        await failFinishedGoodsQcTask(task, taskStatusKey, reason)
      }
      return
    }

    if (
      activeRoleKey === 'warehouse' &&
      isFinishedGoodsInboundTask(task) &&
      taskStatusKey === 'done'
    ) {
      await completeFinishedGoodsInboundTask(task, reason)
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

  const runTaskFollowUp = async (task, taskStatusKey, reason = '') => {
    await runOrderApprovalFollowUp(task, taskStatusKey, reason)
    await runPurchaseInboundFollowUp(task, taskStatusKey, reason)
    await runOutsourceReturnFollowUp(task, taskStatusKey, reason)
    await runFinishedGoodsFollowUp(task, taskStatusKey, reason)
  }

  const moveTask = async (task, taskStatusKey) => {
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
          rejected_reason:
            (isOrderApprovalTask(task) ||
              isPurchaseIqcTask(task) ||
              isOutsourceReturnQcTask(task) ||
              isFinishedGoodsQcTask(task)) &&
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
                        <div className={mobileTheme.warningItem}>已催办</div>
                      ) : null}
                      <textarea
                        aria-label={`任务阻塞原因 ${task.id}`}
                        className="mt-3 h-20 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
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
                          disabled={updatingID === task.id}
                          onClick={() => moveTask(task, 'processing')}
                        >
                          处理
                        </button>
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={updatingID === task.id}
                          onClick={() => moveTask(task, 'blocked')}
                        >
                          阻塞
                        </button>
                        {supportsRejectedAction(activeRoleKey, task) ? (
                          <button
                            type="button"
                            className={mobileTheme.actionButton}
                            disabled={updatingID === task.id}
                            onClick={() => moveTask(task, 'rejected')}
                          >
                            退回
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={updatingID === task.id}
                          onClick={() => moveTask(task, 'done')}
                        >
                          完成
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled
                        >
                          催办待接入
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
