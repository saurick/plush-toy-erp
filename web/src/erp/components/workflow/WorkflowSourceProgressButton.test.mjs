import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('来源跟踪原位选择流程，边界状态不会导航、串单或保留过期权限', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { MemoryRouter, useLocation }, { default: Progress }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./WorkflowSourceProgressButton.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  let mode = 'many'
  let pending
  const summary = (id, sourceID = 1) => ({
    kind: 'process',
    id,
    process_key: 'sales_order_acceptance',
    title: '',
    source_type: 'sales_order',
    source_id: sourceID,
    source_no: `SO-${sourceID}`,
    display_context: null,
    status: 'active',
    resolution_kind: null,
    started_at: 1791367200,
    updated_at: 1791367200,
    completed_at: null,
    initiator_name: '业务员',
    initiator_role_key: 'sales',
    current_tasks: [],
  })
  JsonRpc.prototype.call = async (method, params, options) => {
    calls.push({ method, params })
    if (method === 'get_tracking') return { data: { tracking: { summary: summary(params.id), tasks: [], nodes: [], events: [], current_task_access: [], events_truncated: false, next_event_id: 0 } } }
    assert.equal(method, 'list_tracking')
    assert.equal(params.scope, 'visible')
    assert.equal(params.source_type, 'sales_order')
    assert.equal(params.limit, 20)
    if (mode === 'error') throw new Error('unavailable')
    const allItems = mode === 'pages' ? Array.from({ length: 25 }, (_, index) => summary(10 + index))
      : mode === 'empty' ? [] : mode === 'many' ? [summary(10), summary(11)] : [summary(10, mode === 'mismatch' ? 99 : params.source_id)]
    const items = allItems.slice(params.offset, params.offset + params.limit)
    const result = { data: { items, total: allItems.length, limit: 20, offset: params.offset, status_counts: { active: allItems.length, completed: 0 } } }
    if (mode === 'pending') return new Promise((resolve) => { pending = { signal: options.signal, resolve: () => resolve(result) } })
    return result
  }
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  function Location() { return createElement('output', { 'data-current-location': true }, useLocation().pathname) }
  const render = (sourceID = 1, canRead = true) => act(async () => root.render(createElement(
    MemoryRouter,
    { initialEntries: ['/erp/sales/project-orders/sales-orders'] },
    createElement(Location),
    createElement(Progress, {
      sourceType: 'sales_order',
      sourceID,
      profile: {
        id: 1,
        permissions: canRead ? ['workflow.task.read'] : [],
        effective_session: { actions: canRead ? ['workflow.task.read'] : [] },
      },
    })
  )))
  const button = (name) => [...document.querySelectorAll('button')].find((entry) => entry.textContent.replace(/\s/g, '') === name || entry.getAttribute('aria-label') === name)
  const click = (name) => act(async () => { assert.ok(button(name), name); button(name).click() })
  t.after(async () => { await act(async () => root.unmount()); element.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await render()
  await click('流程跟踪')
  assert.equal(document.querySelectorAll('.erp-workflow-source-tracking li').length, 2)
  assert.equal(calls.filter((call) => call.method === 'get_tracking').length, 0, '多条流程不能擅自取第一条')
  await act(async () => document.querySelector('.erp-workflow-source-tracking li button').click())
  assert.match(document.querySelector('[aria-label="流程概况"]').textContent, /SO-1/)
  assert.equal(document.querySelector('[data-current-location]').textContent, '/erp/sales/project-orders/sales-orders')
  await click('选择其他流程（2）')
  assert.equal(document.querySelectorAll('.erp-workflow-source-tracking li').length, 2)
  await click('返回当前单据')
  mode = 'pages'
  await click('流程跟踪')
  assert.equal(document.querySelectorAll('.erp-workflow-source-tracking > ul > li').length, 20)
  await click('下一页')
  assert.equal(document.querySelectorAll('.erp-workflow-source-tracking > ul > li').length, 5)
  assert.equal(calls.filter((call) => call.method === 'list_tracking').at(-1).params.offset, 20)
  await act(async () => document.querySelector('.erp-workflow-source-tracking li button').click())
  assert.equal(calls.filter((call) => call.method === 'get_tracking').at(-1).params.id, 30, '第二页按实际选择读取，不能回到第一页')
  await click('选择其他流程（25）')
  assert.equal(document.querySelectorAll('.erp-workflow-source-tracking > ul > li').length, 5, '返回流程选择保留页码')
  await click('返回当前单据')
  mode = 'one'
  await click('流程跟踪')
  assert.ok(document.querySelector('[aria-label="流程概况"]'), '只有一条流程时直接展示进度')
  await click('返回当前单据')
  mode = 'error'
  await click('流程跟踪')
  assert.match(document.body.textContent, /关联流程读取失败/)
  mode = 'mismatch'
  await click('重试')
  assert.equal(document.querySelector('[aria-label="流程概况"]'), null, '错单响应不能展示')
  assert.match(document.body.textContent, /关联流程读取失败/)
  mode = 'empty'
  await click('重试')
  assert.match(document.body.textContent, /当前单据暂无可见流程/)
  await click('返回当前单据')
  mode = 'pending'
  await click('流程跟踪')
  const old = pending
  await render(2)
  assert.equal(old.signal.aborted, true)
  await act(async () => old.resolve())
  assert.equal(document.querySelector('[aria-label="流程概况"]'), null, '切换来源后旧结果失效')
  await click('流程跟踪')
  await render(2, false)
  assert.equal(pending.signal.aborted, true)
  assert.equal(button('流程跟踪'), undefined)
  await render(2)
  await click('流程跟踪')
  const expired = pending
  await act(async () => window.dispatchEvent(new Event('plush:auth-session-changed')))
  assert.equal(expired.signal.aborted, true, '登录会话变化立即取消读取')
  await act(async () => expired.resolve())
  assert.equal(document.querySelector('[aria-label="流程概况"]'), null, '会话变化后不能显示旧响应')
  await render(0)
  assert.equal(button('流程跟踪').disabled, true)
  assert.ok(calls.every((call) => ['list_tracking', 'get_tracking'].includes(call.method)), '查看不写业务事实')
})
