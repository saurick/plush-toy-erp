import {
  productionWipStatusMeta,
  productionWipQualityInspectionMeta,
  PRODUCTION_WIP_QUALITY_GATE_LABELS as PRODUCTION_QUALITY_GATE_LABELS,
} from './productionWipModel.mjs'
import {
  currentBusinessDate,
  unixSecondsToBusinessDate,
} from './businessDate.mjs'

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

function unixDateKey(value) {
  return unixSecondsToBusinessDate(value)
}

function normalizedText(value, fallback = '') {
  return String(value ?? '').trim() || fallback
}

function salesDeliveryStatus(row, today) {
  if (row.lineStatus === 'canceled' || row.lifecycleStatus === 'canceled') {
    return { key: 'cancelled', label: '已取消', rank: 7 }
  }
  if (!row.progressKnown) {
    return { key: 'unknown', label: '进度待核对', rank: 4 }
  }
  if (row.remaining <= 0) {
    return { key: 'delivered', label: '已交付', rank: 6 }
  }
  if (row.lifecycleStatus === 'closed' || row.lineStatus === 'closed') {
    return { key: 'closed', label: '已关闭未交完', rank: 1 }
  }
  if (!row.deliveryDate) {
    return { key: 'unscheduled', label: '未排交期', rank: 3 }
  }
  const days = dayDistance(today, row.deliveryDate)
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
      rank: 2,
    }
  }
  return { key: 'inProgress', label: '交付中', rank: 5 }
}

export function buildSalesDeliveryModel(items = [], options = {}) {
  const today = options.today || currentBusinessDate()
  const rows = (Array.isArray(items) ? items : []).map((item) => {
    const ordered = decimalNumber(item?.ordered_quantity)
    const shipped = decimalNumber(item?.shipped_quantity)
    const remaining = decimalNumber(item?.unshipped_quantity)
    const progressKnown =
      ordered !== null && ordered > 0 && shipped !== null && remaining !== null
    const row = {
      id: Number(item?.id || 0),
      salesOrderID: Number(item?.sales_order_id || 0),
      productID: Number(item?.product_id || 0),
      orderNo: normalizedText(item?.order_no, '销售订单未编号'),
      customerName: normalizedText(item?.customer_name, '客户未填写'),
      productName: normalizedText(
        item?.requested_product_name || item?.product_name_snapshot,
        '产品未填写'
      ),
      customerProductNo: normalizedText(item?.customer_product_no),
      unitName: normalizedText(item?.unit_name, '单位'),
      deliveryDate: unixDateKey(item?.planned_delivery_date),
      lifecycleStatus: normalizedText(item?.lifecycle_status).toLowerCase(),
      lineStatus: normalizedText(item?.line_status).toLowerCase(),
      ordered,
      shipped,
      remaining,
      progressKnown,
      percent: progressKnown ? clampPercent((shipped / ordered) * 100) : null,
    }
    return { ...row, status: salesDeliveryStatus(row, today) }
  })

  rows.sort((left, right) => {
    const rank = left.status.rank - right.status.rank
    if (rank !== 0) return rank
    const leftDate = left.deliveryDate || '9999-12-31'
    const rightDate = right.deliveryDate || '9999-12-31'
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
    return left.orderNo.localeCompare(right.orderNo, 'zh-CN')
  })

  return {
    rows,
    counts: {
      total: rows.length,
      overdue: rows.filter((row) => row.status.key === 'overdue').length,
      dueSoon: rows.filter((row) => row.status.key === 'dueSoon').length,
      unknown: rows.filter((row) => row.status.key === 'unknown').length,
      closed: rows.filter((row) => row.status.key === 'closed').length,
      unscheduled: rows.filter((row) => row.status.key === 'unscheduled')
        .length,
      delivered: rows.filter((row) => row.status.key === 'delivered').length,
    },
  }
}

function purchaseArrivalStatus(order, today) {
  if (order.lifecycleStatus === 'canceled') {
    return { key: 'cancelled', label: '已取消', rank: 6 }
  }
  if (order.lifecycleStatus === 'closed') {
    return { key: 'closed', label: '订单已关闭', rank: 5 }
  }
  if (!order.arrivalDate) {
    return { key: 'unscheduled', label: '未填到货日', rank: 0 }
  }
  const days = dayDistance(today, order.arrivalDate)
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
      label: days === 0 ? '今天到货' : `${days} 天后到货`,
      rank: 1,
    }
  }
  if (order.confirmedDate) {
    return { key: 'confirmed', label: '供应商已确认日期', rank: 2 }
  }
  return { key: 'planned', label: '预计到货', rank: 3 }
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

