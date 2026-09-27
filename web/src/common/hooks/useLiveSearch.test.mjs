import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../scripts/test/reactRuntime.mjs'

const wait = (duration) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, duration))

test('live search debounces typing, submits Enter and clear immediately, and respects composition', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: useLiveSearch }] = await Promise.all([
    import('react-dom/client'),
    import('./useLiveSearch.js'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const searches = []
  let controls

  function Harness({ value }) {
    controls = useLiveSearch({
      value,
      delay: 20,
      onSearch: (keyword) => searches.push(keyword),
    })
    return null
  }

  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })

  await act(async () => root.render(createElement(Harness, { value: '' })))
  await act(async () => {
    controls.onChange({
      currentTarget: { value: '毛绒' },
      nativeEvent: { isComposing: false },
    })
    controls.onChange({
      currentTarget: { value: '毛绒熊' },
      nativeEvent: { isComposing: false },
    })
    await wait(30)
  })
  assert.deepEqual(searches, ['毛绒熊'])

  await act(async () => {
    controls.onChange({
      currentTarget: { value: '立即查询' },
      nativeEvent: { isComposing: false },
    })
    controls.onPressEnter({
      currentTarget: { value: '立即查询' },
      nativeEvent: { isComposing: false },
    })
    await wait(30)
  })
  assert.deepEqual(searches, ['毛绒熊', '立即查询'])

  await act(async () => {
    controls.onChange({
      currentTarget: { value: '' },
      nativeEvent: { isComposing: false },
    })
  })
  assert.deepEqual(searches, ['毛绒熊', '立即查询', ''])

  await act(async () => {
    controls.onCompositionStart()
    controls.onChange({
      currentTarget: { value: '中' },
      nativeEvent: { isComposing: true },
    })
    await wait(30)
  })
  assert.deepEqual(searches, ['毛绒熊', '立即查询', ''])
  await act(async () => {
    controls.onCompositionEnd({ currentTarget: { value: '中文' } })
    await wait(30)
  })
  assert.deepEqual(searches, ['毛绒熊', '立即查询', '', '中文'])
})

test('live search cancels a pending draft when the committed value changes externally', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: useLiveSearch }] = await Promise.all([
    import('react-dom/client'),
    import('./useLiveSearch.js'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const searches = []
  let controls

  function Harness({ value }) {
    controls = useLiveSearch({
      value,
      delay: 20,
      onSearch: (keyword) => searches.push(keyword),
    })
    return null
  }

  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })

  await act(async () => root.render(createElement(Harness, { value: '原值' })))
  await act(async () => {
    controls.onChange({
      currentTarget: { value: '待提交' },
      nativeEvent: { isComposing: false },
    })
  })
  await act(async () => {
    root.render(createElement(Harness, { value: '恢复值' }))
  })
  await act(async () => {
    await wait(30)
  })
  assert.equal(controls.value, '恢复值')
  assert.deepEqual(searches, [])
})

test('live search preserves newer typing when the parent acknowledges an earlier query', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: useLiveSearch }] = await Promise.all([
    import('react-dom/client'),
    import('./useLiveSearch.js'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const searches = []
  let controls

  function Harness({ value }) {
    controls = useLiveSearch({
      value,
      delay: 20,
      onSearch: (keyword) => searches.push(keyword),
    })
    return null
  }

  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })

  await act(async () => root.render(createElement(Harness, { value: '' })))
  await act(async () => {
    controls.onChange({
      currentTarget: { value: '订单' },
      nativeEvent: { isComposing: false },
    })
    await wait(30)
  })
  assert.deepEqual(searches, ['订单'])

  await act(async () => {
    controls.onChange({
      currentTarget: { value: '订单二' },
      nativeEvent: { isComposing: false },
    })
  })
  await act(async () => {
    root.render(createElement(Harness, { value: '订单' }))
  })
  assert.equal(controls.value, '订单二')
  await act(async () => {
    await wait(30)
  })
  assert.deepEqual(searches, ['订单', '订单二'])
})
