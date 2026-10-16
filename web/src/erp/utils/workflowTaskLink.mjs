import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { ENTRY_TARGET, getEnabledMobileRoleKeys, hasDesktopEntryAccess, resolveAllowedMobileEntryPath, resolveDefaultEntryTarget } from '../config/entryConfig.mjs'
import { getAllowedMobileRoleKeys } from './mobileRolePermissions.mjs'
import { resolveMenuPermissionKey } from '../config/menuPermissions.mjs'

export function taskLinkID(value) {
  if (!/^[1-9]\d*$/u.test(String(value ?? ''))) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function workflowTaskLinkPath(id) {
  const taskID = taskLinkID(id)
  return taskID ? `/task-link/${taskID}` : ''
}

export function isWorkflowTaskLinkPath(path) {
  const match = /^\/task-link\/([1-9]\d*)$/u.exec(path || '')
  return Boolean(match && taskLinkID(match[1]))
}

export function workflowTaskLinkLoginReturn(path) {
  if (isWorkflowTaskLinkPath(path)) return path
  if (!/^\/(?:erp\/task-board|m\/[a-z-]+\/tasks)\?/u.test(path || '')) return ''
  const params = new URLSearchParams(path.split('?')[1])
  return workflowTaskLinkPath(params.get('link_task'))
}

export function workflowTaskLinkDestination(id, profile, config, target = resolveDefaultEntryTarget({ config })) {
  if (!taskLinkID(id) || !profile) return ''
  const mobile = resolveAllowedMobileEntryPath(getAllowedMobileRoleKeys(profile, getEnabledMobileRoleKeys(config)))
  const taskBoard = profile.is_super_admin === true || (Array.isArray(profile.menus) ? profile.menus : []).some((menu) => resolveMenuPermissionKey(typeof menu === 'string' ? menu : menu?.path) === '/erp/task-board')
  const desktop = hasDesktopEntryAccess(profile, config) && taskBoard ? '/erp/task-board' : ''
  const entry = target === ENTRY_TARGET.MOBILE_TASKS ? mobile || desktop : desktop || mobile
  return entry ? `${entry}?link_task=${id}` : ''
}

export function singleTaskLinkAction(data) {
  if (!data || data.truncated) return null
  const tasks = data.items.filter((item) => item.can_handle && [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(item.task_status_key))
  return tasks.length === 1 ? tasks[0] : null
}
