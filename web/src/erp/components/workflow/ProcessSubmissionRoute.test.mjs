import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('submission responsibility retries, explains amount rules and clears stale people after source changes or closing', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Route }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./ProcessSubmissionRoute.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  let fail = true
  let pending
  const response = (processKey, named = true) => ({ data: { route: {
    config_revision: 'config-a',
    process_key: processKey,
    node_key: 'approval',
    owner_role_key: 'boss',
    assignee_display_name: named ? '审批负责人甲' : '',
    approval_key: 'sales_order',
    condition: named ? { mode: 'amount', amount: '5000', currency: 'CNY' } : { mode: 'all' },
  } } })
  JsonRpc.prototype.call = async (method, params, options) => {
    assert.equal(method, 'get_process_submission_route')
    calls.push({ params, options })
    if (pending) return pending
    if (fail) throw new Error('read failed')
    return response(params.process_key)
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (props = {}) => act(async () => root.render(createElement(Route, {
    processKey: 'sales_order_acceptance', customerKey: 'yoyoosun', ...props,
  })))
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })
  await render()
  assert.match(container.textContent, /暂时无法确认审批去向/)
  assert.doesNotMatch(container.textContent, /老板/)
  fail = false
  await act(async () => container.querySelector('button').click())
  assert.match(container.textContent, /需审批时：岗位：老板 · 处理人：审批负责人甲 · 待审批/)
  assert.equal(container.querySelector('.erp-workflow-responsibilities__role').textContent, '岗位：老板')
  assert.match(container.textContent, /CNY 5,000 起需审批/)
  let resolve
  pending = new Promise((next) => { resolve = next })
  await render({ processKey: 'material_supply' })
  assert.match(container.textContent, /正在读取/)
  assert.doesNotMatch(container.textContent, /审批负责人甲/)
  const oldRequest = calls.at(-1)
  await render({ open: false })
  assert.equal(oldRequest.options.signal.aborted, true)
  await act(async () => resolve(response('material_supply')))
  assert.equal(container.textContent, '')
  pending = Promise.resolve(response('sales_order_acceptance', false))
  await render({ customerKey: 'demo' })
  assert.equal(calls.at(-1).params.customer_key, 'demo')
  assert.match(container.textContent, /提交后：岗位：老板 · 待审批/)
  assert.equal(container.querySelectorAll('.erp-workflow-responsibilities__role').length, 1)
  assert.doesNotMatch(container.textContent, /审批负责人甲|5,000|需审批时/)
})
