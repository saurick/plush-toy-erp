import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildBusinessCollaborationTaskPanelModel,
  filterBusinessCollaborationTasksBySource,
  getBusinessCollaborationTaskReason,
  getBusinessCollaborationTaskReasonLabel,
  getBusinessCollaborationTaskUrgeMeta,
  isBusinessCollaborationTaskBlocking,
  isBusinessCollaborationTaskTerminal,
  loadBusinessCollaborationTasksForSource,
  resolveBusinessCollaborationActionTask,
} from './businessCollaborationTasks.mjs'
import { createLatestRequestCoordinator } from '../hooks/useLatestRequestCoordinator.js'

const tasks = Object.freeze([
  {
    id: 1,
    task_name: '采购异常处理',
    task_status_key: 'blocked',
    owner_role_key: 'purchase',
    source_type: 'accessories-purchase',
    source_id: 1001,
    source_no: 'PO-001',
    payload: { blocked_reason: '供应商未确认回货日期' },
  },
  {
    id: 2,
    task_name: '财务应收登记',
    task_status_key: 'ready',
    owner_role_key: 'finance',
    source_type: 'shipment',
    source_id: 2001,
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
    source_id: 1001,
    source_no: 'IN-001',
    payload: {},
  },
])

function readERPSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function createDeferred() {
  let reject
  let resolve
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

test('businessCollaborationTasks: 当前记录面板只保留未结束任务', () => {
  const model = buildBusinessCollaborationTaskPanelModel({
    tasks,
  })

  assert.deepEqual(
    model.currentRecordTasks.map((task) => task.id),
    [1, 2]
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
  assert.equal(model.currentRecordTaskCount, 2)
  assert.equal(model.blockedTaskCount, 1)
  assert.equal(model.doneTaskCount, 1)
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
    '旧退回原因'
  )
  assert.equal(
    getBusinessCollaborationTaskReasonLabel({
      task_status_key: 'rejected',
      payload: { rejected_reason: '旧退回原因' },
    }),
    '退回原因'
  )
})

test('businessCollaborationTasks: 按 source_type 和 source_id 过滤当前业务记录协同', () => {
  assert.deepEqual(
    filterBusinessCollaborationTasksBySource({
      tasks,
      sourceType: 'accessories-purchase',
      sourceIDs: [1001],
    }).map((task) => task.id),
    [1]
  )

  assert.deepEqual(
    filterBusinessCollaborationTasksBySource({
      tasks,
      sourceType: 'accessories-purchase',
    }).map((task) => task.id),
    [1]
  )

  assert.deepEqual(
    filterBusinessCollaborationTasksBySource({
      tasks,
      sourceIDs: ['1001'],
    }).map((task) => task.id),
    [1, 3]
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

test('businessCollaborationTasks: done/rejected 是终态协同任务，不扩展成事实层完成', () => {
  assert.equal(isBusinessCollaborationTaskTerminal(tasks[2]), true)
  assert.equal(isBusinessCollaborationTaskBlocking(tasks[2]), false)
  assert.equal(isBusinessCollaborationTaskTerminal(tasks[0]), false)
  assert.equal(isBusinessCollaborationTaskBlocking(tasks[0]), true)
  const rejectedTask = {
    task_status_key: 'rejected',
    payload: { rejected_reason: '资料退回补充' },
  }
  assert.equal(isBusinessCollaborationTaskTerminal(rejectedTask), true)
  assert.equal(isBusinessCollaborationTaskBlocking(rejectedTask), true)
  assert.equal(getBusinessCollaborationTaskReason(rejectedTask), '资料退回补充')
})

test('businessCollaborationTasks: 面板只展示前六条，避免撑开业务页局部入口', () => {
  const manyTasks = Array.from({ length: 8 }, (_, index) => ({
    id: `page-${index + 1}`,
    task_status_key: 'ready',
    payload: {},
  }))
  const model = buildBusinessCollaborationTaskPanelModel({
    tasks: manyTasks,
  })

  assert.equal(model.totalTaskCount, 8)
  assert.equal(model.visibleLimit, 6)
  assert.equal(model.activeTaskCount, 8)
  assert.equal(model.currentRecordTaskCount, 8)
  assert.equal(model.currentRecordTasks.length, 6)
  assert.deepEqual(
    model.currentRecordTasks.map((task) => task.id),
    ['page-1', 'page-2', 'page-3', 'page-4', 'page-5', 'page-6']
  )
})

test('businessCollaborationTasks: 当前记录和阻塞视图保留真实总数与可见列表', () => {
  const recordTasks = Array.from({ length: 9 }, (_, index) => ({
    id: `current-${index + 1}`,
    task_status_key: index % 2 === 0 ? 'blocked' : 'ready',
    payload: {},
  }))
  const model = buildBusinessCollaborationTaskPanelModel({
    tasks: [
      ...recordTasks,
      {
        id: 'other-blocked',
        task_status_key: 'rejected',
        payload: {},
      },
    ],
  })

  assert.equal(model.currentRecordTaskCount, 9)
  assert.equal(model.currentRecordTasks.length, 6)
  assert.equal(model.blockedTaskCount, 5)
  assert.equal(model.blockedTasks.length, 5)
  assert.equal(model.doneTaskCount, 1)
  assert.deepEqual(
    model.currentRecordTasks.map((task) => task.id),
    [
      'current-1',
      'current-2',
      'current-3',
      'current-4',
      'current-5',
      'current-6',
    ]
  )
})

test('businessCollaborationTasks: 当前记录只有终态任务时没有可展示待办', () => {
  const model = buildBusinessCollaborationTaskPanelModel({
    tasks: [
      { id: 'done', task_status_key: 'done', payload: {} },
      { id: 'rejected', task_status_key: 'rejected', payload: {} },
    ],
  })

  assert.equal(model.activeTaskCount, 0)
  assert.equal(model.currentRecordTaskCount, 0)
  assert.equal(model.blockedTaskCount, 0)
  assert.equal(model.doneTaskCount, 2)
})

test('businessCollaborationTasks: 无读取权限时清空旧任务且不发起 RPC', async () => {
  const coordinator = createLatestRequestCoordinator()
  const loadStates = []
  let visibleTasks = [{ id: 'old' }]
  let rpcCalls = 0

  const result = await loadBusinessCollaborationTasksForSource({
    beginLatestRequest: coordinator.begin,
    canRead: false,
    listTasks: async () => {
      rpcCalls += 1
      return { tasks: [] }
    },
    setLoadState: (state) => loadStates.push(state),
    setTasks: (nextTasks) => {
      visibleTasks = nextTasks
    },
    sourceID: 1001,
    sourceType: 'accessories-purchase',
  })

  assert.deepEqual(result, { status: 'forbidden', tasks: [] })
  assert.equal(rpcCalls, 0)
  assert.deepEqual(visibleTasks, [])
  assert.deepEqual(loadStates, ['forbidden'])
})

test('businessCollaborationTasks: 请求失败不会回显旧任务并进入错误态', async () => {
  const coordinator = createLatestRequestCoordinator()
  const expectedError = new Error('workflow unavailable')
  const loadStates = []
  const visibleErrors = []
  let visibleTasks = [{ id: 'old' }]

  const result = await loadBusinessCollaborationTasksForSource({
    beginLatestRequest: coordinator.begin,
    canRead: true,
    listTasks: async () => {
      throw expectedError
    },
    onError: (error) => visibleErrors.push(error),
    setLoadState: (state) => loadStates.push(state),
    setTasks: (nextTasks) => {
      visibleTasks = nextTasks
    },
    sourceID: 1001,
    sourceType: 'accessories-purchase',
  })

  assert.equal(result.status, 'error')
  assert.equal(result.error, expectedError)
  assert.deepEqual(visibleTasks, [])
  assert.deepEqual(loadStates, ['loading', 'error'])
  assert.deepEqual(visibleErrors, [expectedError])
})

test('businessCollaborationTasks: 快速切换记录时迟到响应不能覆盖当前任务', async () => {
  const coordinator = createLatestRequestCoordinator()
  const requests = new Map([
    [1001, createDeferred()],
    [1002, createDeferred()],
  ])
  const requestSignals = new Map()
  const requestedParams = []
  const loadStates = []
  const visibleErrors = []
  let currentSourceID = 1001
  let visibleTasks = []

  const load = (sourceID) =>
    loadBusinessCollaborationTasksForSource({
      beginLatestRequest: coordinator.begin,
      canRead: true,
      isCurrentSource: (candidateSourceID) =>
        candidateSourceID === currentSourceID,
      listTasks: async (params, options) => {
        requestedParams.push(params)
        requestSignals.set(params.source_id, options.signal)
        return requests.get(params.source_id).promise
      },
      onError: (error) => visibleErrors.push(error),
      setLoadState: (state) => loadStates.push(state),
      setTasks: (nextTasks) => {
        visibleTasks = nextTasks
      },
      sourceID,
      sourceType: 'accessories-purchase',
    })

  const firstLoad = load(1001)
  currentSourceID = 1002
  const secondLoad = load(1002)

  assert.equal(requestSignals.get(1001)?.aborted, true)
  requests.get(1002).resolve({
    tasks: [{ id: 2, source_id: 1002, task_status_key: 'ready' }],
  })
  assert.equal((await secondLoad).status, 'ready')
  requests.get(1001).resolve({
    tasks: [{ id: 1, source_id: 1001, task_status_key: 'ready' }],
  })
  assert.equal((await firstLoad).status, 'stale')

  assert.deepEqual(requestedParams, [
    { source_type: 'accessories-purchase', source_id: 1001, limit: 200 },
    { source_type: 'accessories-purchase', source_id: 1002, limit: 200 },
  ])
  assert.deepEqual(visibleTasks, [
    { id: 2, source_id: 1002, task_status_key: 'ready' },
  ])
  assert.deepEqual(loadStates, ['loading', 'loading', 'ready'])
  assert.deepEqual(visibleErrors, [])
})

test('businessCollaborationTasks: 抽屉随最新活动任务同步并在终态时关闭', () => {
  const actionTask = { id: 7, version: 1, task_status_key: 'ready' }
  const refreshedTask = { id: 7, version: 2, task_status_key: 'blocked' }

  assert.equal(
    resolveBusinessCollaborationActionTask({
      actionTask,
      tasks: [refreshedTask],
    }),
    refreshedTask
  )
  assert.equal(
    resolveBusinessCollaborationActionTask({
      actionTask,
      tasks: [{ id: 7, version: 2, task_status_key: 'done' }],
    }),
    null
  )
  assert.equal(
    resolveBusinessCollaborationActionTask({ actionTask, tasks: [] }),
    null
  )
})

test('businessCollaborationTasks: 局部入口只保留采购和加工合同当前记录', () => {
  const supportedPages = [
    readERPSource('../pages/V1PurchaseOrdersPage.jsx'),
    readERPSource('../pages/V1OutsourcingOrdersPage.jsx'),
  ]
  const unsupportedPages = [
    readERPSource('../pages/V1MasterDataPage.jsx'),
    readERPSource('../pages/V1SalesOrdersPage.jsx'),
    readERPSource('../pages/BOMVersionsPage.jsx'),
    readERPSource('../pages/WorkflowBusinessModulePage.jsx'),
  ]

  for (const source of supportedPages) {
    assert.match(source, /<CollaborationTaskPanel/u)
    assert.match(source, /loadBusinessCollaborationTasksForSource\(\{/u)
    assert.match(source, /canRead: canReadWorkflowTasks/u)
    assert.match(source, /listTasks: listWorkflowTasks/u)
    assert.match(source, /sourceID: requestedSourceID/u)
    assert.match(
      source,
      /canReadWorkflowTasks && workflowTaskLoadState === 'ready'/u
    )
    assert.match(
      source,
      /onOpenTaskBoard=\{\(\) => navigate\('\/erp\/task-board'\)\}/u
    )
  }
  for (const source of unsupportedPages) {
    assert.doesNotMatch(source, /<CollaborationTaskPanel/u)
  }

  const workflowAPISource = readERPSource('../api/workflowApi.mjs')
  assert.match(
    workflowAPISource,
    /listWorkflowTasks\(params = \{\}, options = \{\}\)/u
  )
  assert.match(
    workflowAPISource,
    /workflowRpc\.call\('list_tasks', params, options\)/u
  )
})

test('businessCollaborationTasks: 当前记录无待办时不渲染固定零统计', () => {
  const source = readERPSource(
    '../components/business-list/CollaborationTaskPanel.jsx'
  )

  assert.match(
    source,
    /if \(!hasFocusedRecord \|\| taskPanelModel\.activeTaskCount === 0\) return null/u
  )
  assert.match(source, /<strong>当前记录任务<\/strong>/u)
  assert.match(source, /任务中心/u)
  assert.match(source, /label: '当前记录'/u)
  assert.match(source, /label: '阻塞异常'/u)
  assert.doesNotMatch(source, /本页待办/u)
})
