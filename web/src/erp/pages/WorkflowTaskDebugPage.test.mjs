import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORKFLOW_TASK_BINDING_ROWS,
  WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS,
  WORKFLOW_TASK_DEBUG_PATH,
  buildWorkflowTaskDebugView,
  buildWorkflowTaskVisibilityDiagnostics,
  normalizeWorkflowTaskEventRows,
} from './WorkflowTaskDebugPage.view.mjs'

const NOW_SEC = 1_800_000_000
const NOW_MS = NOW_SEC * 1000

function task(overrides = {}) {
  return {
    id: 1,
    task_code: 'TASK-001',
    task_name: '协同任务调试样例',
    task_group: 'shipment_release',
    source_type: 'shipping-release',
    source_id: 8,
    source_no: 'OUT-001',
    business_status_key: 'shipment_pending',
    task_status_key: 'blocked',
    owner_role_key: 'warehouse',
    assignee_id: 12,
    priority: 3,
    blocked_reason: '客户出货资料未确认',
    due_at: NOW_SEC - 60,
    payload: {
      complete_condition: '仓库确认出货资料和放行状态',
      related_documents: ['SO-001', 'OUT-001'],
      notification_type: 'shipment_risk',
      alert_type: 'shipment_due',
      critical_path: true,
      urge_count: 1,
      last_urge_at: NOW_SEC - 30,
      last_urge_reason: '客户催交',
      escalated: true,
      escalate_target_role_key: 'boss',
    },
    created_at: NOW_SEC - 3600,
    updated_at: NOW_SEC,
    ...overrides,
  }
}

test('WorkflowTaskDebugPage: 空任务数据可生成空视图', () => {
  const view = buildWorkflowTaskDebugView(
    [],
    WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS,
    {
      nowMs: NOW_MS,
    }
  )

  assert.equal(WORKFLOW_TASK_DEBUG_PATH, '/erp/qa/workflow-task-debug')
  assert.equal(view.summary.total, 0)
  assert.equal(view.summary.filtered, 0)
  assert.deepEqual(view.filteredRows, [])
})

test('WorkflowTaskDebugPage: 能按任务字段和诊断字段筛选结果', () => {
  const view = buildWorkflowTaskDebugView(
    [
      task(),
      task({
        id: 2,
        task_code: 'TASK-002',
        source_no: 'QC-001',
        source_type: 'quality-inspections',
        task_group: 'finished_goods_qc',
        task_status_key: 'ready',
        owner_role_key: 'quality',
        priority: 1,
        blocked_reason: '',
        due_at: NOW_SEC + 3600,
        payload: { alert_type: 'finished_goods_qc_pending' },
      }),
    ],
    {
      ...WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS,
      keyword: 'shipment',
      owner_role_key: 'warehouse',
      blocked: 'yes',
      overdue: 'yes',
      critical_path: 'yes',
      urged: 'yes',
      escalated: 'yes',
    },
    { nowMs: NOW_MS }
  )

  assert.equal(view.summary.total, 2)
  assert.equal(view.summary.filtered, 1)
  assert.equal(view.filteredRows[0].task_name, '协同任务调试样例')
  assert.equal(view.filteredRows[0].alert_level, 'critical')
})

test('WorkflowTaskDebugPage: 移动端诊断展示查询计划和可见性原因', () => {
  const view = buildWorkflowTaskDebugView([task()], {}, { nowMs: NOW_MS })
  const diagnostics = buildWorkflowTaskVisibilityDiagnostics(view.rows, {
    roleKey: 'boss',
    sourceNo: 'OUT-001',
    taskGroup: 'shipment_release',
    nowMs: NOW_MS,
  })

  assert.equal(diagnostics.queryPlan.strategy, 'full_list')
  assert.equal(diagnostics.rows.length, 1)
  assert.equal(diagnostics.rows[0].loaded_by_query_plan, true)
  assert.equal(diagnostics.rows[0].visible, true)
  assert(
    diagnostics.rows[0].reasons.some((item) => item.includes('shipment risk'))
  )
})

test('WorkflowTaskDebugPage: 事件轨迹兼容 list_tasks 未来返回 events', () => {
  const events = normalizeWorkflowTaskEventRows(
    task({
      events: [
        {
          id: 2,
          created_at: NOW_SEC,
          from_status_key: 'ready',
          to_status_key: 'blocked',
          actor_role_key: 'warehouse',
          reason: '资料缺失',
          payload: { action: 'block', note: '客户资料未到' },
        },
        {
          id: 1,
          created_at: NOW_SEC - 60,
          to_status_key: 'ready',
          actor_role_key: 'system',
          payload: { action: 'create_task' },
        },
      ],
    })
  )

  assert.deepEqual(
    events.map((event) => event.action),
    ['create_task', 'block']
  )
  assert.equal(events[1].note, '客户资料未到')
})

test('WorkflowTaskDebugPage: 绑定说明覆盖业务、任务、角色和事件', () => {
  assert.deepEqual(
    WORKFLOW_TASK_BINDING_ROWS.map((row) => row.object),
    ['业务单据', '业务状态', '协同任务', '角色池', '具体处理人', '事件留痕']
  )
})
