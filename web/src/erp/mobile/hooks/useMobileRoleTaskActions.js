import { useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  rejectWorkflowTaskAction,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import {
  buildMobileTaskActionEvidence,
  normalizeMobileActionEvidenceRefs,
} from '../../utils/mobileTaskView.mjs'
import { isOrderApprovalTask } from '../../utils/orderApprovalFlow.mjs'
import { isPurchaseIqcTask } from '../../utils/purchaseInboundFlow.mjs'
import { isOutsourceReturnQcTask } from '../../utils/outsourceReturnFlow.mjs'
import {
  isFinishedGoodsQcTask,
  isShipmentReleaseTask,
} from '../../utils/finishedGoodsFlow.mjs'
import {
  isInvoiceRegistrationTask,
  isReceivableRegistrationTask,
} from '../../utils/shipmentFinanceFlow.mjs'
import {
  isPayableRegistrationTask,
  isPayableReconciliationTask,
} from '../../utils/payableReconciliationFlow.mjs'
import {
  canOpenMobileTaskDetailAction,
  getMobileTaskActionReasonDraftKey,
  normalizeMobileTaskActionKey,
  requiresMobileActionFeedback,
  resolveMobileTaskActionReason,
  resolveMobileActionLabel,
  resolveMobileUrgeAction,
} from '../utils/mobileRoleTaskModel.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../../utils/workflowTaskActionSubmitGuard.mjs'
import { canRunWorkflowTaskAction } from '../../utils/workflowTaskBoard.mjs'

function compactActionPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  )
}

function resolveWorkflowTaskActionMode(action = '') {
  if (action === 'done') return 'complete'
  if (action === 'blocked') return 'block'
  if (action === 'rejected') return 'reject'
  if (action === 'urge') return 'urge'
  return ''
}

function buildMobileWorkflowActionPayload({
  activeRoleKey,
  actionReason,
  evidenceText,
  reasonRequired,
  task,
  taskStatusKey,
}) {
  return compactActionPayload({
    ...buildMobileTaskActionEvidence({
      roleKey: activeRoleKey,
      actionKey: taskStatusKey,
      reason: reasonRequired ? actionReason : '',
      evidenceText,
    }),
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
    rejected_reason: taskStatusKey === 'rejected' ? actionReason : undefined,
    blocked_reason: taskStatusKey === 'blocked' ? actionReason : undefined,
  })
}

