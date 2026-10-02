import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getStyleL1ContextOptions,
  resolveStyleL1BrowserName,
} from './styleL1.mjs'

test('Style L1 rejects an unknown engine instead of producing Chromium evidence', () => {
  assert.equal(resolveStyleL1BrowserName(), 'chromium')
  assert.equal(resolveStyleL1BrowserName('webkit'), 'webkit')
  assert.throws(() => resolveStyleL1BrowserName('safari'), /STYLE_L1_BROWSER/)
  assert.throws(() => resolveStyleL1BrowserName('firefox'), /STYLE_L1_BROWSER/)
})

test('phone regressions enable mobile layout and touch while preserving explicit scenario settings', () => {
  const viewport = { width: 390, height: 844 }
  assert.deepEqual(getStyleL1ContextOptions({ viewport }), {
    viewport,
    isMobile: true,
    hasTouch: true,
  })
  assert.deepEqual(
    getStyleL1ContextOptions({ viewport, isMobile: false, hasTouch: false }),
    {
      viewport,
      isMobile: false,
      hasTouch: false,
    }
  )
  assert.equal(
    getStyleL1ContextOptions({ viewport: { width: 1440, height: 900 } })
      .isMobile,
    false
  )
})
