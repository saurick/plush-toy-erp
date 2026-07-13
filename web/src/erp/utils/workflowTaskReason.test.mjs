import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
  getWorkflowTaskReasonMeta,
} from './workflowTaskReason.mjs'

test('workflowTaskReason: blocked/rejected 只读取当前异常状态的原因', () => {
  assert.deepEqual(
    getWorkflowTaskReasonMeta({
      task_status_key: 'blocked',
      payload: {
        blocked_reason: '等待版型确认',
        rejected_reason: '旧退回原因',
      },
    }),
    {
      kind: 'blocked',
      label: '阻塞原因',
      value: '等待版型确认',
    }
  )
  assert.equal(
    getWorkflowTaskReason({
      task_status_key: 'rejected',
      blocked_reason: '旧阻塞原因',
      payload: { rejected_reason: '资料不完整' },
    }),
    '资料不完整'
  )
  assert.equal(
    getWorkflowTaskReasonLabel({ task_status_key: 'rejected' }),
    '退回原因'
  )
})

test('workflowTaskReason: 非异常状态不读取旧阻塞或退回残值', () => {
  assert.deepEqual(
    getWorkflowTaskReasonMeta({
      task_status_key: 'ready',
      blocked_reason: '旧阻塞原因',
      payload: { rejected_reason: '旧退回原因' },
    }),
    { kind: '', label: '处理说明', value: '' }
  )
})

test('workflowTaskReason: done 优先展示普通完成说明且不标为异常', () => {
  assert.deepEqual(
    getWorkflowTaskReasonMeta({
      task_status_key: 'done',
      blocked_reason: '完成时遗留的旧值',
      payload: {
        rejected_reason: '旧退回原因',
        handling_note: '已核对尺寸并提交结果',
        completion_summary: '完成摘要',
        business_status_reason: '业务说明',
      },
    }),
    {
      kind: 'business',
      label: '处理说明',
      value: '已核对尺寸并提交结果',
    }
  )
  assert.equal(
    getWorkflowTaskReason({
      task_status_key: 'done',
      payload: { completion_summary: '已完成资料确认' },
    }),
    '已完成资料确认'
  )
})
