import {
  canRunWorkflowTaskAction,
  getWorkflowTaskAllowedActionModes,
  getWorkflowTaskReadonlyReason,
} from './workflowTaskBoard.mjs'

export const DEFAULT_WORKFLOW_ACTION_MODES = Object.freeze([
  'complete',
  'block',
  'urge',
])

const ACTION_MODE_ALIASES = Object.freeze({
  done: 'complete',
  complete: 'complete',
  blocked: 'block',
  block: 'block',
  rejected: 'reject',
  reject: 'reject',
  urge_task: 'urge',
  urge_role: 'urge',
  urge_assignee: 'urge',
  escalate_to_pmc: 'urge',
  escalate_to_boss: 'urge',
  urge: 'urge',
})

const WORKFLOW_ACTION_ACCESS_FAILED_REASON =
  '无法核对后端任务动作权限，请刷新后重试。'
const WORKFLOW_ACTION_ACCESS_MISSING_REASON =
  '后端未返回该动作权限，请刷新后重试。'

function normalizeActionMode(value = '') {
  const key = String(value || '').trim()
  return ACTION_MODE_ALIASES[key] || key
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return []
  return values.map((value) => String(value || '').trim()).filter(Boolean)
}

function normalizeDomainCommandEntry(item = {}) {
  const rawReasons = Array.isArray(item.blocked_reasons)
    ? item.blocked_reasons
    : item.blockedReasons
  const rawContract = Array.isArray(item.required_contract)
    ? item.required_contract
    : item.requiredContract
  return {
    enabled: item.enabled === true,
    willWriteFact: item.will_write_fact === true || item.willWriteFact === true,
    source: String(item.source || '').trim(),
    commandKey: String(item.command_key || item.commandKey || '').trim(),
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
  const actionMode = normalizeActionMode(item.action_key || item.action)
  if (!actionMode) return null
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
  const byAction =
    hasExplainData || failed ? { ...fallback.byAction } : fallback.byAction

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
        : 'fallback',
    loading,
    failed,
    byAction,
    allowedModes,
    readonlyReason,
    canRun(actionMode) {
      return byAction[normalizeActionMode(actionMode)]?.allowed === true
    },
    getReason(actionMode) {
      return byAction[normalizeActionMode(actionMode)]?.reason || readonlyReason
    },
  }
}

export function resolveWorkflowActionAccessRequestOutcome({
  currentRequestID = 0,
  requestID = 0,
  taskKey = '',
  data = null,
  error = null,
  isAbortError = () => false,
} = {}) {
  if (currentRequestID !== requestID) return null
  if (error) {
    if (isAbortError(error)) return null
    return {
      taskKey,
      data: null,
      loading: false,
      failed: true,
    }
  }
  return {
    taskKey,
    data,
    loading: false,
    failed: false,
  }
}
