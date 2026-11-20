import { createElement, useRef } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function editableHarness(t) {
  const view = await createReactTestHarness(t)
  const { usePrintEditableDraftSync } =
    await import('./usePrintEditableDraftSync.js')
  function Editable({ commit, disabled = false, as = 'span' }) {
    const editableRef = useRef(null)
    usePrintEditableDraftSync({
      editableRef,
      commitElementValue: commit,
      disabled,
      elementType: as,
    })
    return createElement(as, { ref: editableRef, contentEditable: !disabled })
  }
  return {
    container: view.container,
    render: (props) => view.render(createElement(Editable, props)),
    edit: (element, text, input = true) =>
      view.act(async () => {
        element.textContent = text
        if (input) element.dispatchEvent(new Event('input', { bubbles: true }))
        await view.runtimeWindow.happyDOM.whenAsyncComplete()
      }),
  }
}

test('editable drafts observe direct DOM edits and call the current consumer after rerender', async (t) => {
  const harness = await editableHarness(t)
  const first = []
  const current = []
  await harness.render({ commit: (element) => first.push(element.textContent) })
  const element = harness.container.firstChild
  assert.equal(element.dataset.printWorkspaceDraftReady, 'true')
  await harness.edit(element, 'first')
  assert.ok(first.includes('first'))
  const settledFirstCalls = first.length
  await harness.render({ commit: (target) => current.push(target.textContent) })
  await harness.edit(element, 'second', false)
  assert.ok(current.includes('second'))
  assert.equal(first.length, settledFirstCalls)
})

test('disabled fields release their input observer and reattach on enable', async (t) => {
  const harness = await editableHarness(t)
  const values = []
  const commit = (element) => values.push(element.textContent)
  await harness.render({ commit })
  const element = harness.container.firstChild
  await harness.render({ commit, disabled: true })
  assert.equal(element.dataset.printWorkspaceDraftReady, undefined)
  await harness.edit(element, 'disabled')
  assert.deepEqual(values, [])
  await harness.render({ commit })
  await harness.edit(element, 'enabled')
  assert.ok(values.includes('enabled'))
})

test('changing an editable element type detaches the old node and binds its replacement', async (t) => {
  const harness = await editableHarness(t)
  const values = []
  const commit = (element) => values.push(element.textContent)
  await harness.render({ commit })
  const previous = harness.container.firstChild
  await harness.render({ commit, as: 'div' })
  const replacement = harness.container.firstChild
  assert.notEqual(previous, replacement)
  assert.equal(previous.dataset.printWorkspaceDraftReady, undefined)
  await harness.edit(previous, 'detached')
  assert.deepEqual(values, [])
  await harness.edit(replacement, 'replacement')
  assert.ok(values.includes('replacement'))
})
