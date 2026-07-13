import {
  canRunWorkflowTaskAction,
  getWorkflowTaskAllowedActionModes,
  getWorkflowTaskReadonlyReason,
} from './workflowTaskBoard.mjs'

export const DEFAULT_WORKFLOW_ACTION_MODES = Object.freeze([
  'complete',
  'block',
  'reject',
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

function normalizeStringList(values) {
  if (!Array.isArray(values)) return []
  return values.map((value) => String(value || '').trim()).filter(Boolean)
}

function normalizeDomainCommandEntry(item = {}) {
  const rawReasons = item.blocked_reasons
  const rawContract = item.required_contract
  return {
    enabled: item.enabled === true,
    willWriteFact: item.will_write_fact === true,
    source: String(item.source || '').trim(),
    commandKey: String(item.command_key || '').trim(),
    blockedReasons: normalizeStringList(rawReasons),
    requiredContract: normalizeStringList(rawContract),
  }
}

function workflowActionFallbackDomainCommandEntry() {
  return Object.freeze({
    enabled: false,
    willWriteFact: false,
    source: 'fallback_no_domain_command_contract',
    commandKey: '',
    blockedReasons: ['domain_command_contract_not_configured'],
    requiredContract: [],
  })
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
    ownerRoleKey: String(item.owner_role_key || '').trim(),
    visibleOwnerRoleKeys: Array.isArray(item.visible_owner_role_keys)
      ? item.visible_owner_role_keys
          .map((roleKey) => String(roleKey || '').trim())
          .filter(Boolean)
      : [],
    candidateOwnerRoleKeys: Array.isArray(item.candidate_owner_role_keys)
      ? item.candidate_owner_role_keys
          .map((roleKey) => String(roleKey || '').trim())
          .filter(Boolean)
      : [],
    ownerRoleMatched: item.owner_role_matched === true,
    workPoolRoleMatched: item.work_pool_role_matched === true,
    workPoolEntitlementMatched: item.work_pool_entitlement_matched === true,
    workPoolEntitlementScopeMatched:
      item.work_pool_entitlement_scope_matched === true,
    domainCommandEntry: normalizeDomainCommandEntry(item.domain_command_entry),
    actorRoleKey: String(item.actor_role_key || '').trim(),
    statusKey: String(item.status_key || '').trim(),
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

export function buildWorkflowActionAccessFallback({
  adminProfile = {},
  task = null,
  actionModes = DEFAULT_WORKFLOW_ACTION_MODES,
} = {}) {
  if (!task) {
    return {
      source: 'none',
      byAction: {},
      allowedModes: [],
      readonlyReason: '',
    }
  }
  const allowedModes = getWorkflowTaskAllowedActionModes(
    adminProfile,
    task
  ).filter((actionMode) => actionModes.includes(actionMode))
  const readonlyReason =
    allowedModes.length === 0
      ? getWorkflowTaskReadonlyReason(adminProfile, task)
      : ''
  const byAction = {}
  for (const actionMode of actionModes) {
    byAction[actionMode] = {
      actionMode,
      allowed: canRunWorkflowTaskAction(adminProfile, task, actionMode),
      reason: readonlyReason,
      reasonCode: '',
      requiredPermission: '',
      ownerRoleKey: String(task.owner_role_key || '').trim(),
      visibleOwnerRoleKeys: [],
      ownerRoleMatched: false,
      workPoolRoleMatched: false,
      workPoolEntitlementMatched: false,
      workPoolEntitlementScopeMatched: false,
      domainCommandEntry: workflowActionFallbackDomainCommandEntry(),
      actorRoleKey: '',
      statusKey: '',
    }
  }
  return {
    source: 'fallback',
    byAction,
    allowedModes,
    readonlyReason,
  }
}

export function buildWorkflowActionAccessState({
  adminProfile = {},
  task = null,
  explainData = null,
  loading = false,
  failed = false,
  actionModes = DEFAULT_WORKFLOW_ACTION_MODES,
} = {}) {
  const fallback = buildWorkflowActionAccessFallback({
    adminProfile,
    task,
    actionModes,
  })
  const explainedByAction = normalizeWorkflowActionExplainData(explainData)
  const hasExplainData = Object.keys(explainedByAction).length > 0
  const shouldGateLocalActions =
    Boolean(task) &&
    !hasExplainData &&
    !failed &&
    fallback.allowedModes.length > 0
  const byAction =
    hasExplainData || failed || shouldGateLocalActions
      ? { ...fallback.byAction }
      : fallback.byAction

  if (hasExplainData) {
    for (const actionMode of actionModes) {
      if (explainedByAction[actionMode]) {
        byAction[actionMode] = explainedByAction[actionMode]
      } else {
        byAction[actionMode] = {
          ...byAction[actionMode],
          allowed: false,
          reason: WORKFLOW_ACTION_ACCESS_MISSING_REASON,
          reasonCode: 'action_access_missing_from_backend',
        }
      }
    }
  } else if (failed) {
    for (const actionMode of actionModes) {
      byAction[actionMode] = {
        ...byAction[actionMode],
        allowed: false,
        reason: WORKFLOW_ACTION_ACCESS_FAILED_REASON,
        reasonCode: 'action_access_check_failed',
      }
    }
  } else if (loading || shouldGateLocalActions) {
    for (const actionMode of actionModes) {
      byAction[actionMode] = {
        ...byAction[actionMode],
        allowed: false,
        reason: WORKFLOW_ACTION_ACCESS_CHECKING_REASON,
        reasonCode: 'action_access_checking',
      }
    }
  }

  const allowedModes = actionModes.filter(
    (actionMode) => byAction[actionMode]?.allowed === true
  )
  const firstDenied = actionModes
    .map((actionMode) => byAction[actionMode])
    .find((item) => item && item.allowed !== true && item.reason)
  const readonlyReason =
    allowedModes.length === 0
      ? firstDenied?.reason || fallback.readonlyReason
      : ''

  return {
    source: hasExplainData
      ? 'backend'
      : failed
        ? 'fallback_failed'
        : loading || shouldGateLocalActions
          ? 'fallback_checking'
          : 'fallback',
    loading,
    failed,
    byAction,
    allowedModes,
    readonlyReason,
    canRun(actionMode) {
      return byAction[normalizeWorkflowActionMode(actionMode)]?.allowed === true
    },
    getReason(actionMode) {
      return (
        byAction[normalizeWorkflowActionMode(actionMode)]?.reason ||
        readonlyReason
      )
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
