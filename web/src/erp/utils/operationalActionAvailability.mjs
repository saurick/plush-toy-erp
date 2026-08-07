import { resolveBusinessActionAvailability } from './businessActionAvailability.mjs'
import {
  compareNumeric20Scale6Values,
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
} = {}) {
  const status = payment?.status
  const common = {
    authorized,
    record: payment,
    selectionReason: '请先选择一条收付款记录',
  }

  switch (action) {
    case 'allocation':
      return resolveAction({
        ...common,
        relevant: ['DRAFT', 'APPROVED'].includes(status),
        completed: ['POSTED', 'REVERSED'].includes(status),
        applicable: status === 'APPROVED',
        busy: busy || referenceLoading,
        unavailableReason: '审批通过后可选择应收 / 应付核销',
        busyReason: referenceLoading
          ? '核销资料加载完成后可继续'
          : '当前操作完成后可办理核销',
      })
    case 'approval':
      return resolveAction({
        ...common,
        relevant: status === 'DRAFT',
        applicable: status === 'DRAFT',
        busy,
        unavailableReason: '只有待审批收付款可以核对审批流',
        busyReason: '当前操作完成后可核对审批流',
      })
    case 'cancel':
      return resolveAction({
        ...common,
        relevant: ['DRAFT', 'APPROVED'].includes(status),
        applicable: ['DRAFT', 'APPROVED'].includes(status),
        busy,
        unavailableReason: '只有尚未过账的收付款可以核对取消',
        busyReason: '当前操作完成后可核对取消',
      })
    case 'reverse':
      return resolveAction({
        ...common,
        relevant: ['DRAFT', 'APPROVED', 'POSTED'].includes(status),
        completed: status === 'REVERSED',
        applicable: status === 'POSTED',
        busy,
        unavailableReason: '完成核销后可冲销收付款',
        busyReason: '当前操作完成后可冲销收付款',
      })
    default:
      throw new TypeError(`未知收付款动作：${String(action || '')}`)
  }
}

function positiveDifference(left, right) {
  return compareNumeric20Scale6Values(left, right) > 0
}

function hasPendingIntakeRework(intake) {
  return (intake?.items || []).some((item) =>
    positiveDifference(item?.quantity, item?.active_rework_quantity)
  )
}

function hasActiveIntakeRework(intake) {
  return (intake?.items || []).some((item) =>
    isPositiveNumeric20Scale6Units(
      numeric20Scale6Units(item?.active_rework_quantity) || '0'
    )
  )
}

function hasAvailableReworkCompletion(intake) {
  return (intake?.items || []).some((item) =>
    (item?.completion_candidates || []).some(
      (candidate) =>
        candidate?.selectable === true &&
        isPositiveNumeric20Scale6Units(
          numeric20Scale6Units(candidate?.remaining_quantity) || '0'
        )
    )
  )
}

export function resolveReworkIntakeActionAvailability({
  action,
  authorized = false,
  reworkIntake = null,
  busy = false,
} = {}) {
  const status = reworkIntake?.status
  const common = {
    authorized,
    record: reworkIntake,
    selectionReason: '请先选择一条返工回厂记录',
  }

  switch (action) {
    case 'receive':
      return resolveAction({
        ...common,
        relevant: status === 'DRAFT',
        completed: ['RECEIVED', 'REVERSED'].includes(status),
        applicable: status === 'DRAFT',
        busy,
        unavailableReason: '只有待接收记录可以确认回厂收货',
        busyReason: '当前操作完成后可确认回厂收货',
      })
    case 'cancel':
      return resolveAction({
        ...common,
        relevant: status === 'DRAFT',
        completed: status === 'CANCELLED',
        applicable: status === 'DRAFT',
        busy,
        unavailableReason: '只有尚未接收的返工回厂记录可以取消',
        busyReason: '当前操作完成后可取消',
      })
    case 'reverse':
      return resolveAction({
        ...common,
        relevant: status === 'RECEIVED',
        completed: status === 'REVERSED',
        applicable:
          status === 'RECEIVED' && !hasActiveIntakeRework(reworkIntake),
        busy,
        unavailableReason: hasActiveIntakeRework(reworkIntake)
          ? '已有返工记录，需先取消相关生产返工后才能冲正收货'
          : '只有已接收且尚未进入返工的记录可以冲正收货',
        busyReason: '当前操作完成后可冲正收货',
      })
    case 'rework':
      return resolveAction({
        ...common,
        relevant: status === 'RECEIVED',
        applicable:
          status === 'RECEIVED' && hasPendingIntakeRework(reworkIntake),
        busy,
        unavailableReason:
          status === 'RECEIVED'
            ? '回厂数量已全部建立生产返工记录'
            : '确认回厂收货后才能建立生产返工记录',
        busyReason: '当前操作完成后可建立生产返工记录',
      })
    case 'reship':
      return resolveAction({
        ...common,
        relevant: status === 'RECEIVED',
        completed: reworkIntake?.progress_stage === 'CLOSED',
        applicable:
          status === 'RECEIVED' && hasAvailableReworkCompletion(reworkIntake),
        busy,
        unavailableReason:
          '生产返工完成、工序质检通过并入库后，才能建立补发出货单',
        busyReason: '当前操作完成后可建立补发出货单',
      })
    default:
      throw new TypeError(`未知返工回厂动作：${String(action || '')}`)
  }
}

