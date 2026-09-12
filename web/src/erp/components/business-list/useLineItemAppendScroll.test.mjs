import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'
import { useLineItemAppendScroll } from './useLineItemAppendScroll.mjs'

async function mount(t) {
  const dom = installTestDOM()
  const frames = new Map()
  let frameID = 0
  t.mock.method(window, 'requestAnimationFrame', (callback) => {
    frames.set(++frameID, callback)
    return frameID
  })
  t.mock.method(window, 'cancelAnimationFrame', (id) => frames.delete(id))
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let api
  let unmounted = false
  function View() {
    api = useLineItemAppendScroll()
    return null
  }
  const unmount = async () => {
    if (unmounted) return
    unmounted = true
    await act(async () => root.unmount())
  }
  t.after(async () => {
    await unmount()
    dom.restore()
  })
  await act(async () => root.render(createElement(View)))
  return {
    api,
    frames,
    unmount,
    frame() {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback())
    },
    row(index, html = '<input>') {
      const row = document.createElement('section')
      row.innerHTML = html
      document.body.append(row)
      for (const node of [
        row,
        ...row.querySelectorAll('input, textarea, select'),
      ]) {
        node.style.visibility ||= 'visible'
        if (node !== row && !node.hasAttribute('tabindex')) node.tabIndex = 0
        t.mock.method(node, 'getBoundingClientRect', () => ({
          width: 100,
          height: 32,
        }))
        const matches = node.matches.bind(node)
        // happy-dom 10 不实现 :disabled；布局和原生伪类在浏览器回归中验证。
        t.mock.method(node, 'matches', (selector) =>
          selector === ':disabled' ? Boolean(node.disabled) : matches(selector)
        )
        node.scrollIntoView = t.mock.fn()
      }
      api.registerLineItemRow(index, row)
      return row
    },
  }
}

test('append focuses the first editable field, skipping hidden, readonly and disabled fields', async (t) => {
  const view = await mount(t)
  const row = view.row(
    1,
    `
    <input type="hidden">
    <input disabled>
    <input readonly>
    <input style="visibility:hidden">
    <input aria-hidden="true">
    <input id="collapsed">
    <input id="editable">
  `
  )
  t.mock.method(
    row.querySelector('#collapsed'),
    'getBoundingClientRect',
    () => ({ width: 0, height: 0 })
  )
  view.api.requestLineItemScroll(1)
  view.frame()
  assert.equal(document.activeElement === row.querySelector('#editable'), true)
  assert.equal(row.scrollIntoView.mock.callCount(), 1)
})

test('append can focus a non-searchable combobox while preserving a field already focused by BOM', async (t) => {
  const view = await mount(t)
  const row = view.row(
    0,
    '<input role="combobox" readonly><input aria-label="部位">'
  )
  view.api.requestLineItemScroll(0)
  view.frame()
  assert.equal(document.activeElement === row.firstElementChild, true)
  row.lastElementChild.focus()
  view.api.requestLineItemScroll(0)
  view.frame()
  assert.equal(document.activeElement === row.lastElementChild, true)
})

test('a newer append request supersedes pending focus without moving to the older row', async (t) => {
  const view = await mount(t)
  const oldRow = view.row(0)
  const newRow = view.row(1)
  view.api.requestLineItemScroll(0)
  view.api.requestLineItemScroll(1)
  assert.equal(view.frames.size, 1)
  view.frame()
  assert.equal(document.activeElement === newRow.firstElementChild, true)
  assert.equal(oldRow.scrollIntoView.mock.callCount(), 0)
})

test('append waits for the new row to mount', async (t) => {
  const view = await mount(t)
  view.api.requestLineItemScroll(2)
  view.frame()
  const row = view.row(2)
  view.frame()
  assert.equal(document.activeElement === row.firstElementChild, true)
})

test('a removed target never scrolls or focuses an unrelated last row', async (t) => {
  const view = await mount(t)
  const oldRow = view.row(0)
  view.api.requestLineItemScroll(1)
  for (let count = 0; count < 4; count += 1) view.frame()
  assert.equal(view.frames.size, 0)
  assert.equal(oldRow.scrollIntoView.mock.callCount(), 0)
  assert.equal(document.activeElement === document.body, true)
})

test('closing the form cancels pending focus', async (t) => {
  const view = await mount(t)
  const row = view.row(0)
  view.api.requestLineItemScroll(0)
  await view.unmount()
  assert.equal(view.frames.size, 0)
  view.frame()
  assert.equal(row.scrollIntoView.mock.callCount(), 0)
})
