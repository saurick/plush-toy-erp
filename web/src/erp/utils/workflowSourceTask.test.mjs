import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeShipmentReleaseTaskRequest,
  validateShipmentReleaseTaskResult,
} from './workflowSourceTask.mjs'

const INTENT_HASH = 'a'.repeat(64)

function sourceTask(overrides = {}) {
  return {
    id: 71,
    version: 1,
    task_code: 'source-shipment-release-23',
    task_group: 'shipment_release',
    task_status_key: 'ready',
    business_status_key: 'shipment_pending',
    owner_role_key: 'warehouse',
    source_type: 'shipments',
    source_id: 23,
    payload: {
      source_task_contract: 'workflow.source-task/v1',
      source_task_producer: 'shipment.submit_release',
      source_task_intent_hash: INTENT_HASH,
      shipment_id: 23,
    },
    ...overrides,
  }
}

test('shipment release source task request accepts only one positive shipment id', () => {
  assert.deepEqual(normalizeShipmentReleaseTaskRequest({ id: 23 }), { id: 23 })
  for (const request of [
    {},
    { id: 0 },
    { id: '23' },
    { id: 23, task_group: 'shipment_release' },
    null,
  ]) {
    assert.throws(() => normalizeShipmentReleaseTaskRequest(request), TypeError)
  }
})

test('shipment release source task result retains created and validates exact lineage', () => {
  const result = validateShipmentReleaseTaskResult(
    { workflow_task: sourceTask(), created: true },
    { id: 23 }
  )
  assert.equal(result.created, true)
  assert.equal(result.workflow_task.id, 71)
  assert.equal(Object.isFrozen(result), true)
})

test('shipment release source task result accepts legal replay task and business status pairs', () => {
  for (const [taskStatusKey, businessStatusKey] of [
    ['ready', 'shipment_pending'],
    ['ready', 'blocked'],
    ['blocked', 'blocked'],
    ['done', 'shipping_released'],
    ['rejected', 'blocked'],
  ]) {
    const result = validateShipmentReleaseTaskResult(
      {
        workflow_task: sourceTask({
          task_status_key: taskStatusKey,
          business_status_key: businessStatusKey,
        }),
        created: false,
      },
      { id: 23 }
    )
    assert.equal(result.workflow_task.task_status_key, taskStatusKey)
    assert.equal(result.workflow_task.business_status_key, businessStatusKey)
  }
})

test('shipment release source task result fails closed on spoofed or incomplete lineage', () => {
  const invalidResponses = [
    { workflow_task: sourceTask(), created: 'true' },
    {
      workflow_task: sourceTask({ task_code: 'source-shipment-release-24' }),
      created: true,
    },
    { workflow_task: sourceTask({ source_id: 24 }), created: true },
    {
      workflow_task: sourceTask({ owner_role_key: 'sales' }),
      created: true,
    },
    {
      workflow_task: sourceTask({ source_type: 'shipment' }),
      created: true,
    },
    {
      workflow_task: sourceTask({ task_group: 'shipping_release' }),
      created: true,
    },
    {
      workflow_task: sourceTask({
        payload: {
          source_task_contract: 'workflow.source-task/v1',
          source_task_producer: 'workflow.create_task',
          source_task_intent_hash: INTENT_HASH,
          shipment_id: 23,
        },
      }),
      created: true,
    },
    {
      workflow_task: sourceTask({
        payload: {
          source_task_contract: 'workflow.source-task/v1',
          source_task_producer: 'shipment.submit_release',
          source_task_intent_hash: INTENT_HASH,
          shipment_id: 24,
        },
      }),
      created: true,
    },
    {
      workflow_task: sourceTask({
        payload: {
          source_task_contract: 'workflow.source-task/v1',
          source_task_producer: 'shipment.submit_release',
          source_task_intent_hash: 'NOT-A-HASH',
          shipment_id: 23,
        },
      }),
      created: true,
    },
    {
      workflow_task: sourceTask({ task_status_key: 'pending' }),
      created: true,
    },
    {
      workflow_task: sourceTask({
        task_status_key: 'done',
        business_status_key: 'shipment_pending',
      }),
      created: false,
    },
    {
      workflow_task: sourceTask({
        business_status_key: 'blocked',
      }),
      created: true,
    },
    {
      workflow_task: sourceTask({
        task_status_key: 'done',
        business_status_key: 'shipping_released',
      }),
      created: true,
    },
  ]
  for (const response of invalidResponses) {
    assert.throws(
      () => validateShipmentReleaseTaskResult(response, { id: 23 }),
      (error) => error?.isInvalidResponse === true
    )
  }
  assert.throws(
    () =>
      validateShipmentReleaseTaskResult(
        { workflow_task: sourceTask(), created: true },
        null
      ),
    (error) => error?.isInvalidResponse === true
  )
})
