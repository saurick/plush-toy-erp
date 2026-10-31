import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('opening a gallery keeps row selection unchanged and a source change aborts stale reads', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Gallery }, { BusinessPageContext }] = await Promise.all([
    import('./BusinessProductGallery.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const profile = { id: 1, permissions: ['product.read'], effective_session: { actions: ['product.read'] } }
  let calls = 0
  let rowClicks = 0
  let release
  let readSignal
  const load = ({ signal }) => {
    calls += 1
    readSignal = signal
    return new Promise((resolve) => { release = resolve })
  }
  const view = (title, loader = load) => h(BusinessPageContext.Provider, { value: { adminProfile: profile } }, h('div', { onClick: () => { rowClicks += 1 } }, h(Gallery, { title, products: [{ productID: 7, name: '模拟小熊' }], loadProducts: loader }, h('span', null, '缩略图'))))
  await ui.render(view('SO-ONE'))
  const trigger = ui.container.querySelector('button')
  await ui.act(() => { trigger.click(); trigger.click() })
  assert.equal(calls, 1)
  assert.equal(rowClicks, 0)
  assert.equal(trigger.disabled, true)
  await ui.render(view('SO-TWO', async () => []))
  assert.equal(readSignal.aborted, true)
  assert.equal(ui.container.querySelector('button').disabled, false)
  await ui.act(() => release([{ productID: 7, name: '旧订单产品' }]))
  assert.equal(document.querySelector('.erp-task-image-preview') === null, true, 'a late source read must not reopen an old gallery')
  assert.equal(ui.container.textContent.includes('旧订单产品'), false)
  await ui.act(async () => { ui.container.querySelector('button').click(); await Promise.resolve() })
  assert.equal(ui.container.querySelector('[role="alert"]')?.textContent, '当前没有关联产品，请刷新列表后核对')
})

test('revoking product read removes the entry and aborts a pending gallery request', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Gallery }, { BusinessPageContext }] = await Promise.all([
    import('./BusinessProductGallery.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  let signal
  const load = (options) => { signal = options.signal; return new Promise(() => {}) }
  const view = (allowed) => h(BusinessPageContext.Provider, { value: { adminProfile: { id: 1, permissions: allowed ? ['product.read'] : [], effective_session: { actions: allowed ? ['product.read'] : [] } } } }, h(Gallery, { products: [{ productID: 7, name: '模拟小熊' }], loadProducts: load }, h('span', null, '产品占位')))
  await ui.render(view(true))
  await ui.act(() => ui.container.querySelector('button').click())
  await ui.render(view(false))
  assert.equal(signal.aborted, true)
  assert.equal(ui.container.querySelector('button') === null, true)
  assert.equal(ui.container.textContent, '产品占位')
})
