import { dashboardStatusGroups } from '../config/dashboardModules.mjs'
import { BUSINESS_WORKFLOW_STATES } from '../config/workflowStatus.mjs'

const BUSINESS_STATUS_KEYS = BUSINESS_WORKFLOW_STATES.map((state) => state.key)

function normalizeNonNegativeNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return Math.floor(parsed)
}

function createEmptyStatusCount() {
  return BUSINESS_STATUS_KEYS.reduce((accumulator, statusKey) => {
    accumulator[statusKey] = 0
    return accumulator
  }, {})
}

function normalizeStatusCounts(rawStatusCounts = {}) {
  const counts = createEmptyStatusCount()
  if (!rawStatusCounts || typeof rawStatusCounts !== 'object') {
    return counts
  }
  Object.entries(rawStatusCounts).forEach(([statusKey, count]) => {
    if (!Object.prototype.hasOwnProperty.call(counts, statusKey)) {
      return
    }
    counts[statusKey] = normalizeNonNegativeNumber(count)
  })
  return counts
}

export function normalizeDashboardModuleStats(raw = {}) {
  return {
    moduleKey: String(raw?.module_key || raw?.moduleKey || '').trim(),
    total: normalizeNonNegativeNumber(raw?.total),
    statusCounts: normalizeStatusCounts(
      raw?.status_counts || raw?.statusCounts
    ),
  }
}

export function createDashboardStatsMap(moduleStats = []) {
  const map = new Map()
  ;(moduleStats || []).forEach((item) => {
    const normalized = normalizeDashboardModuleStats(item)
    if (!normalized.moduleKey) {
      return
    }
    map.set(normalized.moduleKey, normalized)
  })
  return map
}

export function buildDashboardModuleRows(
  modules = [],
  moduleStats = [],
  statusGroups = dashboardStatusGroups
) {
  const statsMap =
    moduleStats instanceof Map
      ? moduleStats
      : createDashboardStatsMap(moduleStats)

  return (modules || []).map((moduleItem) => {
    const stats = statsMap.get(moduleItem.key) || {
      total: 0,
      statusCounts: createEmptyStatusCount(),
    }
    const statusGroupCounts = {}
    ;(statusGroups || []).forEach((group) => {
      statusGroupCounts[group.key] = (group.statusKeys || []).reduce(
        (sum, statusKey) => sum + Number(stats.statusCounts?.[statusKey] || 0),
        0
      )
    })

    return {
      key: moduleItem.key,
      module: moduleItem.title,
      path: moduleItem.path,
      count: normalizeNonNegativeNumber(stats.total),
      statusCounts: stats.statusCounts || createEmptyStatusCount(),
      statusGroupCounts,
    }
  })
}

export function buildDashboardSummary(
  moduleRows = [],
  statusGroups = dashboardStatusGroups
) {
  const summary = (moduleRows || []).reduce(
    (accumulator, row) => {
      accumulator.totalRecords += Number(row?.count || 0)
      BUSINESS_STATUS_KEYS.forEach((statusKey) => {
        accumulator.statusCount[statusKey] += Number(
          row?.statusCounts?.[statusKey] || 0
        )
      })
      ;(statusGroups || []).forEach((group) => {
        accumulator.statusGroupCount[group.key] += Number(
          row?.statusGroupCounts?.[group.key] || 0
        )
      })
      return accumulator
    },
    {
      totalRecords: 0,
      statusCount: createEmptyStatusCount(),
      statusGroupCount: (statusGroups || []).reduce((accumulator, group) => {
        accumulator[group.key] = 0
        return accumulator
      }, {}),
    }
  )

  const completedCount =
    summary.statusCount.settled + summary.statusCount.closed

  return {
    ...summary,
    blockedCount: summary.statusGroupCount.blocked || 0,
    activeCount: Math.max(
      0,
      summary.totalRecords -
        completedCount -
        (summary.statusGroupCount.blocked || 0)
    ),
    completedCount,
    completionRatio: summary.totalRecords
      ? Math.round((completedCount / summary.totalRecords) * 100)
      : 0,
  }
}
