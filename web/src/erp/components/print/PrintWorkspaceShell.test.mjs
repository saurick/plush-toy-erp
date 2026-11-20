import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('print selection handles Escape from body and releases its listener on exit', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: PrintWorkspaceShell } = await import('./PrintWorkspaceShell.jsx')
  let returned = 0
  const render = (selectionMode) => view.render(createElement(PrintWorkspaceShell, {
    title: '测试纸面',
    selectionMode,
    onReturnToEdit: () => { returned += 1 },
  }))
  const escape = (target = document.body, options = {}) => {
    const event = new view.runtimeWindow.KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true, ...options,
    })
    target.dispatchEvent(event)
    return event
  }
  await render('选择明细行')
  assert.equal(document.activeElement, document.body)
  assert.equal(escape(document.body, { isComposing: true }).defaultPrevented, false)
  assert.equal(escape(document.body, { keyCode: 229 }).defaultPrevented, false)
  assert.equal(returned, 0)
  assert.equal(escape().defaultPrevented, true)
  assert.equal(returned, 1)
  const outside = document.createElement('input')
  document.body.append(outside)
  outside.focus()
  assert.equal(escape(outside).defaultPrevented, false)
  assert.equal(returned, 1)
  outside.remove()
  await render('')
  assert.equal(escape().defaultPrevented, false)
  assert.equal(returned, 1)
  await render('选择明细行')
  await view.unmount()
  assert.equal(escape().defaultPrevented, false)
  assert.equal(returned, 1)
})
