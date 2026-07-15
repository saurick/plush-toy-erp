import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
} from './dashboardTaskDisplay.mjs'

test('dashboardTaskDisplay: 任务来源类型使用业务可读标签', () => {
  assert.equal(getWorkflowTaskSourceTypeLabel('inbound'), '入库任务')
  assert.equal(getWorkflowTaskSourceTypeLabel('project-orders'), '销售订单')
  assert.equal(getWorkflowTaskSourceTypeLabel('unknown_source_key'), '业务来源')
  assert.equal(getWorkflowTaskSourceTypeLabel('', '全部模块'), '全部模块')
})

test('dashboardTaskDisplay: 未知来源不透出 source_type 原始 key', () => {
  assert.equal(
    formatWorkflowTaskSource({
      source_type: 'unknown_source_key',
      source_id: 88,
    }),
    '已关联业务来源'
  )
})

test('dashboardTaskDisplay: 内部任务号或 source_id fallback 不作为来源号展示', () => {
  assert.equal(
    formatWorkflowTaskSource({
      source_type: 'processing-contracts',
      source_id: 987,
      source_no: 'TASK-987',
    }),
    '委外订单 / 已关联业务来源'
  )
  assert.equal(
    formatWorkflowTaskSource({
      source_type: 'project-orders',
      source_id: 987,
      source_no: '987',
    }),
    '销售订单 / 已关联业务来源'
  )
  assert.equal(
    formatWorkflowTaskSource({
      source_type: 'project-orders',
      source_id: 987,
      source_no: 'SO-987',
    }),
    'SO-987'
  )
})

test('dashboardTaskDisplay: source_no 等于任务 ID 时不作为可见来源或查询关键词', () => {
  const task = {
    id: 66,
    source_type: 'project-orders',
    source_no: '66',
    payload: {
      entry_path: '/erp/sales/project-orders/sales-orders',
    },
  }

  assert.equal(formatWorkflowTaskSource(task), '销售订单 / 已关联业务来源')
  assert.equal(
    resolveWorkflowTaskEntryPath(task),
    '/erp/sales/project-orders/sales-orders?link_source=task-dashboard&link_fields=document_no%2Csource_no'
  )
})
