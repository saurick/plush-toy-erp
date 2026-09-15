import assert from 'node:assert/strict'
import test from 'node:test'
import { updateMobileTaskToolbar } from './mobileTaskToolbar.mjs'

const initial = { top: 200, anchor: 200, direction: 0, visible: true }
const step = (state, scrollTop, options = {}) =>
  updateMobileTaskToolbar(state, {
    scrollTop,
    maxScrollTop: 1000,
    pinned: true,
    ...options,
  })

test('持续向下隐藏，向上回看显示，轻微反向移动不切换', () => {
  let state = step(initial, 224)
  assert.equal(state.visible, false)
  state = step(state, 216)
  assert.equal(state.visible, false)
  state = step(state, 208)
  assert.equal(state.visible, true)
  state = step(state, 220)
  assert.equal(state.visible, true)
  state = step(state, 232)
  assert.equal(state.visible, false)
})

test('滚动方向的小幅抖动不会让隐藏的筛选闪现', () => {
  let state = step(initial, 400)
  for (const top of [399, 402, 395, 401, 394, 399]) {
    state = step(state, top)
    assert.equal(state.visible, false)
  }
  state = step(state, 380)
  assert.equal(state.visible, true)
})

test('未吸顶和正在选择时保持显示，离开选择后重新累计距离', () => {
  let state = step(initial, 400)
  state = step(state, 420, { locked: true })
  assert.equal(state.visible, true)
  state = step(state, 430)
  assert.equal(state.visible, true)
  state = step(state, 444)
  assert.equal(state.visible, false)
  state = step(state, 120, { pinned: false })
  assert.equal(state.visible, true)
})

test('顶部和底部的弹性越界不计为反向滚动', () => {
  let state = step(initial, 1000)
  state = step(state, 1040)
  assert.equal(state.top, 1000)
  state = step(state, 999)
  assert.equal(state.visible, false)
  state = step(state, -30, { pinned: false })
  assert.equal(state.top, 0)
  assert.equal(state.visible, true)
})
