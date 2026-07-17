import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'

const ACTION_LABELS = Object.freeze({
  complete: '处理完成',
  block: '标记阻塞',
  reject: '退回任务',
  resume: '解除阻塞',
  urge: '催办',
})

const ACTION_ORDER = Object.freeze([
  'complete',
  'block',
  'reject',
  'resume',
  'urge',
])

const SINGLE_ACTION_HINTS = Object.freeze({
  complete: '当前可确认任务处理完成；提交只更新当前协同任务。',
  block: '当前可记录任务阻塞；请说明卡点、影响范围和需要谁协助。',
  reject: '当前可退回任务；请说明退回依据和需要补齐的内容。',
  resume: '当前可解除阻塞；请先确认卡点已经消除。',
  urge: '当前仅可催办；催办只发送提醒，不代替负责人处理任务。',
})

function normalizeAllowedActionModes(allowedActionModes = []) {
  if (!Array.isArray(allowedActionModes)) return []
  const allowedModeSet = new Set(
    allowedActionModes.map((mode) => String(mode || '').trim()).filter(Boolean)
  )
  return ACTION_ORDER.filter((mode) => allowedModeSet.has(mode))
}

function appendEntryHint(hint, canOpenEntry) {
  if (!canOpenEntry) return hint
  return `${hint}关联业务信息可在相关单据核对。`
}

function buildMultipleActionHint(task, actionModes) {
  const actionLabels = actionModes.map((mode) => ACTION_LABELS[mode]).join('、')
  const statusKey = String(task?.task_status_key || '').trim()

  if (statusKey === 'blocked') {
    return `当前为阻塞任务，可选择${actionLabels}；解除前请确认卡点已消除。`
  }
  if (statusKey === 'ready') {
    return `可选择${actionLabels}；请按实际结果操作。`
  }
  return `可选择${actionLabels}；请按实际结果操作。`
}

// This is a read-only UI projection. It must not become a workflow fact or a
// persisted "next step" field.
export function getWorkflowTaskProcessingHint({
  task = null,
  allowedActionModes = [],
  loading = false,
  failed = false,
  readonlyReason = '',
  canOpenEntry = false,
} = {}) {
  if (!task) return '当前没有可查看的任务。'

  if (isTerminalWorkflowTask(task)) {
    return canOpenEntry
      ? '任务已结束，可查看关联记录。'
      : '任务已结束，当前仅支持查看任务详情。'
  }

  if (loading) return '正在确认当前可用的处理方式，请稍候。'
  if (failed) return '暂时无法确认可用的处理方式，请稍后重试。'

  const actionModes = normalizeAllowedActionModes(allowedActionModes)
  if (actionModes.length === 1) {
    return appendEntryHint(SINGLE_ACTION_HINTS[actionModes[0]], canOpenEntry)
  }
  if (actionModes.length > 1) {
    return appendEntryHint(
      buildMultipleActionHint(task, actionModes),
      canOpenEntry
    )
  }

  const normalizedReadonlyReason = String(readonlyReason || '').trim()
  if (normalizedReadonlyReason) {
    return appendEntryHint(normalizedReadonlyReason, canOpenEntry)
  }
  return canOpenEntry
    ? '当前没有可用的任务操作，可前往相关单据继续核对。'
    : '当前没有可用的处理方式，只能查看任务详情。'
}
