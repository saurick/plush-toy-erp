import assert from 'node:assert/strict'
import test from 'node:test'
import { assertReadableOnDark, getContrastRatio, parseRgb } from './colorAssertions.mjs'

test('opaque hex and computed RGB colors normalize to the same RGBA channels', () => {
  assert.deepEqual(parseRgb('#bccbc2'), [188, 203, 194, 1])
  assert.deepEqual(parseRgb('#bccbc2'), parseRgb('rgb(188, 203, 194)'))
  assert.deepEqual(parseRgb('#BCCBC2'), parseRgb('rgba(188, 203, 194, 1)'))
  assert.notDeepEqual(parseRgb('#bccbc2'), parseRgb('rgba(188, 203, 194, 0.5)'))
})

test('shorthand CSS hex tokens preserve their full-color channels and contrast', () => {
  assert.deepEqual(parseRgb('#fff'), parseRgb('#ffffff'))
  assert.deepEqual(parseRgb('#000'), [0, 0, 0, 1])
  assert.deepEqual(parseRgb('#AbC'), [170, 187, 204, 1])
  assert.equal(getContrastRatio(parseRgb('#fff'), parseRgb('#000')), 21)
  assert.equal(parseRgb('#ff'), null)
})

test('contrast uses composited alpha instead of opaque foreground RGB', () => {
  assert.deepEqual(parseRgb('rgba(255, 255, 255, 0.1)'), [255, 255, 255, 0.1])
  assert.throws(() => assertReadableOnDark('rgba(255, 255, 255, 0.1)', 'rgb(0, 0, 0)', 'low opacity text'))
  assert.doesNotThrow(() => assertReadableOnDark('rgb(255, 255, 255)', 'rgb(0, 0, 0)', 'white text'))
  assert.equal(getContrastRatio([255,255,255,0], [0,0,0]), 1)
  assert.equal(getContrastRatio([255,255,255], [255,255,255,0], [0,0,0]), 21)
})
