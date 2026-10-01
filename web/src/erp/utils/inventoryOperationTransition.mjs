import {
  cancelInventoryOperation,
  getInventoryOperation,
  postInventoryOperation,
} from '../api/inventoryApi.mjs'
import {
  executeInventoryAdjustmentPost,
  executeInventoryAdjustmentSubmit,
  findExceptionProcessActiveNode,
  getInventoryAdjustmentApprovalProcess,
  startInventoryAdjustmentApprovalProcess,
} from '../api/customerConfigApi.mjs'
import { isSourceBusinessActionResultUnknown } from './sourceBusinessAction.mjs'

const INVENTORY_OPERATION_MUTATION_RECEIPTS = Object.freeze({
  submit: {
    status: 'SUBMITTED',
    actorField: 'submitted_by',
  },
  post: {
    status: 'POSTED',
    actorField: 'posted_by',
  },
  cancel: {
    status: 'CANCELLED',
    actorField: 'cancelled_by',
    reasonField: 'cancel_reason',
  },
})

export function inventoryOperationMutationReceiptMatches({
  item,
  previous,
  action,
  reason,
  actorID,
}) {
  const receipt = INVENTORY_OPERATION_MUTATION_RECEIPTS[action]
  return Boolean(
    receipt &&
    item?.id &&
    Number(item.id) === Number(previous?.id) &&
    Number(item.version) === Number(previous?.version) + 1 &&
    item.status === receipt.status &&
    Number(item[receipt.actorField]) === Number(actorID) &&
    (!receipt.reasonField ||
      String(item[receipt.reasonField] || '').trim() === reason.trim())
  )
}

function usesAdjustmentApproval(operation, action) {
  return (
    operation.operation_type === 'MANUAL_ADJUSTMENT' &&
    (action === 'submit' || action === 'post')
  )
}

async function executeManualAdjustmentTransition({
  operation,
  action,
  customerKey,
}) {
  const sourceParams = {
    ...(customerKey ? { customer_key: customerKey } : {}),
    inventory_operation_id: operation.id,
  }
  let processData
  if (action === 'submit') {
    try {
      processData = await startInventoryAdjustmentApprovalProcess({
        ...sourceParams,
        idempotency_key: `inventory-adjustment-approval/${operation.id}`,
      })
    } catch (error) {
      if (!isSourceBusinessActionResultUnknown(error)) throw error
      processData = await getInventoryAdjustmentApprovalProcess(sourceParams)
      if (!processData.process_context) throw error
    }
    if (processData.source_readback.status !== 'DRAFT') {
      return processData.source_readback
    }
  } else {
    processData = await getInventoryAdjustmentApprovalProcess(sourceParams)
  }
  const nodeKey =
    action === 'submit'
      ? 'submit_inventory_adjustment'
      : 'post_inventory_adjustment'
  const node = findExceptionProcessActiveNode(processData, nodeKey)
  const execute =
    action === 'submit'
      ? executeInventoryAdjustmentSubmit
      : executeInventoryAdjustmentPost
  const execution = await execute({
    ...sourceParams,
    process_instance_id: processData.process_context.process_instance.id,
    process_node_instance_id: node.id,
    expected_version: node.version,
    idempotency_key: `inventory-adjustment-${action}/${operation.id}/${node.id}`,
  })
  return execution.source_readback
}

async function readInventoryOperationAfterUnknownResult({
  operation,
  action,
  customerKey,
}) {
  if (usesAdjustmentApproval(operation, action)) {
    const process = await getInventoryAdjustmentApprovalProcess({
      ...(customerKey ? { customer_key: customerKey } : {}),
      inventory_operation_id: operation.id,
    }).catch(() => null)
    if (process?.source_readback) return process.source_readback
  }
  return getInventoryOperation({ id: operation.id }).catch(() => null)
}

export async function executeInventoryOperationTransition({
  operation,
  action,
  customerKey,
  reason = '',
  actorID,
}) {
  const matchesReceipt = (item) =>
    inventoryOperationMutationReceiptMatches({
      item,
      previous: operation,
      action,
      reason,
      actorID,
    })
  try {
    let next
    if (usesAdjustmentApproval(operation, action)) {
      next = await executeManualAdjustmentTransition({
        operation,
        action,
        customerKey,
      })
    } else {
      const transition = {
        post: postInventoryOperation,
        cancel: cancelInventoryOperation,
      }[action]
      if (!transition) return null
      next = await transition({
        id: operation.id,
        expected_version: operation.version,
        ...(reason ? { reason: reason.trim() } : {}),
      })
    }
    if (!matchesReceipt(next)) {
      throw Object.assign(new Error('库存作业结果暂时无法确认'), {
        isInvalidResponse: true,
      })
    }
    return { outcome: 'confirmed', operation: next, recovered: false }
  } catch (error) {
    if (!isSourceBusinessActionResultUnknown(error)) throw error
    const recovered = await readInventoryOperationAfterUnknownResult({
      operation,
      action,
      customerKey,
    })
    if (matchesReceipt(recovered)) {
      return { outcome: 'confirmed', operation: recovered, recovered: true }
    }
    if (recovered?.id) return { outcome: 'changed', operation: recovered }
    throw error
  }
}
