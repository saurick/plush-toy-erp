import { dashboardHealthModules } from '../config/dashboardModules.mjs'

const REQUIRED_MODULE_KEYS = Object.freeze(
  dashboardHealthModules.flatMap((moduleItem) =>
    moduleItem.sources.map((source) => source.key)
  )
)

function invalidBusinessDashboardResponse() {
  return Object.assign(new Error('业务看板暂时无法加载，请稍后重试'), {
    isInvalidResponse: true,
  })
}

export function requireBusinessDashboardStatsResponse(response) {
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    !Array.isArray(response.modules)
  ) {
    throw invalidBusinessDashboardResponse()
  }

  const seenModuleKeys = new Set()
  for (const item of response.modules) {
    const moduleKey = String(item?.module_key || '').trim()
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      !moduleKey ||
      item.module_key !== moduleKey ||
      seenModuleKeys.has(moduleKey) ||
      typeof item.available !== 'boolean' ||
      !Number.isSafeInteger(item.total) ||
      item.total < 0 ||
      (item.available === false && item.total !== 0)
    ) {
      throw invalidBusinessDashboardResponse()
    }
    seenModuleKeys.add(moduleKey)
  }
  if (
    REQUIRED_MODULE_KEYS.some((moduleKey) => !seenModuleKeys.has(moduleKey))
  ) {
    throw invalidBusinessDashboardResponse()
  }

  return response
}
