import { useCallback, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import {
  buildMobileTaskView,
  buildMobileTaskActionEvidence,
  normalizeMobileActionEvidenceRefs,
} from '../../utils/mobileTaskView.mjs'
import {
  getMobileTaskActionReasonDraftKey,
  normalizeMobileTaskActionKey,
  requiresMobileActionFeedback,
  resolveMobileTaskActionReason,
  resolveMobileUrgeAction,
} from '../utils/mobileRoleTaskModel.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../../utils/workflowTaskActionSubmitGuard.mjs'
import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  isWorkflowTaskMutationResultUnknown,
  verifyNewWorkflowTaskMutationAttempt,
} from '../../utils/workflowTaskMutation.mjs'

function resolveWorkflowTaskActionMode(action = '') {
  if (action === 'done') return 'complete'
  if (action === 'blocked') return 'block'
  if (action === 'rejected') return 'reject'
  if (action === 'resume') return 'resume'
  if (action === 'urge') return 'urge'
  return ''
}

function buildMobileWorkflowActionPayload({ evidenceText, feedback }) {
  return buildMobileTaskActionEvidence({
    evidenceText,
    feedback,
  })
}

const MOBILE_TASK_RECEIPT_STATUSES = new Set(['confirmed', 'failed', 'unknown'])
const MOBILE_TASK_RECEIPT_ACTIONS = new Set([
  'done',
  'blocked',
  'rejected',
  'resume',
  'urge',
])

function normalizeMobileTaskReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const status = String(value.status || '').trim()
  const action = normalizeMobileTaskActionKey(value.action)
  const task =
    value.task && typeof value.task === 'object' && !Array.isArray(value.task)
      ? value.task
      : null
  if (
    !MOBILE_TASK_RECEIPT_STATUSES.has(status) ||
    !MOBILE_TASK_RECEIPT_ACTIONS.has(action) ||
    !String(task?.id || '').trim()
  ) {
    return null
  }
  return {
    action,
    evidence_refs: normalizeMobileActionEvidenceRefs(value.evidence_refs),
    feedback: String(value.feedback || '').trim(),
    message: String(value.message || '').trim(),
    reason: String(value.reason || '').trim(),
    scope_key: String(value.scope_key || '').trim(),
    status,
    task,
  }
}

function mobileTaskReceiptKey(scopeKey, task) {
  const taskID = String(task?.id || '').trim()
  return taskID ? `${String(scopeKey || '').trim()}::${taskID}` : ''
}

function mobileTaskScopedValueKey(scopeKey, taskID) {
  const normalizedTaskID = String(taskID || '').trim()
  return normalizedTaskID
    ? `${String(scopeKey || '').trim()}::${normalizedTaskID}`
    : ''
}

function mobileTaskScopedReasonDraftKey(scopeKey, task, action) {
  const draftKey = getMobileTaskActionReasonDraftKey(task, action)
  return draftKey ? `${String(scopeKey || '').trim()}::${draftKey}` : ''
}

function resolveScopedMobileTaskActionReason({
  scopeKey,
  task,
  action,
  reasonDrafts,
}) {
  const draftKey = getMobileTaskActionReasonDraftKey(task, action)
  const scopedDraftKey = mobileTaskScopedReasonDraftKey(scopeKey, task, action)
  return resolveMobileTaskActionReason({
    task,
    action,
    reasonDrafts:
      draftKey && scopedDraftKey && Object.hasOwn(reasonDrafts, scopedDraftKey)
        ? { [draftKey]: reasonDrafts[scopedDraftKey] }
        : {},
  })
}

