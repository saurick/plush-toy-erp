import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('loading keeps the existing scroll control disabled and an empty result removes it immediately', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Controls } = await import('./TableScrollControls.jsx')
  const wrapper = document.createElement('div')
  wrapper.className = 'ant-table-wrapper'
  wrapper.innerHTML = '<div class="ant-table-body" style="overflow:auto"><table><tbody><tr class="ant-table-row"><td>材料</td></tr></tbody></table></div>'
  document.body.append(wrapper)
  t.after(() => wrapper.remove())
  const scroller = wrapper.querySelector('.ant-table-body')
  for (const [name, value] of Object.entries({ clientWidth: 200, clientHeight: 200, offsetWidth: 200, scrollWidth: 600 })) {
    Object.defineProperty(scroller, name, { value, configurable: true })
  }
  for (const node of [scroller, scroller.querySelector('table')]) {
    node.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 })
  }
  const tableRef = { current: wrapper }
  await ui.render(h(Controls, { tableRef, revision: 1, hasRows: true }))
  await ui.act(() => new Promise(requestAnimationFrame))
  assert.equal(Boolean(wrapper.querySelector('input[type="range"]')), true)
  await ui.render(h(Controls, { tableRef, revision: 2, loading: true, hasRows: false }))
  assert.equal(wrapper.querySelector('input[type="range"]')?.disabled, true)
  await ui.render(h(Controls, { tableRef, revision: 3, loading: false, hasRows: false }))
  assert.equal(wrapper.querySelector('input[type="range"]') === null, true)
})
