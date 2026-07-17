import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
  resolveWorkflowTaskSourceEntryPath,
} from './dashboardTaskDisplay.mjs'

const INTENT_HASH = 'b'.repeat(64)

test('dashboardTaskDisplay: 任务来源类型使用业务可读标签', () => {
  assert.equal(getWorkflowTaskSourceTypeLabel('inbound'), '入库任务')
  assert.equal(getWorkflowTaskSourceTypeLabel('project-orders'), '销售订单')
  assert.equal(getWorkflowTaskSourceTypeLabel('production-orders'), '生产订单')
  assert.equal(
    getWorkflowTaskSourceTypeLabel('production-progress'),
    '生产记录'
  )
  assert.equal(getWorkflowTaskSourceTypeLabel('shipments'), '出货单')
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

test('dashboardTaskDisplay: 流程运行态验证过的业务来源才使用 ID 精确定位', () => {
  const task = {
    source_type: 'PRODUCTION_ORDER',
    source_id: 73,
    source_no: 'PO-73',
    process_instance_id: 501,
    payload: { entry_path: '/erp/legacy/removed' },
  }

  assert.equal(
    resolveWorkflowTaskSourceEntryPath(task),
    '/erp/production/orders?production_order_id=73&link_source=task-dashboard'
  )
  assert.equal(
    resolveWorkflowTaskEntryPath(task),
    resolveWorkflowTaskSourceEntryPath(task)
  )
  assert.equal(
    resolveWorkflowTaskSourceEntryPath({
      source_type: 'shipping-release',
      source_id: 73,
      process_instance_id: 501,
    }),
    ''
  )
  assert.equal(
    resolveWorkflowTaskSourceEntryPath({
      source_type: 'production_order',
      source_id: 73,
    }),
    '',
    'generic tasks cannot prove that source_id is a production order id'
  )
})

test('dashboardTaskDisplay: 白名单来源任务不依赖流程实例也能精确返回源单', () => {
  const tasks = [
    [
      {
        task_code: 'source-production-scheduling-73',
        task_group: 'production_scheduling',
        owner_role_key: 'pmc',
        source_type: 'production-orders',
        source_id: 73,
        payload: {
          source_task_contract: 'workflow.source-task/v1',
          source_task_producer: 'production_order.release',
          source_task_intent_hash: INTENT_HASH,
          production_order_id: 73,
        },
      },
      '/erp/production/orders?production_order_id=73&link_source=task-dashboard',
    ],
    [
      {
        task_code: 'source-production-exception-81',
        task_group: 'production_exception',
        owner_role_key: 'production',
        source_type: 'production-progress',
        source_id: 81,
        payload: {
          source_task_contract: 'workflow.source-task/v1',
          source_task_producer: 'production_rework.post',
          source_task_intent_hash: INTENT_HASH,
          production_fact_id: 81,
        },
      },
      '/erp/production/progress?fact_id=81&link_source=task-dashboard',
    ],
    [
      {
        task_code: 'source-shipment-release-92',
        task_group: 'shipment_release',
        owner_role_key: 'warehouse',
        source_type: 'shipments',
        source_id: 92,
        payload: {
          source_task_contract: 'workflow.source-task/v1',
          source_task_producer: 'shipment.submit_release',
          source_task_intent_hash: INTENT_HASH,
          shipment_id: 92,
        },
      },
      '/erp/warehouse/shipments?shipment_id=92&link_source=task-dashboard',
    ],
  ]

  for (const [task, expected] of tasks) {
    assert.equal(resolveWorkflowTaskSourceEntryPath(task), expected)
    assert.equal(resolveWorkflowTaskEntryPath(task), expected)
  }
})

test('dashboardTaskDisplay: standalone 来源任务缺完整来源合同或被伪造时 fail closed', () => {
  const baseTask = {
    task_code: 'source-shipment-release-92',
    task_group: 'shipment_release',
    owner_role_key: 'warehouse',
    source_type: 'shipments',
    source_id: 92,
    process_instance_id: 501,
    payload: {
      entry_path: '/erp/warehouse/shipments',
      source_task_contract: 'workflow.source-task/v1',
      source_task_producer: 'shipment.submit_release',
      source_task_intent_hash: INTENT_HASH,
      shipment_id: 92,
    },
  }
  for (const task of [
    {
      ...baseTask,
      task_code: 'source-shipment-release-91',
    },
    {
      ...baseTask,
      owner_role_key: 'sales',
    },
    {
      ...baseTask,
      source_type: 'shipment',
    },
    {
      ...baseTask,
      payload: {
        ...baseTask.payload,
        source_task_contract: 'workflow.source-task/v2',
      },
    },
    {
      ...baseTask,
      source_id: 91,
    },
    {
      ...baseTask,
      payload: {
        ...baseTask.payload,
        shipment_id: 91,
      },
    },
    {
      ...baseTask,
      payload: {
        ...baseTask.payload,
        source_task_producer: 'workflow.create_task',
      },
    },
    {
      ...baseTask,
      payload: {
        ...baseTask.payload,
        source_task_intent_hash: 'B'.repeat(64),
      },
    },
    {
      ...baseTask,
      task_group: 'SHIPMENT_RELEASE',
    },
  ]) {
    assert.equal(resolveWorkflowTaskSourceEntryPath(task), '')
    assert.equal(resolveWorkflowTaskEntryPath(task), '')
  }
})
