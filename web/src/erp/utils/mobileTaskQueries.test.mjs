import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MOBILE_ROLE_TASK_PAGE_LIMIT,
  MOBILE_ROLE_TASK_VIEW_KEYS,
  buildMobileRoleTaskQuery,
  createMobileRoleTaskScopeState,
  createMobileRoleTaskSlots,
  isMobileRoleTaskHistoryScope,
  mergeMobileRoleTaskPage,
  readMobileRoleTaskLoadedCounts,
  readMobileRoleTaskScopedHistoryState,
  readMobileRoleTaskScopeState,
  reconcileMobileRoleTaskMutation,
  resolveMobileRoleTaskReceiptDetailTask,
  resolveMobileRoleTaskRestoreLimit,
  resolveMobileRoleTaskViewKey,
  resolveMobileRoleTaskViewState,
  settleMobileRoleTaskRequest,
} from './mobileTaskQueries.mjs'

function roleTaskCounts({
  ready = 0,
  blocked = 0,
  done = 0,
  rejected = 0,
  approval = 0,
  risk = 0,
  overdue = 0,
} = {}) {
  const todo = ready + blocked
  const history = done + rejected
  return {
    approval,
    blocked,
    done,
    history,
    overdue,
    ready,
    rejected,
    risk,
    todo,
    total: todo + history,
  }
}

test('mobileTaskQueries: 历史草稿只在完整访问范围一致时恢复', () => {
  const oldHistory = {
    mobileRoleTasksAction: 'done',
    mobileRoleTasksEvidence: '旧账号证据',
    mobileRoleTasksReason: '旧账号反馈',
    mobileRoleTasksScope: 'boss|access:account-a:revision-1|ready',
    mobileRoleTasksTaskID: 88,
  }
  assert.equal(
    isMobileRoleTaskHistoryScope(
      oldHistory,
      'boss|access:account-a:revision-1|ready'
    ),
    true
  )
  assert.equal(
    readMobileRoleTaskScopedHistoryState(
      oldHistory,
      'boss|access:account-b:revision-2|ready'
    ).mobileRoleTasksReason,
    undefined
  )
  assert.deepEqual(
    readMobileRoleTaskScopedHistoryState(
      oldHistory,
      'boss|access:account-b:revision-2|ready'
    ),
    {}
  )
})

test('mobileTaskQueries: 稀疏筛选按服务端已加载数量恢复深分页', () => {
  assert.deepEqual(
    readMobileRoleTaskLoadedCounts({ todo: 500, history: 25, bad: 900 }),
    { todo: 500, history: 25 }
  )
  assert.equal(
    resolveMobileRoleTaskRestoreLimit({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO,
      loadedCounts: { todo: 500 },
      visibleLimits: { 'todo:mine': 30 },
    }),
    500
  )
  assert.equal(
    resolveMobileRoleTaskRestoreLimit({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.RISK,
      loadedCounts: { risk: 2500 },
      visibleLimits: { 'messages:overdue': 30 },
    }),
    1000
  )
})

test('mobileTaskQueries: 回执详情快照必须匹配当前权限范围和选中任务', () => {
  const task = { id: 88, task_name: '可信终态任务', task_status_key: 'done' }
  const receipt = {
    action: 'done',
    scope_key: 'boss|access:revision-2|ready',
    status: 'confirmed',
    task,
  }
  assert.equal(
    resolveMobileRoleTaskReceiptDetailTask({
      receipt,
      scopeKey: receipt.scope_key,
      selectedTaskID: 88,
    }),
    task
  )
  for (const [scopeKey, selectedTaskID] of [
    ['boss|access:revision-1|ready', 88],
    [receipt.scope_key, 89],
  ]) {
    assert.equal(
      resolveMobileRoleTaskReceiptDetailTask({
        receipt,
        scopeKey,
        selectedTaskID,
      }),
      null
    )
  }
})

test('mobileTaskQueries: 岗位视图查询使用服务端游标合同', () => {
  assert.deepEqual(
    buildMobileRoleTaskQuery({ roleKey: ' pmc ', viewKey: 'risk' }),
    {
      view_key: 'risk',
      role_key: 'pmc',
      limit: MOBILE_ROLE_TASK_PAGE_LIMIT,
    }
  )
  assert.deepEqual(
    buildMobileRoleTaskQuery({
      roleKey: 'boss',
      viewKey: 'history',
      cursor: ' cursor-2 ',
      limit: 100,
    }),
    {
      view_key: 'history',
      role_key: 'boss',
      limit: 100,
      cursor: 'cursor-2',
    }
  )
})