export function resolveShipmentActionAvailability({
  action,
  authorized = false,
  shipment = null,
  busy = false,
} = {}) {
  const status = shipment?.status
  const releaseStatus = shipment?.finance_release_status || 'PENDING'
  const isReworkReshipment = shipment?.purpose === 'REWORK_RESHIPMENT'
  const common = {
    authorized,
    record: shipment,
    selectionReason: '请先选择一张出货单',
  }

  switch (action) {
    case 'quality':
      return resolveAction({
        ...common,
        relevant: status === 'DRAFT' && !isReworkReshipment,
        applicable: status === 'DRAFT' && !isReworkReshipment,
        busy,
        unavailableReason: isReworkReshipment
          ? '返工补发沿用生产返工的工序质检与完工结果，不重复发起出货前检验'
          : '只有出货草稿可以发起出货前检验',
        busyReason: '当前操作完成后可发起检验',
      })
    case 'release':
      return resolveAction({
        ...common,
        relevant:
          status === 'DRAFT' &&
          releaseStatus === 'PENDING' &&
          !isReworkReshipment,
        applicable:
          status === 'DRAFT' &&
          releaseStatus === 'PENDING' &&
          !isReworkReshipment,
        busy,
        unavailableReason: isReworkReshipment
          ? '返工补发不产生销售结算，不需要财务放行'
          : '只有待放行的出货草稿可以核对审批',
        busyReason: '当前操作完成后可核对出货审批',
      })
    case 'ship':
      return resolveAction({
        ...common,
        relevant:
          status === 'DRAFT' &&
          ['PENDING', 'APPROVED', 'NOT_REQUIRED'].includes(releaseStatus),
        completed: status === 'SHIPPED',
        applicable:
          status === 'DRAFT' &&
          (isReworkReshipment
            ? releaseStatus === 'NOT_REQUIRED'
            : releaseStatus === 'APPROVED'),
        busy,
        unavailableReason: isReworkReshipment
          ? '返工补发单准备完成后可确认出货'
          : '财务审批通过后可确认出货',
        busyReason: '当前操作完成后可确认出货',
      })
    case 'cancel':
      return resolveAction({
        ...common,
        relevant: ['DRAFT', 'SHIPPED'].includes(status),
        completed: status === 'CANCELLED',
        applicable: ['DRAFT', 'SHIPPED'].includes(status),
        busy,
        unavailableReason: '当前出货状态不能取消',
        busyReason: '当前操作完成后可继续',
      })
    case 'receivable':
      return resolveAction({
        ...common,
        relevant:
          !isReworkReshipment &&
          (status === 'SHIPPED' ||
            (status === 'DRAFT' &&
              ['PENDING', 'APPROVED'].includes(releaseStatus))),
        applicable: !isReworkReshipment && status === 'SHIPPED',
        busy,
        unavailableReason: isReworkReshipment
          ? '返工补发不产生新的应收'
          : '确认出货后可生成应收',
        busyReason: '当前操作完成后可生成应收',
      })
    case 'invoice':
      return resolveAction({
        ...common,
        relevant:
          !isReworkReshipment &&
          (status === 'SHIPPED' ||
            (status === 'DRAFT' &&
              ['PENDING', 'APPROVED'].includes(releaseStatus))),
        applicable: !isReworkReshipment && status === 'SHIPPED',
        busy,
        unavailableReason: isReworkReshipment
          ? '返工补发不产生新的开票记录'
          : '确认出货后可生成开票记录',
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
        relevant: status === 'SUBMITTED' && requesterOwned,
        applicable: status === 'SUBMITTED' && requesterOwned,
        busy,
        unavailableReason: '只有本人提交且待审批的申请可以核对审批流',
        busyReason: '当前操作完成后可核对审批流',
      })
    case 'decide':
      return resolveAction({
        ...common,
        relevant: status === 'SUBMITTED',
        applicable: status === 'SUBMITTED',
        busy,
        unavailableReason: '只有待审批申请可以前往任务中心审批',
        busyReason: '当前操作完成后可前往审批',
      })
    case 'withdraw':
      return resolveAction({
        ...common,
        relevant: status === 'SUBMITTED' && requesterOwned,
        applicable: status === 'SUBMITTED' && requesterOwned,
        busy,
        unavailableReason: '只有本人提交且待审批的申请可以撤回',
        busyReason: '当前操作完成后可核对撤回条件',
      })
    case 'execute':
      return resolveAction({
        ...common,
        relevant: !isQuota && ['SUBMITTED', 'APPROVED'].includes(status),
        completed: ['APPLIED', 'REVERSED'].includes(executionStatus),
        applicable: status === 'APPROVED' && executionStatus === 'PENDING',
        busy,
        unavailableReason: '审批通过后可确认执行报废或在制品让步',
        busyReason: '当前操作完成后可确认执行',
      })
    case 'reverse':
      return resolveAction({
        ...common,
        relevant:
          !isQuota &&
          ['SUBMITTED', 'APPROVED'].includes(status) &&
          ['PENDING', 'APPLIED'].includes(executionStatus),
        completed: executionStatus === 'REVERSED',
        applicable: status === 'APPROVED' && executionStatus === 'APPLIED',
        busy,
        unavailableReason: '业务执行后可确认冲正',
        busyReason: '当前操作完成后可确认冲正',
      })
    case 'revokeQuota':
      return resolveAction({
        ...common,
        relevant:
          isQuota &&
          ['SUBMITTED', 'APPROVED'].includes(status) &&
          executionStatus === 'PENDING',
        completed: executionStatus === 'REVERSED',
        applicable: status === 'APPROVED' && executionStatus === 'PENDING',
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
} = {}) {
  const hasItems = Number(itemCount) > 0
  return resolveAction({
    authorized,
    record,
    relevant: !record || hasItems,
    applicable: hasItems,
    selectionReason: '请先选择一条业务记录',
    unavailableReason: '当前业务记录没有可打开的关联单据',
  })
}
