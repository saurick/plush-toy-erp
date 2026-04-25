const LOAD_ALL_ROLE_KEYS = new Set([
  'pmc',
  'boss',
  'production',
  'merchandiser',
])

const LOAD_ALL_ROLE_REASON = Object.freeze({
  pmc: 'PMC 需要在全量任务里筛选 blocked、overdue、critical_path、催办和升级关注项。',
  boss: '老板需要在全量任务里筛选高优先级、审批、出货风险、财务 critical 和升级关注项。',
  production:
    '生产经理需要在全量任务里筛选委外、成品返工和生产相关任务，不只看 owner_role_key。',
  merchandiser: '跟单需要在全量任务里筛选出货确认、业务确认和自己主责的任务。',
})

function normalizeRoleKey(roleKey) {
  return String(roleKey || '').trim()
}

function normalizeTaskArray(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.tasks)) return result.tasks
  return []
}

export function shouldLoadAllWorkflowTasksForRole(roleKey) {
  return LOAD_ALL_ROLE_KEYS.has(normalizeRoleKey(roleKey))
}

export function buildMobileWorkflowTaskQueryPlan(roleKey) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  if (shouldLoadAllWorkflowTasksForRole(normalizedRoleKey)) {
    return [{ limit: 200 }]
  }
  if (!normalizedRoleKey) return [{ limit: 200 }]
  return [{ owner_role_key: normalizedRoleKey, limit: 200 }]
}

export function explainMobileTaskQueryPlan(roleKey) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  const queries = buildMobileWorkflowTaskQueryPlan(normalizedRoleKey)
  const loadsFullList = shouldLoadAllWorkflowTasksForRole(normalizedRoleKey)

  if (!normalizedRoleKey) {
    return {
      role_key: '',
      strategy: 'full_list',
      loads_full_list: true,
      queries,
      reason:
        '未选择角色时只能读取最近 200 条任务用于诊断，不代表任何角色任务池。',
    }
  }

  if (loadsFullList) {
    return {
      role_key: normalizedRoleKey,
      strategy: 'full_list',
      loads_full_list: true,
      queries,
      reason:
        LOAD_ALL_ROLE_REASON[normalizedRoleKey] ||
        '该角色需要先加载最近 200 条任务，再按移动端可见性规则过滤。',
    }
  }

  return {
    role_key: normalizedRoleKey,
    strategy: 'owner_role_key',
    loads_full_list: false,
    queries,
    reason:
      '该角色按 owner_role_key 直查任务池，扩展可见性不额外加载全量任务。',
  }
}

export function mergeWorkflowTaskResults(results = []) {
  const merged = []
  const seenIDs = new Set()

  for (const result of Array.isArray(results) ? results : []) {
    for (const task of normalizeTaskArray(result)) {
      const id = String(task?.id ?? '').trim()
      if (!id || seenIDs.has(id)) continue
      seenIDs.add(id)
      merged.push(task)
    }
  }

  return merged
}