export function buildPurchaseArrivalModel(orders = [], options = {}) {
  const today = options.today || currentBusinessDate()
  const startDate =
    dateKeyToUTC(options.startDate) !== null ? options.startDate : today
  const rows = (Array.isArray(orders) ? orders : []).map((item) => {
    const confirmedDate = unixDateKey(item?.supplier_confirmed_arrival_date)
    const expectedDate = unixDateKey(item?.expected_arrival_date)
    const row = {
      id: Number(item?.id || 0),
      orderNo: normalizedText(item?.purchase_order_no, '采购订单未编号'),
      supplierName: normalizedText(
        item?.supplier_snapshot?.name || item?.supplier_name,
        '供应商未填写'
      ),
      lifecycleStatus: normalizedText(item?.lifecycle_status).toLowerCase(),
      confirmedDate,
      expectedDate,
      arrivalDate: confirmedDate || expectedDate,
      dateSource: confirmedDate ? 'confirmed' : expectedDate ? 'expected' : '',
    }
    return { ...row, status: purchaseArrivalStatus(row, today) }
  })
  rows.sort((left, right) => {
    const rank = left.status.rank - right.status.rank
    if (rank !== 0) return rank
    return (left.arrivalDate || '9999-12-31').localeCompare(
      right.arrivalDate || '9999-12-31'
    )
  })

  const days = Array.from({ length: 14 }, (_, index) => {
    const dateKey = moveBusinessDate(startDate, index)
    return { dateKey, day: Number(dateKey.slice(-2)), items: [] }
  })
  const dayMap = new Map(days.map((day) => [day.dateKey, day]))
  rows.forEach((row) => dayMap.get(row.arrivalDate)?.items.push(row))

  return {
    rows,
    days,
    startDate,
    endDate: days.at(-1).dateKey,
    unscheduled: rows.filter((row) => row.status.key === 'unscheduled'),
    counts: {
      total: rows.length,
      overdue: rows.filter((row) => row.status.key === 'overdue').length,
      dueSoon: rows.filter((row) => row.status.key === 'dueSoon').length,
      confirmed: rows.filter(
        (row) =>
          row.confirmedDate && !['closed', 'cancelled'].includes(row.status.key)
      ).length,
      unscheduled: rows.filter((row) => row.status.key === 'unscheduled')
        .length,
    },
  }
}

