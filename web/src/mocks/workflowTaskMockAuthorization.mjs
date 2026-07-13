import {
  getWorkflowTaskActionPermission,
  getWorkflowTaskActionStatusKey,
} from '../erp/utils/workflowTaskActionContract.mjs'

const TERMINAL_TASK_STATUS_KEYS = new Set([
  'done',
  'rejected',
  'cancelled',
  'closed',
])

function normalizedRoleKeys(adminProfile = {}) {
  return new Set(
    Array.isArray(adminProfile?.roles)
      ? adminProfile.roles
          .map((role) => String(role?.role_key || role?.key || '').trim())
          .filter(Boolean)
      : []
  )
}

function normalizedPermissionKeys(adminProfile = {}) {
  return new Set(
    Array.isArray(adminProfile?.permissions)
      ? adminProfile.permissions
          .map((permission) => String(permission || '').trim())
          .filter(Boolean)
      : []
  )
}

function normalizedEffectiveActionKeys(adminProfile, effectiveSession) {
  const session =
    effectiveSession && typeof effectiveSession === 'object'
      ? effectiveSession
      : adminProfile?.effective_session
  return new Set(
    Array.isArray(session?.actions)
      ? session.actions
          .map((action) => String(action || '').trim())
          .filter(Boolean)
      : []
  )
}

export function workflowMockVisibleOwnerRoleKeys(
  adminProfile,
  effectiveSession,
  capabilityKey = ''
) {
  const capability = String(capabilityKey || '').trim()
  const session =
    effectiveSession && typeof effectiveSession === 'object'
      ? effectiveSession
      : adminProfile?.effective_session
  const configuredScopes =
    session?.workflow_visible_owner_role_keys_by_capability ||
    session?.workflowVisibleOwnerRoleKeysByCapability
  if (
    configuredScopes &&
    typeof configuredScopes === 'object' &&
    Object.prototype.hasOwnProperty.call(configuredScopes, capability)
  ) {
    return [
      ...new Set(
        Array.isArray(configuredScopes[capability])
          ? configuredScopes[capability]
              .map((role) => String(role || '').trim())
              .filter(Boolean)
          : []
      ),
    ]
  }
  return []
}

export function workflowMockPermissionAllowed(
  adminProfile,
  effectiveSession,
  permissionKey = ''
) {
  const permission = String(permissionKey || '').trim()
  if (!permission || !adminProfile || adminProfile.disabled === true) {
    return false
  }
  const rbacAllowed =
    adminProfile.is_super_admin === true ||
    normalizedPermissionKeys(adminProfile).has(permission)
  return (
    rbacAllowed &&
    normalizedEffectiveActionKeys(adminProfile, effectiveSession).has(
      permission
    )
  )
}

export function workflowMockCanCreateTask(adminProfile, effectiveSession) {
  return workflowMockPermissionAllowed(
    adminProfile,
    effectiveSession,
    'workflow.task.create'
  )
}

export function workflowMockCanViewTask(adminProfile, effectiveSession, task) {
  return workflowMockCanAccessTaskForCapability(
    adminProfile,
    effectiveSession,
    task,
    'workflow.task.read'
  )
}

export function workflowMockCanAccessTaskForCapability(
  adminProfile,
  effectiveSession,
  task,
  capabilityKey
) {
  if (
    !task ||
    !workflowMockPermissionAllowed(
      adminProfile,
      effectiveSession,
      capabilityKey
    )
  ) {
    return false
  }
  if (adminProfile?.is_super_admin === true) return true
  const rawRoleKeys = normalizedRoleKeys(adminProfile)
  const visibleOwnerRoleKeys = new Set(
    workflowMockVisibleOwnerRoleKeys(
      adminProfile,
      effectiveSession,
      capabilityKey
    )
  )
  const assigneeID = Number(task?.assignee_id || 0)
  const assignedToCurrentAdmin =
    assigneeID > 0 && assigneeID === Number(adminProfile?.id || 0)
  return (
    assignedToCurrentAdmin ||
    visibleOwnerRoleKeys.has(String(task?.owner_role_key || '').trim()) ||
    (rawRoleKeys.has('pmc') && visibleOwnerRoleKeys.has('pmc')) ||
    (rawRoleKeys.has('boss') && visibleOwnerRoleKeys.has('boss'))
  )
}

export function workflowMockActionDecision({
  actionKey,
  adminProfile,
  effectiveSession,
  task,
} = {}) {
  const action = String(actionKey || '').trim()
  const requiredPermission = getWorkflowTaskActionPermission(action, task)
  const statusKey = getWorkflowTaskActionStatusKey(action)
  const permissionAllowed = workflowMockPermissionAllowed(
    adminProfile,
    effectiveSession,
    requiredPermission
  )
  const ownerRoleKey = String(task?.owner_role_key || '').trim()
  const roleKeys = normalizedRoleKeys(adminProfile)
  const visibleOwnerRoleKeys = workflowMockVisibleOwnerRoleKeys(
    adminProfile,
    effectiveSession,
    requiredPermission
  )
  const ownerRoleVisible = visibleOwnerRoleKeys.includes(ownerRoleKey)
  const ownerRoleMatched = roleKeys.has(ownerRoleKey) && ownerRoleVisible
  const assigneeID = Number(task?.assignee_id || 0)
  const assignedToCurrentAdmin =
    assigneeID > 0 && assigneeID === Number(adminProfile?.id || 0)
  const terminal = TERMINAL_TASK_STATUS_KEYS.has(
    String(task?.task_status_key || '').trim()
  )
  let allowed = false
  let reasonCode = 'not_owner_or_assignee'
  let reason = '当前账号不属于任务责任角色，也不是该任务的指定处理人。'

  if (!adminProfile || adminProfile.disabled === true) {
    reasonCode = 'admin_disabled'
    reason = '当前账号已停用，不能处理任务。'
  } else if (!task) {
    reasonCode = 'task_missing'
    reason = '任务不存在。'
  } else if (terminal) {
    reasonCode = 'terminal_task'
    reason = '该任务已结束，只能查看上下文。'
  } else if (!permissionAllowed) {
    reasonCode = 'missing_permission'
    reason = '当前账号缺少执行该动作所需权限。'
  } else if (action === 'urge') {
    allowed =
      adminProfile?.is_super_admin === true ||
      assignedToCurrentAdmin ||
      ownerRoleVisible ||
      roleKeys.has('pmc') ||
      roleKeys.has('boss')
  } else if (assigneeID > 0) {
    allowed = assignedToCurrentAdmin
  } else {
    allowed = ownerRoleVisible
  }

  if (allowed) {
    reasonCode = 'allowed'
    reason =
      action === 'urge'
        ? '当前账号可催办该任务。'
        : '当前账号可执行该任务动作。'
  }

  return {
    actionKey: action,
    allowed,
    assignedToCurrentAdmin,
    ownerRoleKey,
    ownerRoleMatched,
    permissionAllowed,
    reason,
    reasonCode,
    requiredPermission,
    statusKey,
    visibleOwnerRoleKeys,
  }
}
