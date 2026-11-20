import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

test('exception cards keep current work visible and collapse complete task records without deriving closure', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Panel }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowExceptionPanel.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const tasks = ['ready', 'blocked', 'ready', 'done'].map((task_status_key, index) => ({
    id: index + 1,
    task_name: `处理事项 ${index + 1}`,
    task_status_key,
    owner_role_key: 'quality',
    discovery: { assignee_name: task_status_key === 'done' ? '' : '品质负责人', path: '订单履约 / 手工 / 检验' },
  }))
  const items = [
    { key: 'quality:1', number: 'EX-1', state: 'open', tasks, task_ids: tasks.map(({ id }) => id), orders: [] },
    { key: 'quality:2', number: 'EX-2', state: 'executing', tasks: [tasks[3]], task_ids: [4], orders: [] },
    { key: 'quality:3', number: 'EX-3', state: 'closed', tasks: [], task_ids: [], orders: [] },
    { key: 'quality:4', number: 'EX-4', state: 'executing', tasks: tasks.slice(0, 3), task_ids: [1, 2, 3, 4, 5], orders: [] },
    { key: 'quality:5', number: 'EX-5', state: 'open', tasks: [tasks[0]], task_ids: [1], orders: [] },
  ]
  JsonRpc.prototype.call = async (method) => {
    assert.equal(method, 'list_exceptions')
    return { data: { items, total: 5, view_total: 5, pending_tasks: 3, affected_orders: 0, open: 4, closed: 1, tasks: [], orders: [] } }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await act(async () => root.render(createElement(Panel, { compact: true, profile: { id: 1 }, onOpenTask() {} })))
  assert.deepEqual([...container.querySelectorAll('.erp-filter-chip__count')].map((node) => node.textContent), ['5', '4', '1'])
  const cards = [...container.querySelectorAll('.workflow-exceptions__item')]
  assert.equal(cards[0].querySelector('details').open, false)
  assert.equal(cards[0].querySelectorAll('.workflow-exceptions__pending button').length, 2)
  assert.match(cards[0].querySelector('.workflow-exceptions__pending').textContent, /品质负责人.*阻塞/su)
  assert.doesNotMatch(cards[0].querySelector('.workflow-exceptions__pending').textContent, /处理事项 4/u)
  assert.match(cards[0].querySelector('summary').textContent, /另有 1 项待办/u)
  assert.equal(cards[0].querySelectorAll('details button').length, 4)
  assert.equal(cards[1].querySelector('details').open, false)
  assert.equal(cards[1].querySelector('.workflow-exceptions__pending'), null)
  assert.doesNotMatch(cards[1].querySelector('details').textContent, /岗位待领取/u)
  assert.match(cards[1].querySelector('.ant-tag').textContent, /执行与复检中/u)
  assert.equal(cards[2].querySelector('details'), null)
  assert.match(cards[3].querySelector('summary').textContent, /另有至少 1 项待办/u)
  assert.match(cards[3].querySelector('details').textContent, /当前列出前 3 项/u)
  assert.equal(cards[4].querySelector('details'), null, '已展示全部当前待办时不再重复折叠区')
  assert.equal(cards[4].querySelectorAll('button').length, 1)
})

test('exception statistics drill into server-paginated details and abandon task reads after access changes', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Panel }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowExceptionPanel.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const task = { id: 12, task_name: '核对裁片异常', task_status_key: 'ready', owner_role_key: 'sales', discovery: { path: '订单履约 / 裁片 / 异常处置', assignee_name: '业务员' } }
  const calls = []
  let finishTask
  JsonRpc.prototype.call = async (method, params, options) => {
    calls.push({ method, params, options })
    if (method === 'get_task_board') throw new Error('no people fixture')
    if (method === 'get_task') return new Promise((resolve) => { finishTask = resolve })
    assert.equal(method, 'list_exceptions')
    return { data: { items: [], total: params.state === 'open' ? 40 : params.state === 'closed' ? 5 : 45, open: 40, closed: 5, pending_tasks: 32, affected_orders: 3, view_total: params.view === 'tasks' ? 32 : params.view === 'orders' ? 3 : params.state === 'open' ? 40 : params.state === 'closed' ? 5 : 45, tasks: params.view === 'tasks' ? [task] : [], orders: params.view === 'orders' ? [{ id: 2, number: 'SO-002' }] : [] } }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let opened = false
  const render = (id) => act(async () => root.render(createElement(Panel, { profile: { id }, initialQuery: { page: 2, keyword: '裁片', state: 'open' }, onOpenTask: () => { opened = true } })))
  const click = async (text) => act(async () => [...container.querySelectorAll('button, .ant-segmented-item')].find((button) => button.textContent.includes(text)).click())
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await render(1)
  assert.deepEqual([...container.querySelectorAll('.erp-filter-chip__count')].map((node) => node.textContent), ['45', '40', '5'], '全部数量不使用当前选中状态的 total')
  await click('关联待办')
  assert.equal(calls.findLast((call) => call.method === 'list_exceptions').params.view, 'tasks')
  assert.match(container.textContent, /核对裁片异常/u)
  assert.equal(container.querySelector('.workflow-exceptions__query'), null)
  assert.equal(container.querySelector('.workflow-exceptions__states'), null)
  assert.equal(calls.findLast((call) => call.method === 'list_exceptions').params.offset, 0)
  await click('返回异常跟踪')
  assert.equal(calls.findLast((call) => call.method === 'list_exceptions').params.offset, 20)
  assert.equal(calls.findLast((call) => call.method === 'list_exceptions').params.keyword, '裁片')
  await click('关联订单')
  assert.equal(calls.findLast((call) => call.method === 'list_exceptions').params.view, 'orders')
  assert.match(container.textContent, /SO-002/u)
  await click('返回异常跟踪')
  await click('关联待办')
  await click('核对裁片异常')
  const pending = calls.findLast((call) => call.method === 'get_task')
  await render(2)
  assert.equal(pending.options.signal.aborted, true)
  await act(async () => finishTask({ data: { task } }))
  assert.equal(opened, false)
})

