import { hasActionPermission, BUSINESS_ROUTE_PATHS } from './masterDataOrderView.mjs'
import { canOpenRelatedDocumentPath } from './relatedDocumentNavigation.mjs'
import { routeWithQuery } from './routeQuery.mjs'

export const PRODUCTION_RECORD_VIEW_KEYS = Object.freeze({
  RECORDS: 'records',
  PROCESS: 'process',
  DECISIONS: 'decisions',
  TASKS: 'tasks',
})

export function canReadProductionExceptionDecisions(adminProfile) {
  return [
    'pmc.risk.read',
    'production.fact.read',
    'production.exception.submit',
    'production.exception.approve',
  ].some((permission) => hasActionPermission(adminProfile, permission))
}

export function canReadProductionProcess(adminProfile) {
  return (
    hasActionPermission(adminProfile, 'production.fact.read') &&
    hasActionPermission(adminProfile, 'production.wip.read')
  )
}

export function availableProductionRecordViews(adminProfile, allowedMenuPaths) {
  const canOpen = (path) =>
    canOpenRelatedDocumentPath({ path, adminProfile, allowedMenuPaths })
  const records = canOpen(BUSINESS_ROUTE_PATHS.productionProgress)
  const exceptions = canOpen(BUSINESS_ROUTE_PATHS.productionExceptions)
  return [
    ...(records ? [PRODUCTION_RECORD_VIEW_KEYS.RECORDS] : []),
    ...(records && canReadProductionProcess(adminProfile)
      ? [PRODUCTION_RECORD_VIEW_KEYS.PROCESS]
      : []),
    ...(exceptions && canReadProductionExceptionDecisions(adminProfile)
      ? [PRODUCTION_RECORD_VIEW_KEYS.DECISIONS]
      : []),
    ...(exceptions && hasActionPermission(adminProfile, 'workflow.task.read')
      ? [PRODUCTION_RECORD_VIEW_KEYS.TASKS]
      : []),
  ]
}

export function resolveProductionExceptionTab({
  linkedProductionExceptionID = 0,
  linkedKeyword = '',
  requestedView = '',
  canReadRecords = false,
  canReadTasks = false,
} = {}) {
  const { DECISIONS, TASKS } = PRODUCTION_RECORD_VIEW_KEYS
  if (linkedProductionExceptionID > 0 && canReadRecords) return DECISIONS
  if (linkedKeyword && canReadTasks) return TASKS
  if (requestedView === DECISIONS && canReadRecords) return DECISIONS
  if (requestedView === TASKS && canReadTasks) return TASKS
  return canReadRecords ? DECISIONS : TASKS
}

export function resolveProductionRecordView(
  pathname,
  searchParams,
  availableKeys
) {
  if (pathname === BUSINESS_ROUTE_PATHS.productionProgress) {
    return searchParams.get('display') === 'process' &&
      availableKeys.includes(PRODUCTION_RECORD_VIEW_KEYS.PROCESS)
      ? PRODUCTION_RECORD_VIEW_KEYS.PROCESS
      : PRODUCTION_RECORD_VIEW_KEYS.RECORDS
  }
  return resolveProductionExceptionTab({
    linkedProductionExceptionID: Number(
      searchParams.get('production_exception_id') || 0
    ),
    linkedKeyword: searchParams.get('link_keyword') || '',
    requestedView: searchParams.get('view') || '',
    canReadRecords: availableKeys.includes(
      PRODUCTION_RECORD_VIEW_KEYS.DECISIONS
    ),
    canReadTasks: availableKeys.includes(PRODUCTION_RECORD_VIEW_KEYS.TASKS),
  })
}

export function productionRecordViewPath(pathname, searchParams, nextView) {
  const { RECORDS, PROCESS, DECISIONS, TASKS } = PRODUCTION_RECORD_VIEW_KEYS
  const fromRecords = pathname === BUSINESS_ROUTE_PATHS.productionProgress
  const toRecords = nextView === RECORDS || nextView === PROCESS
  const targetPath = toRecords
    ? BUSINESS_ROUTE_PATHS.productionProgress
    : BUSINESS_ROUTE_PATHS.productionExceptions
  if (fromRecords === toRecords) {
    const params = new URLSearchParams(searchParams)
    if (toRecords) {
      if (nextView === PROCESS) params.set('display', 'process')
      else params.delete('display')
    } else {
      params.set('view', nextView)
      if (nextView === TASKS) {
        params.delete('production_exception_id')
        params.delete('production_order_id')
      } else {
        for (const key of ['link_keyword', 'link_source', 'link_fields']) {
          params.delete(key)
        }
      }
    }
    return routeWithQuery(targetPath, Object.fromEntries(params))
  }
  const orderID = Number(
    fromRecords
      ? String(searchParams.get('source_type') || '').toUpperCase() ===
        'PRODUCTION_ORDER'
        ? searchParams.get('source_id') || 0
        : 0
      : searchParams.get('production_order_id') || 0
  )
  const productionOrderID =
    Number.isSafeInteger(orderID) && orderID > 0 ? orderID : undefined
  return routeWithQuery(
    targetPath,
    toRecords
      ? {
          display: nextView === PROCESS ? 'process' : undefined,
          source_type: productionOrderID ? 'PRODUCTION_ORDER' : undefined,
          source_id: productionOrderID,
        }
      : {
          view: nextView,
          production_order_id:
            nextView === DECISIONS ? productionOrderID : undefined,
        }
  )
}
