import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('进度滚动合并历史写入，重复位置和隐藏面板不重复写入', async (t) => {
  const harness = await businessFormHarness(t, { rpc: () => new Promise(() => {}) })
  const [{ default: Panel }, { MemoryRouter }] = await Promise.all([
    import('./MobileProgressPanel.jsx'),
    import('react-router-dom'),
  ])
  const props = { active: true, access: { sales: true, production: false }, scopeKey: 'test-account', roleKey: 'sales', adminProfile: {} }
  const render = (active) => harness.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Panel, { ...props, active })))
  await render(true)
  const scroll = document.querySelector('.mobile-progress-scroll')
  const replace = window.history.replaceState.bind(window.history)
  const writes = []
  window.history.replaceState = (...args) => { writes.push(args[0]); return replace(...args) }
  const scrollTo = (top) => {
    scroll.scrollTop = top
    scroll.dispatchEvent(new window.Event('scroll'))
  }
  const settleScroll = () => act(async () => new Promise((resolve) => setTimeout(resolve, 200)))
  await act(async () => {
    for (let top = 1; top <= 200; top += 1) scrollTo(top)
  })
  assert.equal(writes.length, 0, '连续滚动不逐帧调用 History API')
  await settleScroll()
  assert.equal(writes.length, 1)
  assert.equal(window.history.state.mobileProgress.scrollTop, 200)
  writes.length = 0
  await act(async () => scrollTo(200))
  await settleScroll()
  assert.equal(writes.length, 0, '相同页面状态不重复写入')
  await render(false)
  writes.length = 0
  await act(async () => scrollTo(0))
  await settleScroll()
  assert.equal(writes.length, 0, '隐藏进度不覆盖待办正在使用的历史状态')
  assert.equal(window.history.state.mobileProgress.scrollTop, 200)
})

test('等待进度数据时保留恢复位置，返回历史和卸载时取消旧滚动写入', async (t) => {
  const harness = await businessFormHarness(t, { rpc: () => new Promise(() => {}) })
  const [{ default: Panel }, { MemoryRouter }] = await Promise.all([
    import('./MobileProgressPanel.jsx'),
    import('react-router-dom'),
  ])
  window.history.replaceState({ mobileProgress: { scope: 'test-account', scrollTop: 360 }, mobileRoleTasksMainTab: 'progress' }, '')
  const props = { active: true, access: { sales: true, production: false }, scopeKey: 'test-account', roleKey: 'sales', adminProfile: {} }
  await harness.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Panel, props)))
  assert.equal(window.history.state.mobileProgress.scrollTop, 360, '加载前不能用空容器位置覆盖保存的位置')
  const scroll = document.querySelector('.mobile-progress-scroll')
  const queueScroll = async () => act(async () => {
    scroll.scrollTop = 600
    scroll.dispatchEvent(new window.Event('scroll'))
  })
  await queueScroll()
  await act(async () => {
    window.history.replaceState({ ...window.history.state, mobileProgress: { scope: 'test-account', scrollTop: 120 } }, '')
    window.dispatchEvent(new window.PopStateEvent('popstate', { state: window.history.state }))
  })
  await act(async () => new Promise((resolve) => setTimeout(resolve, 200)))
  assert.equal(window.history.state.mobileProgress.scrollTop, 120)
  assert.equal(window.history.state.mobileRoleTasksMainTab, 'progress')
  await queueScroll()
  await harness.render(null)
  await act(async () => new Promise((resolve) => setTimeout(resolve, 200)))
  assert.equal(window.history.state.mobileProgress.scrollTop, 120, '离开后不能再写入旧页面的滚动位置')
})
