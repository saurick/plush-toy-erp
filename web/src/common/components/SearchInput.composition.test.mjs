import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

async function harness(t, props = {}) {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { Simulate }, { default: SearchInput }] = await Promise.all([
    import('react-dom/client'), import('react-dom/test-utils'), import('./SearchInput.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const changes = []
  const keys = []
  const compositions = []
  const handlers = {
    onSearch: (value) => changes.push(value),
    onKeyDown: (event) => keys.push(event.key),
    onSubmitted: () => keys.push('submit'),
    onCompositionStart: () => compositions.push('start'),
    onCompositionEnd: () => compositions.push('end'),
  }
  const render = (next = props) => act(async () => {
    root.render(createElement(SearchInput, { allowClear: true, ...handlers, ...next }))
  })
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  await render()
  const input = container.querySelector('input')
  const type = (value) => act(async () => { input.value = value; Simulate.change(input) })
  const start = () => act(async () => Simulate.compositionStart(input))
  const end = () => act(async () => Simulate.compositionEnd(input))
  return { container, input, changes, keys, compositions, render, type, start, end, Simulate }
}

test('search keeps confirmed Chinese as a draft until button or Enter submission', async (t) => {
  const h = await harness(t, { value: '' })
  await act(async () => h.input.focus())
  await h.start()
  await h.type('xia')
  await h.render({ value: '', placeholder: '父级重新渲染' })
  assert.equal(h.input.value, 'xia')
  await h.type('xiala')
  assert.deepEqual(h.changes, [])
  await h.type('下拉')
  await h.end()
  await h.type('下拉')
  assert.deepEqual(h.changes, [], 'compositionend and final input must not query')
  assert.equal(document.activeElement, h.input)
  await h.start()
  await h.type('下拉caidan')
  assert.deepEqual(h.changes, [])
  await h.type('下拉菜单')
  await h.end()
  assert.deepEqual(h.changes, [])
  assert.deepEqual(h.compositions, ['start', 'end', 'start', 'end'])
  await act(async () => h.container.querySelector('.erp-search-submit').click())
  assert.deepEqual(h.changes, ['下拉菜单'])
  await h.render({ value: '下拉菜单' })
  await h.type('下拉菜')
  assert.deepEqual(h.changes, ['下拉菜单'], 'deleting characters does not query')
  await act(async () => h.Simulate.keyDown(h.input, { key: 'Enter' }))
  assert.deepEqual(h.changes, ['下拉菜单', '下拉菜'])
  await act(async () => h.container.querySelector('.ant-input-clear-icon').click())
  assert.deepEqual(h.changes, ['下拉菜单', '下拉菜', ''])
  assert.equal(h.input.value, '')
})

test('an earlier value acknowledgement cannot interrupt new composition; history and scope reset restore values', async (t) => {
  const h = await harness(t, { value: '', resetKey: 'one' })
  await h.type('前缀')
  await act(async () => h.container.querySelector('.erp-search-submit').click())
  await h.start()
  await h.type('前缀zhongwen')
  await h.render({ value: '前缀', resetKey: 'one' })
  assert.equal(h.input.value, '前缀zhongwen')
  assert.deepEqual(h.changes, ['前缀'])
  await h.type('前缀中文')
  await h.end()
  assert.deepEqual(h.changes, ['前缀'])
  await act(async () => h.container.querySelector('.erp-search-submit').click())
  await h.render({ value: '前缀中文', resetKey: 'one' })
  await h.render({ value: '历史关键词', resetKey: 'one' })
  assert.equal(h.input.value, '历史关键词')
  await h.start()
  await h.type('历史关键词xin')
  await h.render({ value: '历史关键词', resetKey: 'two' })
  assert.equal(h.input.value, '历史关键词')
  assert.deepEqual(h.changes, ['前缀', '前缀中文'])
})

test('candidate Enter and Escape do not submit, cancel, or reach enclosing keyboard handlers', async (t) => {
  const h = await harness(t, { value: '已查询' })
  // React delegates to the root; observe propagation beyond that root.
  const outerKeys = []
  const { body } = document
  const listener = (event) => outerKeys.push(event.key)
  body.addEventListener('keydown', listener)
  t.after(() => body.removeEventListener('keydown', listener))
  await h.start()
  await h.type('已查询zhongwen')
  for (const key of ['Enter', 'Escape']) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    await act(async () => h.input.dispatchEvent(event))
    assert.equal(event.defaultPrevented, false, 'the input method must retain candidate confirmation/cancellation')
    await act(async () => h.Simulate.keyUp(h.input, { key }))
  }
  assert.deepEqual(h.keys, [])
  assert.deepEqual(outerKeys, [])
  assert.equal(h.input.value, '已查询zhongwen')
  await h.type('已查询中文')
  await h.end()
  await act(async () => h.Simulate.keyDown(h.input, { key: 'Enter', nativeEvent: { keyCode: 229 } }))
  assert.deepEqual(h.keys, [])
  await act(async () => h.Simulate.keyUp(h.input, { key: 'Enter' }))
  await act(async () => h.Simulate.keyDown(h.input, { key: 'Enter' }))
  assert.deepEqual(h.keys, ['submit', 'Enter'])
})

test('default text and clearing an unfinished composition use the same submission contract', async (t) => {
  const h = await harness(t, { defaultValue: '默认' })
  assert.equal(h.input.value, '默认')
  await h.start()
  await h.type('默认zhongwen')
  await act(async () => h.container.querySelector('.ant-input-clear-icon').click())
  assert.equal(h.input.value, '')
  assert.deepEqual(h.changes, [''])
  await h.end()
  assert.deepEqual(h.changes, [''])
  await h.type(' 新关键词 ')
  assert.equal(h.input.value, ' 新关键词 ')
  assert.deepEqual(h.changes, [''])
  await act(async () => h.container.querySelector('.erp-search-submit').click())
  assert.deepEqual(h.changes, ['', '新关键词'])
  assert.equal(h.input.value, '新关键词')
})

test('submitted search preserves a new composition when the preceding query is acknowledged', async (t) => {
  const queries = []
  const cancellations = []
  const props = { value: '', onSearch: (value) => queries.push(value), onCancel: () => cancellations.push('cancel') }
  const h = await harness(t, props)
  await h.type('已提交')
  await act(async () => h.container.querySelector('.erp-search-submit').click())
  await h.start()
  await h.type('xin')
  await h.render({ ...props, value: '已提交' })
  await act(async () => h.Simulate.keyDown(h.input, { key: 'Escape' }))
  assert.equal(h.input.value, 'xin')
  assert.deepEqual(cancellations, [])
  await h.type('新查询')
  await h.end()
  assert.deepEqual(queries, ['已提交'])
  await act(async () => h.container.querySelector('.erp-search-submit').click())
  assert.deepEqual(queries, ['已提交', '新查询'])
  assert.deepEqual(h.compositions, ['start', 'end'])
})

test('ordinary input recovers after native search cancellation without compositionend', async (t) => {
  const h = await harness(t, { value: '', type: 'search' })
  await h.start()
  await h.type('zhong')
  await act(async () => {
    h.input.value = '恢复查询'
    h.Simulate.change(h.input, { nativeEvent: { isComposing: false } })
  })
  assert.deepEqual(h.changes, [])
  await act(async () => h.Simulate.keyDown(h.input, { key: 'Enter' }))
  assert.deepEqual(h.changes, ['恢复查询'])
})