test('mobileTaskQueries: 缺少岗位、非法视图和越界分页在发请求前拒绝', () => {
  assert.throws(
    () => buildMobileRoleTaskQuery({ viewKey: 'todo' }),
    /缺少岗位/u
  )
  assert.throws(
    () => buildMobileRoleTaskQuery({ roleKey: 'pmc', viewKey: 'all' }),
    /视图无效/u
  )
  for (const limit of [0, 101, 1.5, '50']) {
    assert.throws(
      () =>
        buildMobileRoleTaskQuery({ roleKey: 'pmc', viewKey: 'todo', limit }),
      /分页大小无效/u
    )
  }
})

test('mobileTaskQueries: 主标签和风险筛选映射到独立服务端视图', () => {
  assert.equal(
    resolveMobileRoleTaskViewKey({ mainTabKey: 'todo', filterKey: 'all' }),
    MOBILE_ROLE_TASK_VIEW_KEYS.TODO
  )
  assert.equal(
    resolveMobileRoleTaskViewKey({
      mainTabKey: 'todo',
      filterKey: 'approval',
    }),
    MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL
  )
  assert.equal(
    resolveMobileRoleTaskViewKey({ mainTabKey: 'done' }),
    MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY
  )
  assert.equal(
    resolveMobileRoleTaskViewKey({ mainTabKey: 'messages' }),
    MOBILE_ROLE_TASK_VIEW_KEYS.RISK
  )
  for (const filterKey of [
    'risk',
    'alert',
    'overdue',
    'due_soon',
    'high_priority',
    'blocked',
  ]) {
    assert.equal(
      resolveMobileRoleTaskViewKey({ mainTabKey: 'todo', filterKey }),
      MOBILE_ROLE_TASK_VIEW_KEYS.RISK
    )
  }
})

test('mobileTaskQueries: 每个岗位视图持有独立初始分页槽', () => {
  const slots = createMobileRoleTaskSlots()
  assert.deepEqual(Object.keys(slots).sort(), [
    'approval',
    'history',
    'risk',
    'todo',
  ])
  assert.notEqual(slots.todo, slots.history)
  assert.notEqual(slots.history.items, slots.risk.items)
  assert.notEqual(slots.approval.items, slots.todo.items)
  for (const slot of Object.values(slots)) {
    assert.deepEqual(slot, {
      items: [],
      next_cursor: '',
      has_more: false,
      server_time: 0,
      count_summary: null,
      loaded: false,
      loading: false,
      error: '',
    })
  }
  assert.equal(
    Object.hasOwn(createMobileRoleTaskScopeState('sales'), 'countSummary'),
    false
  )
})

test('mobileTaskQueries: todo、approval、risk、history 使用各自数据且历史详情只读', () => {
  const todoTasks = [{ id: 1, task_status_key: 'ready' }]
  const riskTasks = [{ id: 2, task_status_key: 'blocked' }]
  const historyTasks = [{ id: 3, task_status_key: 'done' }]
  const approvalTasks = [{ id: 4, task_status_key: 'ready' }]

  assert.deepEqual(
    resolveMobileRoleTaskViewState({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO,
      todoTasks,
      historyTasks,
      riskTasks,
      approvalTasks,
      selectedTaskID: 1,
    }),
    { tasks: todoTasks, selectedTask: todoTasks[0], actionsEnabled: true }
  )
  assert.deepEqual(
    resolveMobileRoleTaskViewState({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.RISK,
      todoTasks,
      historyTasks,
      riskTasks,
      approvalTasks,
      selectedTaskID: 2,
    }),
    { tasks: riskTasks, selectedTask: riskTasks[0], actionsEnabled: true }
  )
  assert.deepEqual(
    resolveMobileRoleTaskViewState({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL,
      todoTasks,
      historyTasks,
      riskTasks,
      approvalTasks,
      selectedTaskID: 4,
    }),
    {
      tasks: approvalTasks,
      selectedTask: approvalTasks[0],
      actionsEnabled: true,
    }
  )
  assert.deepEqual(
    resolveMobileRoleTaskViewState({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY,
      todoTasks,
      historyTasks,
      riskTasks,
      approvalTasks,
      selectedTaskID: 3,
    }),
    {
      tasks: historyTasks,
      selectedTask: historyTasks[0],
      actionsEnabled: false,
    }
  )
})

