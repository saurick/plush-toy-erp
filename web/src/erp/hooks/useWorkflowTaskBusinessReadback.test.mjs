import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('historical source readback requires backend access, survives step changes and discards old account results', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: useReadback }, { JsonRpc }] = await Promise.all([import('./useWorkflowTaskBusinessReadback.js'), import('../../common/utils/jsonRpc.js')])
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const calls = []
  let allowed = false
  let fail = false
  JsonRpc.prototype.call = async (method) => {
    calls.push(method)
    if (method === 'explain_action_access') return { data: { source_access: { applicable: true, resolved: true, allowed }, actions: [{ action_key: 'complete', allowed: false }] } }
    assert.equal(method, 'get_purchase_receipt')
    if (fail) throw new Error('offline')
    return { data: { purchase_receipt: { id: 3, receipt_no: 'RC-3', status: 'POSTED', quantity: '12' } } }
  }
  let value
  function Consumer(props) { value = useReadback(props); return null }
  const task = { id: 7, version: 2, source_type: 'purchase_receipt', source_id: 3, task_status_key: 'done', task_group: 'handoff_receipt_inbound', task_code: 'source-handoff-receipt-inbound-3', payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: 3, source_task_intent_hash: 'a'.repeat(64), entry_path: '/erp/warehouse/inbound?receipt_id=3' } }
  await ui.render(h(Consumer, { task: null, profile: { id: 1, is_super_admin: true } }))
  assert.equal(value, null)
  assert.equal(calls.length, 0, 'opening a task center without a selection does not read a task or its source')
  await ui.render(h(Consumer, { task, profile: { id: 1, is_super_admin: true } }))
  assert.equal(value, null)
  assert.equal(calls.includes('get_purchase_receipt'), false, 'admin supervision cannot bypass source access')
  allowed = true
  const profile = { id: 2 }
  await ui.render(h(Consumer, { task, profile }))
  await ui.flush()
  assert.equal(value.summary.recordNo, 'RC-3')
  const reads = calls.length
  await ui.render(h(Consumer, { task, profile, activeStep: 1 }))
  await ui.render(h(Consumer, { task, profile, activeStep: 3 }))
  assert.equal(calls.length, reads)
  fail = true
  await ui.render(h(Consumer, { task: { ...task, version: 3 }, profile }))
  await ui.flush()
  assert.equal(value.state, 'error')
  assert.equal(value.summary, undefined)
  fail = false
  await ui.act(() => value.retry())
  await ui.flush()
  assert.equal(value.summary.recordNo, 'RC-3')
})
