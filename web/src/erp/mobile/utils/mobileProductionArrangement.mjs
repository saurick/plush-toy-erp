import { resolveWorkflowTaskSourceEntryPath } from '../../utils/dashboardTaskDisplay.mjs'

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveMobileProductionArrangementContext(task = {}) {
  const payload = task?.payload
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !resolveWorkflowTaskSourceEntryPath(task)
  ) {
    return null
  }

  const sourceFactID = task.source_id
  const productionFactID = payload.production_fact_id
  const productionOrderID = payload.production_order_id
  const productionOrderItemID = payload.production_order_item_id
  if (
    !positiveSafeInteger(sourceFactID) ||
    productionFactID !== sourceFactID ||
    !positiveSafeInteger(productionOrderID) ||
    !positiveSafeInteger(productionOrderItemID)
  ) {
    return null
  }

  return Object.freeze({
    productionFactID,
    productionOrderID,
    productionOrderItemID,
    productionOrderNo: normalizedText(payload.production_order_no),
  })
}
