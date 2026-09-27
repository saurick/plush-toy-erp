import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ERP_ACCENTS,
  normalizeERPAppearance,
  readERPAppearance,
} from './erpAppearance.mjs'

test('appearance recovers from stale or unavailable storage without losing valid preferences', () => {
  for (const value of [
    null,
    false,
    'old-theme',
    { accent: '__proto__', density: 'wide' },
  ]) {
    assert.deepEqual(normalizeERPAppearance(value), {
      accent: 'blue',
      density: 'standard',
    })
  }
  for (const storage of [
    undefined,
    { getItem: () => '{broken' },
    {
      getItem() {
        throw new Error('blocked')
      },
    },
  ]) {
    assert.deepEqual(readERPAppearance(storage), {
      accent: 'blue',
      density: 'standard',
    })
  }
  assert.deepEqual(
    readERPAppearance({
      getItem: () => '{"accent":"purple","density":"compact"}',
    }),
    { accent: 'purple', density: 'compact' }
  )
})

test('every accent supplies readable primary button text and link colors', () => {
  const luminance = (hex) => {
    const rgb = hex
      .replace('#', '')
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  }
  const contrast = (a, b) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) /
    (Math.min(luminance(a), luminance(b)) + 0.05)
  for (const [name, accent] of Object.entries(ERP_ACCENTS)) {
    assert.ok(
      contrast(accent.onPrimary, accent.primary) >= 4.5,
      `${name}: primary button`
    )
    assert.ok(contrast(accent.strong, '#ffffff') >= 4.5, `${name}: light link`)
    assert.ok(contrast(accent.dark, '#18201b') >= 4.5, `${name}: dark link`)
  }
})
