import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowTaskBoardLanes,
  canRunWorkflowTaskAction,
  filterWorkflowTaskBoardTasks,
  getWorkflowTaskActionPermission,
  getWorkflowTaskAllowedActionModes,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
  hasActiveWorkflowTaskBoardFilters,
  readWorkflowTaskBoardFiltersFromSearch,
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
  assert.equal(getWorkflowTaskReason(tasks[1]), '库位未确认')
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
    permissions: ['workflow.task.read', 'workflow.task.complete'],
  }
  const readOnlyAdmin = {
    id: 8,
    roles: [{ role_key: 'warehouse' }],
    permissions: ['workflow.task.read'],
  }
  const salesAdmin = {
    id: 9,
    roles: [{ role_key: 'sales' }],
    permissions: ['workflow.task.read', 'workflow.task.complete'],
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
    /不属于 warehouse/
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
  }
  const pmcAdmin = {
    id: 13,
    roles: [{ role_key: 'pmc' }],
    permissions: ['workflow.task.update'],
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
