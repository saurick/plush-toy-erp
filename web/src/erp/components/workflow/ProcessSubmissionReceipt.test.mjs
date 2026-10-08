import { act } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

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
      tasks: [], nodes: [], events: [], events_truncated: false, next_event_id: 0,
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
