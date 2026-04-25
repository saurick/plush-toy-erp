const LOAD_ALL_ROLE_KEYS = new Set([
  'pmc',
  'boss',
  'production',
  'merchandiser',
])

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
