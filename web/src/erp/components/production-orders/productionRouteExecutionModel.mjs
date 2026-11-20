import {
  ProductionPackagingConfirmationStatus,
  ProductionWIPStatus,
} from '../../../common/consts/statuses.generated.mjs'
import {
  PRODUCTION_WIP_ACTION,
  PRODUCTION_WIP_EXECUTION_MODE,
  positiveSafeInteger,
  productionWipActionAllowedForOrder,
  productionWipQualityGateLabel,
  productionWipQualitySummary,
} from '../../utils/productionWipModel.mjs'

export function operationStepStatus(batch, operation, currentOperationID) {
  const status = String(batch?.status || '').trim()
  if (status === ProductionWIPStatus.ACCEPTED) return 'finish'
  if (status === ProductionWIPStatus.REJECTED) return 'error'
  if (operation?.id === currentOperationID && batch) return 'process'
  return 'wait'
}

export function qualityGateText(aggregate, operation, batch) {
  const gates = operation?.required_quality_gates || []
  if (gates.length === 0) return '本工序无需品质关口'
  if (batch) return productionWipQualitySummary(aggregate, batch)
  return gates
    .map((gateCode) => `${productionWipQualityGateLabel(gateCode)}：尚未到达`)
    .join('；')
}

function displayUnixTime(value) {
  if (!positiveSafeInteger(value)) return ''
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

export function packagingConfirmationText(confirmation) {
  if (
    !confirmation ||
    confirmation.status !== ProductionPackagingConfirmationStatus.CONFIRMED
  ) {
    return '待业务确认'
  }
  return [
    '业务已确认',
    confirmation.packaging_version_snapshot
      ? `包装版本：${confirmation.packaging_version_snapshot}`
      : '',
    displayUnixTime(confirmation.confirmed_at),
    confirmation.note ? `备注：${confirmation.note}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function resolveProductionRouteReadOnly({
  taskReadOnly,
  assignmentOnly,
  canAssign,
  canExecute,
  canReceiveReturn,
  canCreateCompletion,
  canWarehousePackaging,
  canIssueCutting,
  canConfirmPackaging,
}) {
  return Boolean(
    taskReadOnly ||
      (!assignmentOnly &&
        !canAssign &&
        !canExecute &&
        !canReceiveReturn &&
        !canCreateCompletion &&
        !canWarehousePackaging &&
        !canIssueCutting &&
        !canConfirmPackaging)
  )
}

export function canRunProductionRouteAction({
  action,
  assignmentOnly,
  readOnly,
  currentOperation,
  canWarehousePackaging,
  canIssueCutting,
  canAssign,
  canConfirmPackaging,
  canExecute,
  canReceiveReturn,
}) {
  if (readOnly) return false
  if (assignmentOnly && action !== PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION) {
    return false
  }
  if (action === PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL) {
    return canConfirmPackaging
  }
  if (
    action === PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION &&
    currentOperation?.operation_code === 'PACKAGING'
  ) {
    return canWarehousePackaging
  }
  if (
    [
      PRODUCTION_WIP_ACTION.SPLIT_BATCH,
      PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION,
      PRODUCTION_WIP_ACTION.CANCEL_BATCH,
    ].includes(action)
  ) {
    return canAssign
  }
  if (
    currentOperation?.operation_code === 'PACKAGING' ||
    (currentOperation?.operation_code === 'HANDWORK' &&
      action === PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION)
  ) {
    return canWarehousePackaging
  }
  if (
    currentOperation?.operation_code === 'FABRIC_PROCESSING' &&
    action === PRODUCTION_WIP_ACTION.START_OPERATION
  ) {
    return canIssueCutting
  }
  if (action === PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN) {
    return canReceiveReturn
  }
  if (
    [
      PRODUCTION_WIP_ACTION.START_OPERATION,
      PRODUCTION_WIP_ACTION.COMPLETE_OPERATION,
      PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION,
    ].includes(action)
  ) {
    return canExecute
  }
  return false
}

export function actionButtonEnabled(
  action,
  batch,
  operation,
  nextOperation,
  packagingConfirmation,
  canAct,
  order
) {
  if (
    !canAct ||
    !batch ||
    !operation ||
    !productionWipActionAllowedForOrder(order, batch, action)
  ) {
    return false
  }
  const status = String(batch.status || '').trim()
  switch (action) {
    case PRODUCTION_WIP_ACTION.SPLIT_BATCH:
      return (
        status === ProductionWIPStatus.PLANNED &&
        operation.operation_code !== 'FABRIC_PROCESSING'
      )
    case PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION:
      return status === ProductionWIPStatus.PLANNED && !batch.execution_mode
    case PRODUCTION_WIP_ACTION.CANCEL_BATCH:
      return status === ProductionWIPStatus.PLANNED
    case PRODUCTION_WIP_ACTION.START_OPERATION:
      return status === ProductionWIPStatus.PLANNED && Boolean(batch.execution_mode)
    case PRODUCTION_WIP_ACTION.COMPLETE_OPERATION:
      return (
        status === ProductionWIPStatus.IN_PROGRESS &&
        batch.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.IN_HOUSE
      )
    case PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN:
      return (
        status === ProductionWIPStatus.OUTSOURCED &&
        batch.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED
      )
    case PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION:
      return status === ProductionWIPStatus.ACCEPTED && Boolean(nextOperation)
    case PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL:
      return (
        packagingConfirmation?.status ===
          ProductionPackagingConfirmationStatus.PENDING &&
        ![ProductionWIPStatus.SPLIT, ProductionWIPStatus.CANCELLED].includes(
          status
        )
      )
    default:
      return false
  }
}
