import {
  OperationalFactStatus,
  ProductionWIPStatus,
  QualityInspectionStatus,
} from '../../common/consts/statuses.generated.mjs'
import {
  productionWipStatusMeta,
  productionWipQualityInspectionMeta,
  PRODUCTION_WIP_QUALITY_GATE_LABELS as PRODUCTION_QUALITY_GATE_LABELS,
} from './productionWipModel.mjs'
import { currentBusinessDate } from './businessDate.mjs'
import { unixToDateInputValue } from './masterDataOrderView.mjs'

const DAY_MS = 24 * 60 * 60 * 1000

function decimalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function dateKeyToUTC(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(dateKey || ''))) return null
  const time = Date.parse(`${dateKey}T00:00:00Z`)
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === dateKey
    ? time
    : null
}

function dayDistance(fromDateKey, toDateKey) {
  const from = dateKeyToUTC(fromDateKey)
  const to = dateKeyToUTC(toDateKey)
  if (from === null || to === null) return null
  return Math.round((to - from) / DAY_MS)
}

function normalizedText(value, fallback = '') {
  return String(value ?? '').trim() || fallback
}

export function moveBusinessDate(dateKey, delta) {
  const timestamp = dateKeyToUTC(dateKey)
  if (timestamp === null || !Number.isInteger(delta)) return ''
  return new Date(timestamp + delta * DAY_MS).toISOString().slice(0, 10)
}

export function paginateVisualizationRows(
  rows,
  requestedPage = 1,
  pageSize = 25
) {
  const size = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 25
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const page = Math.min(
    pageCount,
    Math.max(1, Math.floor(Number(requestedPage) || 1))
  )
  return {
    rows: rows.slice((page - 1) * size, page * size),
    page,
    pageSize: size,
    total: rows.length,
  }
}

function financeDueStatus(row, dueDate, today) {
  const status = normalizedText(row.status).toUpperCase()
  if (status === OperationalFactStatus.CANCELLED) {
    return { key: 'cancelled', label: '已取消', rank: 6 }
  }
  const outstanding = decimalNumber(row.outstanding_amount)
  if (outstanding === null || decimalNumber(row.amount) === null || !normalizedText(row.currency)) {
    return { key: 'unknown', label: '金额待核对', rank: 2 }
  }
  if (status === OperationalFactStatus.SETTLED || outstanding === 0) {
    return { key: 'settled', label: '已结清', rank: 5 }
  }
  if (status === OperationalFactStatus.DRAFT) {
    return { key: 'draft', label: '草稿待过账', rank: 4 }
  }
  if (!dueDate) {
    return { key: 'unscheduled', label: '未填到期日', rank: 2 }
  }
  const days = dayDistance(today, dueDate)
  if (days !== null && days < 0) {
    return {
      key: 'overdue',
      label: `逾期 ${Math.abs(days)} 天`,
      rank: 0,
    }
  }
  if (days !== null && days <= 7) {
    return {
      key: 'dueSoon',
      label: days === 0 ? '今天到期' : `${days} 天后到期`,
      rank: 1,
    }
  }
  return { key: 'open', label: '未到期', rank: 3 }
}

export function buildFinanceDueModel(facts = [], options = {}) {
  const today = options.today || currentBusinessDate()
  const rows = (Array.isArray(facts) ? facts : [])
    .filter((item) => ['RECEIVABLE', 'PAYABLE'].includes(item?.fact_type))
    .map((item) => {
      const dueDate = unixToDateInputValue(item.due_at)
      return { ...item, dueDate, dueStatus: financeDueStatus(item, dueDate, today) }
    })

  rows.sort((left, right) => {
    const rank = left.dueStatus.rank - right.dueStatus.rank
    if (rank !== 0) return rank
    const dateOrder = (left.dueDate || '9999-12-31').localeCompare(
      right.dueDate || '9999-12-31'
    )
    if (dateOrder !== 0) return dateOrder
    return normalizedText(left.fact_no).localeCompare(normalizedText(right.fact_no), 'zh-CN')
  })

  return {
    rows,
    counts: {
      total: rows.length,
      overdue: rows.filter((row) => row.dueStatus.key === 'overdue').length,
      dueSoon: rows.filter((row) => row.dueStatus.key === 'dueSoon').length,
      unknown: rows.filter((row) => row.dueStatus.key === 'unknown').length,
      unscheduled: rows.filter((row) => row.dueStatus.key === 'unscheduled')
        .length,
      settled: rows.filter((row) => row.dueStatus.key === 'settled').length,
    },
  }
}

