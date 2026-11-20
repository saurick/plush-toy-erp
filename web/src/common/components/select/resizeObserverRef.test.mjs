import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, createRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { createRequire } from 'node:module'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

const require = createRequire(import.meta.url)

test('resize observer uses an explicit DOM ref through an animated child mount and removal', async (t) => {
  const ui = await createReactTestHarness(t)
  const Observer = require('rc-resize-observer/lib/SingleObserver').default
  const original = ReactDOM.findDOMNode
  let legacyReads = 0
  ReactDOM.findDOMNode = (...args) => { legacyReads += 1; return original(...args) }
  t.after(() => { ReactDOM.findDOMNode = original })
  const observed = createRef()
  let changeOpen
  function AnimatedChild() {
    const [open, setOpen] = useState(false)
    changeOpen = setOpen
    return h(Observer, { disabled: !open, ref: observed }, (ref) => open ? h('div', { ref, 'data-observed': true }, '候选项') : null)
  }
  await ui.render(h(AnimatedChild))
  assert.equal(legacyReads, 0, 'an unmounted render-prop child has no implicit DOM to discover')
  await ui.act(async () => changeOpen(true))
  assert.equal(observed.current === document.querySelector('[data-observed]'), true)
  await ui.act(async () => changeOpen(false))
  assert.equal(observed.current === null, true)
  await ui.act(async () => changeOpen(true))
  assert.equal(observed.current === document.querySelector('[data-observed]'), true)
  assert.equal(legacyReads, 0)
})
