import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
  resolveWorkflowTaskSourceEntryPath,
} from './dashboardTaskDisplay.mjs'
import { canOpenWorkflowTaskEntry } from './workflowTaskEntryAccess.mjs'

test('formatWorkflowTaskSource marks simulated task catalog as display-only', () => {
  assert.equal(
    formatWorkflowTaskSource({
      source_type: 'simulated-manual-acceptance-task-batch',
      source_no: 'SIM-001',
      payload: { simulated_only: true },
    }),
    '模拟任务批次'
  )
})

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
  assert.equal(getWorkflowTaskSourceTypeLabel('sales_order'), '销售订单')
  assert.equal(getWorkflowTaskSourceTypeLabel('purchase_order'), '采购订单')
  assert.equal(getWorkflowTaskSourceTypeLabel('rework_intake'), '返工回厂')
  assert.equal(
    getWorkflowTaskSourceTypeLabel('finance_payment'),
    '收付款与核销'
  )
  assert.equal(
    getWorkflowTaskSourceTypeLabel('inventory_operation'),
    '库存调整'
  )
  assert.equal(
    getWorkflowTaskSourceTypeLabel('production_exception_decision'),
    '生产异常处置'
  )
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
  assert.equal(
    formatWorkflowTaskSource({
      source_type: 'unknown_source_key',
      source_no: 'BIZ-88',
    }),
    '业务单据 · BIZ-88'
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
    '销售订单 · SO-987'
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

test('dashboardTaskDisplay: 正式逾期任务可精确打开后端已授权的相关单据', () => {
  const tasks = [
    [
      'rework_intake',
      81,
      '/erp/sales/rework-intakes?rework_intake_id=81&link_source=task-dashboard',
    ],
    [
      'finance_payment',
      82,
      '/erp/finance/payments?finance_payment_id=82&link_source=task-dashboard',
    ],
    [
      'inventory_operation',
      83,
      '/erp/warehouse/inventory?inventory_operation_id=83&link_source=task-dashboard',
    ],
    [
      'production_exception_decision',
      84,
      '/erp/production/exceptions?production_exception_id=84&link_source=task-dashboard',
    ],
  ]
  const sourceAccess = {
    applicable: true,
    resolved: true,
    allowed: true,
  }

  for (const [sourceType, sourceID, expected] of tasks) {
    const task = {
      task_status_key: 'ready',
      due_at: 1,
      source_type: sourceType,
      source_id: sourceID,
      config_revision: 'customer-revision-1',
      process_instance_id: 501,
      process_node_instance_id: 701,
    }
    const entryPath = resolveWorkflowTaskSourceEntryPath(task)

    assert.equal(entryPath, expected)
    assert.equal(resolveWorkflowTaskEntryPath(task), expected)
    assert.equal(
      canOpenWorkflowTaskEntry(
        { menus: [expected.split('?')[0]] },
        entryPath,
        sourceAccess
      ),
      true
    )
    assert.equal(
      resolveWorkflowTaskSourceEntryPath({
        source_type: sourceType,
        source_id: sourceID,
      }),
      '',
      'ordinary source_type/source_id pairs cannot create a related-document link'
    )
  }
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
  ]

  for (const [task, expected] of tasks) {
    assert.equal(resolveWorkflowTaskSourceEntryPath(task), expected)
    assert.equal(resolveWorkflowTaskEntryPath(task), expected)
  }
})

test('dashboardTaskDisplay: 出货财务审批只信任 ProcessRuntime 关联来源', () => {
  const processTask = {
    task_code: 'PROC-501-NODE-701-A1',
    task_group: 'shipment_finance_approval',
    owner_role_key: 'finance',
    source_type: 'shipment',
    source_id: 92,
    process_instance_id: 501,
    process_node_instance_id: 701,
    payload: {},
  }
  const expected =
    '/erp/warehouse/shipments?shipment_id=92&link_source=task-dashboard'
  assert.equal(resolveWorkflowTaskSourceEntryPath(processTask), expected)
  assert.equal(resolveWorkflowTaskEntryPath(processTask), expected)

  const retiredStandaloneTask = {
    task_code: 'source-shipment-release-92',
    task_group: 'shipment_release',
    owner_role_key: 'warehouse',
    source_type: 'shipments',
    source_id: 92,
    payload: {},
  }
  assert.equal(resolveWorkflowTaskSourceEntryPath(retiredStandaloneTask), '')
  assert.equal(
    resolveWorkflowTaskEntryPath(retiredStandaloneTask),
    '/erp/warehouse/shipments?link_source=task-dashboard&link_fields=document_no%2Csource_no'
  )
})
