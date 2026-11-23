import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('tracking tab and session changes cancel older reads and never restore stale rows', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { MemoryRouter }, { default: Panel }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./WorkflowTrackingPanel.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  JsonRpc.prototype.call = (method, params, options) => new Promise((resolve) => {
    assert.equal(method, 'list_tracking')
    calls.push({ params, signal: options.signal, resolve })
  })
  const node = document.createElement('div')
  document.body.appendChild(node)
  const root = createRoot(node)
  const render = (scope, sessionKey = 'session-one') => act(async () => root.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Panel, { scope, sessionKey, refreshKey: 0 }))))
  const response = (title) => ({ data: {
    items: [{ kind: 'task', id: 1, process_key: '', title, source_type: 'sales_order', source_id: 1, source_no: 'SO-TRACK', display_context: null, status: 'done', resolution_kind: null, started_at: 1791367200, updated_at: 1791367200, completed_at: 1791367200, initiator_name: '业务', initiator_role_key: 'sales', current_tasks: [] }],
    total: 1,
    status_counts: { completed: 1 },
    limit: 20,
    offset: 0,
  } })
  t.after(async () => {
    await act(async () => root.unmount())
    node.remove(); JsonRpc.prototype.call = original; dom.restore()
  })
  await render('started')
  await render('participated')
  assert.equal(calls[0].signal.aborted, true)
  await act(async () => calls[1].resolve(response('本次参与记录')))
  await act(async () => calls[0].resolve(response('过期发起记录')))
  assert.match(node.textContent, /本次参与记录/)
  assert.doesNotMatch(node.textContent, /过期发起记录/)
  await render('participated', 'session-two')
  assert.equal(calls[1].signal.aborted, true)
  assert.doesNotMatch(node.textContent, /本次参与记录/)
  await act(async () => calls[2].resolve(response('新账号记录')))
  assert.match(node.textContent, /新账号记录/)
})

test('tracking pagination cancels stale pages, retries the requested page and corrects a shrinking total', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { MemoryRouter, useNavigate, useLocation }, { default: Panel }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./WorkflowTrackingPanel.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  let navigate
  let location
  function Probe() {
    navigate = useNavigate()
    location = useLocation()
    return createElement(Panel, { scope: 'started', sessionKey: 'session', refreshKey: 0 })
  }
  JsonRpc.prototype.call = (method, params, options) => new Promise((resolve, reject) => {
    assert.equal(method, 'list_tracking')
    calls.push({ params, signal: options.signal, resolve, reject })
  })
  const node = document.createElement('div')
  document.body.appendChild(node)
  const root = createRoot(node)
  const respond = (call, total, title) => act(async () => call.resolve({ data: {
    total,
    status_counts: { completed: total },
    limit: call.params.limit,
    offset: call.params.offset,
    items: Array.from({ length: Math.max(0, Math.min(call.params.limit, total - call.params.offset)) }, (_, i) => ({
      kind: 'task', id: call.params.offset + i + 1, process_key: '', title: `${title}-${i}`, source_type: 'sales_order', source_id: 1, source_no: 'SO-TRACK', display_context: null, status: 'done', resolution_kind: null, started_at: 1791367200, updated_at: 1791367200, completed_at: 1791367200, initiator_name: '业务', initiator_role_key: 'sales', current_tasks: [],
    })),
  } }))
  const go = (page) => act(async () => navigate(`?track_page_started=${page}`))
  t.after(async () => {
    await act(async () => root.unmount())
    node.remove(); JsonRpc.prototype.call = original; dom.restore()
  })
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/?track_page_started=2'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Probe))))
  assert.equal(calls[0].params.offset, 20)
  await respond(calls[0], 25, '第二页')
  assert.match(node.textContent, /第二页-4/)
  await go(1)
  await go(2)
  assert.equal(calls[1].signal.aborted, true)
  await respond(calls[2], 25, '当前页')
  await respond(calls[1], 25, '过期页')
  assert.match(node.textContent, /当前页-4/)
  assert.doesNotMatch(node.textContent, /过期页/)
  await go(1)
  await act(async () => calls[3].reject(new Error('temporarily unavailable')))
  assert.match(node.textContent, /任务进度加载失败/)
  const retry = [...node.querySelectorAll('button')].find((button) => button.textContent.includes('重新读取'))
  await act(async () => retry.click())
  assert.equal(calls[4].params.offset, 0)
  await respond(calls[4], 25, '重试页')
  assert.match(node.textContent, /重试页-19/)
  await go(3)
  await respond(calls[5], 21, '范围缩小')
  assert.equal(calls[6].params.offset, 20)
  assert.equal(new URLSearchParams(location.search).get('track_page_started'), '2')
  await respond(calls[6], 21, '最后一页')
  assert.match(node.textContent, /最后一页-0/)
  assert.equal(node.querySelectorAll('.erp-workflow-tracking-entry').length, 1)
  await go(5)
  await respond(calls[7], 0, '全部移出')
  assert.equal(calls[8].params.offset, 0)
  await respond(calls[8], 0, '无记录')
  assert.equal(new URLSearchParams(location.search).get('track_page_started'), '1')
  assert.match(node.textContent, /暂无你发起的流程记录/)
})

