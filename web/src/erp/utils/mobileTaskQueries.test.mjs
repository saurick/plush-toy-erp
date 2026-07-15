import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MOBILE_ROLE_TASK_PAGE_LIMIT,
  MOBILE_ROLE_TASK_VIEW_KEYS,
  buildMobileRoleTaskQuery,
  createMobileRoleTaskScopeState,
  createMobileRoleTaskSlots,
  mergeMobileRoleTaskPage,
  readMobileRoleTaskScopeState,
  resolveMobileRoleTaskViewKey,
  resolveMobileRoleTaskViewState,
  settleMobileRoleTaskRequest,
} from './mobileTaskQueries.mjs'

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
  assert.deepEqual(Object.keys(slots).sort(), ['history', 'risk', 'todo'])
  assert.notEqual(slots.todo, slots.history)
  assert.notEqual(slots.history.items, slots.risk.items)
  for (const slot of Object.values(slots)) {
    assert.deepEqual(slot, {
      items: [],
      next_cursor: '',
      has_more: false,
      server_time: 0,
      loaded: false,
      loading: false,
      error: '',
    })
  }
})

test('mobileTaskQueries: todo、risk、history 使用各自数据且历史详情只读', () => {
  const todoTasks = [{ id: 1, task_status_key: 'ready' }]
  const riskTasks = [{ id: 2, task_status_key: 'blocked' }]
  const historyTasks = [{ id: 3, task_status_key: 'done' }]

  assert.deepEqual(
    resolveMobileRoleTaskViewState({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.TODO,
      todoTasks,
      historyTasks,
      riskTasks,
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
      selectedTaskID: 2,
    }),
    { tasks: riskTasks, selectedTask: riskTasks[0], actionsEnabled: true }
  )
  assert.deepEqual(
    resolveMobileRoleTaskViewState({
      viewKey: MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY,
      todoTasks,
      historyTasks,
      riskTasks,
      selectedTaskID: 3,
    }),
    {
      tasks: historyTasks,
      selectedTask: historyTasks[0],
      actionsEnabled: false,
    }
  )
})

test('mobileTaskQueries: 游标追加按任务 id 去重且不覆盖已加载项', () => {
  const firstPage = mergeMobileRoleTaskPage(undefined, {
    items: [
      { id: 350, task_name: 'A' },
      { id: 349, task_name: 'B' },
    ],
    next_cursor: 'page-2',
    has_more: true,
    server_time: 1_720_000_000,
  })
  const secondPage = mergeMobileRoleTaskPage(
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
  )

  assert.deepEqual(
    secondPage.items.map((task) => task.id),
    [350, 349, 348]
  )
  assert.equal(secondPage.items[1].task_name, 'B')
  assert.equal(secondPage.has_more, false)
  assert.equal(secondPage.loaded, true)
  assert.equal(secondPage.error, '')
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

test('mobileTaskQueries: 切角色、客户或 revision 时同步隐藏旧范围任务', () => {
  const currentScopeKey = 'sales|customer-a|revision-1|ready'
  const state = createMobileRoleTaskScopeState(currentScopeKey)
  state.slots.todo = mergeMobileRoleTaskPage(state.slots.todo, {
    items: [{ id: 1, task_name: '旧范围任务' }],
    next_cursor: 'page-2',
    has_more: true,
    server_time: 1_720_000_000,
  })

  for (const nextScopeKey of [
    'purchase|customer-a|revision-1|ready',
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
})
