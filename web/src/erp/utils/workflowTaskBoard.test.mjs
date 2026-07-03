import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowTaskBoardLanes,
  canRunWorkflowTaskAction,
  filterWorkflowTaskBoardTasks,
  getWorkflowTaskActionPermission,
  getWorkflowTaskAllowedActionModes,
  getWorkflowTaskBusinessStatusLabel,
  getWorkflowTaskCodeLabel,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
  getWorkflowTaskStatusMeta,
  hasActiveWorkflowTaskBoardFilters,
  readWorkflowTaskBoardFiltersFromSearch,
  TASK_BOARD_ROLE_OPTIONS,
  writeWorkflowTaskBoardFiltersToSearch,
} from './workflowTaskBoard.mjs'

const now = Math.floor(Date.now() / 1000)

const tasks = Object.freeze([
  {
    id: 1,
    task_name: '应收对账',
    task_status_key: 'ready',
    owner_role_key: 'finance',
    source_type: 'receivables',
    source_no: 'AR-001',
    due_at: now + 3600,
    payload: {},
  },
  {
    id: 2,
    task_name: '仓库入库确认',
    task_status_key: 'blocked',
    owner_role_key: 'warehouse',
    source_type: 'inbound',
    source_no: 'IN-001',
    due_at: now - 3600,
    payload: { blocked_reason: '库位未确认' },
  },
  {
    id: 3,
    task_name: '采购审批',
    task_status_key: 'done',
    owner_role_key: 'boss',
    source_type: 'accessories-purchase',
    source_no: 'PO-001',
    payload: {},
  },
])

test('workflowTaskBoard: ready 任务按待处理筛选', () => {
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(tasks, { status: 'pending' }).map(
      (task) => task.id
    ),
    [1]
  )
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(tasks, { role: 'finance' }).map(
      (task) => task.id
    ),
    [1]
  )
})

test('workflowTaskBoard: 支持关键词、来源和到期筛选', () => {
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(tasks, { keyword: '库位' }).map(
      (task) => task.id
    ),
    [2]
  )
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(tasks, { sourceType: 'inbound' }).map(
      (task) => task.id
    ),
    [2]
  )
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(tasks, { due: 'overdue' }).map(
      (task) => task.id
    ),
    [2]
  )
})

test('workflowTaskBoard: 状态文案和原因从任务或 payload 收口', () => {
  assert.deepEqual(getWorkflowTaskStatusMeta(tasks[0]), {
    label: '可执行',
    color: 'blue',
  })
  assert.deepEqual(
    getWorkflowTaskStatusMeta({
      task_status_key: 'unknown_task_status_key',
    }),
    {
      label: '未知状态',
      color: 'default',
    }
  )
  assert.equal(getWorkflowTaskReason(tasks[1]), '库位未确认')
  assert.equal(getWorkflowTaskReasonLabel(tasks[1]), '阻塞原因')
  assert.equal(
    getWorkflowTaskReason({
      task_status_key: 'rejected',
      payload: {
        blocked_reason: '旧阻塞原因',
        rejected_reason: '资料不完整',
      },
    }),
    '资料不完整'
  )
  assert.equal(
    getWorkflowTaskReasonLabel({
      task_status_key: 'rejected',
      payload: { rejected_reason: '资料不完整' },
    }),
    '退回原因'
  )
})

test('FL_workflow_business_status__retains_business_status_snapshot workflowTaskBoard: 业务状态使用统一字典且不透出内部 key', () => {
  assert.equal(
    getWorkflowTaskBusinessStatusLabel({
      business_status_key: 'shipping_released',
    }),
    '已放行待出库'
  )
  assert.equal(
    getWorkflowTaskBusinessStatusLabel({
      business_status_key: 'unknown_business_status_key',
    }),
    '未知业务状态'
  )
  assert.equal(
    getWorkflowTaskBusinessStatusLabel({
      business_status_key: 'shipping_released',
      payload: { business_status_label: '客户确认中' },
    }),
    '客户确认中'
  )
  assert.equal(getWorkflowTaskBusinessStatusLabel({}), '业务状态未记录')
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(
      [
        {
          id: 40,
          task_name: '出货放行确认',
          task_status_key: 'ready',
          owner_role_key: 'warehouse',
          business_status_key: 'shipping_released',
          payload: {},
        },
      ],
      { keyword: '已放行' }
    ).map((task) => task.id),
    [40]
  )
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(
      [
        {
          id: 41,
          task_name: '未知状态任务',
          task_status_key: 'ready',
          owner_role_key: 'warehouse',
          business_status_key: 'unknown_business_status_key',
          payload: {},
        },
      ],
      { keyword: 'unknown_business_status_key' }
    ).map((task) => task.id),
    []
  )
})

