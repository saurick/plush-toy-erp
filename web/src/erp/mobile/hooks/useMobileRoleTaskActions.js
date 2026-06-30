import { useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  explainWorkflowActionAccess,
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

  const explainTaskAction = async (task, actionKey) => {
    try {
      const data = await explainWorkflowActionAccess({
        task_id: task.id,
        action_key: actionKey,
      })
      const action = data?.action || {}
      if (action.allowed !== true) {
        message.warning(action.reason || '当前账号不能提交这个任务动作')
        return false
      }
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对任务动作权限失败'))
      return false
    }
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
    const explainActionKey =
      taskStatusKey === 'done'
        ? 'complete'
        : taskStatusKey === 'blocked'
          ? 'block'
          : taskStatusKey === 'rejected'
            ? 'reject'
            : taskStatusKey
    const explainAllowed = await explainTaskAction(task, explainActionKey)
    if (!explainAllowed) return false

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
      const actionParams = {
        id: task.id,
        business_status_key: nextBusinessStatusKey,
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
    const explainAllowed = await explainTaskAction(task, 'urge')
    if (!explainAllowed) return false

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
