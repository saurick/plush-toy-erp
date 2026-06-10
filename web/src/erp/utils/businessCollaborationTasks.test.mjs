import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBusinessCollaborationTaskPanelModel,
  getBusinessCollaborationTaskReason,
  getBusinessCollaborationTaskUrgeMeta,
  isBusinessCollaborationTaskBlocking,
  isBusinessCollaborationTaskTerminal,
} from './businessCollaborationTasks.mjs'

const tasks = Object.freeze([
  {
    id: 1,
    task_name: '采购异常处理',
    task_status_key: 'blocked',
    owner_role_key: 'purchase',
    source_type: 'accessories-purchase',
    source_no: 'PO-001',
    payload: { blocked_reason: '供应商未确认回货日期' },
  },
  {
    id: 2,
    task_name: '财务应收登记',
    task_status_key: 'ready',
    owner_role_key: 'finance',
    source_type: 'shipment',
    source_no: 'SHIP-001',
    payload: {
      urged: true,
      urge_count: 2,
      last_urge_reason: '客户等开票资料',
    },
  },
  {
    id: 3,
    task_name: '仓库入库确认',
    task_status_key: 'done',
    owner_role_key: 'warehouse',
    source_type: 'inbound',
    source_no: 'IN-001',
    payload: {},
  },
])

test('businessCollaborationTasks: 当前记录协同从本页待办中排除并保留统计', () => {
  const model = buildBusinessCollaborationTaskPanelModel({
    tasks,
    selectedTasks: [tasks[1]],
  })

  assert.deepEqual(
    model.currentRecordTasks.map((task) => task.id),
    [2]
  )
  assert.deepEqual(
    model.pageTasks.map((task) => task.id),
    [1, 3]
  )
  assert.deepEqual(
    model.blockedTasks.map((task) => task.id),
    [1]
  )
  assert.deepEqual(
    model.doneTasks.map((task) => task.id),
    [3]
  )
  assert.equal(model.totalTaskCount, 3)
  assert.equal(model.activeTaskCount, 2)
  assert.equal(model.blockedTaskCount, 1)
})

test('businessCollaborationTasks: 阻塞原因按任务和 payload 顺序收口', () => {
  assert.equal(
    getBusinessCollaborationTaskReason(tasks[0]),
    '供应商未确认回货日期'
  )
  assert.equal(
    getBusinessCollaborationTaskReason({
      task_status_key: 'rejected',
      blocked_reason: '页面填写的阻塞原因',
      payload: { rejected_reason: '旧退回原因' },
    }),
    '页面填写的阻塞原因'
  )
})

test('businessCollaborationTasks: 催办态只读取 workflow payload 快照', () => {
  assert.deepEqual(getBusinessCollaborationTaskUrgeMeta(tasks[1]), {
    isUrged: true,
    urgeCount: 2,
    lastUrgeReason: '客户等开票资料',
  })
  assert.deepEqual(
    getBusinessCollaborationTaskUrgeMeta({ payload: { last_urge_at: 1 } }),
    {
      isUrged: true,
      urgeCount: 1,
      lastUrgeReason: '',
    }
  )
  assert.deepEqual(getBusinessCollaborationTaskUrgeMeta({ payload: {} }), {
    isUrged: false,
    urgeCount: 0,
    lastUrgeReason: '',
  })
})

test('businessCollaborationTasks: done 只是终态协同任务，不扩展成事实层完成', () => {
  assert.equal(isBusinessCollaborationTaskTerminal(tasks[2]), true)
  assert.equal(isBusinessCollaborationTaskBlocking(tasks[2]), false)
  assert.equal(isBusinessCollaborationTaskTerminal(tasks[0]), false)
  assert.equal(isBusinessCollaborationTaskBlocking(tasks[0]), true)
})

test('businessCollaborationTasks: 面板只展示前六条，避免撑开业务页局部入口', () => {
  const manyTasks = Array.from({ length: 8 }, (_, index) => ({
    id: `page-${index + 1}`,
    task_status_key: 'ready',
    payload: {},
  }))
  const model = buildBusinessCollaborationTaskPanelModel({
    tasks: manyTasks,
    selectedTasks: [],
  })

  assert.equal(model.totalTaskCount, 8)
  assert.equal(model.pageTasks.length, 6)
  assert.deepEqual(
    model.pageTasks.map((task) => task.id),
    ['page-1', 'page-2', 'page-3', 'page-4', 'page-5', 'page-6']
  )
})
