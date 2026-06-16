import { useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  createWorkflowTask,
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  upsertWorkflowBusinessState,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import {
  buildMobileTaskActionEvidence,
  normalizeMobileActionEvidenceRefs,
} from '../../utils/mobileTaskView.mjs'
import { isOrderApprovalTask } from '../../utils/orderApprovalFlow.mjs'
import { isPurchaseIqcTask } from '../../utils/purchaseInboundFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY as OUTSOURCE_INBOUND_DONE_STATUS_KEY,
  PRODUCTION_PROCESSING_STATUS_KEY as OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_PENDING_STATUS_KEY as OUTSOURCE_QC_PENDING_STATUS_KEY,
  OUTSOURCE_RETURN_QC_TASK_GROUP,
  buildOutsourceReturnQcTask,
  isOutsourceReturnQcTask,
  isOutsourceReturnTrackingTask,
  isOutsourceReworkTask,
  isOutsourceWarehouseInboundTask,
} from '../../utils/outsourceReturnFlow.mjs'
import {
  PRODUCTION_PROCESSING_STATUS_KEY as FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY,
  isFinishedGoodsInboundTask,
  isFinishedGoodsQcTask,
  isFinishedGoodsReworkTask,
  isShipmentReleaseTask,
} from '../../utils/finishedGoodsFlow.mjs'
import {
  INVOICE_REGISTRATION_TASK_GROUP,
  RECONCILING_STATUS_KEY as FINANCE_RECONCILING_STATUS_KEY,
  buildFinanceBlockedState,
  buildInvoiceRegistrationTask,
  isInvoiceRegistrationTask,
  isReceivableRegistrationTask,
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
} from '../../utils/payableReconciliationFlow.mjs'
import {
  TERMINAL_TASK_STATUS_KEYS,
  canOperateTask,
  canUrgeTask,
  resolveMobileTaskBusinessStatus,
  resolveMobileUrgeAction,
} from '../utils/mobileRoleTaskModel.mjs'

