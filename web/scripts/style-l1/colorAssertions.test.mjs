import assert from 'node:assert/strict'
import test from 'node:test'
import { assertReadableOnDark, getContrastRatio, isAcceptedFocusBorder, parseRgb } from './colorAssertions.mjs'

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

test('focus borders match the selected theme token rather than a color family', () => {
  for (const [borderColor, expectedFocusBorder] of [
    ['rgb(37, 127, 124)', '#257f7c'],
    ['rgb(102, 101, 130)', '#666582'],
    ['rgb(186, 184, 220)', '#bab8dc'],
    ['rgb(10, 102, 194)', '#0a66c2'],
  ]) {
    assert.equal(isAcceptedFocusBorder({ borderColor, expectedFocusBorder }), true)
  }
  for (const borderColor of ['rgb(10, 102, 194)', 'rgb(119, 100, 180)', 'rgb(184, 182, 217)', 'transparent']) {
    assert.equal(isAcceptedFocusBorder({ borderColor, expectedFocusBorder: '#bab8dc' }), false)
  }
  assert.equal(isAcceptedFocusBorder({ borderColor: 'rgb(10, 102, 194)' }), false)
  assert.equal(isAcceptedFocusBorder({ borderColor: 'transparent', allowTransparentBorder: true }), true)
})

test('contrast uses composited alpha instead of opaque foreground RGB', () => {
  assert.deepEqual(parseRgb('rgba(255, 255, 255, 0.1)'), [255, 255, 255, 0.1])
  assert.throws(() => assertReadableOnDark('rgba(255, 255, 255, 0.1)', 'rgb(0, 0, 0)', 'low opacity text'))
  assert.doesNotThrow(() => assertReadableOnDark('rgb(255, 255, 255)', 'rgb(0, 0, 0)', 'white text'))
  assert.equal(getContrastRatio([255, 255, 255, 0], [0, 0, 0]), 1)
  assert.equal(getContrastRatio([255, 255, 255], [255, 255, 255, 0], [0, 0, 0]), 21)
})