export function financeDueFilterOptions(counts) {
  return [
    { value: 'all', label: '全部', count: counts.total },
    { value: 'overdue', label: '逾期未结', count: counts.overdue },
    { value: 'dueSoon', label: '7 天内到期', count: counts.dueSoon },
    { value: 'unknown', label: '金额待核对', count: counts.unknown, additional: counts.unknown === 0 },
    { value: 'unscheduled', label: '未填到期日', count: counts.unscheduled, additional: counts.unscheduled === 0 },
    { value: 'settled', label: '已结清（含未结金额为零）', count: counts.settled, additional: true },
  ]
}

export function buildInventoryDistributionModel(distribution = []) {
  const totalRecords = distribution.reduce((sum, row) => sum + row.record_count, 0)
  const rows = distribution.map((row) => ({
    warehouseID: row.warehouse_id,
    warehouseName: row.warehouse_code ? `${row.warehouse_name}（${row.warehouse_code}）` : row.warehouse_name,
    recordCount: row.record_count,
    stockCount: row.stock_count,
    availableRecordCount: row.available_record_count,
    unavailableRecordCount: row.unavailable_record_count,
    percent: totalRecords > 0 ? clampPercent((row.record_count / totalRecords) * 100) : 0,
  }))
  return {
    rows,
    counts: {
    warehouses: rows.length,
    records: totalRecords,
    stocks: rows.reduce((sum, row) => sum + row.stockCount, 0),
    unavailableRecords: rows.reduce((sum, row) => sum + row.unavailableRecordCount, 0),
    },
  }
}

