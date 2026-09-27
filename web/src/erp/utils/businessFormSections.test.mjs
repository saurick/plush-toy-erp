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
