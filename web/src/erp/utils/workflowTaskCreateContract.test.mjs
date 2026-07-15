import assert from 'node:assert/strict'
import test from 'node:test'

import { requireWorkflowTaskCreateParams } from './workflowTaskCreateContract.mjs'

function baseParams(overrides = {}) {
  return {
    task_code: 'TASK-001',
    task_group: 'warehouse_inbound',
    task_name: '确认入库',
    source_type: 'purchase_receipt',
    source_id: 42,
    owner_role_key: 'warehouse',
    ...overrides,
  }
}

test('workflow task public create defaults to the only executable initial state', () => {
  const params = requireWorkflowTaskCreateParams(baseParams())
  assert.equal(params.task_status_key, 'ready')
  assert.equal(params.payload && typeof params.payload, 'object')

  assert.equal(
    requireWorkflowTaskCreateParams(
      baseParams({ task_status_key: ' ready ' })
    ).task_status_key,
    'ready'
  )
})

test('workflow task public create rejects non-initial states and lifecycle reason fields', () => {
  for (const taskStatusKey of [
    'pending',
    'processing',
    'blocked',
    'done',
    'rejected',
    'cancelled',
    'closed',
  ]) {
    assert.throws(
      () =>
        requireWorkflowTaskCreateParams(
          baseParams({ task_status_key: taskStatusKey })
        ),
      /新建任务只能从待处理状态开始/u
    )
  }

  assert.throws(
    () =>
      requireWorkflowTaskCreateParams(
        baseParams({ blocked_reason: '不应由创建入口写入' })
      ),
    /任务资料包含无法识别的内容/u
  )
})
