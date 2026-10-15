import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRINT_BLANK_VALUE,
  coalescePrintValues,
  hasPrintValue,
  renderPrintValue,
} from './printValue.mjs'

test('FL_print_value_zero__keeps_explicit_zero_for_paper_and_pdf_output printValue: 显式 0 不按空态处理', () => {
  assert.equal(hasPrintValue(0), true)
  assert.equal(hasPrintValue('0'), true)
  assert.equal(renderPrintValue(0), 0)
  assert.equal(renderPrintValue('0'), '0')
  assert.equal(coalescePrintValues(0, 'fallback'), 0)
})

test('FL_print_value_blank__only_blank_like_values_render_as_print_blank printValue: 只有缺值或空白字符串渲染为空白占位', () => {
  assert.equal(hasPrintValue(null), false)
  assert.equal(hasPrintValue(undefined), false)
  assert.equal(hasPrintValue(''), false)
  assert.equal(hasPrintValue('   '), false)
  assert.equal(renderPrintValue(null), PRINT_BLANK_VALUE)
  assert.equal(renderPrintValue(undefined), PRINT_BLANK_VALUE)
  assert.equal(renderPrintValue(''), PRINT_BLANK_VALUE)
  assert.equal(renderPrintValue('   ', ''), '')
  assert.equal(coalescePrintValues('', '  ', 'fallback'), 'fallback')
})
