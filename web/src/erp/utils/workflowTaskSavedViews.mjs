import { normalizeTaskDiscoveryFilters } from './workflowTaskDiscovery.mjs'

// These contain presentation filters only. Visibility is always re-evaluated
// by the server; no tasks or personnel records are persisted on this device.
export function taskSavedViewsKey(adminID) {
  return Number.isSafeInteger(adminID) && adminID > 0 ? `erp.task-filters.${adminID}` : ''
}

export function normalizeTaskSavedViews(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item?.name === 'string' && item.name.trim()).slice(0, 8).map((item) => ({ name: item.name.trim().slice(0, 30), filters: normalizeTaskDiscoveryFilters(item.filters) }))
}