test('mobileTaskQueries: 游标追加遇到重复任务时拒绝混合快照', () => {
  const firstPage = mergeMobileRoleTaskPage(undefined, {
    items: [
      { id: 350, task_name: 'A' },
      { id: 349, task_name: 'B' },
    ],
    next_cursor: 'page-2',
    has_more: true,
    server_time: 1_720_000_000,
  })
  assert.throws(
    () =>
      mergeMobileRoleTaskPage(
        firstPage,
        {
          items: [
            { id: 349, task_name: 'duplicate' },
            { id: 348, task_name: 'C' },
          ],
          next_cursor: '',
          has_more: false,
          server_time: 1_720_000_000,
        },
        { append: true }
      ),
    (error) => error.isInvalidResponse === true && /重复/u.test(error.message)
  )
})

test('mobileTaskQueries: 多页可继续追加超过旧 200 条上限', () => {
  let slot
  for (let page = 0; page < 4; page += 1) {
    const start = 350 - page * 100
    const size = page === 3 ? 50 : 100
    slot = mergeMobileRoleTaskPage(
      slot,
      {
        items: Array.from({ length: size }, (_, index) => ({
          id: start - index,
        })),
        next_cursor: page < 3 ? `page-${page + 2}` : '',
        has_more: page < 3,
        server_time: 1_720_000_000,
      },
      { append: page > 0 }
    )
  }

  assert.equal(slot.items.length, 350)
  assert.equal(slot.items.at(-1).id, 1)
  assert.equal(slot.has_more, false)
})

test('mobileTaskQueries: 权威总数约束首屏与终页完整闭合', () => {
  const counts = roleTaskCounts({ ready: 2, blocked: 1, risk: 1 })
  assert.throws(
    () =>
      mergeMobileRoleTaskPage(
        undefined,
        {
          items: [{ id: 3 }],
          next_cursor: '',
          has_more: false,
          server_time: 1_720_000_000,
          counts,
          risk_scope: 'role',
        },
        { viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO }
      ),
    (error) =>
      error.isInvalidResponse === true && /分页结果异常/u.test(error.message)
  )

  const first = mergeMobileRoleTaskPage(
    undefined,
    {
      items: [{ id: 3 }, { id: 2 }],
      next_cursor: 'page-2',
      has_more: true,
      server_time: 1_720_000_000,
      counts,
      risk_scope: 'role',
    },
    { viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO }
  )
  const terminal = mergeMobileRoleTaskPage(
    first,
    {
      items: [{ id: 1 }],
      next_cursor: '',
      has_more: false,
      server_time: 1_720_000_000,
    },
    { append: true, viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO }
  )
  assert.equal(terminal.items.length, counts.todo)
  assert.deepEqual(terminal.count_summary, first.count_summary)
})

test('mobileTaskQueries: append 快照漂移时拒绝拼接并保留原分页槽', () => {
  const currentSlot = mergeMobileRoleTaskPage(undefined, {
    items: [{ id: 2, task_name: '已加载任务' }],
    next_cursor: 'page-2',
    has_more: true,
    server_time: 1_720_000_000,
  })
  const before = structuredClone(currentSlot)

  assert.throws(
    () =>
      mergeMobileRoleTaskPage(
        currentSlot,
        {
          items: [{ id: 1, task_name: '漂移快照任务' }],
          next_cursor: '',
          has_more: false,
          server_time: 1_720_000_001,
        },
        { append: true }
      ),
    (error) =>
      error.isInvalidResponse === true && /任务列表已更新/u.test(error.message)
  )
  assert.deepEqual(currentSlot, before)
})

test('mobileTaskQueries: append 拒绝重复游标，避免自动恢复无限请求', () => {
  const currentSlot = mergeMobileRoleTaskPage(undefined, {
    items: [{ id: 2 }],
    next_cursor: 'page-2',
    has_more: true,
    server_time: 1_720_000_000,
  })

  assert.throws(
    () =>
      mergeMobileRoleTaskPage(
        currentSlot,
        {
          items: [{ id: 1 }],
          next_cursor: 'page-2',
          has_more: true,
          server_time: 1_720_000_000,
        },
        { append: true }
      ),
    (error) =>
      error.isInvalidResponse === true && /分页结果异常/u.test(error.message)
  )
})

test('mobileTaskQueries: append 拒绝无新增任务的循环页', () => {
  const currentSlot = mergeMobileRoleTaskPage(undefined, {
    items: [{ id: 2 }],
    next_cursor: 'page-2',
    has_more: true,
    server_time: 1_720_000_000,
  })

  assert.throws(
    () =>
      mergeMobileRoleTaskPage(
        currentSlot,
        {
          items: [{ id: 2 }],
          next_cursor: 'page-3',
          has_more: true,
          server_time: 1_720_000_000,
        },
        { append: true }
      ),
    (error) => error.isInvalidResponse === true && /重复/u.test(error.message)
  )
})

