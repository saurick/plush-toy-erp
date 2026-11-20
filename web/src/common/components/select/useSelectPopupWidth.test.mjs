import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('关闭的选择框不读取弹层尺寸，打开、缩放和重新打开仍使用当前尺寸', async (t) => {
  const ui = await createReactTestHarness(t)
  const { useSelectPopupWidth } = await import('./useSelectPopupWidth.mjs')
  const element = document.createElement('div')
  element.innerHTML = '<span class="ant-select-selection-item">长名称</span>'
  document.body.append(element)
  t.after(() => element.remove())
  let reads = 0
  let triggerWidth = 200
  Object.defineProperty(element, 'offsetWidth', { get: () => { reads += 1; return triggerWidth } })
  const item = element.firstElementChild
  const observeRead = (value) => () => { reads += 1; return value }
  for (const [name, value] of Object.entries({ scrollWidth: 400, clientWidth: 180 })) {
    Object.defineProperty(item, name, { get: observeRead(value) })
  }
  const selectRef = { current: { nativeElement: element } }
  function Fixture({ open, identity = false }) {
    const width = useSelectPopupWidth(selectRef, { open, showSearch: true, hasIdentity: identity })
    return h('output', null, width ?? 'auto')
  }
  await ui.render(h(Fixture, { open: false }))
  await ui.render(h(Fixture, { open: false, identity: true }))
  assert.equal(reads, 0, '页面挂载和普通更新不应测量关闭的弹层')
  await ui.render(h(Fixture, { open: true }))
  assert.equal(ui.container.textContent, '360')
  await ui.render(h(Fixture, { open: true, identity: true }))
  assert.equal(ui.container.textContent, '560')
  await ui.render(h(Fixture, { open: false }))
  const closedReads = reads
  triggerWidth = 640
  await ui.act(async () => window.dispatchEvent(new window.Event('resize')))
  await ui.flush()
  assert.equal(reads, closedReads, '关闭后释放尺寸监听')
  await ui.render(h(Fixture, { open: true }))
  assert.equal(ui.container.textContent, '640', '重新打开以当前触发控件宽度为准')
})

test('远程搜索在候选未返回时就预留宽度，结果到达不改宽', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  const remote = { open: true, showSearch: true, filterOption: false }
  await ui.render(h(AppSelect, { ...remote, loading: true, options: [] }))
  await ui.flush()
  const width = () => Number.parseFloat(document.querySelector('.ant-select-dropdown')?.style.width)
  assert.equal(width(), 560)
  await ui.render(h(AppSelect, { ...remote, options: [{ value: 1, label: '材料名称', identity: { name: '材料名称', code: 'MAT-1' } }] }))
  assert.equal(width(), 560)
})
