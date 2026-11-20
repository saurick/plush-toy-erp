import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { setTimeout as delay } from 'node:timers/promises'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('scroll geometry is read before updating the header gap and unchanged measurements retain the controls', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Controls } = await import('./TableScrollControls.jsx')
  const wrapper = document.createElement('div')
  wrapper.className = 'ant-table-wrapper'
  wrapper.innerHTML = '<div class="ant-table-header"><table><thead><tr><th class="ant-table-cell-scrollbar"></th></tr></thead></table></div><div class="ant-table-body" style="border:0px solid;overflow:auto"><table><tbody><tr class="ant-table-row"><td>材料</td></tr></tbody></table></div>'
  document.body.append(wrapper)
  t.after(() => wrapper.remove())
  const scroller = wrapper.querySelector('.ant-table-body')
  const table = scroller.querySelector('table')
  for (const [name, value] of Object.entries({ clientWidth: 200, clientHeight: 200, offsetWidth: 215, scrollWidth: 600 })) {
    Object.defineProperty(scroller, name, { value, configurable: true })
  }
  const operations = []
  for (const node of [scroller, table]) {
    node.getBoundingClientRect = () => {
      operations.push('read geometry')
      return { x: 0, y: 0, left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }
    }
  }
  const setProperty = wrapper.style.setProperty.bind(wrapper.style)
  wrapper.style.setProperty = (name, value, priority) => {
    if (name === '--app-table-header-scroll-gap') operations.push('write header gap')
    return setProperty(name, value, priority)
  }
  const tableRef = { current: wrapper }
  await ui.render(h(Controls, { tableRef, revision: 1 }))
  assert.equal(wrapper.style.getPropertyValue('--app-table-header-scroll-gap'), '15px')
  assert.ok(operations.indexOf('write header gap') > operations.lastIndexOf('read geometry'), 'cosmetic writes must follow the geometry snapshot')
  const range = wrapper.querySelector('input[type="range"]')
  assert.equal(range.max, '400')
  const count = operations.filter((value) => value === 'write header gap').length
  await ui.render(h(Controls, { tableRef, revision: 2 }))
  assert.equal(wrapper.querySelector('input[type="range"]') === range, true)
  assert.equal(operations.filter((value) => value === 'write header gap').length, count, 'unchanged geometry does not repeat the style write')
})

test('boxless ancestors do not clip the dock and newly bounded scroll parents remain observed', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Controls } = await import('./TableScrollControls.jsx')
  const outer = document.createElement('section')
  const parent = document.createElement('div')
  parent.style.display = 'contents'
  parent.style.overflowX = 'hidden'
  parent.style.overflowY = 'hidden'
  const wrapper = document.createElement('div')
  wrapper.className = 'ant-table-wrapper'
  wrapper.innerHTML = '<div class="ant-table-body" style="border:0px solid;overflow:auto"><table><tbody><tr class="ant-table-row"><td>材料</td></tr></tbody></table></div>'
  parent.append(wrapper)
  outer.append(parent)
  document.body.append(outer)
  t.after(() => outer.remove())
  const scroller = wrapper.firstElementChild
  const rect = (height) => ({ x: 0, y: 0, left: 0, top: 0, width: 200, height, right: 200, bottom: height })
  for (const [name, value] of Object.entries({ clientWidth: 200, clientHeight: 200, offsetWidth: 200, scrollWidth: 600 })) {
    Object.defineProperty(scroller, name, { value, configurable: true })
  }
  scroller.getBoundingClientRect = () => rect(200)
  scroller.firstElementChild.getBoundingClientRect = () => rect(200)
  for (const node of [outer, parent]) {
    node.getBoundingClientRect = () => rect(node.style.display === 'contents' ? 0 : 30)
    Object.defineProperty(node, 'clientHeight', { get: () => node.style.display === 'contents' ? 0 : 30 })
    Object.defineProperty(node, 'clientWidth', { get: () => node.style.display === 'contents' ? 0 : 200 })
  }
  await ui.render(h(Controls, { tableRef: { current: wrapper } }))
  const dock = wrapper.querySelector('.app-table-scroll-dock')
  assert.equal(dock.style.visibility, 'visible', 'display:contents has no clipping box even with overflow:hidden')
  const scroll = async (node) => ui.act(async () => {
    node.scrollTop += 1
    node.dispatchEvent(new window.Event('scroll'))
    await delay(220)
  })
  parent.style.display = 'block'
  await scroll(parent)
  assert.equal(dock.style.visibility, 'hidden', 'a real short clipping box must still bound the dock')
  parent.style.display = 'contents'
  outer.style.overflowX = 'hidden'
  outer.style.overflowY = 'hidden'
  await scroll(outer)
  assert.equal(dock.style.visibility, 'hidden', 'an ancestor that becomes a scroller must participate in measurement')
  outer.style.overflowX = 'visible'
  outer.style.overflowY = 'visible'
  await scroll(outer)
  assert.equal(dock.style.visibility, 'visible', 'changing back to an unbounded ancestor restores the dock')
})