function countBy(items, keyOf) {
  const counts = new Map()
  items.forEach((item) => {
    const key = keyOf(item)
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return counts
}

function productionStepState({ batches, inspections, hasDownstream }) {
  const activeBatches = batches.filter(
    (batch) => ![ProductionWIPStatus.CANCELLED, ProductionWIPStatus.SPLIT].includes(batch.status)
  )
  const activeBatchIDs = new Set(activeBatches.map((batch) => batch.id))
  const activeInspections = inspections.filter(
    (inspection) =>
      activeBatchIDs.has(inspection.production_wip_batch_id) &&
      inspection.status !== QualityInspectionStatus.CANCELLED
  )
  const hasRejectedQuality = activeInspections.some(
    (inspection) => inspection.status === QualityInspectionStatus.REJECTED
  )
  if (
    hasRejectedQuality ||
    activeBatches.some((batch) => batch.status === ProductionWIPStatus.REJECTED)
  ) {
    return { key: 'exception', label: '需要处理' }
  }
  if (
    activeInspections.some((inspection) => inspection.status === QualityInspectionStatus.SUBMITTED) ||
    activeBatches.some((batch) => batch.status === ProductionWIPStatus.WAITING_QUALITY)
  ) {
    return { key: 'quality', label: '等待质检' }
  }
  if (
    activeBatches.some((batch) =>
      [ProductionWIPStatus.IN_PROGRESS, ProductionWIPStatus.OUTSOURCED].includes(batch.status)
    )
  ) {
    return { key: 'active', label: '正在进行' }
  }
  if (
    activeBatches.some((batch) => batch.status === ProductionWIPStatus.ACCEPTED) ||
    hasDownstream
  ) {
    return { key: 'done', label: '已通过' }
  }
  if (activeBatches.some((batch) => batch.status === ProductionWIPStatus.PLANNED)) {
    return { key: 'ready', label: '待安排' }
  }
  return { key: 'waiting', label: '等待前序' }
}

function batchSummary(batches) {
  if (batches.length === 0) return ''
  return Array.from(countBy(batches, (batch) => batch.status).entries())
    .map(
      ([status, count]) => `${count} 批${productionWipStatusMeta(status).label}`
    )
    .join(' · ')
}

export function buildProductionProcessModel(aggregate) {
  const order = aggregate?.productionOrder || null
  const items = Array.isArray(aggregate?.items) ? aggregate.items : []
  const operations = Array.isArray(aggregate?.operations)
    ? aggregate.operations
    : []
  const batches = Array.isArray(aggregate?.batches) ? aggregate.batches : []
  const inspections = Array.isArray(aggregate?.qualityInspections)
    ? aggregate.qualityInspections
    : []
  const batchByID = new Map(batches.map((batch) => [batch.id, batch]))

  const itemRows = items.map((item) => {
    const itemOperations = operations
      .filter(
        (operation) => operation.production_order_item_id === Number(item.id)
      )
      .sort((left, right) => left.step_no - right.step_no)
    const operationPosition = new Map(
      itemOperations.map((operation, index) => [operation.id, index])
    )
    const itemBatches = batches.filter(
      (batch) => batch.production_order_item_id === Number(item.id)
    )
    const steps = itemOperations.map((operation, index) => {
      const operationBatches = itemBatches.filter(
        (batch) => batch.production_order_operation_id === operation.id
      )
      const operationBatchIDs = new Set(
        operationBatches.map((batch) => batch.id)
      )
      const operationInspections = inspections.filter((inspection) =>
        operationBatchIDs.has(inspection.production_wip_batch_id)
      )
      const hasDownstream = itemBatches.some(
        (batch) =>
          ![ProductionWIPStatus.CANCELLED, ProductionWIPStatus.SPLIT].includes(batch.status) &&
          (operationPosition.get(batch.production_order_operation_id) ?? -1) >
            index
      )
      const state = productionStepState({
        batches: operationBatches,
        inspections: operationInspections,
        hasDownstream,
      })
      const activeModes = [
        ...new Set(
          operationBatches
            .filter((batch) => ![ProductionWIPStatus.CANCELLED, ProductionWIPStatus.SPLIT].includes(batch.status))
            .map((batch) => batch.execution_mode)
            .filter(Boolean)
        ),
      ]
      return {
        id: operation.id,
        stepNo: operation.step_no,
        name: normalizedText(
          operation.process_name_snapshot,
          normalizedText(operation.operation_code, '工序')
        ),
        state,
        batchCount: operationBatches.length,
        batches: operationBatches.map((batch) => ({
          id: batch.id,
          batchNo: normalizedText(batch.batch_no, '批次未编号'),
          quantity: normalizedText(batch.quantity, '—'),
          statusKey: batch.status,
          status: productionWipStatusMeta(batch.status).label,
        })),
        inspections: operationInspections.map((inspection) => ({
          id: inspection.id,
          inspectionNo: normalizedText(
            inspection.inspection_no,
            '检验单未编号'
          ),
          gate:
            PRODUCTION_QUALITY_GATE_LABELS[inspection.gate_code] || '品质检验',
          status: productionWipQualityInspectionMeta(inspection).label,
        })),
        batchSummary: batchSummary(operationBatches),
        executionText: activeModes
          .map((mode) => (mode === 'OUTSOURCED' ? '外发' : '本厂'))
          .join(' / '),
        qualityText: (operation.required_quality_gates || [])
          .map((gate) => PRODUCTION_QUALITY_GATE_LABELS[gate] || '质检关口')
          .join(' / '),
      }
    })
    return {
      id: item.id,
      lineNo: item.line_no,
      productID: Number(item.product_id || 0),
      productName: normalizedText(
        item.product_name_snapshot || item.product_code_snapshot,
        `产品行 ${item.line_no || ''}`.trim()
      ),
      productCode: normalizedText(item.product_code_snapshot),
      skuCode: normalizedText(item.sku_code_snapshot),
      plannedQuantity: normalizedText(item.planned_quantity, '—'),
      unitName: normalizedText(item.unit_name_snapshot, '单位'),
      steps,
    }
  })

  const activeBatches = batches.filter(
    (batch) => ![ProductionWIPStatus.CANCELLED, ProductionWIPStatus.SPLIT].includes(batch.status)
  )
  const rejectedInspectionBatchIDs = new Set(
    inspections
      .filter((inspection) => inspection.status === QualityInspectionStatus.REJECTED)
      .map((inspection) => inspection.production_wip_batch_id)
  )

  return {
    order: order
      ? {
          id: Number(order.id || 0),
          orderNo: normalizedText(order.order_no, '生产订单未编号'),
          status: normalizedText(order.status).toUpperCase(),
        }
      : null,
    initialized: Boolean(aggregate?.initialized),
    items: itemRows,
    counts: {
      products: itemRows.length,
      activeBatches: activeBatches.length,
      outsourced: activeBatches.filter(
        (batch) => batch.execution_mode === 'OUTSOURCED'
      ).length,
      waitingQuality: activeBatches.filter(
        (batch) => batch.status === ProductionWIPStatus.WAITING_QUALITY
      ).length,
      exceptions: activeBatches.filter(
        (batch) =>
          batch.status === ProductionWIPStatus.REJECTED ||
          rejectedInspectionBatchIDs.has(batch.id)
      ).length,
      rework: activeBatches.filter((batch) => batch.flow_type === 'REWORK')
        .length,
    },
    lineageCount: batches.filter(
      (batch) => batch.source_batch_id && batchByID.has(batch.source_batch_id)
    ).length,
  }
}
