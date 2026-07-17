const SOURCE_TASK_CONTRACT = 'workflow.source-task/v1'

const SOURCE_TASK_DEFINITIONS = Object.freeze({
  production_scheduling: Object.freeze({
    taskCodePrefix: 'source-production-scheduling-',
    sourceType: 'production-orders',
    producer: 'production_order.release',
    ownerRoleKey: 'pmc',
    businessStatusKey: 'production_ready',
    payloadSourceIDKey: 'production_order_id',
    entryPath: '/erp/production/orders',
    defaultTaskName: '安排生产订单',
  }),
  production_exception: Object.freeze({
    taskCodePrefix: 'source-production-exception-',
    sourceType: 'production-progress',
    producer: 'production_rework.post',
    ownerRoleKey: 'production',
    businessStatusKey: 'blocked',
    payloadSourceIDKey: 'production_fact_id',
    entryPath: '/erp/production/progress',
    defaultTaskName: '处理生产异常',
  }),
  shipment_release: Object.freeze({
    taskCodePrefix: 'source-shipment-release-',
    sourceType: 'shipments',
    producer: 'shipment.submit_release',
    ownerRoleKey: 'warehouse',
    businessStatusKey: 'shipment_pending',
    payloadSourceIDKey: 'shipment_id',
    entryPath: '/erp/warehouse/shipments',
    defaultTaskName: '确认出货放行',
  }),
})

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function normalizedText(value) {
  return String(value || '').trim()
}

export function createWorkflowSourceTaskFixture({
  taskGroup,
  sourceID,
  taskID = sourceID,
  sourceNo = '',
  taskName = '',
  intentHash = 'a'.repeat(64),
  payload = {},
  now = 1_750_000_000,
} = {}) {
  const definition = SOURCE_TASK_DEFINITIONS[normalizedText(taskGroup)]
  if (
    !definition ||
    !positiveSafeInteger(sourceID) ||
    !positiveSafeInteger(taskID) ||
    !/^[0-9a-f]{64}$/u.test(intentHash)
  ) {
    throw new TypeError('来源任务 fixture 参数无效')
  }
  const normalizedSourceNo = normalizedText(sourceNo)
  return {
    id: taskID,
    version: 1,
    task_code: `${definition.taskCodePrefix}${sourceID}`,
    task_group: taskGroup,
    task_name:
      normalizedText(taskName) ||
      `${definition.defaultTaskName}${normalizedSourceNo ? ` ${normalizedSourceNo}` : ''}`,
    source_type: definition.sourceType,
    source_id: sourceID,
    source_no: normalizedSourceNo,
    business_status_key: definition.businessStatusKey,
    task_status_key: 'ready',
    owner_role_key: definition.ownerRoleKey,
    owner_pool_key: definition.ownerRoleKey,
    required_capability_key: 'workflow.task.complete',
    assignee_id: '',
    priority: 2,
    blocked_reason: '',
    critical_path: true,
    due_at: null,
    payload: {
      source_task_contract: SOURCE_TASK_CONTRACT,
      source_task_producer: definition.producer,
      source_task_intent_hash: intentHash,
      [definition.payloadSourceIDKey]: sourceID,
      entry_path: definition.entryPath,
      notification_type: 'task_created',
      critical_path: true,
      ...payload,
    },
    created_at: now,
    updated_at: now,
  }
}

export function isMatchingShipmentReleaseFixture(task, shipmentID) {
  const definition = SOURCE_TASK_DEFINITIONS.shipment_release
  return Boolean(
    positiveSafeInteger(shipmentID) &&
      task?.task_code === `${definition.taskCodePrefix}${shipmentID}` &&
      task?.task_group === 'shipment_release' &&
      task?.source_type === definition.sourceType &&
      task?.source_id === shipmentID &&
      task?.owner_role_key === definition.ownerRoleKey &&
      task?.payload?.source_task_contract === SOURCE_TASK_CONTRACT &&
      task?.payload?.source_task_producer === definition.producer &&
      task?.payload?.shipment_id === shipmentID &&
      /^[0-9a-f]{64}$/u.test(
        String(task?.payload?.source_task_intent_hash || '')
      )
  )
}

export const workflowSourceTaskFixtureDefinitions = SOURCE_TASK_DEFINITIONS
