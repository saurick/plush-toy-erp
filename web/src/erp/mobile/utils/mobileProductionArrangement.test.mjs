import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveMobileProductionArrangementContext } from './mobileProductionArrangement.mjs'

function productionExceptionTask(overrides = {}) {
  const { payload: payloadOverrides = {}, ...taskOverrides } = overrides
  const sourceID = taskOverrides.source_id ?? 71
  const payload = {
    source_task_contract: 'workflow.source-task/v1',
    source_task_producer: 'production_rework.post',
    source_task_intent_hash: 'a'.repeat(64),
    production_fact_id: sourceID,
    production_order_id: 19,
    production_order_item_id: 23,
    production_order_no: 'PO-2026-0019',
    ...payloadOverrides,
  }
  return {
    source_id: sourceID,
    source_type: 'production-progress',
    task_code: `source-production-exception-${sourceID}`,
    task_group: 'production_exception',
    owner_role_key: 'production',
    ...taskOverrides,
    payload,
  }
}

test('trusted production exception exposes only its formal WIP anchors', () => {
  const context = resolveMobileProductionArrangementContext(
    productionExceptionTask()
  )

  assert.deepEqual(context, {
    productionFactID: 71,
    productionOrderID: 19,
    productionOrderItemID: 23,
    productionOrderNo: 'PO-2026-0019',
  })
  assert.equal(Object.isFrozen(context), true)
})

test('manual lookalikes and incomplete production anchors fail closed', () => {
  const invalidTasks = [
    productionExceptionTask({ task_code: 'manual-production-exception' }),
    productionExceptionTask({ owner_role_key: 'pmc' }),
    productionExceptionTask({
      payload: { source_task_intent_hash: 'not-a-trusted-intent' },
    }),
    productionExceptionTask({ payload: { production_fact_id: 72 } }),
    productionExceptionTask({ payload: { production_order_id: 0 } }),
    productionExceptionTask({ payload: { production_order_item_id: '23' } }),
  ]

  for (const task of invalidTasks) {
    assert.equal(resolveMobileProductionArrangementContext(task), null)
  }
})
