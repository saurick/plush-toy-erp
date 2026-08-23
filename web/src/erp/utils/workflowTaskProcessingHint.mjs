import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'
import { getRoleDisplayName, normalizeRoleKey } from './roleKeys.mjs'

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

const ACTION_MODE_ALIASES = Object.freeze({
  done: 'complete',
  blocked: 'block',
  rejected: 'reject',
})

function workflowRoleLabel(roleKey = '') {
  const label = getRoleDisplayName(roleKey, '当前负责岗位')
  return label.endsWith('岗位') ? label : `${label}岗位`
}

function buildExceptionContactPresentation(parts = []) {
  const normalizedParts = parts.filter((part) => part?.text)
  return {
    parts: normalizedParts,
    text: normalizedParts.map((part) => part.text).join(''),
  }
}

function contactText(text) {
  return { kind: 'text', text }
}

function contactRole(text) {
  return { kind: 'role', text }
}

export function getWorkflowTaskExceptionContactPresentation(task = {}) {
  const statusKey = String(task?.task_status_key || '').trim()
  const blocked = statusKey === 'blocked'
  const escalated = Boolean(task?.is_escalated || task?.escalated_at)
  if (!blocked && !escalated) return buildExceptionContactPresentation()

  const ownerRoleKey = normalizeRoleKey(task?.owner_role_key)
  const escalationRoleKey = normalizeRoleKey(task?.escalate_target_role_key)
  const ownerLabel = workflowRoleLabel(ownerRoleKey)
  const escalationLabel = escalationRoleKey
    ? workflowRoleLabel(escalationRoleKey)
    : ''

  if (escalated && !blocked) {
    return buildExceptionContactPresentation([
      contactText('请联系 '),
      contactRole(escalationLabel || ownerLabel),
      contactText('，确认处理。'),
    ])
  }
  if (escalationLabel && escalationRoleKey !== ownerRoleKey) {
    return buildExceptionContactPresentation([
      contactText('先联系 '),
      contactRole(ownerLabel),
      contactText('；仍无法解决时联系 '),
      contactRole(escalationLabel),
      contactText('。'),
    ])
  }
  return buildExceptionContactPresentation([
    contactText('请联系 '),
    contactRole(ownerLabel),
    contactText('，确认卡点和恢复条件。'),
  ])
}

export function getWorkflowTaskExceptionContactHint(task = {}) {
  return getWorkflowTaskExceptionContactPresentation(task).text
}

export function getWorkflowTaskActionOutcomeHint({
  task = {},
  actionMode = '',
} = {}) {
  const normalizedActionMode =
    ACTION_MODE_ALIASES[String(actionMode || '').trim()] ||
    String(actionMode || '').trim()
  const ownerRoleKey = normalizeRoleKey(task?.owner_role_key)
  const escalationRoleKey = normalizeRoleKey(task?.escalate_target_role_key)
  const ownerLabel = workflowRoleLabel(ownerRoleKey)
  const escalationLabel = escalationRoleKey
    ? workflowRoleLabel(escalationRoleKey)
    : ''
  const processLinked = Number(task?.process_instance_id || 0) > 0

  if (normalizedActionMode === 'assign') {
    return '确认后只改变处理人，负责岗位和流程保持不变。'
  }
  if (normalizedActionMode === 'urge') {
    return `确认后只提醒${ownerLabel}，不会改变任务状态或业务单据。`
  }
  if (normalizedActionMode === 'block') {
    const contactCopy =
      escalationLabel && escalationRoleKey !== ownerRoleKey
        ? `先联系 ${ownerLabel}，仍无法解决时联系 ${escalationLabel}`
        : `联系 ${ownerLabel}，确认卡点`
    return `确认后任务会标记为受阻；${contactCopy}，不会改变业务单据。`
  }
  if (normalizedActionMode === 'resume') {
    return `确认后任务恢复由${ownerLabel}办理，不会直接完成业务单据。`
  }
  if (normalizedActionMode === 'reject') {
    return processLinked
      ? '确认后系统会按退回结果自动流转；提交成功后以业务进度和对应业务单据为准。'
      : '确认后任务会退回；相关业务是否变化以对应业务页面为准。'
  }
  if (normalizedActionMode === 'complete') {
    return processLinked
      ? '确认后系统会按本次结果自动流转；提交成功后以业务进度和对应业务单据为准。'
      : '确认后只完成当前任务；相关业务是否办结以对应业务页面为准。'
  }
  return '提交只处理当前任务；相关业务结果仍以对应业务页面为准。'
}

function normalizeAllowedActionModes(allowedActionModes = []) {
  if (!Array.isArray(allowedActionModes)) return []
  const allowedModeSet = new Set(
    allowedActionModes.map((mode) => String(mode || '').trim()).filter(Boolean)
  )
  return ACTION_ORDER.filter((mode) => allowedModeSet.has(mode))
}

function appendEntryHint(hint, canOpenEntry, sourceAccess = {}) {
  if (canOpenEntry) {
    return `${hint}关联业务信息可在相关单据核对。`
  }
  if (
    sourceAccess?.applicable === false &&
    sourceAccess?.resolved === true &&
    sourceAccess?.allowed === true
  ) {
    const noSourceReason =
      String(sourceAccess?.reason || '').trim() ||
      '当前任务没有需要核对的相关单据。'
    return hint.includes(noSourceReason) ? hint : `${hint}${noSourceReason}`
  }
  return hint
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
  sourceAccess = {},
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
  if (sourceAccess?.applicable === true && sourceAccess?.allowed !== true) {
    const sourceReason =
      String(sourceAccess?.reason || '').trim() ||
      String(readonlyReason || '').trim() ||
      '当前不能核对该任务的相关单据，因此不能办理。'
    if (
      actionModes.length === 1 &&
      actionModes[0] === 'urge' &&
      !sourceReason.includes('催办')
    ) {
      return `${sourceReason}当前仍可催办责任人。`
    }
    return sourceReason
  }
  if (actionModes.length === 1) {
    return appendEntryHint(
      SINGLE_ACTION_HINTS[actionModes[0]],
      canOpenEntry,
      sourceAccess
    )
  }
  if (actionModes.length > 1) {
    return appendEntryHint(
      buildMultipleActionHint(task, actionModes),
      canOpenEntry,
      sourceAccess
    )
  }

  const normalizedReadonlyReason = String(readonlyReason || '').trim()
  if (normalizedReadonlyReason) {
    return appendEntryHint(normalizedReadonlyReason, canOpenEntry, sourceAccess)
  }
  if (canOpenEntry) {
    return '当前没有可用的任务操作，可前往相关单据继续核对。'
  }
  return appendEntryHint(
    '当前没有可用的处理方式，只能查看任务详情。',
    false,
    sourceAccess
  )
}
