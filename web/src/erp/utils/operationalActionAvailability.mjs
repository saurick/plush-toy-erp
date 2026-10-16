import {
  FinancePaymentKind,
  FinancePaymentStatus,
  ProductionExceptionExecutionStatus,
  ProductionExceptionStatus,
  ShipmentFinanceReleaseStatus,
  ShipmentStatus,
} from '../../common/consts/statuses.generated.mjs'
import {
  resolveBusinessActionAvailability,
  resolveContextualBusinessActionAvailability,
} from './businessActionAvailability.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from './numeric20Scale6.mjs'

function resolveAction({
  authorized,
  record,
  relevant,
  completed = false,
  applicable,
  busy = false,
  selectionReason,
  unavailableReason,
  busyReason,
}) {
  return resolveBusinessActionAvailability({
    authorized,
    selected: Boolean(record),
    relevant,
    completed,
    applicable,
    busy,
    selectionReason,
    unavailableReason,
    busyReason,
  })
}

export function resolveFinancePaymentActionAvailability({
  action,
  authorized = false,
  payment = null,
  busy = false,
  referenceLoading = false,
  pendingAllocation = false,
} = {}) {
  const status = payment?.status
  const canResumeAllocation =
    pendingAllocation &&
    status === FinancePaymentStatus.POSTED &&
    payment?.kind !== FinancePaymentKind.REFUND
  const canAllocateBalance =
    status === FinancePaymentStatus.POSTED &&
    payment?.kind !== FinancePaymentKind.REFUND &&
    isPositiveNumeric20Scale6Units(
      numeric20Scale6Units(payment?.available_amount)
    )
  const common = {
    authorized,
    record: payment,
    selectionReason: '请先选择一条收付款记录',
  }

  switch (action) {
    case 'allocation':
      return resolveAction({
        ...common,
        relevant: [FinancePaymentStatus.DRAFT, FinancePaymentStatus.APPROVED].includes(status) || canAllocateBalance || canResumeAllocation,
        completed:
          (status === FinancePaymentStatus.POSTED && !canAllocateBalance && !canResumeAllocation) || status === FinancePaymentStatus.REVERSED,
        applicable: status === FinancePaymentStatus.APPROVED || canAllocateBalance || canResumeAllocation,
        busy: busy || referenceLoading,
        unavailableReason: '审批通过后可选择应收 / 应付核销',
        busyReason: referenceLoading
          ? '核销资料加载完成后可继续'
          : '当前操作完成后可办理核销',
      })
    case 'approval':
      return resolveAction({
        ...common,
        relevant: status === FinancePaymentStatus.DRAFT,
        applicable: status === FinancePaymentStatus.DRAFT,
        busy,
        unavailableReason: '只有待审批收付款可以核对审批流',
        busyReason: '当前操作完成后可核对审批流',
      })
    case 'cancel':
      return resolveAction({
        ...common,
        relevant: [FinancePaymentStatus.DRAFT, FinancePaymentStatus.APPROVED].includes(status),
        applicable: [FinancePaymentStatus.DRAFT, FinancePaymentStatus.APPROVED].includes(status),
        busy,
        unavailableReason: '只有尚未过账的收付款可以核对取消',
        busyReason: '当前操作完成后可核对取消',
      })
    case 'reverse':
      return resolveAction({
        ...common,
        relevant: [FinancePaymentStatus.DRAFT, FinancePaymentStatus.APPROVED, FinancePaymentStatus.POSTED].includes(status),
        completed: status === FinancePaymentStatus.REVERSED,
        applicable: status === FinancePaymentStatus.POSTED,
        busy,
        unavailableReason: '完成核销后可冲销收付款',
        busyReason: '当前操作完成后可冲销收付款',
      })
    default:
      throw new TypeError(`未知收付款动作：${String(action || '')}`)
  }
}

