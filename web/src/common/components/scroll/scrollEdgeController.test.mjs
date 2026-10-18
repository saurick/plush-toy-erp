import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { getScrollEdgeState, mountScrollEdges } from './scrollEdgeController.mjs'

const metrics = {
  clientWidth: 200,
  scrollWidth: 600,
  clientHeight: 100,
  scrollHeight: 500,
  scrollLeft: 0,
  scrollTop: 0,
}

test('scroll edges distinguish start, middle, end and non-overflowing content on both axes', () => {
  assert.deepEqual(getScrollEdgeState(metrics), {
    left: false,
    right: true,
    top: false,
    bottom: true,
  })
  assert.deepEqual(
    getScrollEdgeState({ ...metrics, scrollLeft: 200, scrollTop: 200 }),
    { left: true, right: true, top: true, bottom: true }
  )
  assert.deepEqual(
    getScrollEdgeState({ ...metrics, scrollLeft: 400, scrollTop: 400 }),
    { left: true, right: false, top: true, bottom: false }
  )
  assert.deepEqual(
    getScrollEdgeState({ ...metrics, scrollWidth: 200, scrollHeight: 100 }),
    { left: false, right: false, top: false, bottom: false }
  )
})

test('scroll edges clamp elastic overscroll, tolerate rounding and respect hidden axes', () => {
  assert.deepEqual(
    getScrollEdgeState({ ...metrics, scrollLeft: -20, scrollTop: -10 }),
    getScrollEdgeState(metrics)
  )
  assert.deepEqual(
    getScrollEdgeState({ ...metrics, scrollLeft: 450, scrollTop: 500 }),
    { left: true, right: false, top: true, bottom: false }
  )
  assert.deepEqual(
    getScrollEdgeState({ ...metrics, scrollLeft: 399.5, scrollTop: 399.5 }),
    { left: true, right: false, top: true, bottom: false }
  )
  assert.deepEqual(getScrollEdgeState(metrics, { x: false, y: false }), {
    left: false,
    right: false,
    top: false,
    bottom: false,
  })
  assert.deepEqual(
    getScrollEdgeState({ ...metrics, clientWidth: 0, clientHeight: 0 }),
    { left: false, right: false, top: false, bottom: false }
  )
})

test('RTL horizontal edges describe physical left and right', () => {
  assert.deepEqual(getScrollEdgeState(metrics, { rtl: true, y: false }), {
    left: true,
    right: false,
    top: false,
    bottom: false,
  })
  assert.deepEqual(
    getScrollEdgeState(
      { ...metrics, scrollLeft: -400 },
      { rtl: true, y: false }
    ),
    { left: false, right: true, top: false, bottom: false }
  )
})

test('application observation discovers portal content, skips editing surfaces and cleans up on disposal', () => {
  const view = new Window()
  const doc = view.document
  const frames = new Map()
  let nextFrame = 0
  view.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }
  view.cancelAnimationFrame = (id) => frames.delete(id)
  const flush = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback())
  }
  const makeRegion = (tag = 'div') => {
    const node = doc.createElement(tag)
    node.style.overflowX = 'auto'
    node.style.overflowY = 'auto'
    Object.entries({ ...metrics, offsetWidth: 200, offsetHeight: 100 }).forEach(
      ([key, value]) =>
        Object.defineProperty(node, key, { configurable: true, value })
    )
    node.getBoundingClientRect = () => ({
      left: 20,
      top: 30,
      right: 220,
      bottom: 130,
      width: 200,
      height: 100,
    })
    return node
  }
  const region = makeRegion()
  const editor = makeRegion('textarea')
  const preview = makeRegion()
  preview.dataset.scrollEdges = 'off'
  doc.body.append(region, editor, preview)
  const dispose = mountScrollEdges(doc)
  flush()
  assert.equal(region.querySelectorAll('.app-scroll-edges').length, 1)
  assert.equal(editor.querySelectorAll('.app-scroll-edges').length, 0)
  assert.equal(preview.querySelectorAll('.app-scroll-edges').length, 0)
  assert.equal(region.querySelector('.app-scroll-edges').dataset.right, 'true')
  assert.equal(
    region.style.position,
    '',
    'scroll enhancement cannot change containing blocks'
  )
  region.dispatchEvent(new view.Event('scroll', { bubbles: false }))
  flush()
  assert.equal(
    region.querySelectorAll('.app-scroll-edges').length,
    1,
    'repeated scroll cannot duplicate the effect'
  )
  dispose()
  assert.equal(doc.querySelectorAll('.app-scroll-edges').length, 0)
  assert.equal(frames.size, 0)
  view.happyDOM.abort()
})