test('workflowTaskBoard: 责任角色展示和只读原因不透出 owner_role_key', () => {
  const warehouseTask = {
    id: 20,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    task_group: 'warehouse_inbound',
    source_type: 'inbound',
  }
  const salesAdmin = {
    id: 21,
    roles: [{ role_key: 'sales' }],
    permissions: ['workflow.task.read', 'workflow.task.complete'],
    effective_session: {
      actions: ['workflow.task.complete'],
    },
  }

  assert.equal(getWorkflowTaskOwnerRoleLabel(warehouseTask), '仓库')
  assert.equal(
    getWorkflowTaskOwnerRoleLabel({
      ...warehouseTask,
      owner_role_key: 'engineering',
    }),
    '工程'
  )
  assert.equal(
    getWorkflowTaskOwnerRoleLabel({
      ...warehouseTask,
      owner_role_key: 'unknown_role_key',
    }),
    '责任岗位'
  )

  const readonlyReason = getWorkflowTaskReadonlyReason(
    salesAdmin,
    warehouseTask
  )
  assert.match(readonlyReason, /仓库责任角色/)
  assert.doesNotMatch(readonlyReason, /warehouse/)
})

test('workflowTaskBoard: 角色筛选包含工程岗位并按 role key 过滤', () => {
  assert.deepEqual(
    TASK_BOARD_ROLE_OPTIONS.find((item) => item.value === 'engineering'),
    { value: 'engineering', label: '工程' }
  )
  assert.deepEqual(
    filterWorkflowTaskBoardTasks(
      [
        {
          id: 61,
          task_name: '工程资料补齐',
          task_status_key: 'ready',
          owner_role_key: 'engineering',
          source_type: 'material-bom',
        },
        {
          id: 62,
          task_name: '采购确认',
          task_status_key: 'ready',
          owner_role_key: 'purchase',
          source_type: 'purchase-orders',
        },
      ],
      { role: 'engineering' }
    ).map((task) => task.id),
    [61]
  )
})

test('workflowTaskBoard: 任务编号缺失时不拼内部 ID', () => {
  assert.equal(
    getWorkflowTaskCodeLabel({ id: 88, task_code: 'TASK-BIZ-001' }),
    'TASK-BIZ-001'
  )
  assert.equal(getWorkflowTaskCodeLabel({ id: 88 }), '任务已关联')
})

test('workflowTaskBoard: 生成原型式任务看板泳道并保留协同完成边界', () => {
  const lanes = buildWorkflowTaskBoardLanes(tasks)
  assert.deepEqual(
    lanes.map((lane) => [lane.key, lane.count]),
    [
      ['pending', 1],
      ['blocked', 1],
      ['due', 2],
      ['done', 1],
    ]
  )
  assert.equal(
    lanes.find((lane) => lane.key === 'pending')?.title,
    '可推进任务'
  )
  assert.match(lanes.find((lane) => lane.key === 'done')?.description, /协同/)
})

test('workflowTaskBoard: 从 URL 读取任务看板筛选并过滤非法值', () => {
  const filters = readWorkflowTaskBoardFiltersFromSearch(
    '?q=%E5%BA%93%E4%BD%8D&status=blocked&role=warehouse&due=overdue&source=inbound&unknown=1'
  )
  assert.deepEqual(filters, {
    keyword: '库位',
    status: 'blocked',
    role: 'warehouse',
    due: 'overdue',
    sourceType: 'inbound',
  })

  assert.deepEqual(
    readWorkflowTaskBoardFiltersFromSearch(
      '?status=bad&role=bad&due=bad&source='
    ),
    {
      keyword: '',
      status: 'all',
      role: 'all',
      due: 'all',
      sourceType: 'all',
    }
  )
  assert.equal(
    readWorkflowTaskBoardFiltersFromSearch('?role=engineering').role,
    'engineering'
  )
})

test('workflowTaskBoard: 写入 URL 时只保留非默认筛选并保留无关参数', () => {
  const params = writeWorkflowTaskBoardFiltersToSearch('page=1&status=done', {
    keyword: ' 入库 ',
    status: 'blocked',
    role: 'warehouse',
    due: 'all',
    sourceType: 'inbound',
  })

  assert.equal(
    params.toString(),
    'page=1&q=%E5%85%A5%E5%BA%93&status=blocked&role=warehouse&source=inbound'
  )

  const cleared = writeWorkflowTaskBoardFiltersToSearch(params, {
    keyword: '',
    status: 'all',
    role: 'all',
    due: 'all',
    sourceType: 'all',
  })
  assert.equal(cleared.toString(), 'page=1')
})

