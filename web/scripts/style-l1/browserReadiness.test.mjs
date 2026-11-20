import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

test('popup readiness waits for the selected portal motion and ignores paused or looping page animations', async (t) => {
  const previous = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame }
  let release
  let finished = false
  let frames = 0
  const running = { playState: 'running', effect: { getTiming: () => ({ iterations: 1 }) }, get finished() { throw new Error('read live animation state instead of retaining a finished promise') } }
  release = () => { running.playState = 'finished' }
  const neverWait = (playState, iterations) => ({ playState, effect: { getTiming: () => ({ iterations }) }, get finished() { throw new Error('unrelated animation must not block the popup') } })
  const popup = { getClientRects: () => [1], getAnimations: () => [running, neverWait('paused', 1), neverWait('running', Infinity)] }
  globalThis.requestAnimationFrame = (callback) => queueMicrotask(() => { frames += 1; callback() })
  globalThis.document = { querySelectorAll: (selector) => { assert.equal(selector, '.ant-modal'); return [popup] }, getAnimations: () => { throw new Error('the full page is outside this popup check') } }
  t.after(() => Object.assign(globalThis, previous))
  const page = { evaluate: (fn, value) => fn(value) }
  const waiting = waitForFiniteAnimations(page, { selector: '.ant-modal' }).then(() => { finished = true })
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
  assert.equal(finished, false)
  const framesBeforeFinish = frames
  release()
  await waiting
  assert.equal(finished, true)
  assert.ok(frames >= framesBeforeFinish + 2, '完成后还需核对稳定绘制帧')
})

test('motion that does not finish fails with a bounded diagnostic', async (t) => {
  const previous = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  let expire
  let release
  let cleared = false
  globalThis.document = { getAnimations: () => [{ playState: 'running', effect: { getTiming: () => ({ iterations: 1 }) }, finished: new Promise((resolve) => { release = resolve }) }] }
  globalThis.requestAnimationFrame = (callback) => queueMicrotask(callback)
  globalThis.setTimeout = (callback, delay) => { assert.equal(delay, 5000); expire = callback; return 71 }
  globalThis.clearTimeout = (id) => { assert.equal(id, 71); cleared = true }
  t.after(() => { release?.(); Object.assign(globalThis, previous) })
  const waiting = waitForFiniteAnimations({ evaluate: (fn, value) => fn(value) })
  expire()
  await assert.rejects(waiting, /Browser motion did not settle: document/u)
  assert.equal(cleared, true)
})

test('readiness follows a replacement transition instead of returning when the original one finishes', async (t) => {
  const previous = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame }
  const animation = () => ({ playState: 'running', effect: { getTiming: () => ({ iterations: 1 }) } })
  const first = animation(), replacement = animation()
  let current = [first]
  let finished = false
  globalThis.requestAnimationFrame = (callback) => queueMicrotask(callback)
  globalThis.document = { getAnimations: () => current }
  t.after(() => Object.assign(globalThis, previous))
  const waiting = waitForFiniteAnimations({ evaluate: (fn, value) => fn(value) }).then(() => { finished = true })
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
  first.playState = 'finished'
  current = [replacement]
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
  assert.equal(finished, false, '新出现的有限动画仍须等待')
  replacement.playState = 'finished'
  await waiting
  assert.equal(finished, true)
})

test('readiness settles when a completed transition retains an unresolved finished promise', async (t) => {
  const previous = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame }
  const motion = { playState: 'running', effect: { getTiming: () => ({ iterations: 1 }) }, finished: new Promise(() => {}) }
  globalThis.requestAnimationFrame = (callback) => queueMicrotask(callback)
  globalThis.document = { getAnimations: () => [motion] }
  t.after(() => Object.assign(globalThis, previous))
  const waiting = waitForFiniteAnimations({ evaluate: (fn, value) => fn(value) })
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
  motion.playState = 'finished'
  await waiting
})
