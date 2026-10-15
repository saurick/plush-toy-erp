import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

test('mobile exceptions restore query through task return and reset across access scopes', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Panel }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'),
    import('./MobileWorkflowExceptionPanel.jsx'),
    import('../../../common/utils/jsonRpc.js'),
  ])
  window.history.replaceState({
    mobileRoleTasksMainTab: 'exceptions',
    mobileWorkflowExceptions: {
      accessScope: 'account-1',
      query: { filters: { moduleKey: 'quality' }, keyword: '复检', state: 'closed', view: 'orders', loadedCount: 40 },
    },
  }, '')
  const original = JsonRpc.prototype.call
  const reads = []
  JsonRpc.prototype.call = async (method, params) => {
    assert.equal(method, 'list_exceptions')
    reads.push(params)
    return { data: { items: [], tasks: [], orders: [], total: 0, view_total: 0, open: 0, closed: 0, pending_tasks: 0, affected_orders: 0 } }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })
  const scrollContainerRef = { current: container }
  const render = (scope) => act(async () => root.render(createElement(Panel, { key: scope, accessScope: scope, profile: { id: scope }, scrollContainerRef })))
  await render('account-1')
  assert.deepEqual(reads.at(-1), { module_key: 'quality', keyword: '复检', state: 'closed', view: 'orders', limit: 20, offset: 0 })
  assert.equal(container.querySelector('input').value, '复检')
  assert.equal(window.history.state.mobileRoleTasksMainTab, 'exceptions')
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === '未闭环').click())
  assert.equal(reads.at(-1).state, 'open')
  assert.equal(reads.at(-1).offset, 0)
  await act(async () => root.render(null))
  await render('account-1')
  assert.equal(reads.at(-1).state, 'open')
  assert.equal(reads.at(-1).keyword, '复检')
  assert.equal(reads.at(-1).module_key, 'quality')
  await render('account-2')
  assert.deepEqual(reads.at(-1), { limit: 20, offset: 0 })
  assert.equal(container.querySelector('input').value, '')
})
