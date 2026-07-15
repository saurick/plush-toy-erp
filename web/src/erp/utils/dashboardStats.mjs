import { DASHBOARD_TRUTH_KINDS } from '../config/dashboardModules.mjs'

const SUMMARY_TRUTH_KINDS = Object.freeze([
  DASHBOARD_TRUTH_KINDS.MASTER_DATA,
  DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT,
  DASHBOARD_TRUTH_KINDS.BUSINESS_FACT,
])

function normalizeAvailableTotal(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function normalizeDashboardModuleStats(raw = {}) {
  const moduleKey = String(raw?.module_key || raw?.moduleKey || '').trim()
  const total = normalizeAvailableTotal(raw?.total)
  const available = raw?.available === true && total !== null
  return {
    moduleKey,
    available,
    total: available ? total : null,
  }
}

export function createDashboardStatsMap(moduleStats = []) {
  const map = new Map()
  ;(moduleStats || []).forEach((item) => {
    const normalized = normalizeDashboardModuleStats(item)
    if (!normalized.moduleKey) return
    map.set(normalized.moduleKey, normalized)
  })
  return map
}

export function buildDashboardModuleRows(modules = [], moduleStats = []) {
  const statsMap =
    moduleStats instanceof Map
      ? moduleStats
      : createDashboardStatsMap(moduleStats)

  return (modules || []).map((moduleItem) => {
    const sources = (
      Array.isArray(moduleItem.sources) ? moduleItem.sources : []
    ).map((source) => {
      const stats = statsMap.get(source.key)
      return {
        ...source,
        available: stats?.available === true,
        total: stats?.available === true ? stats.total : null,
      }
    })
    return {
      key: moduleItem.key,
      module: moduleItem.title,
      sources,
    }
  })
}

export function buildDashboardSummary(moduleRows = []) {
  const sources = (moduleRows || []).flatMap((row) => row?.sources || [])
  return Object.fromEntries(
    SUMMARY_TRUTH_KINDS.map((truthKind) => {
      const kindSources = sources.filter(
        (source) => source.truthKind === truthKind
      )
      const available =
        kindSources.length > 0 &&
        kindSources.every((source) => source.available)
      return [
        truthKind,
        {
          available,
          total: available
            ? kindSources.reduce((sum, source) => sum + source.total, 0)
            : null,
        },
      ]
    })
  )
}