test('mobileTaskQueries: 已确认动作原位更新深分页缓存且保留游标', () => {
  const scopeKey = 'sales|access-identity|ready'
  const state = createMobileRoleTaskScopeState(scopeKey)
  state.slots.todo = {
    items: Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      task_name: `任务 ${index + 1}`,
      task_status_key: 'ready',
    })),
    next_cursor: 'page-6',
    has_more: true,
    server_time: 1_720_000_000,
    count_summary: {
      counts: roleTaskCounts({ ready: 249, blocked: 1, risk: 1 }),
      risk_scope: 'role',
      server_time: 1_720_000_000,
    },
    loaded: true,
    loading: true,
    error: '旧错误',
  }
  state.slots.risk = {
    ...state.slots.risk,
    items: [{ id: 230, task_name: '风险缓存旧版本' }],
    count_summary: {
      counts: roleTaskCounts({ ready: 249, blocked: 1, risk: 1 }),
      risk_scope: 'role',
      server_time: 1_720_000_000,
    },
    loaded: true,
    loading: true,
  }

  const updated = reconcileMobileRoleTaskMutation(state, {
    scopeKey,
    viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO,
    canonicalTask: {
      id: 230,
      task_name: '任务 230 已阻塞',
      task_status_key: 'blocked',
      version: 2,
    },
    keepInViews: { todo: true, risk: true, history: false },
  })

  assert.equal(updated.slots.todo.items.length, 250)
  assert.equal(updated.slots.todo.items[229].task_name, '任务 230 已阻塞')
  assert.equal(updated.slots.todo.next_cursor, 'page-6')
  assert.equal(updated.slots.todo.has_more, true)
  assert.equal(updated.slots.todo.server_time, 1_720_000_000)
  assert.equal(updated.slots.todo.loading, false)
  assert.equal(updated.slots.todo.error, '')
  assert.equal(updated.slots.todo.count_summary, null)
  assert.equal(updated.slots.risk.loaded, false)
  assert.equal(updated.slots.risk.count_summary, null)
  assert.equal(updated.slots.risk.loading, false)
  assert.equal(updated.slots.risk.items[0].task_name, '任务 230 已阻塞')

  const completed = reconcileMobileRoleTaskMutation(updated, {
    scopeKey,
    viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO,
    canonicalTask: {
      id: 230,
      task_name: '任务 230 已完成',
      task_status_key: 'done',
      version: 3,
    },
    keepInActiveView: false,
    keepInViews: { todo: false, risk: false, history: true },
  })
  assert.equal(completed.slots.todo.items.length, 249)
  assert.equal(
    completed.slots.todo.items.some((task) => task.id === 230),
    false
  )
  assert.equal(completed.slots.todo.next_cursor, 'page-6')
  assert.equal(completed.slots.todo.has_more, true)
  assert.deepEqual(completed.slots.risk.items, [])
})

test('mobileTaskQueries: 九岗位切角色、客户或 revision 时同步隐藏旧范围任务', () => {
  const currentScopeKey = 'sales|customer-a|revision-1|ready'
  const state = createMobileRoleTaskScopeState(currentScopeKey)
  state.slots.todo = mergeMobileRoleTaskPage(state.slots.todo, {
    items: [{ id: 1, task_name: '旧范围任务' }],
    next_cursor: 'page-2',
    has_more: true,
    server_time: 1_720_000_000,
  })

  for (const nextScopeKey of [
    ...[
      'boss',
      'purchase',
      'pmc',
      'production',
      'warehouse',
      'quality',
      'finance',
      'engineering',
    ].map((roleKey) => `${roleKey}|customer-a|revision-1|ready`),
    'sales|customer-b|revision-1|ready',
    'sales|customer-a|revision-2|ready',
  ]) {
    const visible = readMobileRoleTaskScopeState(state, nextScopeKey)
    assert.equal(visible.scopeKey, nextScopeKey)
    assert.deepEqual(visible.slots.todo.items, [])
    assert.equal(visible.slots.todo.loaded, false)
  }
  assert.equal(state.slots.todo.items[0].task_name, '旧范围任务')
})

