import {
  PRODUCTION_WIP_ACTION,
  PRODUCTION_WIP_EXECUTION_MODE,
  buildProductionWipConservingSplits,
  positiveSafeInteger,
} from './productionWipModel.mjs'

function outsourcingAllocations(
  values,
  isNormalFabricBatch,
  materialRequirements
) {
  if (values.execution_mode !== PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED) {
    return []
  }
  if (isNormalFabricBatch) {
    return materialRequirements.map((requirement) => ({
      outsourcing_order_item_id:
        values.fabric_outsourcing_item_ids?.[String(requirement.id)],
      production_order_material_requirement_id: requirement.id,
    }))
  }
  if (!positiveSafeInteger(values.outsourcing_order_item_id)) return []
  return [{ outsourcing_order_item_id: values.outsourcing_order_item_id }]
}

export function buildProductionWipFormPayload({
  action,
  values,
  orderID,
  batch,
  nextOperation,
  packagingConfirmation,
  isNormalFabricBatch,
  materialRequirements,
}) {
  if (action === PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL) {
    return {
      production_order_id: orderID,
      production_order_item_id: batch.production_order_item_id,
      expected_version: packagingConfirmation?.version,
      packaging_version_snapshot: values.packaging_version_snapshot,
      note: values.note,
    }
  }
  const payload = {
    production_order_id: orderID,
    production_wip_batch_id: batch.id,
    expected_version: batch.version,
    reason: values.reason,
  }
  switch (action) {
    case PRODUCTION_WIP_ACTION.SPLIT_BATCH:
      return {
        ...payload,
        splits: buildProductionWipConservingSplits(
          batch.quantity,
          values.quantity
        ),
      }
    case PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION:
      return {
        ...payload,
        execution_mode: values.execution_mode,
        outsourcing_allocations: outsourcingAllocations(
          values,
          isNormalFabricBatch,
          materialRequirements
        ),
      }
    case PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION:
      return {
        ...payload,
        quantity: batch.quantity,
        target_operation_id: nextOperation?.id,
      }
    case PRODUCTION_WIP_ACTION.REWORK:
      return {
        ...payload,
        quantity: values.quantity,
        target_operation_id: values.target_operation_id,
      }
    default:
      return payload
  }
}
