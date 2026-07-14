import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TERMINAL_TASK_STATUS_KEYS,
  getWorkflowTaskLifecycleStatusKey,
  isTerminalWorkflowTask,
} from './workflowTaskLifecycle.mjs'

test('workflowTaskLifecycle: rejected 与完成类状态统一视为生命周期终态', () => {
  assert.deepEqual([...TERMINAL_TASK_STATUS_KEYS], ['done', 'rejected'])
  assert.equal(isTerminalWorkflowTask({ task_status_key: 'rejected' }), true)
  assert.equal(isTerminalWorkflowTask({ task_status_key: 'blocked' }), false)
  for (const removedStatusKey of [
    'pending',
    'processing',
    'cancelled',
    'closed',
  ]) {
    assert.equal(
      isTerminalWorkflowTask({ task_status_key: removedStatusKey }),
      false
    )
  }
  assert.equal(getWorkflowTaskLifecycleStatusKey({}), '')
})
