import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

async function harness(t, initial = {}) {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: useSubmittedSearch }] = await Promise.all([
    import('react-dom/client'), import('./useSubmittedSearch.js'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const calls = []
  let search
  function Harness(props) {
    search = useSubmittedSearch({ ...props, onSearch: (value) => calls.push(value) })
    return null
  }
  const render = (props) => act(async () => root.render(createElement(Harness, props)))
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  await render(initial)
  return { calls, render, get search() { return search } }
}
const input = (value) => ({ currentTarget: { value } })

test('typing, deleting and composition do not query; submit trims and deduplicates', async (t) => {
  const h = await harness(t)
  await act(async () => { h.search.onChange(input('草稿')); h.search.onChange(input('')) })
  assert.deepEqual(h.calls, [])
  await act(async () => { h.search.onCompositionStart(); h.search.onChange(input('中')); assert.equal(h.search.submit('中'), false) })
  await act(async () => h.search.onCompositionEnd(input('中文')))
  assert.deepEqual(h.calls, [])
  await act(async () => assert.equal(h.search.submit('中文', { nativeEvent: { isComposing: true } }), false))
  await act(async () => assert.equal(h.search.submit('中文', { nativeEvent: { keyCode: 229 } }), false))
  await act(async () => { h.search.submit(' 中文 '); h.search.submit('中文') })
  assert.deepEqual(h.calls, ['中文'])
  assert.equal(h.search.value, '中文')
})

test('cancel restores submitted text; clear resets exactly once even during composition', async (t) => {
  const h = await harness(t, { value: '已提交' })
  await act(async () => h.search.onChange(input('尚未提交')))
  await act(async () => h.search.cancel())
  assert.equal(h.search.value, '已提交')
  assert.deepEqual(h.calls, [])
  await act(async () => { h.search.onCompositionStart(); h.search.clear(); h.search.clear() })
  assert.equal(h.search.value, '')
  assert.deepEqual(h.calls, [''])
})

test('a parent acknowledgement preserves newer typing; navigation restores external state', async (t) => {
  const h = await harness(t, { value: '' })
  await act(async () => h.search.submit('已提交'))
  await act(async () => h.search.onChange(input('下一次草稿')))
  await h.render({ value: '已提交' })
  assert.equal(h.search.value, '下一次草稿')
  await h.render({ value: '历史查询' })
  assert.equal(h.search.value, '历史查询')
  assert.deepEqual(h.calls, ['已提交'])
})

test('changing tabs resets a draft even when both tabs have the same applied keyword', async (t) => {
  const h = await harness(t, { value: '', resetKey: '待办' })
  await act(async () => h.search.onChange(input('未提交')))
  await h.render({ value: '', resetKey: '已办' })
  assert.equal(h.search.value, '')
  assert.deepEqual(h.calls, [])
})
