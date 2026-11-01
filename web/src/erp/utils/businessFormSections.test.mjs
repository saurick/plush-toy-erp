import assert from 'node:assert/strict'
import test from 'node:test'
import { activeFormSectionIndex } from './businessFormSections.mjs'

test('section tracking follows the top reading position and manual upward scrolling', () => {
  const tops = [14, 240, 760, 1100]
  assert.equal(activeFormSectionIndex(tops, 0, 600, 1500), 0)
  assert.equal(activeFormSectionIndex(tops, 225, 600, 1500), 1)
  assert.equal(activeFormSectionIndex(tops, 745, 600, 1500), 2)
  assert.equal(activeFormSectionIndex(tops, 60, 600, 1500), 0)
})

test('short final sections remain reachable at the scroll boundary', () => {
  assert.equal(activeFormSectionIndex([14, 240, 760, 1100], 600, 600, 1200), 3)
  assert.equal(activeFormSectionIndex([14, 100, 200], 0, 600, 600), 0)
  assert.equal(activeFormSectionIndex([], 0, 600, 600), -1)
})

test('manual scrolling visits every short trailing section in both directions', () => {
  const tops = [14, 166, 2124, 2394]
  const clientHeight = 917
  const scrollHeight = 2733
  const maxScroll = scrollHeight - clientHeight
  const positions = Array.from({ length: maxScroll + 1 }, (_, top) => top)
  const visited = (values) => [...new Set(values.map((top) =>
    activeFormSectionIndex(tops, top, clientHeight, scrollHeight)
  ))]
  assert.deepEqual(visited(positions), [0, 1, 2, 3])
  assert.deepEqual(visited(positions.toReversed()), [3, 2, 1, 0])
  assert.equal(activeFormSectionIndex(tops, maxScroll - 30, clientHeight, scrollHeight), 2)
  assert.equal(activeFormSectionIndex(tops, maxScroll - 1, clientHeight, scrollHeight), 3)
  assert.equal(activeFormSectionIndex(tops, maxScroll, clientHeight, scrollHeight), 3)
})

test('a tall final section follows the normal reading line without a bottom adjustment', () => {
  const tops = [14, 240, 760]
  assert.equal(activeFormSectionIndex(tops, 200, 600, 2400), 0)
  assert.equal(activeFormSectionIndex(tops, 215, 600, 2400), 1)
  assert.equal(activeFormSectionIndex(tops, 730, 600, 2400), 1)
  assert.equal(activeFormSectionIndex(tops, 735, 600, 2400), 2)
})
