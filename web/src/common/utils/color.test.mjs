import assert from 'node:assert/strict'
import test from 'node:test'

import { rgbToHsv } from './color.js'

test('rgbToHsv uses the blue-red delta when green is the maximum channel', () => {
  assert.deepEqual(rgbToHsv(0, 255, 0), { h: 120, s: 100, v: 100 })
  assert.deepEqual(rgbToHsv(64, 128, 96), { h: 150, s: 50, v: 50 })
})

test('rgbToHsv keeps the canonical primary and achromatic values', () => {
  assert.deepEqual(rgbToHsv(255, 0, 0), { h: 0, s: 100, v: 100 })
  assert.deepEqual(rgbToHsv(0, 0, 255), { h: 240, s: 100, v: 100 })
  assert.deepEqual(rgbToHsv(128, 128, 128), { h: 0, s: 0, v: 50 })
})
