export const DEFAULT_WORKFLOW_ACTION_MODES = Object.freeze([
  'complete',
  'block',
  'reject',
  'resume',
  'urge',
])

const WORKFLOW_ACTION_MODE_SET = new Set(DEFAULT_WORKFLOW_ACTION_MODES)
const WORKFLOW_TASK_EXPLAIN_PARAM_KEYS = new Set(['task_id'])
const WORKFLOW_ACTION_EXPLAIN_PARAM_KEYS = new Set(['task_id', 'action_key'])

const WORKFLOW_ACTION_ACCESS_FAILED_REASON =
  '暂时无法确认您是否可以处理此任务，请刷新后重试。'
const WORKFLOW_ACTION_ACCESS_MISSING_REASON = '当前操作暂不可用，请刷新后重试。'
const WORKFLOW_ACTION_ACCESS_CHECKING_REASON =
  '正在确认操作权限，请稍后再提交。'
const WORKFLOW_SOURCE_ACCESS_MISSING_REASON =
  '暂时无法确认相关单据访问权限，当前不能办理；请刷新后重试。'

function sortedIdentityStrings(values = [], mapValue = (value) => value) {
  if (!Array.isArray(values)) return []
  return values
    .map(mapValue)
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
}

export function workflowTaskAdminAccessRequestIdentity(adminProfile = {}) {
  const session =
    adminProfile?.effective_session &&
    typeof adminProfile.effective_session === 'object'
      ? adminProfile.effective_session
      : {}
  return JSON.stringify([
    Number(adminProfile?.id || 0),
    adminProfile?.is_super_admin === true,
    sortedIdentityStrings(
      adminProfile?.roles,
      (role) => role?.role_key || role?.key || ''
    ),
    sortedIdentityStrings(adminProfile?.permissions),
    String(session?.customer?.key || session?.customer_key || '').trim(),
    String(session?.config_revision || session?.configRevision || '').trim(),
    String(session?.config_hash || session?.configHash || '').trim(),
    sortedIdentityStrings(session?.actions),
    sortedIdentityStrings(session?.roles),
  ])
}

export function workflowTaskActionAccessRequestIdentity(task = null) {
  const taskID = Number(task?.id || 0)
  if (!Number.isSafeInteger(taskID) || taskID <= 0) {
    return { taskID: 0, taskVersion: 0, requestKey: '' }
  }
  const rawTaskVersion = Number(task?.version || 0)
  const taskVersion =
    Number.isSafeInteger(rawTaskVersion) && rawTaskVersion > 0
      ? rawTaskVersion
      : 0
  return {
    taskID,
    taskVersion,
    requestKey: `${taskID}:${taskVersion}`,
  }
}

export function requireWorkflowTaskExplainParams(
  params = {},
  { allowActionKey = false } = {}
) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('task_id 必须是安全正整数')
  }
  const allowedKeys = allowActionKey
    ? WORKFLOW_ACTION_EXPLAIN_PARAM_KEYS
    : WORKFLOW_TASK_EXPLAIN_PARAM_KEYS
  if (Object.keys(params).some((key) => !allowedKeys.has(key))) {
    throw new TypeError('任务查询参数无效')
  }
  if (!Number.isSafeInteger(params.task_id) || params.task_id <= 0) {
    throw new TypeError('task_id 必须是安全正整数')
  }
  if (!Object.hasOwn(params, 'action_key')) {
    return { taskID: params.task_id, actionKey: '' }
  }
  if (
    !allowActionKey ||
    typeof params.action_key !== 'string' ||
    !WORKFLOW_ACTION_MODE_SET.has(params.action_key)
  ) {
    throw new TypeError('action_key 不支持')
  }
  return { taskID: params.task_id, actionKey: params.action_key }
}

export function normalizeWorkflowActionMode(value = '') {
  const key = String(value || '').trim()
  return WORKFLOW_ACTION_MODE_SET.has(key) ? key : ''
}

function normalizeActionExplainItem(item = {}) {
  const actionMode = String(item.action_key || '').trim()
  if (!WORKFLOW_ACTION_MODE_SET.has(actionMode)) return null
  return {
    actionMode,
    allowed: item.allowed === true,
    reason: String(item.reason || '').trim(),
    reasonCode: String(item.reason_code || '').trim(),
    requiredPermission: String(item.required_permission || '').trim(),
    ownerRoleMatched: item.owner_role_matched === true,
    workPoolEntitlementScopeMatched:
      item.work_pool_entitlement_scope_matched === true,
  }
}