test('exception refresh and continuous loading preserve results on failure and discard stale queries', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Panel }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowExceptionPanel.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  const items = Array.from({ length: 45 }, (_, index) => ({
    key: `quality:${index + 1}`, number: `EX-${index + 1}`, state: 'open', orders: [], tasks: [], task_ids: [], reason: '待复检',
  }))
  const data = (params) => ({
    items: params.state === 'closed' ? [] : items.slice(params.offset, params.offset + params.limit),
    tasks: [],
orders: [],
total: params.state === 'closed' ? 0 : 45,
view_total: params.state === 'closed' ? 0 : 45,
    open: 45,
closed: 0,
pending_tasks: 0,
affected_orders: 0,
  })
  let mode = 'pending'
  let finish
  JsonRpc.prototype.call = async (method, params, options) => {
    assert.equal(method, 'list_exceptions')
    calls.push({ params, options })
    if (mode === 'failure') throw new Error('unavailable')
    if (mode === 'pending') return new Promise((resolve) => { finish = () => resolve({ data: data(params) }) })
    return { data: data(params) }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let refresh
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await act(async () => root.render(createElement(Panel, {
    compact: true,
profile: { id: 1 },
    renderRefreshControl: ({ onRefresh }) => { refresh = onRefresh; return null },
  })))
  const count = () => container.querySelectorAll('.workflow-exceptions__item').length
  const counts = () => [...container.querySelectorAll('.erp-filter-chip__count')].map((node) => node.textContent)
  assert.deepEqual(counts(), ['—', '—', '—'], '尚未读回的统计不是零项')
  await act(async () => finish())
  mode = 'success'
  assert.deepEqual(counts(), ['45', '45', '0'])
  assert.equal(count(), 20)
  assert.equal(container.querySelectorAll('.ant-pagination').length, 0)
  mode = 'pending'
  let pending
  await act(async () => { pending = refresh({ append: true }) })
  const callCount = calls.length
  await act(async () => refresh({ append: true }))
  assert.equal(calls.length, callCount, '重复触底不重复请求')
  await act(async () => { finish(); await pending })
  assert.equal(count(), 40)
  mode = 'failure'
  await act(async () => refresh({ append: true }))
  assert.equal(count(), 40)
  assert.match(container.textContent, /已加载记录仍保留/u)
  await act(async () => refresh())
  assert.equal(count(), 40)
  assert.match(container.textContent, /已保留上次结果/u)
  assert.deepEqual(counts(), ['45', '45', '0'], '同一条件刷新失败保留上次统计')
  mode = 'success'
  calls.length = 0
  await act(async () => refresh())
  assert.deepEqual(calls.map(({ params }) => params.offset), [0, 20], '刷新重读已加载范围')
  assert.equal(count(), 40)
  assert.doesNotMatch(container.textContent, /已保留上次结果/u)
  await act(async () => refresh({ append: true }))
  assert.equal(count(), 45)
  assert.match(container.textContent, /已显示全部 45 条/u)
  mode = 'pending'
  await act(async () => { pending = refresh() })
  const stale = calls.at(-1)
  const finishStale = finish
  mode = 'success'
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.querySelector('.erp-filter-chip__label')?.textContent === '已处理完').click())
  assert.equal(stale.options.signal.aborted, true)
  assert.equal(count(), 0)
  assert.match(container.textContent, /当前条件下没有可跟踪的异常/u)
  await act(async () => { finishStale(); await pending })
  assert.equal(count(), 0, '过期刷新不能把旧异常带回新筛选')
  assert.deepEqual(counts(), ['45', '45', '0'], '选中零项状态仍保留其他状态数量')
  mode = 'failure'
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.querySelector('.erp-filter-chip__label')?.textContent === '全部异常').click())
  assert.deepEqual(counts(), ['—', '—', '—'], '新查询读取失败不能沿用其他条件的统计或显示零项')
})