export default function useMobileRoleTaskActions({
  activeRoleKey,
  adminProfile,
  selectedTask,
  detailAction,
  setDetailAction,
  setSelectedTaskID,
  loadTasks,
}) {
  const [updatingTaskIDs, setUpdatingTaskIDs] = useState(() => new Set())
  const [urgingTaskIDs, setUrgingTaskIDs] = useState(() => new Set())
  const [taskActionReasonDrafts, setTaskActionReasonDrafts] = useState({})
  const [urgeReasonByTaskID, setUrgeReasonByTaskID] = useState({})
  const [evidenceTextByTaskID, setEvidenceTextByTaskID] = useState({})
  const actionInFlightTaskIDsRef = useRef(new Set())
  const selectedTaskIDRef = useRef(selectedTask?.id ?? null)
  const detailActionRef = useRef(detailAction)
  selectedTaskIDRef.current = selectedTask?.id ?? null
  detailActionRef.current = detailAction

  const canRunMobileTaskAction = (task, action) => {
    const actionMode = resolveWorkflowTaskActionMode(action)
    return Boolean(
      actionMode &&
        canOpenMobileTaskDetailAction(activeRoleKey, task, action) &&
        canRunWorkflowTaskAction(adminProfile, task, actionMode)
    )
  }

  const moveTask = async (task, taskStatusKey) => {
    const taskID = task?.id ?? null
    if (actionInFlightTaskIDsRef.current.has(taskID)) {
      return false
    }
    actionInFlightTaskIDsRef.current.add(taskID)
    setUpdatingTaskIDs((current) => {
      const next = new Set(current)
      next.add(taskID)
      return next
    })
    try {
      if (!canRunMobileTaskAction(task, taskStatusKey)) {
        message.warning(
          `当前角色不能${resolveMobileActionLabel(taskStatusKey)}该任务`
        )
        return false
      }
      const actionReason = String(
        resolveMobileTaskActionReason({
          task,
          action: taskStatusKey,
          reasonDrafts: taskActionReasonDrafts,
        })
      ).trim()
      const reasonRequired = ['blocked', 'rejected'].includes(taskStatusKey)
      if (reasonRequired && !actionReason) {
        message.warning('请先填写阻塞或退回原因')
        return false
      }
      const evidenceText = String(evidenceTextByTaskID[task.id] || '').trim()
      if (requiresMobileActionFeedback(taskStatusKey) && !evidenceText) {
        message.warning('请先填写完成反馈或附件线索')
        return false
      }
      const explainActionKey =
        taskStatusKey === 'done'
          ? 'complete'
          : taskStatusKey === 'blocked'
            ? 'block'
            : taskStatusKey === 'rejected'
              ? 'reject'
              : taskStatusKey
      const explainAllowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
        task,
        actionKey: explainActionKey,
        reason: actionReason,
        onWarning: message.warning,
        onError: message.error,
      })
      if (!explainAllowed) return false

      const payload = buildMobileWorkflowActionPayload({
        activeRoleKey,
        actionReason,
        evidenceText,
        reasonRequired,
        task,
        taskStatusKey,
      })
      const actionParams = {
        task_id: task.id,
        reason: reasonRequired ? actionReason : '',
        payload,
      }
      if (taskStatusKey === 'done') {
        await completeWorkflowTaskAction({
          ...actionParams,
          action_key: 'complete',
        })
      } else if (taskStatusKey === 'blocked') {
        await blockWorkflowTaskAction({
          ...actionParams,
          action_key: 'block',
        })
      } else if (taskStatusKey === 'rejected') {
        await rejectWorkflowTaskAction({
          ...actionParams,
          action_key: 'reject',
        })
      } else {
        throw new Error('当前任务动作暂不支持')
      }
      setTaskActionReasonDrafts((current) => {
        const next = { ...current }
        const draftKey = getMobileTaskActionReasonDraftKey(task, taskStatusKey)
        if (draftKey) {
          delete next[draftKey]
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
      actionInFlightTaskIDsRef.current.delete(taskID)
      setUpdatingTaskIDs((current) => {
        if (!current.has(taskID)) return current
        const next = new Set(current)
        next.delete(taskID)
        return next
      })
    }
  }

  const urgeTask = async (task) => {
    const taskID = task?.id ?? null
    if (actionInFlightTaskIDsRef.current.has(taskID)) {
      return false
    }
    actionInFlightTaskIDsRef.current.add(taskID)
    setUrgingTaskIDs((current) => {
      const next = new Set(current)
      next.add(taskID)
      return next
    })
    try {
      if (!canRunMobileTaskAction(task, 'urge')) {
        message.warning('当前角色没有催办该任务的权限')
        return false
      }
      const reason = String(urgeReasonByTaskID[task.id] || '').trim()
      if (!reason) {
        message.warning('请先填写催办原因')
        return false
      }
      const explainAllowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
        task,
        actionKey: 'urge',
        reason,
        onWarning: message.warning,
        onError: message.error,
      })
      if (!explainAllowed) return false

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
        payload: {
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
      actionInFlightTaskIDsRef.current.delete(taskID)
      setUrgingTaskIDs((current) => {
        if (!current.has(taskID)) return current
        const next = new Set(current)
        next.delete(taskID)
        return next
      })
    }
  }

  const handleTaskAction = async (task, action) => {
    selectedTaskIDRef.current = task.id
    setSelectedTaskID(task.id)
    if (['done', 'blocked', 'rejected', 'urge'].includes(action)) {
      if (!canRunMobileTaskAction(task, action)) {
        message.warning(`当前角色不能${resolveMobileActionLabel(action)}该任务`)
        return
      }
      detailActionRef.current = action
      setDetailAction(action)
      return
    }
    detailActionRef.current = null
    setDetailAction(null)
    await moveTask(task, action)
  }

  const submitDetailAction = async () => {
    if (!selectedTask || !detailAction) return
    const submittedTaskID = selectedTask.id
    const submittedAction = detailAction
    const actionCompleted =
      submittedAction === 'urge'
        ? await urgeTask(selectedTask)
        : await moveTask(selectedTask, submittedAction)
    if (
      actionCompleted &&
      selectedTaskIDRef.current === submittedTaskID &&
      detailActionRef.current === submittedAction
    ) {
      detailActionRef.current = null
      setDetailAction(null)
    }
  }

  const selectedCanBlock = selectedTask
    ? canRunMobileTaskAction(selectedTask, 'blocked')
    : false
  const selectedCanComplete = selectedTask
    ? canRunMobileTaskAction(selectedTask, 'done')
    : false
  const selectedCanReject = selectedTask
    ? canRunMobileTaskAction(selectedTask, 'rejected')
    : false
  const selectedCanOperate =
    selectedCanBlock || selectedCanComplete || selectedCanReject
  const selectedCanUrge = selectedTask
    ? canRunMobileTaskAction(selectedTask, 'urge')
    : false
  const detailReasonValue = selectedTask
    ? detailAction === 'urge'
      ? urgeReasonByTaskID[selectedTask.id] || ''
      : resolveMobileTaskActionReason({
          task: selectedTask,
          action: detailAction,
          reasonDrafts: taskActionReasonDrafts,
        })
    : ''
  const detailEvidenceValue = selectedTask
    ? evidenceTextByTaskID[selectedTask.id] || ''
    : ''
  const savedEvidenceRefs = selectedTask
    ? normalizeMobileActionEvidenceRefs(
        selectedTask.mobile_action_evidence_refs
      )
    : []
  const updatingID =
    selectedTask && updatingTaskIDs.has(selectedTask.id)
      ? selectedTask.id
      : null
  const urgingID =
    selectedTask && urgingTaskIDs.has(selectedTask.id) ? selectedTask.id : null

  const updateDetailReason = (value) => {
    if (!selectedTask) return
    if (detailAction === 'urge') {
      setUrgeReasonByTaskID((current) => ({
        ...current,
        [selectedTask.id]: value,
      }))
      return
    }
    const draftKey = getMobileTaskActionReasonDraftKey(
      selectedTask,
      normalizeMobileTaskActionKey(detailAction)
    )
    if (!draftKey) return
    setTaskActionReasonDrafts((current) => ({
      ...current,
      [draftKey]: value,
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
    selectedCanBlock,
    selectedCanComplete,
    selectedCanReject,
    selectedCanUrge,
    submitDetailAction,
    updateDetailReason,
    updateEvidenceText,
    updatingID,
    urgingID,
  }
}