export function normalizeWorkflowTaskSourceAccess(data = {}) {
  const item = data?.source_access
  if (
    !item ||
    typeof item !== 'object' ||
    Array.isArray(item) ||
    typeof item.applicable !== 'boolean' ||
    typeof item.resolved !== 'boolean' ||
    typeof item.allowed !== 'boolean'
  ) {
    return {
      source: 'missing',
      applicable: true,
      resolved: false,
      allowed: false,
      reasonCode: 'source_access_missing_from_backend',
      reason: WORKFLOW_SOURCE_ACCESS_MISSING_REASON,
    }
  }

  const applicable = item.applicable === true
  const resolved = item.resolved === true
  const allowed = item.allowed === true
  const valid =
    (!applicable && resolved && allowed) ||
    (applicable && ((resolved && allowed) || !allowed))
  if (!valid) {
    return {
      source: 'invalid',
      applicable: true,
      resolved: false,
      allowed: false,
      reasonCode: 'source_access_invalid_from_backend',
      reason: WORKFLOW_SOURCE_ACCESS_MISSING_REASON,
    }
  }

  return {
    source: 'backend',
    applicable,
    resolved,
    allowed,
    reasonCode: String(item.reason_code || '').trim(),
    reason:
      String(item.reason || '').trim() ||
      (allowed ? '' : WORKFLOW_SOURCE_ACCESS_MISSING_REASON),
  }
}

export function normalizeWorkflowActionExplainData(data = {}) {
  const rawActions = Array.isArray(data?.actions)
    ? data.actions
    : data?.action
      ? [data.action]
      : []
  const byAction = {}
  for (const rawItem of rawActions) {
    const item = normalizeActionExplainItem(rawItem)
    if (!item) continue
    byAction[item.actionMode] = item
  }
  return byAction
}

export function hasWorkflowTaskActionCapability(
  actionAccess = {},
  canUsePermission = () => false
) {
  if (typeof canUsePermission !== 'function') return false
  return Object.values(actionAccess?.byAction || {}).some((item) => {
    const permission = String(item?.requiredPermission || '').trim()
    return permission && canUsePermission(permission)
  })
}

export function buildWorkflowActionAccessState({
  task = null,
  explainData = null,
  loading = false,
  failed = false,
  actionModes = DEFAULT_WORKFLOW_ACTION_MODES,
} = {}) {
  const explainedByAction = normalizeWorkflowActionExplainData(explainData)
  const hasExplainData = Object.keys(explainedByAction).length > 0
  const source = hasExplainData ? 'backend' : !task ? 'none' : failed ? 'failed' : loading ? 'checking' : 'unavailable'
  const unavailableReason = source === 'none' ? ''
    : source === 'failed' ? WORKFLOW_ACTION_ACCESS_FAILED_REASON
    : source === 'checking' ? WORKFLOW_ACTION_ACCESS_CHECKING_REASON
    : WORKFLOW_ACTION_ACCESS_MISSING_REASON
  const reasonCode = source === 'failed' ? 'action_access_check_failed'
    : source === 'checking' ? 'action_access_checking'
    : 'action_access_missing_from_backend'
  const sourceAccess = hasExplainData ? normalizeWorkflowTaskSourceAccess(explainData) : {
    source,
    applicable: Boolean(task),
    resolved: !task,
    allowed: false,
    reasonCode: task ? reasonCode : '',
    reason: unavailableReason,
  }
  const byAction = {}
  if (source !== 'none') {
    for (const actionMode of actionModes) {
      const item = explainedByAction[actionMode] || {
        actionMode,
        allowed: false,
        reason: unavailableReason,
        reasonCode,
      }
      byAction[actionMode] = hasExplainData && !sourceAccess.allowed && actionMode !== 'urge'
        ? { ...item, allowed: false, reason: sourceAccess.reason, reasonCode: sourceAccess.reasonCode }
        : item
    }
  }

  const allowedModes = actionModes.filter((mode) => byAction[mode]?.allowed === true)
  const readonlyReason = allowedModes.length === 0
    ? Object.values(byAction).find((item) => !item.allowed && item.reason)?.reason || unavailableReason
    : ''

  return {
    source,
    loading,
    failed,
    sourceAccess,
    byAction,
    allowedModes,
    canHandle: allowedModes.some((mode) => mode !== 'urge'),
    urgeOnly: allowedModes.length === 1 && allowedModes[0] === 'urge',
    readonlyReason,
    canRun(actionMode) {
      return byAction[normalizeWorkflowActionMode(actionMode)]?.allowed === true
    },
    getReason(actionMode) {
      return byAction[normalizeWorkflowActionMode(actionMode)]?.reason || readonlyReason
    },
  }
}

export function resolveWorkflowActionAccessRequestOutcome({
  currentRequestID = 0,
  requestID = 0,
  requestKey = '',
  data = null,
  error = null,
  isAbortError = () => false,
} = {}) {
  if (currentRequestID !== requestID) return null
  if (error) {
    if (isAbortError(error)) return null
    return {
      requestKey,
      data: null,
      loading: false,
      failed: true,
    }
  }
  return {
    requestKey,
    data,
    loading: false,
    failed: false,
  }
}