// The server also checks related inspections and workflow records before saving.
export function canEditShipmentDraft(shipment) {
  return Boolean(
    shipment?.status === ShipmentStatus.DRAFT &&
    shipment.finance_release_status === ShipmentFinanceReleaseStatus.PENDING &&
    shipment.finance_release_version === 1 &&
    !shipment.finance_release_process_instance_id &&
    !shipment.finance_release_process_node_id &&
    !shipment.finance_released_at
  )
}

export function resolveShipmentActionAvailability({
  action,
  authorized = false,
  shipment = null,
  busy = false,
} = {}) {
  const status = shipment?.status
  const releaseStatus = shipment?.finance_release_status || 'PENDING'
  const common = {
    authorized,
    record: shipment,
    selectionReason: '请先选择一张出货单',
  }

  switch (action) {
    case 'quality':
      return resolveAction({
        ...common,
        relevant: status === ShipmentStatus.DRAFT && releaseStatus === ShipmentFinanceReleaseStatus.PENDING,
        applicable: status === ShipmentStatus.DRAFT && releaseStatus === ShipmentFinanceReleaseStatus.PENDING,
        busy,
        unavailableReason: '只有尚未财务放行的出货草稿可以发起检验',
        busyReason: '当前操作完成后可发起检验',
      })
    case 'release':
      return resolveAction({
        ...common,
        relevant: status === ShipmentStatus.DRAFT && releaseStatus === ShipmentFinanceReleaseStatus.PENDING,
        applicable: status === ShipmentStatus.DRAFT && releaseStatus === ShipmentFinanceReleaseStatus.PENDING,
        busy,
        unavailableReason: '只有待放行的出货草稿可以核对审批',
        busyReason: '当前操作完成后可核对出货审批',
      })
    case 'ship':
      return resolveAction({
        ...common,
        relevant:
          status === ShipmentStatus.DRAFT && [ShipmentFinanceReleaseStatus.PENDING, ShipmentFinanceReleaseStatus.APPROVED].includes(releaseStatus),
        completed: status === ShipmentStatus.SHIPPED,
        applicable: status === ShipmentStatus.DRAFT && releaseStatus === ShipmentFinanceReleaseStatus.APPROVED,
        busy,
        unavailableReason: '财务审批通过后可确认出货',
        busyReason: '当前操作完成后可确认出货',
      })
    case 'cancel':
      return resolveAction({
        ...common,
        relevant: [ShipmentStatus.DRAFT, ShipmentStatus.SHIPPED].includes(status),
        completed: status === ShipmentStatus.CANCELLED,
        applicable: [ShipmentStatus.DRAFT, ShipmentStatus.SHIPPED].includes(status),
        busy,
        unavailableReason: '当前出货状态不能取消',
        busyReason: '当前操作完成后可继续',
      })
    case 'receivable':
      return resolveAction({
        ...common,
        relevant:
          status === ShipmentStatus.SHIPPED ||
          (status === ShipmentStatus.DRAFT &&
            [ShipmentFinanceReleaseStatus.PENDING, ShipmentFinanceReleaseStatus.APPROVED].includes(releaseStatus)),
        applicable: status === ShipmentStatus.SHIPPED,
        busy,
        unavailableReason: '确认出货后可生成应收',
        busyReason: '当前操作完成后可生成应收',
      })
    case 'invoice':
      return resolveAction({
        ...common,
        relevant:
          status === ShipmentStatus.SHIPPED ||
          (status === ShipmentStatus.DRAFT &&
            [ShipmentFinanceReleaseStatus.PENDING, ShipmentFinanceReleaseStatus.APPROVED].includes(releaseStatus)),
        applicable: status === ShipmentStatus.SHIPPED,
        busy,
        unavailableReason: '确认出货后可生成开票记录',
        busyReason: '当前操作完成后可生成开票记录',
      })
    default:
      throw new TypeError(`未知出货动作：${String(action || '')}`)
  }
}