test('mobileTaskQueries: 旧范围或旧序号响应不能回填当前范围', () => {
  const state = createMobileRoleTaskScopeState(
    'purchase|customer-b|revision-2|ready'
  )
  const response = {
    items: [{ id: 2, task_name: '过期响应任务' }],
    next_cursor: '',
    has_more: false,
    server_time: 1_720_000_010,
  }

  const staleScope = settleMobileRoleTaskRequest(state, {
    currentScopeKey: state.scopeKey,
    requestScopeKey: 'sales|customer-a|revision-1|ready',
    viewKey: 'todo',
    currentRequestSeq: 3,
    requestSeq: 3,
    response,
  })
  assert.equal(staleScope, state)

  const staleSequence = settleMobileRoleTaskRequest(state, {
    currentScopeKey: state.scopeKey,
    requestScopeKey: state.scopeKey,
    viewKey: 'todo',
    currentRequestSeq: 4,
    requestSeq: 3,
    response,
  })
  assert.equal(staleSequence, state)
  assert.deepEqual(state.slots.todo.items, [])
})

test('mobileTaskQueries: 每个视图只保存自己的权威数量快照', () => {
  const scopeKey = 'sales|customer-a|revision-1|ready'
  const state = createMobileRoleTaskScopeState(scopeKey)
  const todoCounts = roleTaskCounts({
    ready: 348,
    blocked: 3,
    done: 5,
    rejected: 2,
    approval: 7,
    risk: 93,
    overdue: 61,
  })
  const first = settleMobileRoleTaskRequest(state, {
    currentScopeKey: scopeKey,
    requestScopeKey: scopeKey,
    viewKey: 'todo',
    currentRequestSeq: 1,
    requestSeq: 1,
    response: {
      items: [{ id: 351 }],
      next_cursor: 'page-2',
      has_more: true,
      server_time: 1_720_000_000,
      counts: todoCounts,
      risk_scope: 'role',
    },
  })
  assert.deepEqual(first.slots.todo.count_summary, {
    counts: todoCounts,
    risk_scope: 'role',
    server_time: 1_720_000_000,
  })
  assert.equal(first.slots.risk.count_summary, null)

  const appended = settleMobileRoleTaskRequest(first, {
    currentScopeKey: scopeKey,
    requestScopeKey: scopeKey,
    viewKey: 'todo',
    currentRequestSeq: 2,
    requestSeq: 2,
    append: true,
    response: {
      items: [{ id: 350 }],
      next_cursor: 'page-3',
      has_more: true,
      server_time: 1_720_000_000,
    },
  })
  assert.deepEqual(
    appended.slots.todo.count_summary,
    first.slots.todo.count_summary
  )

  const riskCounts = roleTaskCounts({
    ready: 4,
    blocked: 1,
    done: 2,
    risk: 3,
    overdue: 1,
  })
  const crossView = settleMobileRoleTaskRequest(appended, {
    currentScopeKey: scopeKey,
    requestScopeKey: scopeKey,
    viewKey: 'risk',
    currentRequestSeq: 1,
    requestSeq: 1,
    response: {
      items: [{ id: 7 }, { id: 6 }, { id: 5 }],
      next_cursor: '',
      has_more: false,
      server_time: 1_719_999_999,
      counts: riskCounts,
      risk_scope: 'supervised',
    },
  })
  assert.deepEqual(
    crossView.slots.todo.count_summary,
    first.slots.todo.count_summary
  )
  assert.deepEqual(crossView.slots.risk.count_summary, {
    counts: riskCounts,
    risk_scope: 'supervised',
    server_time: 1_719_999_999,
  })
})

test('mobileTaskQueries: 同范围刷新失败保留任务、游标和服务端时间', () => {
  const scopeKey = 'sales|customer-a|revision-1|ready'
  const state = createMobileRoleTaskScopeState(scopeKey)
  state.slots.todo = {
    ...mergeMobileRoleTaskPage(state.slots.todo, {
      items: [{ id: 3, task_name: '保留任务' }],
      next_cursor: 'page-2',
      has_more: true,
      server_time: 1_720_000_020,
    }),
    loading: true,
  }

  const failed = settleMobileRoleTaskRequest(state, {
    currentScopeKey: scopeKey,
    requestScopeKey: scopeKey,
    viewKey: 'todo',
    currentRequestSeq: 7,
    requestSeq: 7,
    errorMessage: '刷新任务失败，已保留上次数据',
  })
  assert.deepEqual(failed.slots.todo.items, state.slots.todo.items)
  assert.equal(failed.slots.todo.next_cursor, 'page-2')
  assert.equal(failed.slots.todo.has_more, true)
  assert.equal(failed.slots.todo.server_time, 1_720_000_020)
  assert.equal(failed.slots.todo.loaded, true)
  assert.equal(failed.slots.todo.loading, false)
  assert.equal(failed.slots.todo.error, '刷新任务失败，已保留上次数据')
  assert.equal(failed.slots.todo.count_summary, null)
})