test('workflowTaskBoard: 可判断任务看板是否存在活跃筛选', () => {
  assert.equal(hasActiveWorkflowTaskBoardFilters({}), false)
  assert.equal(
    hasActiveWorkflowTaskBoardFilters({
      keyword: '',
      status: 'all',
      role: 'all',
      due: 'all',
      sourceType: 'all',
    }),
    false
  )
  assert.equal(hasActiveWorkflowTaskBoardFilters({ keyword: '入库' }), true)
  assert.equal(hasActiveWorkflowTaskBoardFilters({ role: 'warehouse' }), true)
  assert.equal(hasActiveWorkflowTaskBoardFilters({ role: 'bad' }), false)
})

test('workflowTaskBoard: 任务处理动作按权限码和 owner 角色收口', () => {
  const warehouseAdmin = {
    id: 7,
    roles: [{ role_key: 'warehouse' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.complete',
      'workflow.task.update',
    ],
    effective_session: {
      actions: ['workflow.task.complete', 'workflow.task.update'],
    },
  }
  const readOnlyAdmin = {
    id: 8,
    roles: [{ role_key: 'warehouse' }],
    permissions: ['workflow.task.read'],
    effective_session: {
      actions: [],
    },
  }
  const salesAdmin = {
    id: 9,
    roles: [{ role_key: 'sales' }],
    permissions: ['workflow.task.read', 'workflow.task.complete'],
    effective_session: {
      actions: ['workflow.task.complete'],
    },
  }
  const warehouseTask = {
    id: 10,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    task_group: 'finished_goods_inbound',
    source_type: 'production-progress',
  }

  assert.equal(
    canRunWorkflowTaskAction(warehouseAdmin, warehouseTask, 'complete'),
    true
  )
  assert.equal(
    canRunWorkflowTaskAction(warehouseAdmin, warehouseTask, 'reject'),
    true
  )
  assert.equal(
    getWorkflowTaskActionPermission('reject', warehouseTask),
    'workflow.task.update'
  )
  assert.deepEqual(
    getWorkflowTaskAllowedActionModes(warehouseAdmin, warehouseTask),
    ['complete', 'block', 'reject', 'urge']
  )
  assert.equal(
    canRunWorkflowTaskAction(readOnlyAdmin, warehouseTask, 'complete'),
    false
  )
  assert.equal(
    canRunWorkflowTaskAction(salesAdmin, warehouseTask, 'complete'),
    false
  )
  assert.deepEqual(
    getWorkflowTaskAllowedActionModes(readOnlyAdmin, warehouseTask),
    []
  )
  assert.match(
    getWorkflowTaskReadonlyReason(readOnlyAdmin, warehouseTask),
    /只有查看任务权限/
  )
  assert.match(
    getWorkflowTaskReadonlyReason(salesAdmin, warehouseTask),
    /不属于仓库责任角色/
  )
})

test('workflowTaskBoard: 审批类 done 使用 approve 权限，催办按 update 权限', () => {
  const approvalTask = {
    id: 11,
    task_status_key: 'ready',
    owner_role_key: 'boss',
    task_group: 'order_approval',
    source_type: 'project-orders',
  }
  const bossAdmin = {
    id: 12,
    roles: [{ key: 'boss' }],
    permissions: ['workflow.task.approve', 'workflow.task.update'],
    effective_session: {
      actions: ['workflow.task.approve', 'workflow.task.update'],
    },
  }
  const pmcAdmin = {
    id: 13,
    roles: [{ role_key: 'pmc' }],
    permissions: ['workflow.task.update'],
    effective_session: {
      actions: ['workflow.task.update'],
    },
  }

  assert.equal(
    getWorkflowTaskActionPermission('complete', approvalTask),
    'workflow.task.approve'
  )
  assert.equal(
    canRunWorkflowTaskAction(bossAdmin, approvalTask, 'complete'),
    true
  )
  assert.equal(canRunWorkflowTaskAction(pmcAdmin, approvalTask, 'urge'), true)
  assert.equal(
    canRunWorkflowTaskAction(
      bossAdmin,
      { ...approvalTask, task_status_key: 'done' },
      'complete'
    ),
    false
  )
})
