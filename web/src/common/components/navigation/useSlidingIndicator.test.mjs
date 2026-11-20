import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('内容更新不重复测量页签，选中项变化仍更新指示条', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: useSlidingIndicator } = await import('./useSlidingIndicator.js')
  let reads = 0
  const observeRead = (value) => () => { reads += 1; return value }
  for (const [name, value] of Object.entries({ offsetWidth: 80, offsetHeight: 32, offsetTop: 0 })) {
    t.mock.getter(window.HTMLElement.prototype, name, observeRead(value))
  }
  t.mock.getter(window.HTMLElement.prototype, 'offsetLeft', function readOffsetLeft() {
    reads += 1
    return this.dataset.position === 'second' ? 80 : 0
  })
  function Fixture({ active = 'first', revision = 0 }) {
    const ref = useSlidingIndicator({ itemSelector: '[role="tab"]', selectedSelector: '[aria-selected="true"]' })
    return h('div', { ref, 'data-revision': revision }, ['first', 'second'].map((key) => h('button', {
      key, role: 'tab', 'data-position': key, 'aria-selected': key === active,
    }, key)))
  }
  await ui.render(h(Fixture))
  const root = ui.container.firstElementChild
  assert.equal(root.style.getPropertyValue('--erp-slider-x'), '0px')
  const initialReads = reads
  await ui.render(h(Fixture, { revision: 1 }))
  await ui.flush()
  assert.equal(reads, initialReads, '无关更新不触发强制布局读取')
  await ui.render(h(Fixture, { active: 'second', revision: 2 }))
  await ui.flush()
  assert.equal(ui.container.firstElementChild === root, true)
  assert.equal(root.style.getPropertyValue('--erp-slider-x'), '80px')
  assert.equal(root.dataset.slidingReady, 'true')
})