export function resolveProductionExceptionActionAvailability({
  action,
  authorized = false,
  productionException = null,
  requesterOwned = false,
  busy = false,
} = {}) {
  const status = productionException?.status
  const executionStatus = productionException?.execution_status
  const isQuota = productionException?.decision_type === 'OVER_ISSUE'
  const common = {
    authorized,
    record: productionException,
    selectionReason: '请先选择一条生产异常处置申请',
  }

  switch (action) {
    case 'approval':
      return resolveAction({
        ...common,
        relevant: status === ProductionExceptionStatus.SUBMITTED && requesterOwned,
        applicable: status === ProductionExceptionStatus.SUBMITTED && requesterOwned,
        busy,
        unavailableReason: '只有本人提交且待审批的申请可以核对审批流',
        busyReason: '当前操作完成后可核对审批流',
      })
    case 'decide':
      return resolveAction({
        ...common,
        relevant: status === ProductionExceptionStatus.SUBMITTED,
        applicable: status === ProductionExceptionStatus.SUBMITTED,
        busy,
        unavailableReason: '只有待审批申请可以前往任务中心审批',
        busyReason: '当前操作完成后可前往审批',
      })
    case 'withdraw':
      return resolveAction({
        ...common,
        relevant: status === ProductionExceptionStatus.SUBMITTED && requesterOwned,
        applicable: status === ProductionExceptionStatus.SUBMITTED && requesterOwned,
        busy,
        unavailableReason: '只有本人提交且待审批的申请可以撤回',
        busyReason: '当前操作完成后可核对撤回条件',
      })
    case 'execute':
      return resolveAction({
        ...common,
        relevant: !isQuota && [ProductionExceptionStatus.SUBMITTED, ProductionExceptionStatus.APPROVED].includes(status),
        completed: [ProductionExceptionExecutionStatus.APPLIED, ProductionExceptionExecutionStatus.REVERSED].includes(executionStatus),
        applicable: status === ProductionExceptionStatus.APPROVED && executionStatus === ProductionExceptionExecutionStatus.PENDING,
        busy,
        unavailableReason: '审批通过后可确认执行报废或在制品让步',
        busyReason: '当前操作完成后可确认执行',
      })
    case 'reverse':
      return resolveAction({
        ...common,
        relevant:
          !isQuota &&
          [ProductionExceptionStatus.SUBMITTED, ProductionExceptionStatus.APPROVED].includes(status) &&
          [ProductionExceptionExecutionStatus.PENDING, ProductionExceptionExecutionStatus.APPLIED].includes(executionStatus),
        completed: executionStatus === ProductionExceptionExecutionStatus.REVERSED,
        applicable: status === ProductionExceptionStatus.APPROVED && executionStatus === ProductionExceptionExecutionStatus.APPLIED,
        busy,
        unavailableReason: '业务执行后可确认冲正',
        busyReason: '当前操作完成后可确认冲正',
      })
    case 'revokeQuota':
      return resolveAction({
        ...common,
        relevant:
          isQuota &&
          [ProductionExceptionStatus.SUBMITTED, ProductionExceptionStatus.APPROVED].includes(status) &&
          executionStatus === ProductionExceptionExecutionStatus.PENDING,
        completed: executionStatus === ProductionExceptionExecutionStatus.REVERSED,
        applicable: status === ProductionExceptionStatus.APPROVED && executionStatus === ProductionExceptionExecutionStatus.PENDING,
        busy,
        unavailableReason: '审批通过后可撤销未使用的超领额度',
        busyReason: '当前操作完成后可撤销额度',
      })
    default:
      throw new TypeError(`未知生产异常动作：${String(action || '')}`)
  }
}

export function resolveRelatedRecordActionAvailability({
  authorized = false,
  record = null,
  itemCount = 0,
  busy = false,
  busyReason = '当前操作完成后可查看相关单据',
} = {}) {
  const hasItems = Number(itemCount) > 0
  return resolveContextualBusinessActionAvailability({
    authorized,
    selected: Boolean(record),
    relevant: hasItems,
    applicable: hasItems,
    busy,
    busyReason,
    unavailableReason: '当前业务记录没有可打开的关联单据',
  })
}
