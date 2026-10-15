import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDesktopWorkflowTaskActionParams } from './desktopWorkflowTaskAction.mjs'

function task(requiredCapabilityKey = 'workflow.task.complete') {
  return {
    id: 465,
    version: 1,
    required_capability_key: requiredCapabilityKey,
  }
}

test('desktop completion places the exact formal decision on the complete payload', () => {
  assert.deepEqual(
    buildDesktopWorkflowTaskActionParams({
      task: task('warehouse.adjustment.approve'),
      actionMode: 'complete',
      reason: '  已核对库存调整依据  ',
      processDecision: {
        reason: '已核对库存调整依据',
      },
    }),
    {
      task_id: 465,
      expected_version: 1,
      action_key: 'complete',
      reason: '已核对库存调整依据',
      payload: {
        surface_key: 'desktop_task_board',
        process_decision: {
          reason: '已核对库存调整依据',
        },
      },
    }
  )
})

test('desktop production completion canonicalizes exact approved quantity', () => {
  assert.deepEqual(
    buildDesktopWorkflowTaskActionParams({
      task: task('production.exception.approve'),
      actionMode: 'complete',
      reason: '批准返工',
      processDecision: {
        reason: '批准返工',
        approved_quantity: '8.250000',
      },
    }).payload.process_decision,
    {
      reason: '批准返工',
      approved_quantity: '8.25',
    }
  )
})

test('desktop non-completion actions reject a leaked process decision', () => {
  for (const actionMode of ['block', 'reject', 'resume', 'urge', 'assign']) {
    assert.throws(
      () =>
        buildDesktopWorkflowTaskActionParams({
          task: task('warehouse.adjustment.approve'),
          actionMode,
          reason: '不应携带审批决策',
          assignmentTarget: actionMode === 'assign' ? 'pool' : undefined,
          processDecision: {
            reason: '不应携带审批决策',
          },
        }),
      /当前任务操作参数已失效/u
    )
  }
})

test('desktop regular completion, urge and assignment keep distinct exact contracts', () => {
  assert.deepEqual(
    buildDesktopWorkflowTaskActionParams({
      task: task(),
      actionMode: 'complete',
      reason: '',
    }),
    {
      task_id: 465,
      expected_version: 1,
      action_key: 'complete',
      payload: {
        surface_key: 'desktop_task_board',
      },
    }
  )
  assert.deepEqual(
    buildDesktopWorkflowTaskActionParams({
      task: task(),
      actionMode: 'urge',
      reason: '请尽快处理',
    }),
    {
      task_id: 465,
      expected_version: 1,
      action: 'urge_task',
      reason: '请尽快处理',
      payload: {
        surface_key: 'desktop_task_board',
      },
    }
  )
  assert.deepEqual(
    buildDesktopWorkflowTaskActionParams({
      task: task(),
      actionMode: 'assign',
      reason: '交回共同待办',
      assignmentTarget: 'pool',
    }),
    {
      task_id: 465,
      expected_version: 1,
      assignee_id: null,
      reason: '交回共同待办',
    }
  )
})
