import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM } from './reactRuntime.mjs'

test('textarea computed border widths resolve none and hidden to zero without changing authored styles', (t) => {
  const dom = installTestDOM()
  t.after(() => dom.restore())
  const textarea = document.createElement('textarea')
  textarea.style.cssText = 'border: none; border-bottom-style: hidden; padding: 4px; box-sizing: border-box;'
  textarea.style.borderLeftWidth = '7px'
  document.body.append(textarea)

  for (const readStyle of [window.getComputedStyle.bind(window), getComputedStyle]) {
    const style = readStyle(textarea)
    assert.equal(style.getPropertyValue('border-top-width'), '0px')
    assert.equal(style.borderBottomWidth, '0px')
    assert.equal(style.borderLeftWidth, '0px')
    assert.equal(style.paddingTop, '4px')
    assert.equal(style.boxSizing, 'border-box')
  }
  assert.equal(textarea.style.borderTopWidth, 'initial')
  assert.equal(textarea.style.borderLeftWidth, '7px')
})

test('textarea computed styles preserve visible borders and DOM cleanup restores the host getter', () => {
  const originalGetter = globalThis.getComputedStyle
  const dom = installTestDOM()
  try {
    const textarea = document.createElement('textarea')
    textarea.style.cssText = 'border: 3px solid; padding: 4px;'
    document.body.append(textarea)
    const style = getComputedStyle(textarea)
    assert.equal(style.getPropertyValue('border-top-width'), '3px')
    assert.equal(style.borderBottomWidth, '3px')
    assert.equal(style.getPropertyValue('border-top-style'), 'solid')
    assert.equal(style.getPropertyPriority('border-top-width'), '')
  } finally {
    dom.restore()
  }
  assert.equal(globalThis.getComputedStyle, originalGetter)
})
