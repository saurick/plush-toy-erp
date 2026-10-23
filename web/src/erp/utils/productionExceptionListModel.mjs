import { ProductionExceptionStatus, ProductionExceptionExecutionStatus } from '../../common/consts/statuses.generated.mjs'
import { getBusinessPaginationParams, normalizeBusinessPageSize } from './businessPagination.mjs'

function invalidProductionExceptionResponse() {
  return Object.assign(new Error('生产异常记录返回不完整'), {
    isInvalidResponse: true,
  })
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function buildProductionExceptionListQuery({
  handlingStatus = '',
  decisionType = '',
  status = '',
  executionStatus = '',
  productionOrderID = 0,
  pagination = {},
} = {}) {
  const { limit, offset } = getBusinessPaginationParams(pagination)
  const query = { limit, offset }
  if (handlingStatus) query.handling_status = handlingStatus
  const normalizedDecisionType = String(decisionType || '').trim()
  const normalizedStatus = String(status || '').trim()
  const normalizedExecutionStatus = String(executionStatus || '').trim()
  const normalizedProductionOrderID = positiveInteger(productionOrderID)
  if (normalizedDecisionType) query.decision_type = normalizedDecisionType
  if (normalizedStatus) query.status = normalizedStatus
  if (normalizedExecutionStatus) {
    query.execution_status = normalizedExecutionStatus
  }
  if (normalizedProductionOrderID) {
    query.production_order_id = normalizedProductionOrderID
  }
  return query
}

export function requireProductionExceptionRecord(
  record,
  { id = 0, productionOrderID = 0 } = {}
) {
  const expectedID = positiveInteger(id)
  const expectedProductionOrderID = positiveInteger(productionOrderID)
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    !positiveInteger(record.id) ||
    !positiveInteger(record.version) ||
    (expectedID && Number(record.id) !== expectedID) ||
    (expectedProductionOrderID &&
      Number(record.production_order_id) !== expectedProductionOrderID)
  ) {
    throw invalidProductionExceptionResponse()
  }
  return record
}

export function requireProductionExceptionPage(
  data,
  { limit, productionOrderID = 0 } = {}
) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !Array.isArray(data.production_exceptions) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    data.production_exceptions.length > limit
  ) {
    throw invalidProductionExceptionResponse()
  }
  data.production_exceptions.forEach((record) =>
    requireProductionExceptionRecord(record, { productionOrderID })
  )
  return {
    records: data.production_exceptions,
    total: data.total,
  }
}

export function reconcileProductionExceptionPage({
  records = [],
  total = 0,
  pagination = {},
  selectedID = null,
} = {}) {
  const pageSize = normalizeBusinessPageSize(pagination.pageSize)
  const current = positiveInteger(pagination.current) || 1
  const normalizedTotal =
    Number.isSafeInteger(total) && total >= 0 ? total : 0
  const lastPage = Math.max(Math.ceil(normalizedTotal / pageSize), 1)
  if (current > lastPage) {
    return {
      current: lastPage,
      shouldRetreat: true,
      records: [],
      selectedID: null,
    }
  }
  const normalizedRecords = Array.isArray(records) ? records : []
  return {
    current,
    shouldRetreat: false,
    records: normalizedRecords,
    selectedID: normalizedRecords.some(
      (record) => Number(record.id) === Number(selectedID)
    )
      ? selectedID
      : null,
  }
}

export function productionExceptionHandlingKey(record) {
  return record?.status === ProductionExceptionStatus.APPROVED
    ? `${record.status}:${record.execution_status}`
    : record?.status || ''
}
export const PRODUCTION_EXCEPTION_HANDLING_OPTIONS = [
  { value: ProductionExceptionStatus.SUBMITTED, label: '待审批' },
  { value: `${ProductionExceptionStatus.APPROVED}:${ProductionExceptionExecutionStatus.PENDING}`, label: '待办理／额度生效' },
  { value: `${ProductionExceptionStatus.APPROVED}:${ProductionExceptionExecutionStatus.APPLIED}`, label: '业务已执行' },
  { value: `${ProductionExceptionStatus.APPROVED}:${ProductionExceptionExecutionStatus.REVERSED}`, label: '业务已冲正' },
  { value: ProductionExceptionStatus.REJECTED, label: '已拒绝' },
  { value: ProductionExceptionStatus.CANCELLED, label: '已取消' },
]