test('tracking scopes keep their names and clearing a source reloads the current filters from the first page', async (t) => {
  const calls = []
  const harness = await businessFormHarness(t, { rpc: (method, params, options) => {
    assert.equal(method, 'list_tracking')
    calls.push({ params, signal: options.signal })
    return { data: {
      total: 100,
      status_counts: { completed: 100 },
      limit: params.limit,
      offset: params.offset,
      items: Array.from({ length: params.limit }, (_, index) => ({
        kind: 'task',
        id: params.offset + index + 1,
        process_key: '',
        title: params.source_id ? '单据范围内记录' : '全部范围记录',
        source_type: 'sales_order',
        source_id: 12,
        source_no: 'SO-TRACK',
        display_context: null,
        status: 'done',
        resolution_kind: null,
        started_at: 1791367200,
        updated_at: 1791367200,
        completed_at: 1791367200,
        initiator_name: '业务',
        initiator_role_key: 'sales',
        current_tasks: [],
      })),
    } }
  } })
  const [{ MemoryRouter, useSearchParams }, { default: Panel }] = await Promise.all([
    import('react-router-dom'), import('./WorkflowTrackingPanel.jsx'),
  ])
  let search
  function Probe() {
    const [params, setParams] = useSearchParams()
    search = params
    return createElement(Panel, {
      scope: params.get('tracking'),
      sessionKey: 'session',
      refreshKey: 0,
      onScopeChange: (scope) => setParams((current) => {
        const next = new URLSearchParams(current)
        next.set('tracking', scope)
        return next
      }),
    })
  }
  const initial = '/?tracking=visible&track_source_type=sales_order&track_source_id=12&track_page_visible=2&track_page_started=3&track_page_participated=4&track_search_visible=小熊&track_owner_role_key_visible=engineering&track_search_started=保留其他范围'
  await harness.render(createElement(MemoryRouter, { initialEntries: [initial], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Probe)))
  assert.equal(calls.at(-1).params.offset, 20)
  const scopes = () => document.querySelector('[role="group"][aria-label="跟踪范围"]')
  assert.deepEqual([...scopes().querySelectorAll('button')].map((button) => button.textContent), ['相关流程', '我发起的', '我参与的'])
  const choose = (label) => harness.click([...scopes().querySelectorAll('button')].find((button) => button.textContent === label))
  await choose('我发起的')
  assert.equal(calls.at(-1).params.scope, 'started')
  assert.equal(calls.at(-1).params.source_id, 12)
  assert.equal(calls.at(-1).params.offset, 40)
  await choose('相关流程')
  assert.equal(calls.at(-1).params.scope, 'visible')
  assert.equal(calls.at(-1).params.source_id, 12)
  assert.equal(calls.at(-1).params.offset, 20)
  assert.equal(Boolean(document.querySelector('[role="dialog"][aria-label="筛选条件"]')), false)
  const scopedRequest = calls.at(-1)
  await harness.click(harness.button('清除单据范围'))
  assert.equal(scopedRequest.signal.aborted, true)
  assert.deepEqual(calls.at(-1).params, { scope: 'visible', record_type: 'flow', keyword: '小熊', owner_role_key: 'engineering', limit: 20, offset: 0 })
  assert.equal(search.has('track_source_type'), false)
  assert.equal(search.has('track_source_id'), false)
  for (const scope of ['visible', 'started', 'participated']) assert.equal(search.has(`track_page_${scope}`), false)
  assert.equal(search.get('track_search_started'), '保留其他范围')
  assert.equal(harness.button('清除单据范围'), undefined)
  assert.match(document.querySelector('.erp-workflow-tracking-panel').textContent, /全部范围记录/u)
})

