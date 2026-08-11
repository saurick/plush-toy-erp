import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCSVText,
  escapeCSVCell,
  protectCSVCellValue,
} from './csvExport.mjs'

test('protectCSVCellValue neutralizes spreadsheet formulas in text cells', () => {
  for (const value of [
    '=1+1',
    '+cmd',
    '-2+3',
    '@SUM(A1:A2)',
    '  =1+1',
    '\tformula',
    '\rformula',
  ]) {
    assert.equal(protectCSVCellValue(value), `'${value}`)
  }
})

test('protectCSVCellValue keeps numeric values numeric-looking', () => {
  assert.equal(protectCSVCellValue(-12.5), '-12.5')
  assert.equal(protectCSVCellValue(0), '0')
  assert.equal(protectCSVCellValue(null), '')
})

test('escapeCSVCell quotes separators, quotes, and line breaks', () => {
  assert.equal(escapeCSVCell('普通文本'), '普通文本')
  assert.equal(escapeCSVCell('a,b'), '"a,b"')
  assert.equal(escapeCSVCell('a"b'), '"a""b"')
  assert.equal(escapeCSVCell('a\nb'), '"a\nb"')
})

test('buildCSVText serializes rows with formula protection', () => {
  assert.equal(
    buildCSVText([
      ['名称', '金额'],
      ['=HYPERLINK("https://example.com")', -10],
    ]),
    '名称,金额\n"\'=HYPERLINK(""https://example.com"")",-10'
  )
})
