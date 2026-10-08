import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

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
  const render = (scope, sessionKey = 'session-one') => act(async () => root.render(createElement(MemoryRouter, null, createElement(Panel, { scope, sessionKey, refreshKey: 0 }))))
  const response = (title) => ({ data: {
    items: [{ kind: 'task', id: 1, process_key: '', title, source_type: 'sales_order', source_id: 1, source_no: 'SO-TRACK', display_context: null, status: 'done', resolution_kind: null, started_at: 1791367200, updated_at: 1791367200, completed_at: 1791367200, initiator_name: '业务', initiator_role_key: 'sales', current_tasks: [] }],
    total: 1,
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
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/?track_page_started=2'] }, createElement(Probe))))
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
  assert.equal(node.querySelectorAll('.ant-table-row').length, 1)
  await go(5)
  await respond(calls[7], 0, '全部移出')
  assert.equal(calls[8].params.offset, 0)
  await respond(calls[8], 0, '无记录')
  assert.equal(new URLSearchParams(location.search).get('track_page_started'), '1')
  assert.match(node.textContent, /暂无你发起的流程或跟进任务/)
})