function financeDueStatus(row, today) {
  if (row.status === 'CANCELLED') {
    return { key: 'cancelled', label: '已取消', rank: 6 }
  }
  if (row.outstanding === null || row.amount === null || !row.currency) {
    return { key: 'unknown', label: '金额待核对', rank: 2 }
  }
  if (row.status === 'SETTLED' || row.outstanding === 0) {
    return { key: 'settled', label: '已结清', rank: 5 }
  }
  if (row.status === 'DRAFT') {
    return { key: 'draft', label: '草稿待过账', rank: 4 }
  }
  if (!row.dueDate) {
    return { key: 'unscheduled', label: '未填到期日', rank: 2 }
  }
  const days = dayDistance(today, row.dueDate)
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
      const row = {
        id: Number(item?.id || 0),
        factNo: normalizedText(item?.fact_no, '财务记录未编号'),
        factType: normalizedText(item?.fact_type),
        typeLabel: item?.fact_type === 'PAYABLE' ? '应付' : '应收',
        status: normalizedText(item?.status).toUpperCase(),
        sourceNo: normalizedText(item?.source_no, '来源单据已关联'),
        amount: decimalNumber(item?.amount),
        outstanding: decimalNumber(item?.outstanding_amount),
        currency: normalizedText(item?.currency),
        dueDate: unixDateKey(item?.due_at),
      }
      return { ...row, dueStatus: financeDueStatus(row, today) }
    })

  rows.sort((left, right) => {
    const rank = left.dueStatus.rank - right.dueStatus.rank
    if (rank !== 0) return rank
    const dateOrder = (left.dueDate || '9999-12-31').localeCompare(
      right.dueDate || '9999-12-31'
    )
    if (dateOrder !== 0) return dateOrder
    return left.factNo.localeCompare(right.factNo, 'zh-CN')
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

function warehouseLabel(warehouse, warehouseID) {
  const name = normalizedText(warehouse?.name)
  const code = normalizedText(warehouse?.code)
  if (name && code) return `${name}（${code}）`
  return (
    name || code || (warehouseID ? `仓库 #${warehouseID}（未启用）` : '未分仓')
  )
}

export function buildInventoryDistributionModel(
  balances = [],
  warehouses = []
) {
  const warehouseMap = new Map(
    (Array.isArray(warehouses) ? warehouses : []).map((warehouse) => [
      Number(warehouse?.id || 0),
      warehouse,
    ])
  )
  const groups = new Map()
  ;(Array.isArray(balances) ? balances : []).forEach((balance) => {
    const warehouseID = Number(balance?.warehouse_id || 0)
    if (!groups.has(warehouseID)) {
      groups.set(warehouseID, {
        warehouseID,
        warehouseName: warehouseLabel(
          warehouseMap.get(warehouseID),
          warehouseID
        ),
        recordCount: 0,
        availableRecordCount: 0,
        unavailableRecordCount: 0,
        stockKeys: new Set(),
      })
    }
    const group = groups.get(warehouseID)
    group.recordCount += 1
    const available = decimalNumber(balance?.available_quantity)
    if (available !== null && available > 0) group.availableRecordCount += 1
    else group.unavailableRecordCount += 1
    group.stockKeys.add(
      [
        normalizedText(balance?.subject_type, 'UNKNOWN'),
        Number(balance?.subject_id || 0),
        Number(balance?.product_sku_id || 0),
      ].join(':')
    )
  })

  const totalRecords = Array.from(groups.values()).reduce(
    (sum, group) => sum + group.recordCount,
    0
  )
  const rows = Array.from(groups.values())
    .map((group) => ({
      warehouseID: group.warehouseID,
      warehouseName: group.warehouseName,
      recordCount: group.recordCount,
      stockCount: group.stockKeys.size,
      availableRecordCount: group.availableRecordCount,
      unavailableRecordCount: group.unavailableRecordCount,
      percent:
        totalRecords > 0
          ? clampPercent((group.recordCount / totalRecords) * 100)
          : 0,
    }))
    .sort(
      (left, right) =>
        right.recordCount - left.recordCount ||
        left.warehouseName.localeCompare(right.warehouseName, 'zh-CN')
    )

  return {
    rows,
    counts: {
      warehouses: rows.length,
      records: totalRecords,
      stocks: rows.reduce((sum, row) => sum + row.stockCount, 0),
      unavailableRecords: rows.reduce(
        (sum, row) => sum + row.unavailableRecordCount,
        0
      ),
    },
  }
}

const PRODUCTION_ORDER_STATUS_META = Object.freeze({
  DRAFT: Object.freeze({ label: '草稿', tone: 'draft' }),
  RELEASED: Object.freeze({ label: '生产中', tone: 'inProgress' }),
  CLOSED: Object.freeze({ label: '已关闭', tone: 'delivered' }),
  CANCELLED: Object.freeze({ label: '已取消', tone: 'cancelled' }),
})

function productionScheduleStatus(row, today) {
  if (row.orderStatus === 'CANCELLED') {
    return { key: 'cancelled', label: '已取消', rank: 7 }
  }
  if (row.orderStatus === 'CLOSED') {
    return { key: 'delivered', label: '已完成', rank: 6 }
  }
  if (row.orderStatus === 'DRAFT') {
    return { key: 'draft', label: '待发布', rank: 4 }
  }
  if (!row.plannedEndDate) {
    return { key: 'unscheduled', label: '未排计划结束', rank: 0 }
  }
  const days = dayDistance(today, row.plannedEndDate)
  if (days !== null && days < 0) {
    return {
      key: 'overdue',
      label: `计划逾期 ${Math.abs(days)} 天`,
      rank: 0,
    }
  }
  if (days !== null && days <= 7) {
    return {
      key: 'dueSoon',
      label: days === 0 ? '计划今天结束' : `计划 ${days} 天后结束`,
      rank: 1,
    }
  }
  return { key: 'inProgress', label: '按计划生产', rank: 3 }
}

export function buildProductionOrderOverviewModel(orders = [], options = {}) {
  const today = options.today || currentBusinessDate()
  const rows = (Array.isArray(orders) ? orders : []).map((order) => {
    const orderStatus = normalizedText(order?.status).toUpperCase()
    const orderStatusMeta = PRODUCTION_ORDER_STATUS_META[orderStatus] || {
      label: '状态待核对',
      tone: 'unknown',
    }
    const row = {
      id: Number(order?.id || 0),
      orderNo: normalizedText(order?.order_no, '生产订单未编号'),
      orderStatus,
      orderStatusMeta,
      plannedStartDate: unixDateKey(order?.planned_start_at),
      plannedEndDate: unixDateKey(order?.planned_end_at),
      note: normalizedText(order?.note),
    }
    return { ...row, scheduleStatus: productionScheduleStatus(row, today) }
  })

  rows.sort((left, right) => {
    const riskOrder =
      left.scheduleStatus.rank - right.scheduleStatus.rank ||
      (left.plannedEndDate || '9999-12-31').localeCompare(
        right.plannedEndDate || '9999-12-31'
      )
    return riskOrder || left.orderNo.localeCompare(right.orderNo, 'zh-CN')
  })

  const statusOrder = ['DRAFT', 'RELEASED', 'CLOSED', 'CANCELLED']
  const statusGroups = statusOrder.map((status) => {
    const count = rows.filter((row) => row.orderStatus === status).length
    return {
      key: status,
      label: PRODUCTION_ORDER_STATUS_META[status].label,
      tone: PRODUCTION_ORDER_STATUS_META[status].tone,
      count,
      percent: rows.length > 0 ? clampPercent((count / rows.length) * 100) : 0,
    }
  })

  return {
    rows,
    statusGroups,
    counts: {
      total: rows.length,
      active: rows.filter((row) => row.orderStatus === 'RELEASED').length,
      overdue: rows.filter((row) => row.scheduleStatus.key === 'overdue')
        .length,
      dueSoon: rows.filter((row) => row.scheduleStatus.key === 'dueSoon')
        .length,
      unscheduled: rows.filter(
        (row) => row.scheduleStatus.key === 'unscheduled'
      ).length,
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
    (batch) => !['CANCELLED', 'SPLIT'].includes(batch.status)
  )
  const activeBatchIDs = new Set(activeBatches.map((batch) => batch.id))
  const activeInspections = inspections.filter(
    (inspection) =>
      activeBatchIDs.has(inspection.production_wip_batch_id) &&
      inspection.status !== 'CANCELLED'
  )
  const hasRejectedQuality = activeInspections.some(
    (inspection) => inspection.status === 'REJECTED'
  )
  if (
    hasRejectedQuality ||
    activeBatches.some((batch) => batch.status === 'REJECTED')
  ) {
    return { key: 'exception', label: '需要处理' }
  }
  if (
    activeInspections.some((inspection) => inspection.status === 'SUBMITTED') ||
    activeBatches.some((batch) => batch.status === 'WAITING_QUALITY')
  ) {
    return { key: 'quality', label: '等待质检' }
  }
  if (
    activeBatches.some((batch) =>
      ['IN_PROGRESS', 'OUTSOURCED'].includes(batch.status)
    )
  ) {
    return { key: 'active', label: '正在进行' }
  }
  if (
    activeBatches.some((batch) => batch.status === 'ACCEPTED') ||
    hasDownstream
  ) {
    return { key: 'done', label: '已通过' }
  }
  if (activeBatches.some((batch) => batch.status === 'PLANNED')) {
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
          batch.status !== 'CANCELLED' &&
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
            .filter((batch) => !['CANCELLED', 'SPLIT'].includes(batch.status))
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
    (batch) => !['CANCELLED', 'SPLIT'].includes(batch.status)
  )
  const rejectedInspectionBatchIDs = new Set(
    inspections
      .filter((inspection) => inspection.status === 'REJECTED')
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
        (batch) => batch.status === 'WAITING_QUALITY'
      ).length,
      exceptions: activeBatches.filter(
        (batch) =>
          batch.status === 'REJECTED' ||
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
