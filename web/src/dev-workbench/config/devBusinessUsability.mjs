import {
  BUSINESS_USABILITY_CATALOG,
  BUSINESS_USABILITY_STATUS,
  BUSINESS_USABILITY_STATUS_PRESENTATION,
} from '../../erp/config/businessUsabilityCatalog.mjs'
import { ROLE_HELP_GUIDES } from '../../erp/config/roleHelpContent.mjs'
import { DEV_BUSINESS_USABILITY_ROUTE } from './devRoutes.mjs'

export { DEV_BUSINESS_USABILITY_ROUTE }

export const DEV_BUSINESS_USABILITY_ALL_STATUS = 'all'
export const DEV_BUSINESS_USABILITY_ALL_ROLES = 'all'
export const DEV_BUSINESS_USABILITY_PAGE_SIZE = 10

const ROLE_LABEL_BY_KEY = new Map(
  ROLE_HELP_GUIDES.map((guide) => [guide.key, guide.label])
)

export const DEV_BUSINESS_USABILITY_STATUS_OPTIONS = Object.freeze([
  Object.freeze({
    label: '全部覆盖状态',
    value: DEV_BUSINESS_USABILITY_ALL_STATUS,
  }),
  ...Object.entries(BUSINESS_USABILITY_STATUS_PRESENTATION).map(
    ([value, presentation]) =>
      Object.freeze({ value, label: presentation.label })
  ),
])

export const DEV_BUSINESS_USABILITY_ROLE_OPTIONS = Object.freeze([
  Object.freeze({
    label: '全部岗位帮助',
    value: DEV_BUSINESS_USABILITY_ALL_ROLES,
  }),
  ...ROLE_HELP_GUIDES.map((guide) =>
    Object.freeze({ value: guide.key, label: guide.label })
  ),
])

function normalizeKeyword(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function getBusinessUsabilityRoleLabels(entry = {}) {
  return (Array.isArray(entry.roleHelpKeys) ? entry.roleHelpKeys : []).map(
    (roleKey) => ROLE_LABEL_BY_KEY.get(roleKey) || roleKey
  )
}

export function filterBusinessUsabilityEntries(
  entries = BUSINESS_USABILITY_CATALOG,
  filters = {}
) {
  const keyword = normalizeKeyword(filters.keyword)
  const status = String(filters.status || DEV_BUSINESS_USABILITY_ALL_STATUS)
  const role = String(filters.role || DEV_BUSINESS_USABILITY_ALL_ROLES)

  return entries.filter((entry) => {
    if (
      status !== DEV_BUSINESS_USABILITY_ALL_STATUS &&
      entry.status !== status
    ) {
      return false
    }
    if (
      role !== DEV_BUSINESS_USABILITY_ALL_ROLES &&
      !entry.roleHelpKeys.includes(role)
    ) {
      return false
    }
    if (!keyword) return true

    return [
      entry.title,
      entry.sectionTitle,
      entry.task,
      entry.completion,
      entry.handoff,
      ...entry.upstreamLabels,
      ...entry.downstreamLabels,
      ...getBusinessUsabilityRoleLabels(entry),
      ...entry.items.flatMap((item) => [item.title, item.explanation]),
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
}

export function buildBusinessUsabilitySummary(
  entries = BUSINESS_USABILITY_CATALOG
) {
  const countByStatus = Object.fromEntries(
    Object.values(BUSINESS_USABILITY_STATUS).map((status) => [status, 0])
  )
  entries.forEach((entry) => {
    countByStatus[entry.status] = (countByStatus[entry.status] || 0) + 1
  })

  return Object.freeze({
    total: entries.length,
    covered: countByStatus[BUSINESS_USABILITY_STATUS.COVERED] || 0,
    partial: countByStatus[BUSINESS_USABILITY_STATUS.PARTIAL] || 0,
    missing: countByStatus[BUSINESS_USABILITY_STATUS.MISSING] || 0,
    pageHelpCount: entries.filter((entry) => entry.hasPageHelp).length,
    explanationCount: entries.reduce(
      (total, entry) => total + entry.items.length,
      0
    ),
  })
}
