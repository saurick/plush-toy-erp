import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TASK_BOARD_FOCUS_PAGE_SIZE,
  TASK_BOARD_OVERVIEW_LIMIT,
  buildWorkflowTaskBoardModel,
  buildWorkflowTaskBoardRequest,
  getWorkflowTaskBoardRequestKey,
  canRunWorkflowTaskAction,
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
  resolveWorkflowTaskBoardResponseState,
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

test('workflowTaskBoard: 角色筛选包含工程岗位', () => {
  assert.deepEqual(
    TASK_BOARD_ROLE_OPTIONS.find((item) => item.value === 'engineering'),
    { value: 'engineering', label: '工程' }
  )
})

test('workflowTaskBoard: 任务编号缺失时不拼内部 ID', () => {
  assert.equal(
    getWorkflowTaskCodeLabel({ id: 88, task_code: 'TASK-BIZ-001' }),
    'TASK-BIZ-001'
  )
  assert.equal(getWorkflowTaskCodeLabel({ id: 88 }), '任务已关联')
})

test('workflowTaskBoard: 使用服务端互斥计数构建四个运营泳道', () => {
  const response = {
    snapshot_at: now,
    total: 12,
    counts: { actionable: 6, exception: 2, due: 3, finished: 1 },
    lanes: [
      {
        key: 'actionable',
        total: 6,
        limit: 5,
        offset: 0,
        tasks: Array.from({ length: 5 }, (_, index) => ({ id: index + 1 })),
      },
      {
        key: 'exception',
        total: 2,
        limit: 5,
        offset: 0,
        tasks: [{ id: 7 }, { id: 8 }],
      },
      {
        key: 'due',
        total: 3,
        limit: 5,
        offset: 0,
        tasks: [{ id: 9 }, { id: 10 }, { id: 11 }],
      },
      {
        key: 'finished',
        total: 1,
        limit: 5,
        offset: 0,
        tasks: [{ id: 12 }],
      },
    ],
    source_types: ['inbound', 'project-orders'],
  }
  const model = buildWorkflowTaskBoardModel(response)
  assert.deepEqual(
    model.lanes.map((lane) => [lane.key, lane.count]),
    [
      ['actionable', 6],
      ['exception', 2],
      ['due', 3],
      ['finished', 1],
    ]
  )
  assert.equal(model.lanes[0].title, '常规待办')
  assert.equal(model.lanes[0].tasks.length, TASK_BOARD_OVERVIEW_LIMIT)
  assert.equal(model.lanes[0].hiddenCount, 1)
  assert.equal(model.visibleLanes.length, 4)
  assert.deepEqual(model.sourceTypes, ['inbound', 'project-orders'])
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
    lane: 'all',
    page: 1,
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
      lane: 'all',
      page: 1,
    }
  )
  assert.equal(
    readWorkflowTaskBoardFiltersFromSearch('?role=engineering').role,
    'engineering'
  )
})

test('workflowTaskBoard: 写入 URL 时保留上下文并规范 lane/page', () => {
  const params = writeWorkflowTaskBoardFiltersToSearch('keep=1&page=9', {
    keyword: ' 入库 ',
    status: 'blocked',
    role: 'warehouse',
    due: 'all',
    sourceType: 'inbound',
    lane: 'exception',
    page: 2,
  })

  assert.equal(
    params.toString(),
    'keep=1&q=%E5%85%A5%E5%BA%93&status=blocked&role=warehouse&source=inbound&lane=exception&page=2'
  )

  const cleared = writeWorkflowTaskBoardFiltersToSearch(params, {
    keyword: '',
    status: 'all',
    role: 'all',
    due: 'all',
    sourceType: 'all',
    lane: 'all',
    page: 1,
  })
  assert.equal(cleared.toString(), 'keep=1')
})

test('workflowTaskBoard: 聚焦请求保留筛选并按每页八条计算 offset', () => {
  assert.deepEqual(
    buildWorkflowTaskBoardRequest({
      keyword: ' 包装 ',
      status: 'pending',
      role: 'warehouse',
      due: 'dueSoon',
      sourceType: 'inbound',
      lane: 'due',
      page: 3,
    }),
    {
      keyword: '包装',
      status: 'pending',
      owner_role_key: 'warehouse',
      due: 'dueSoon',
      source_type: 'inbound',
      lane_key: 'due',
      limit: TASK_BOARD_FOCUS_PAGE_SIZE,
      offset: 16,
    }
  )
  assert.deepEqual(buildWorkflowTaskBoardRequest({}), {
    limit: TASK_BOARD_OVERVIEW_LIMIT,
    offset: 0,
  })
})

test('workflowTaskBoard: lane/page 切换不会把上一请求响应交给新筛选建模', () => {
  const overviewRequest = buildWorkflowTaskBoardRequest({})
  const overviewResponse = {
    snapshot_at: now,
    total: 0,
    counts: { actionable: 0, exception: 0, due: 0, finished: 0 },
    lanes: ['actionable', 'exception', 'due', 'finished'].map((key) => ({
      key,
      total: 0,
      limit: 5,
      offset: 0,
      tasks: [],
    })),
    source_types: [],
  }
  const responseState = {
    requestKey: getWorkflowTaskBoardRequestKey(overviewRequest),
    response: overviewResponse,
  }

  assert.equal(
    resolveWorkflowTaskBoardResponseState(responseState, overviewRequest),
    overviewResponse
  )
  assert.equal(
    resolveWorkflowTaskBoardResponseState(
      responseState,
      buildWorkflowTaskBoardRequest({ lane: 'actionable', page: 1 })
    ),
    null
  )
  assert.equal(
    resolveWorkflowTaskBoardResponseState(
      responseState,
      buildWorkflowTaskBoardRequest({ lane: 'actionable', page: 2 })
    ),
    null
  )
})

test('workflowTaskBoard: 聚焦页保留服务端总数并把越界展示页收敛到末页', () => {
  const response = {
    snapshot_at: now,
    total: 18,
    counts: { actionable: 1, exception: 1, due: 15, finished: 1 },
    lanes: [
      {
        key: 'due',
        total: 15,
        limit: 8,
        offset: 16,
        tasks: [],
      },
    ],
    source_types: ['inbound'],
  }
  const model = buildWorkflowTaskBoardModel(response, {
    lane: 'due',
    page: 3,
  })

  assert.equal(model.focused, true)
  assert.equal(model.visibleLanes.length, 1)
  assert.equal(model.visibleLanes[0].count, 15)
  assert.equal(model.requestedPage, 3)
  assert.equal(model.pageCount, 2)
  assert.equal(model.page, 2)
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
      'workflow.task.reject',
    ],
    effective_session: {
      actions: [
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
      ],
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
    'workflow.task.reject'
  )
  assert.equal(
    canRunWorkflowTaskAction(
      {
        ...warehouseAdmin,
        permissions: ['workflow.task.read', 'workflow.task.update'],
        effective_session: { actions: ['workflow.task.update'] },
      },
      warehouseTask,
      'reject'
    ),
    false
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
