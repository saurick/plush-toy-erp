import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('手机提交流程使用任务回执，已有结果不重复报告，桌面继续显示流转通知', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, router, { useProcessSubmissionReceipt }, { registerAntdAppApis }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./ProcessSubmissionReceipt.jsx'), import('../../../common/utils/antdApp.js'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const results = []
  const notices = []
  registerAntdAppApis({ notification: { success: (notice) => notices.push(notice) } })
  let showReceipt
  function Consumer() { showReceipt = useProcessSubmissionReceipt(); return null }
  const render = async (mobile) => act(async () => root.render(createElement(router.MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(router.Routes, null, createElement(router.Route, { element: createElement(router.Outlet, { context: mobile ? { taskBusiness: { onResult: (...args) => results.push(args) } } : {} }) }, createElement(router.Route, { index: true, element: createElement(Consumer) }))))))
  t.after(async () => { await act(async () => root.unmount()); container.remove(); registerAntdAppApis(); dom.restore() })
  const record = { id: 7, payment_no: 'PAY-7' }
  await render(true)
  await act(async () => showReceipt({ title: '收付款已提交审批', record, result: { process_instance: { id: 10 } } }))
  assert.deepEqual(results, [['收付款已提交审批', record]])
  assert.equal(notices.length, 0)
  await act(async () => showReceipt({ title: '业务结果已由调用方记录', result: { process_instance: { id: 10 } } }))
  assert.equal(results.length, 1)
  assert.equal(notices.length, 0)
  await render(false)
  await act(async () => showReceipt({ title: '收付款已提交审批', record, result: { process_instance: { id: 10 } } }))
  assert.equal(results.length, 1)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].message, '收付款已提交审批')
})

test('confirmed submission retains success when progress read fails and retry never resubmits', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { showProcessSubmissionReceipt }, { registerAntdAppApis }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./ProcessSubmissionReceipt.jsx'), import('../../../common/utils/antdApp.js'), import('../../../common/utils/jsonRpc.js'),
  ])
  const rootElement = document.createElement('div')
  document.body.appendChild(rootElement)
  const root = createRoot(rootElement)
  const original = JsonRpc.prototype.call
  const calls = []
  let notice
  let closedKey
  let fail = true
  registerAntdAppApis({ notification: {
    success: (value) => { notice = value; root.render(value.description) },
    destroy: (key) => { closedKey = key },
  } })
  JsonRpc.prototype.call = async (method, params) => {
    calls.push({ method, params })
    assert.equal(method, 'get_tracking')
    if (fail) throw new Error('temporary read failure')
    const now = 1791367200
    return { data: { tracking: {
      summary: { kind: 'process', id: 10, process_key: 'sales_order_acceptance', title: '', source_type: 'sales_order', source_id: 1, source_no: 'SO-TRACK', display_context: null, status: 'completed', resolution_kind: 'succeeded', started_at: now, updated_at: now, completed_at: now, initiator_name: '业务小李', initiator_role_key: 'sales', current_tasks: [] },
      tasks: [],
      current_task_access: [],
      nodes: [],
      events: [],
      events_truncated: false,
      next_event_id: 0,
    } } }
  }
  t.after(async () => {
    await act(async () => root.unmount())
    rootElement.remove(); JsonRpc.prototype.call = original; registerAntdAppApis(); dom.restore()
  })
  await act(async () => showProcessSubmissionReceipt({ result: { process_instance: { id: 10 } }, title: '销售订单已提交' }))
  assert.equal(notice.message, '销售订单已提交')
  assert.match(rootElement.textContent, /提交已成功.*暂时无法读取/)
  assert.match(rootElement.querySelector('a').href, /track_id=10/)
  fail = false
  await act(async () => rootElement.querySelector('button').click())
  assert.match(rootElement.textContent, /当前去向：正常结束/)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map((call) => call.params), [{ kind: 'process', id: 10 }, { kind: 'process', id: 10 }])
  await act(async () => window.dispatchEvent(new Event('plush:auth-session-changed')))
  assert.equal(closedKey, notice.key)
  assert.equal(rootElement.textContent, '')
})
