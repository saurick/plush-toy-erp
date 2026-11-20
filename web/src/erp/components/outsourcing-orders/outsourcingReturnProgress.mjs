import { OutsourcingOrderItemStatus, OutsourcingOrderStatus } from '../../../common/consts/statuses.generated.mjs'
import { OUTSOURCING_ORDER_SUBJECT_TYPES } from '../../utils/sourceOrderLineValues.mjs'
import { formatUnitQuantitySummary } from '../../utils/sourceOrderAmounts.mjs'
import {
  OUTSOURCING_SOURCE_ACTIONS,
  outsourcingReturnEffectiveQuantity,
  outsourcingSourceActionQuantitySummary,
} from '../../utils/outsourcingOrderFactAction.mjs'
import {
  OUTSOURCING_RETURN_QUALITY_GATE_STATES,
  isPostedOutsourcingReturn,
  resolveOutsourcingReturnQualityGate,
} from '../../utils/qualityInspectionSourceAction.mjs'

export function outsourcingReturnProgressLines(order, items) {
  return order.source_wip_batch_id ? [] : items.filter((item) =>
    item.subject_type === OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT &&
    !item.production_wip_batch_id &&
    item.line_status !== OutsourcingOrderItemStatus.CANCELED
  )
}

export function buildOutsourcingReturnProgress(order, lines, facts, {
  fullWarehouseScope,
  qualityByFactID,
  unitOptions = [],
}) {
  const lineByID = new Map(lines.map((line) => [line.id, line]))
  const factsByLine = new Map()
  const batches = facts.filter((fact) =>
    isPostedOutsourcingReturn(fact) && fact.source_type === 'OUTSOURCING_ORDER' && fact.source_id === order.id
  ).map((fact) => {
    const line = lineByID.get(fact.source_line_id)
    const matched = Boolean(line && line.unit_id === fact.unit_id)
    if (matched) {
      if (!factsByLine.has(line.id)) factsByLine.set(line.id, [])
      factsByLine.get(line.id).push(fact)
    }
    return {
      fact,
      matched,
      effective: outsourcingReturnEffectiveQuantity(fact),
      unit_name_snapshot: matched ? line.unit_name_snapshot : undefined,
      quality: qualityByFactID ? resolveOutsourcingReturnQualityGate(qualityByFactID[fact.id]) : null,
    }
  })

  const canReconcile = batches.every((batch) => batch.matched)
  const lineTotals = lines.map((line) => ({
    ...line,
    ...outsourcingSourceActionQuantitySummary(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      line,
      factsByLine.get(line.id)
    ),
  }))
  const confirmed = order.lifecycle_status === OutsourcingOrderStatus.CONFIRMED
  const waiting = lineTotals.filter((line) =>
    line.line_status === OutsourcingOrderItemStatus.OPEN && line.remaining !== '0'
  )
  const qualityIssues = batches.filter(({ effective, quality }) =>
    effective !== '0' && quality && quality.state !== OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED
  )
  const quantityLabel = (items, field) => formatUnitQuantitySummary(items, field, unitOptions)

  return {
    batches,
    planned: quantityLabel(lineTotals, 'planned'),
    returned: canReconcile && fullWarehouseScope
      ? quantityLabel(lineTotals, 'processed')
      : quantityLabel(batches.map(({ fact, effective, unit_name_snapshot }) => ({
          ...fact, effective, unit_name_snapshot,
        })), 'effective'),
    remaining: confirmed && canReconcile && fullWarehouseScope
      ? quantityLabel(lineTotals.map((line) => ({
          ...line, remaining: line.line_status === OutsourcingOrderItemStatus.OPEN ? line.remaining : '0',
        })), 'remaining')
      : '—',
    hasPendingReturns: confirmed && canReconcile && fullWarehouseScope && waiting.length > 0,
    canReconcile,
    attention: confirmed
      ? qualityIssues.find(({ quality }) => quality.state === OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED) ?? qualityIssues[0] ?? null
      : null,
    qualityIssueCount: qualityIssues.length,
  }
}
