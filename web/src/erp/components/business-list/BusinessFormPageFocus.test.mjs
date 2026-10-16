import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, useState } from 'react'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'

test('deferred form autofocus preserves a field chosen before initialization finishes', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [
    { createRoot },
    { createMemoryRouter, RouterProvider },
    { default: Page },
  ] = await Promise.all([
    import('react-dom/client'),
    import('react-router-dom'),
    import('./BusinessFormPage.jsx'),
  ])
  const frames = new Map()
  let frameID = 0
  window.requestAnimationFrame = (callback) => {
    frames.set(++frameID, callback)
    return frameID
  }
  window.cancelAnimationFrame = (id) => frames.delete(id)
  const flushFrames = async () => {
    for (let iteration = 0; frames.size && iteration < 10; iteration++) {
      const batch = [...frames.values()]
      frames.clear()
      await act(async () => batch.forEach((callback) => callback(0)))
    }
    assert.equal(frames.size, 0, 'initialization must settle')
  }
  let setProps
  function Harness() {
    const [props, update] = useState({ open: false })
    setProps = update
    return createElement(
      Page,
      { title: '退款表单', ...props },
      createElement('label', { htmlFor: 'refund-reason' }, '退款原因'),
      createElement('input', { id: 'refund-reason' }),
      createElement('label', { htmlFor: 'payment-number' }, '收付款单号'),
      createElement('input', { id: 'payment-number' })
    )
  }
  const router = createMemoryRouter([
    { path: '*', element: createElement(Harness) },
  ])
  const container = document.createElement('div')
  const trigger = document.createElement('button')
  document.body.append(trigger, container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    router.dispose()
    container.remove()
    trigger.remove()
    dom.restore()
  })
  await act(async () =>
    root.render(
      createElement(RouterProvider, {
        router,
        future: { v7_startTransition: true },
      })
    )
  )
  for (const input of container.querySelectorAll('input')) {
    input.getClientRects = () => [{ width: 100, height: 40 }]
  }
  const reason = container.querySelector('#refund-reason')
  const number = container.querySelector('#payment-number')
  const render = async (props) => act(async () => setProps(props))

  trigger.focus()
  await render({ open: true })
  assert.ok(frames.size > 0)
  number.focus()
  number.value = 'SIM-REFUND-001'
  await flushFrames()
  assert.equal(
    document.activeElement.id,
    'payment-number',
    'initial autofocus must not replace the user-selected field'
  )
  assert.equal(reason.value, '')
  assert.equal(number.value, 'SIM-REFUND-001')

  await render({ open: false })
  await flushFrames()
  assert.equal(document.activeElement, trigger)
  await render({ open: true })
  await flushFrames()
  assert.equal(
    document.activeElement,
    reason,
    'a fresh untouched form still focuses its first editable field'
  )

  await render({ open: false })
  await flushFrames()
  await render({ open: true, loading: true })
  await flushFrames()
  assert.equal(document.activeElement, trigger)
  await render({ open: true, loading: false })
  number.focus()
  await flushFrames()
  assert.equal(
    document.activeElement.id,
    'payment-number',
    'finishing a reference load must preserve the active input'
  )

  await render({ open: false })
  await flushFrames()
  await render({ open: true, readOnly: true })
  await flushFrames()
  assert.equal(document.activeElement, container.querySelector('h1'))
})
