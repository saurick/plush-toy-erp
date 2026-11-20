import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useEffect } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('桌面首次挂载保留表体，测量只更新吸顶偏移且不重复写样式', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: useBusinessListStickyHeader } = await import('./useBusinessListStickyHeader.js')
  const { OverlayScopeContext } = await import('../../../common/components/overlay/OverlayScopeContext.mjs')
  const container = document.createElement('div')
  container.className = 'erp-admin-content'
  container.style.paddingTop = '8px'
  container.innerHTML = '<section class="erp-business-page-layout"><div data-page-table-toolbar></div><div class="card"></div></section>'
  document.body.append(container)
  t.after(() => container.remove())
  const page = container.firstElementChild
  const toolbar = page.firstElementChild
  const cardRef = { current: page.lastElementChild }
  let height = 100
  const operations = []
  toolbar.getBoundingClientRect = () => { operations.push('read'); return { height } }
  Object.defineProperty(container, 'clientHeight', { get() { operations.push('read'); return 800 } })
  const setProperty = page.style.setProperty.bind(page.style)
  page.style.setProperty = (...args) => { operations.push('write'); return setProperty(...args) }
  const observers = []
  t.mock.method(globalThis, 'ResizeObserver', class {
    constructor(callback) { observers.push(callback) }

    observe() {}

    disconnect() {}
  })
  t.mock.method(window, 'matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  let mounts = 0
  let sticky
  function Body() {
    useEffect(() => { mounts += 1 }, [])
    return h('span', { 'data-body': true }, '业务记录')
  }
  function Fixture() {
    sticky = useBusinessListStickyHeader(cardRef, true)
    return h(sticky ? 'section' : 'div', null, h(Body))
  }
  const render = (visible) => ui.render(h(OverlayScopeContext.Provider, { value: { visible } }, h(Fixture)))
  const nextFrame = () => ui.act(async () => new Promise(requestAnimationFrame))
  await render(true)
  await nextFrame()
  const body = ui.container.querySelector('[data-body]')
  assert.equal(mounts, 1, '启用吸顶不应重建表体')
  assert.equal(sticky.offsetHeader, 92)
  assert.equal(sticky.getContainer() === container, true)
  assert.ok(operations.indexOf('write') > operations.lastIndexOf('read'), '先读取几何再写入样式')
  const writes = operations.filter((operation) => operation === 'write').length
  await ui.act(async () => observers[0]())
  await nextFrame()
  assert.equal(operations.filter((operation) => operation === 'write').length, writes)
  height = 140
  await ui.act(async () => observers[0]())
  await nextFrame()
  assert.equal(sticky.offsetHeader, 132)
  assert.equal(ui.container.querySelector('[data-body]') === body, true)
  assert.equal(mounts, 1)
  const reads = operations.filter((operation) => operation === 'read').length
  height = 0
  await render(false)
  assert.equal(operations.filter((operation) => operation === 'read').length, reads, '隐藏视图不以零尺寸覆盖吸顶状态')
  assert.equal(sticky.offsetHeader, 132)
  height = 140
  await render(true)
  await nextFrame()
  assert.equal(ui.container.querySelector('[data-body]') === body, true)
  assert.equal(mounts, 1)
})
