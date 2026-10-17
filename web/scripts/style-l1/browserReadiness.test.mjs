import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

test('popup readiness waits for the selected portal motion and ignores paused or looping page animations', async (t) => {
  const previous = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame }
  let release
  let finished = false
  let frames = 0
  const running = { playState: 'running', effect: { getTiming: () => ({ iterations: 1 }) }, finished: new Promise((resolve) => { release = resolve }) }
  const neverWait = (playState, iterations) => ({ playState, effect: { getTiming: () => ({ iterations }) }, get finished() { throw new Error('unrelated animation must not block the popup') } })
  const popup = { getClientRects: () => [1], getAnimations: () => [running, neverWait('paused', 1), neverWait('running', Infinity)] }
  globalThis.requestAnimationFrame = (callback) => queueMicrotask(() => { frames += 1; callback() })
  globalThis.document = { querySelectorAll: (selector) => { assert.equal(selector, '.ant-modal'); return [popup] }, getAnimations: () => { throw new Error('the full page is outside this popup check') } }
  t.after(() => Object.assign(globalThis, previous))
  const page = { evaluate: (fn, value) => fn(value) }
  const waiting = waitForFiniteAnimations(page, { selector: '.ant-modal' }).then(() => { finished = true })
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve()
  assert.equal(finished, false)
  release()
  await waiting
  assert.equal(finished, true)
  assert.equal(frames, 4)
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