export default function useMobileRoleTaskActions({
  activeRoleKey,
  initialAction = '',
  initialActionReceipt = null,
  initialActionTaskID = null,
  initialEvidence = '',
  initialReason = '',
  selectedTask,
  taskActionAccess,
  detailAction,
  receiptScopeKey = activeRoleKey,
  setDetailAction,
  setSelectedTaskID,
  loadTasks,
}) {
  const normalizedReceiptScopeKey = String(
    receiptScopeKey || activeRoleKey || ''
  ).trim()
  const [updatingTaskIDs, setUpdatingTaskIDs] = useState(() => new Set())
  const [urgingTaskIDs, setUrgingTaskIDs] = useState(() => new Set())
  const normalizedInitialAction = normalizeMobileTaskActionKey(initialAction)
  const normalizedInitialTaskID = Number(initialActionTaskID || 0)
  const normalizedInitialReason = String(initialReason || '')
  const normalizedInitialEvidence = String(initialEvidence || '')
  const [taskActionReasonDrafts, setTaskActionReasonDrafts] = useState(() => {
    if (
      normalizedInitialTaskID <= 0 ||
      !normalizedInitialAction ||
      normalizedInitialAction === 'urge' ||
      !normalizedInitialReason
    ) {
      return {}
    }
    const initialDraftKey = mobileTaskScopedReasonDraftKey(
      normalizedReceiptScopeKey,
      { id: normalizedInitialTaskID },
      normalizedInitialAction
    )
    return {
      [initialDraftKey]: normalizedInitialReason,
    }
  })
  const [urgeReasonByTaskID, setUrgeReasonByTaskID] = useState(() =>
    normalizedInitialTaskID > 0 &&
    normalizedInitialAction === 'urge' &&
    normalizedInitialReason
      ? {
          [mobileTaskScopedValueKey(
            normalizedReceiptScopeKey,
            normalizedInitialTaskID
          )]: normalizedInitialReason,
        }
      : {}
  )
  const [evidenceTextByTaskID, setEvidenceTextByTaskID] = useState(() =>
    normalizedInitialTaskID > 0 && normalizedInitialEvidence
      ? {
          [mobileTaskScopedValueKey(
            normalizedReceiptScopeKey,
            normalizedInitialTaskID
          )]: normalizedInitialEvidence,
        }
      : {}
  )
  const initialReceiptCandidate =
    normalizeMobileTaskReceipt(initialActionReceipt)
  const scopedInitialReceipt =
    initialReceiptCandidate &&
    initialReceiptCandidate.scope_key === normalizedReceiptScopeKey
      ? {
          ...initialReceiptCandidate,
          scope_key: normalizedReceiptScopeKey,
        }
      : null
  const normalizedInitialReceipt = scopedInitialReceipt
    ? {
        ...scopedInitialReceipt,
        message:
          scopedInitialReceipt.status === 'unknown'
            ? '上次提交结果尚未确认。为避免重复办理，请返回列表刷新核对后再处理。'
            : scopedInitialReceipt.status === 'failed'
              ? `上次操作未完成。${scopedInitialReceipt.message || '请返回列表重新进入任务后再试。'}`
              : scopedInitialReceipt.message,
      }
    : null
  const [actionReceipt, setActionReceipt] = useState(
    () => normalizedInitialReceipt
  )
  const [taskReceiptsByKey, setTaskReceiptsByKey] = useState(() => {
    const key = mobileTaskReceiptKey(
      normalizedReceiptScopeKey,
      normalizedInitialReceipt?.task
    )
    return key ? { [key]: normalizedInitialReceipt } : {}
  })
  const [retryableReceiptKeys, setRetryableReceiptKeys] = useState(
    () => new Set()
  )
  const mutationScopeKeyRef = useRef('')
  const mutationInFlightRef = useRef(null)
  const mutationAttemptsRef = useRef(null)
  if (mutationScopeKeyRef.current !== normalizedReceiptScopeKey) {
    mutationScopeKeyRef.current = normalizedReceiptScopeKey
    mutationInFlightRef.current = createTaskMutationInFlightGuard()
    mutationAttemptsRef.current = createTaskMutationAttemptStore()
  }
  const activeReceiptScopeKeyRef = useRef(normalizedReceiptScopeKey)
  activeReceiptScopeKeyRef.current = normalizedReceiptScopeKey
  const selectedTaskIDRef = useRef(selectedTask?.id ?? null)
  const detailActionRef = useRef(detailAction)
  selectedTaskIDRef.current = selectedTask?.id ?? null
  detailActionRef.current = detailAction

  const publishActionReceipt = (value) => {
    if (activeReceiptScopeKeyRef.current !== normalizedReceiptScopeKey) {
      return null
    }
    const normalized = normalizeMobileTaskReceipt({
      ...value,
      scope_key: normalizedReceiptScopeKey,
    })
    if (!normalized) return null
    setActionReceipt(normalized)
    const key = mobileTaskReceiptKey(normalizedReceiptScopeKey, normalized.task)
    if (key) {
      setTaskReceiptsByKey((current) => ({
        ...current,
        [key]: normalized,
      }))
      setRetryableReceiptKeys((current) => {
        const next = new Set(current)
        if (normalized.status === 'confirmed') {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    }
    return normalized
  }

  const canRunMobileTaskAction = (task, action) => {
    const actionMode = resolveWorkflowTaskActionMode(action)
    const accessMatchesTask =
      Number(task?.id) === Number(selectedTask?.id) &&
      Number(task?.version) === Number(selectedTask?.version)
    return Boolean(
      actionMode &&
        accessMatchesTask &&
        taskActionAccess?.canRun?.(actionMode) === true
    )
  }

  const moveTask = async (task, taskStatusKey) => {
    const taskID = task?.id ?? null
    const taskOperationKey = mobileTaskScopedValueKey(
      normalizedReceiptScopeKey,
      taskID
    )
    const mutationInFlight = mutationInFlightRef.current
    const mutationAttempts = mutationAttemptsRef.current
    const inFlightLease = mutationInFlight.acquire(
      Number.isSafeInteger(taskID) && taskID > 0
        ? `task:${taskOperationKey}`
        : ''
    )
    if (!inFlightLease) return false
    setUpdatingTaskIDs((current) => {
      const next = new Set(current)
      next.add(taskOperationKey)
      return next
    })
    try {
      const actionInput = String(
        resolveScopedMobileTaskActionReason({
          scopeKey: normalizedReceiptScopeKey,
          task,
          action: taskStatusKey,
          reasonDrafts: taskActionReasonDrafts,
        })
      ).trim()
      const completionFeedbackRequired =
        requiresMobileActionFeedback(taskStatusKey)
      const completionFeedback = completionFeedbackRequired ? actionInput : ''
      const actionReason = completionFeedbackRequired ? '' : actionInput
      const reasonRequired = ['blocked', 'rejected', 'resume'].includes(
        taskStatusKey
      )
      if (completionFeedbackRequired && !actionInput) {
        message.warning('请先填写完成反馈')
        return false
      }
      if (reasonRequired && !actionReason) {
        message.warning(
          taskStatusKey === 'resume'
            ? '请先填写阻塞解除说明'
            : '请先填写阻塞或退回原因'
        )
        return false
      }
      const evidenceText = String(
        evidenceTextByTaskID[
          mobileTaskScopedValueKey(normalizedReceiptScopeKey, task.id)
        ] || ''
      ).trim()
      const payload = buildMobileWorkflowActionPayload({
        evidenceText,
        feedback: completionFeedback,
      })
      const actionParams = {
        task_id: task.id,
        expected_version: task.version,
        ...(actionReason ? { reason: actionReason } : {}),
        payload,
      }
      const actionMode = resolveWorkflowTaskActionMode(taskStatusKey)
      const mutate =
        taskStatusKey === 'done'
          ? completeWorkflowTaskAction
          : taskStatusKey === 'blocked'
            ? blockWorkflowTaskAction
            : taskStatusKey === 'rejected'
              ? rejectWorkflowTaskAction
              : taskStatusKey === 'resume'
                ? resumeWorkflowTaskAction
                : null
      if (!mutate) {
        throw new Error('当前处理方式暂不可用，请重新选择')
      }
      const scope = `${normalizedReceiptScopeKey}::${task.id}:${actionMode}`
      const params = {
        ...actionParams,
        action_key: actionMode,
      }
      const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
        attemptStore: mutationAttempts,
        scope,
        operation: actionMode,
        params,
        verify: async () => {
          if (!canRunMobileTaskAction(task, taskStatusKey)) {
            message.warning('当前岗位不能处理该任务')
            return false
          }
          return verifyWorkflowTaskActionAccessBeforeSubmit({
            task,
            actionKey: actionMode,
            reason: actionReason,
            onWarning: message.warning,
            onError: message.error,
          })
        },
      })
      if (!accessVerified) return false
      let canonicalTask
      try {
        canonicalTask = await mutationAttempts.run({
          scope,
          operation: actionMode,
          mutate,
          params,
        })
      } catch (error) {
        if (isWorkflowTaskMutationResultUnknown(error)) {
          publishActionReceipt({
            action: taskStatusKey,
            evidence_refs: payload.evidence_refs || [],
            feedback: completionFeedback,
            message:
              '网络中断，本次办理结果暂未确认。已填写内容和证据已保留，可继续确认。',
            reason: actionReason,
            status: 'unknown',
            task,
          })
          message.warning('提交结果暂未确认，已保留填写内容，可直接重试')
        } else {
          const errorMessage = getActionErrorMessage(
            error,
            '更新任务状态失败，请稍后重试'
          )
          publishActionReceipt({
            action: taskStatusKey,
            evidence_refs: payload.evidence_refs || [],
            feedback: completionFeedback,
            message: errorMessage,
            reason: actionReason,
            status: 'failed',
            task,
          })
          message.error(errorMessage)
        }
        return false
      }
      const confirmedTask =
        canonicalTask && typeof canonicalTask === 'object'
          ? buildMobileTaskView(canonicalTask)
          : null
      publishActionReceipt({
        action: taskStatusKey,
        evidence_refs: payload.evidence_refs || [],
        feedback: completionFeedback,
        message: confirmedTask
          ? '任务办理结果已经确认。'
          : '办理已返回，但没有取得可确认的任务信息，请刷新任务列表核对。',
        reason: actionReason,
        status: confirmedTask ? 'confirmed' : 'unknown',
        task: confirmedTask || task,
      })
      setTaskActionReasonDrafts((current) => {
        const next = { ...current }
        const draftKey = mobileTaskScopedReasonDraftKey(
          normalizedReceiptScopeKey,
          task,
          taskStatusKey
        )
        if (draftKey) {
          delete next[draftKey]
        }
        return next
      })
      setEvidenceTextByTaskID((current) => {
        const next = { ...current }
        delete next[
          mobileTaskScopedValueKey(normalizedReceiptScopeKey, task.id)
        ]
        return next
      })
      message.success('任务状态已更新')
      loadTasks({ canonicalTask: confirmedTask }).catch(() => {
        message.warning('操作已成功但列表刷新失败，请手动刷新')
      })
      return true
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '更新任务状态失败，请稍后重试')
      )
      return false
    } finally {
      mutationInFlight.release(inFlightLease)
      setUpdatingTaskIDs((current) => {
        if (!current.has(taskOperationKey)) return current
        const next = new Set(current)
        next.delete(taskOperationKey)
        return next
      })
    }
  }

  const urgeTask = async (task) => {
    const taskID = task?.id ?? null
    const taskOperationKey = mobileTaskScopedValueKey(
      normalizedReceiptScopeKey,
      taskID
    )
    const mutationInFlight = mutationInFlightRef.current
    const mutationAttempts = mutationAttemptsRef.current
    const inFlightLease = mutationInFlight.acquire(
      Number.isSafeInteger(taskID) && taskID > 0
        ? `task:${taskOperationKey}`
        : ''
    )
    if (!inFlightLease) return false
    setUrgingTaskIDs((current) => {
      const next = new Set(current)
      next.add(taskOperationKey)
      return next
    })
    try {
      const scopedTaskKey = mobileTaskScopedValueKey(
        normalizedReceiptScopeKey,
        task.id
      )
      const reason = String(urgeReasonByTaskID[scopedTaskKey] || '').trim()
      if (!reason) {
        message.warning('请先填写催办原因')
        return false
      }
      const mobileActionEvidence = buildMobileTaskActionEvidence({
        evidenceText: evidenceTextByTaskID[scopedTaskKey] || '',
      })
      const scope = `${normalizedReceiptScopeKey}::${task.id}:urge`
      const operation = 'urge'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action: resolveMobileUrgeAction(activeRoleKey, task),
        reason,
        payload: mobileActionEvidence,
      }
      const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
        attemptStore: mutationAttempts,
        scope,
        operation,
        params,
        verify: async () => {
          if (!canRunMobileTaskAction(task, operation)) {
            message.warning('当前岗位不能催办该任务')
            return false
          }
          return verifyWorkflowTaskActionAccessBeforeSubmit({
            task,
            actionKey: operation,
            reason,
            onWarning: message.warning,
            onError: message.error,
          })
        },
      })
      if (!accessVerified) return false
      let canonicalTask
      try {
        canonicalTask = await mutationAttempts.run({
          scope,
          operation,
          mutate: urgeWorkflowTask,
          params,
        })
      } catch (error) {
        if (isWorkflowTaskMutationResultUnknown(error)) {
          publishActionReceipt({
            action: 'urge',
            evidence_refs: mobileActionEvidence.evidence_refs || [],
            message:
              '网络中断，催办结果尚未确认。本次原因和证据已保留，可继续确认。',
            reason,
            status: 'unknown',
            task,
          })
          message.warning('催办结果暂未确认，已保留本次操作，可直接重试')
        } else {
          const errorMessage = getActionErrorMessage(
            error,
            '催办失败，请稍后重试'
          )
          publishActionReceipt({
            action: 'urge',
            evidence_refs: mobileActionEvidence.evidence_refs || [],
            message: errorMessage,
            reason,
            status: 'failed',
            task,
          })
          message.error(errorMessage)
        }
        return false
      }
      const confirmedTask =
        canonicalTask && typeof canonicalTask === 'object'
          ? buildMobileTaskView(canonicalTask)
          : null
      publishActionReceipt({
        action: 'urge',
        evidence_refs: mobileActionEvidence.evidence_refs || [],
        message: confirmedTask
          ? '催办结果已经确认。'
          : '催办已返回，但没有取得可确认的任务信息，请刷新任务列表核对。',
        reason,
        status: confirmedTask ? 'confirmed' : 'unknown',
        task: confirmedTask || task,
      })
      setUrgeReasonByTaskID((current) => {
        const next = { ...current }
        delete next[scopedTaskKey]
        return next
      })
      setEvidenceTextByTaskID((current) => {
        const next = { ...current }
        delete next[scopedTaskKey]
        return next
      })
      message.success('催办已记录')
      loadTasks({ canonicalTask: confirmedTask }).catch(() => {
        message.warning('操作已成功但列表刷新失败，请手动刷新')
      })
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '催办失败，请稍后重试'))
      return false
    } finally {
      mutationInFlight.release(inFlightLease)
      setUrgingTaskIDs((current) => {
        if (!current.has(taskOperationKey)) return current
        const next = new Set(current)
        next.delete(taskOperationKey)
        return next
      })
    }
  }

  const handleTaskAction = async (task, action) => {
    selectedTaskIDRef.current = task.id
    setSelectedTaskID(task.id)
    if (['done', 'blocked', 'rejected', 'resume', 'urge'].includes(action)) {
      if (!canRunMobileTaskAction(task, action)) {
        message.warning('当前岗位不能处理该任务')
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

  const submitDetailAction = async (submission = {}) => {
    if (!selectedTask || !detailAction) return
    const requestedAction = normalizeMobileTaskActionKey(
      submission?.action || detailAction
    )
    const currentAction = normalizeMobileTaskActionKey(detailAction)
    if (!requestedAction || requestedAction !== currentAction) {
      message.warning('处理方式已变化，请重新选择后提交')
      return false
    }
    const submittedTaskID = selectedTask.id
    const submittedAction = requestedAction
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
    return actionCompleted
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
  const selectedCanResume = selectedTask
    ? canRunMobileTaskAction(selectedTask, 'resume')
    : false
  const selectedCanOperate =
    selectedCanBlock ||
    selectedCanComplete ||
    selectedCanReject ||
    selectedCanResume
  const selectedCanUrge = selectedTask
    ? canRunMobileTaskAction(selectedTask, 'urge')
    : false
  const selectedTaskScopedKey = selectedTask
    ? mobileTaskScopedValueKey(normalizedReceiptScopeKey, selectedTask.id)
    : ''
  const detailReasonValue = selectedTask
    ? detailAction === 'urge'
      ? urgeReasonByTaskID[selectedTaskScopedKey] || ''
      : resolveScopedMobileTaskActionReason({
          scopeKey: normalizedReceiptScopeKey,
          task: selectedTask,
          action: detailAction,
          reasonDrafts: taskActionReasonDrafts,
        })
    : ''
  const detailEvidenceValue = selectedTask
    ? evidenceTextByTaskID[selectedTaskScopedKey] || ''
    : ''
  const savedEvidenceRefs = selectedTask
    ? normalizeMobileActionEvidenceRefs(
        selectedTask.mobile_action_evidence_refs
      )
    : []
  const updatingID =
    selectedTask && updatingTaskIDs.has(selectedTaskScopedKey)
      ? selectedTask.id
      : null
  const urgingID =
    selectedTask && urgingTaskIDs.has(selectedTaskScopedKey)
      ? selectedTask.id
      : null

  const updateDetailReason = (value) => {
    if (!selectedTask) return
    if (detailAction === 'urge') {
      setUrgeReasonByTaskID((current) => ({
        ...current,
        [selectedTaskScopedKey]: value,
      }))
      return
    }
    const draftKey = mobileTaskScopedReasonDraftKey(
      normalizedReceiptScopeKey,
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
      [selectedTaskScopedKey]: value,
    }))
  }

  const restoreActionDraft = useCallback(
    ({ taskID, action, reason = '', evidence = '' } = {}) => {
      const normalizedTaskID = Number(taskID || 0)
      const normalizedAction = normalizeMobileTaskActionKey(action)
      if (
        !Number.isSafeInteger(normalizedTaskID) ||
        normalizedTaskID <= 0 ||
        !MOBILE_TASK_RECEIPT_ACTIONS.has(normalizedAction)
      ) {
        return false
      }
      const normalizedReason = String(reason || '')
      const normalizedEvidence = String(evidence || '')
      const scopedTaskKey = mobileTaskScopedValueKey(
        normalizedReceiptScopeKey,
        normalizedTaskID
      )
      if (normalizedAction === 'urge') {
        setUrgeReasonByTaskID((current) => ({
          ...current,
          [scopedTaskKey]: normalizedReason,
        }))
      } else {
        const draftKey = mobileTaskScopedReasonDraftKey(
          normalizedReceiptScopeKey,
          { id: normalizedTaskID },
          normalizedAction
        )
        setTaskActionReasonDrafts((current) => ({
          ...current,
          [draftKey]: normalizedReason,
        }))
      }
      setEvidenceTextByTaskID((current) => ({
        ...current,
        [scopedTaskKey]: normalizedEvidence,
      }))
      return true
    },
    [normalizedReceiptScopeKey]
  )

  const appendQuickReason = (value) => {
    const nextValue = detailReasonValue
      ? `${detailReasonValue}；${value}`
      : value
    updateDetailReason(nextValue)
  }

  const clearActionReceipt = useCallback(() => setActionReceipt(null), [])

  const restoreActionReceipt = useCallback(
    (receipt) => {
      const normalized = normalizeMobileTaskReceipt(receipt)
      if (!normalized || normalized.scope_key !== normalizedReceiptScopeKey) {
        setActionReceipt(null)
        return null
      }
      const scopedReceipt = {
        ...normalized,
        scope_key: normalizedReceiptScopeKey,
      }
      setActionReceipt(scopedReceipt)
      const key = mobileTaskReceiptKey(
        normalizedReceiptScopeKey,
        scopedReceipt.task
      )
      if (key) {
        setTaskReceiptsByKey((current) => ({
          ...current,
          [key]: scopedReceipt,
        }))
      }
      return scopedReceipt
    },
    [normalizedReceiptScopeKey]
  )

  const showTaskReceipt = useCallback(
    (task) => {
      const key = mobileTaskReceiptKey(normalizedReceiptScopeKey, task)
      const receipt = key ? taskReceiptsByKey[key] || null : null
      if (!receipt) return null
      setActionReceipt(receipt)
      return receipt
    },
    [normalizedReceiptScopeKey, taskReceiptsByKey]
  )

  const selectedTaskReceipt = selectedTask
    ? taskReceiptsByKey[
        mobileTaskReceiptKey(normalizedReceiptScopeKey, selectedTask)
      ] || null
    : null
  const scopedActionReceipt =
    actionReceipt?.scope_key === normalizedReceiptScopeKey
      ? actionReceipt
      : null
  const actionReceiptRetryable = Boolean(
    scopedActionReceipt &&
      retryableReceiptKeys.has(
        mobileTaskReceiptKey(
          normalizedReceiptScopeKey,
          scopedActionReceipt.task
        )
      )
  )
  const selectedTaskReceiptRetryable = Boolean(
    selectedTaskReceipt &&
      retryableReceiptKeys.has(
        mobileTaskReceiptKey(
          normalizedReceiptScopeKey,
          selectedTaskReceipt.task
        )
      )
  )

  return {
    actionReceiptRetryable,
    appendQuickReason,
    actionReceipt: scopedActionReceipt,
    clearActionReceipt,
    detailEvidenceValue,
    detailReasonValue,
    handleTaskAction,
    savedEvidenceRefs,
    selectedCanOperate,
    selectedCanBlock,
    selectedCanComplete,
    selectedCanReject,
    selectedCanResume,
    selectedCanUrge,
    selectedTaskReceipt,
    selectedTaskReceiptRetryable,
    restoreActionReceipt,
    restoreActionDraft,
    showTaskReceipt,
    submitDetailAction,
    updateDetailReason,
    updateEvidenceText,
    updatingID,
    urgingID,
  }
}