export default function useMobileRoleTaskActions({
  activeRoleKey,
  selectedTask,
  detailAction,
  setDetailAction,
  setSelectedTaskID,
  loadTasks,
}) {
  const [updatingID, setUpdatingID] = useState(null)
  const [urgingID, setUrgingID] = useState(null)
  const [blockedReasonByTaskID, setBlockedReasonByTaskID] = useState({})
  const [urgeReasonByTaskID, setUrgeReasonByTaskID] = useState({})
  const [evidenceTextByTaskID, setEvidenceTextByTaskID] = useState({})

  const buildSourceSnapshotForTask = async (task) => {
    const sourceType = String(task.source_type || '').trim()
    if (!sourceType) return null
    const payload =
      task.payload && typeof task.payload === 'object' ? task.payload : {}
    return {
      id: task.source_id,
      module_key: sourceType,
      document_no: task.source_no || payload.document_no || '',
      title:
        payload.record_title ||
        payload.title ||
        task.task_name ||
        task.source_no ||
        '',
      business_status_key:
        task.business_status_key || payload.business_status_key || '',
      owner_role_key: task.owner_role_key || payload.owner_role_key || '',
      source_no: task.source_no || payload.source_no || '',
      payload,
    }
  }

  const updateSourceStatusForTask = async () => null

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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应加工合同或委外回货记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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

  const completeFinishedGoodsReworkTask = async (task, reason) => {
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应生产进度记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应出货或应收登记记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应应收或开票登记记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应采购、委外或应付登记记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应采购、委外或对账记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应财务登记记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(task, record, 'blocked', reason)) ||
      record
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
    const record = await buildSourceSnapshotForTask(task)
    if (!record) {
      throw new Error('未找到对应应付或对账记录')
    }
    const savedRecord =
      (await updateSourceStatusForTask(task, record, 'blocked', reason)) ||
      record
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

    if (activeRoleKey === 'warehouse' && isShipmentReleaseTask(task)) {
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
      return false
    }
    const blockedReason = String(
      blockedReasonByTaskID[task.id] ?? task.blocked_reason ?? ''
    ).trim()
    const reasonRequired = ['blocked', 'rejected'].includes(taskStatusKey)
    if (reasonRequired && !blockedReason) {
      message.warning('请先填写阻塞或退回原因')
      return false
    }
    const nextBusinessStatusKey = resolveMobileTaskBusinessStatus(
      task,
      taskStatusKey
    )
    const mobileActionEvidence = buildMobileTaskActionEvidence({
      roleKey: activeRoleKey,
      actionKey: taskStatusKey,
      reason: reasonRequired ? blockedReason : '',
      evidenceText: evidenceTextByTaskID[task.id] || '',
    })

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
          ...mobileActionEvidence,
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
          shipment_release_result:
            isShipmentReleaseTask(task) && taskStatusKey === 'done'
              ? 'done'
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
              isShipmentReleaseTask(task) ||
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
      setEvidenceTextByTaskID((current) => {
        const next = { ...current }
        delete next[task.id]
        return next
      })
      message.success('任务状态已更新')
      await loadTasks()
      return true
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '更新任务状态失败，请稍后重试')
      )
      return false
    } finally {
      setUpdatingID(null)
    }
  }

  const urgeTask = async (task) => {
    if (!canUrgeTask(activeRoleKey, task)) {
      message.warning('当前角色没有催办该任务的权限')
      return false
    }
    const reason = String(urgeReasonByTaskID[task.id] || '').trim()
    if (!reason) {
      message.warning('请先填写催办原因')
      return false
    }

    setUrgingID(task.id)
    try {
      const mobileActionEvidence = buildMobileTaskActionEvidence({
        roleKey: activeRoleKey,
        actionKey: 'urge',
        reason,
        evidenceText: evidenceTextByTaskID[task.id] || '',
      })
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
          ...mobileActionEvidence,
        },
      })
      setUrgeReasonByTaskID((current) => {
        const next = { ...current }
        delete next[task.id]
        return next
      })
      setEvidenceTextByTaskID((current) => {
        const next = { ...current }
        delete next[task.id]
        return next
      })
      message.success('催办已记录')
      await loadTasks()
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '催办失败，请稍后重试'))
      return false
    } finally {
      setUrgingID(null)
    }
  }

  const handleTaskAction = async (task, action) => {
    setSelectedTaskID(task.id)
    if (['blocked', 'rejected', 'urge'].includes(action)) {
      setDetailAction(action)
      return
    }
    setDetailAction(null)
    await moveTask(task, action)
  }

  const submitDetailAction = async () => {
    if (!selectedTask || !detailAction) return
    const actionCompleted =
      detailAction === 'urge'
        ? await urgeTask(selectedTask)
        : await moveTask(selectedTask, detailAction)
    if (actionCompleted) {
      setDetailAction(null)
    }
  }

  const selectedCanOperate = selectedTask
    ? canOperateTask(activeRoleKey, selectedTask)
    : false
  const selectedCanUrge = selectedTask
    ? canUrgeTask(activeRoleKey, selectedTask)
    : false
  const detailReasonValue = selectedTask
    ? detailAction === 'urge'
      ? urgeReasonByTaskID[selectedTask.id] || ''
      : blockedReasonByTaskID[selectedTask.id] || ''
    : ''
  const detailEvidenceValue = selectedTask
    ? evidenceTextByTaskID[selectedTask.id] || ''
    : ''
  const savedEvidenceRefs = selectedTask
    ? normalizeMobileActionEvidenceRefs(
        selectedTask.mobile_action_evidence_refs
      )
    : []

  const updateDetailReason = (value) => {
    if (!selectedTask) return
    if (detailAction === 'urge') {
      setUrgeReasonByTaskID((current) => ({
        ...current,
        [selectedTask.id]: value,
      }))
      return
    }
    setBlockedReasonByTaskID((current) => ({
      ...current,
      [selectedTask.id]: value,
    }))
  }

  const updateEvidenceText = (value) => {
    if (!selectedTask) return
    setEvidenceTextByTaskID((current) => ({
      ...current,
      [selectedTask.id]: value,
    }))
  }

  const appendQuickReason = (value) => {
    const nextValue = detailReasonValue
      ? `${detailReasonValue}；${value}`
      : value
    updateDetailReason(nextValue)
  }

  return {
    appendQuickReason,
    detailEvidenceValue,
    detailReasonValue,
    handleTaskAction,
    savedEvidenceRefs,
    selectedCanOperate,
    selectedCanUrge,
    submitDetailAction,
    updateDetailReason,
    updateEvidenceText,
    updatingID,
    urgingID,
  }
}