test('tracking rows pair each current task with its actual handoff and show historical results once', async (t) => {
  const startedAt = 1791367200
  const summary = {
    kind: 'process',
process_key: 'sales_order_acceptance',
title: '',
source_type: 'sales_order',
    source_id: 12,
source_no: 'SO-FIRST',
display_context: null,
started_at: startedAt,
    updated_at: startedAt,
completed_at: null,
resolution_kind: null,
initiator_name: '发起人甲',
initiator_role_key: '',
  }
  const current = { node_instance_id: 20, status: 'ready', created_at: startedAt, completed_at: null, due_at: null }
  const items = [
    { ...summary,
id: 1,
status: 'blocked',
current_tasks: [
      { ...current, task_id: 21, task_name: '核对材料', owner_role_key: 'engineering', assignee_name: '工程小李' },
      { ...current, task_id: 22, task_name: '仓库点数', owner_role_key: 'warehouse', assignee_name: '', status: 'blocked' },
    ] },
    { ...summary, id: 2, status: 'completed', source_no: 'SO-HISTORY', completed_at: startedAt, resolution_kind: 'succeeded', current_tasks: [] },
    { ...summary, id: 3, status: 'active', source_no: 'SO-WAITING', current_tasks: [] },
  ]
  const harness = await businessFormHarness(t, { rpc: (method) => {
    assert.equal(method, 'list_tracking')
    return { data: { items, total: 3, status_counts: { active: 2, completed: 1 }, limit: 20, offset: 0 } }
  } })
  const [{ MemoryRouter }, { default: Panel }] = await Promise.all([
    import('react-router-dom'), import('./WorkflowTrackingPanel.jsx'),
  ])
  await harness.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Panel, { scope: 'visible' })))
  const rows = [...document.querySelectorAll('.erp-workflow-tracking-entry')]
  assert.equal(rows.length, 3)
  assert.match(rows[0].querySelector('.erp-workflow-tracking-document').textContent, /销售订单 · SO-FIRST/u)
  const handoffs = [...rows[0].querySelectorAll('.erp-workflow-tracking-progress-line')].map((line) => line.textContent)
  assert.deepEqual(handoffs, ['核对材料岗位：工程 · 处理人：工程小李 · 待处理', '仓库点数岗位：仓库已阻塞'])
  assert.equal(rows[0].querySelector('[data-tracking-entry]').getAttribute('aria-label'), '流程跟踪：SO-FIRST · 销售订单受理')
  assert.equal(rows[1].querySelector('.erp-workflow-tracking-progress').textContent, '销售订单受理正常结束')
  assert.equal(rows[2].querySelector('.erp-workflow-tracking-progress').textContent, '销售订单受理等待后续业务处理')
  assert.doesNotMatch(rows.map((row) => row.textContent).join(''), /发起人甲/u)
})
