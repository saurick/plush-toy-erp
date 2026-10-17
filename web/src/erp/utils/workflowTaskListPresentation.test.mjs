import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWorkflowTaskListSource, getWorkflowTaskSourceNo } from './dashboardTaskDisplay.mjs'
import { getWorkflowTaskTiming } from './workflowTaskTiming.mjs'

test('模拟来源摘要只认正式标记，保留真实来源和缺值', () => {
  const formal = { task_name: '模拟资料复核', source_type: 'sales_order', source_no: 'SO-20261018-001' }
  assert.equal(formatWorkflowTaskListSource(formal), '销售订单 · SO-20261018-001')
  assert.equal(formatWorkflowTaskListSource({ ...formal, payload: { simulated_only: true } }), '模拟任务')
  assert.equal(formatWorkflowTaskListSource({ source_type: 'simulated-manual-acceptance-task-batch' }), '模拟任务')
  assert.equal(getWorkflowTaskSourceNo(formal), 'SO-20261018-001')
  assert.equal(formatWorkflowTaskListSource({ ...formal, display_context: { available: false } }), '关联单据已不可用')
})

test('截止风险文案合并不会改变截止时间、风险色或详细时间', () => {
  const task = { id: 1, owner_role_key: 'engineering', task_status_key: 'ready', created_at: 100, due_at: 200 }
  const options = { nowMs: 300000 }
  const full = getWorkflowTaskTiming(task, options)
  const merged = getWorkflowTaskTiming(task, { ...options, showDueRisk: false })
  assert.equal(full.find((row) => row.key === 'due').tone, 'danger')
  assert.match(full.find((row) => row.key === 'due').value, /已超时/u)
  assert.equal(merged.find((row) => row.key === 'due').tone, 'danger')
  assert.equal(merged.find((row) => row.key === 'due').dateTime, full.find((row) => row.key === 'due').dateTime)
  assert.doesNotMatch(merged.find((row) => row.key === 'due').value, /已超时/u)
  assert.ok(merged.some((row) => row.key === 'arrived'))
})
