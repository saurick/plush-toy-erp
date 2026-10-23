import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatContractPaperPrice,
  formatContractPaperAmount,
  formatContractPaperDate,
} from './contractPaperPresentation.mjs'

test('合同显示补零不舍入有效精度或掩盖非法、缺失值', () => {
  assert.equal(formatContractPaperPrice('1.25'), '1.250')
  assert.equal(formatContractPaperPrice('0'), '0.000')
  assert.equal(
    formatContractPaperPrice('99999999999999.123456'),
    '99999999999999.123456'
  )
  assert.equal(formatContractPaperAmount('2.5'), '2.50')
  for (const value of ['', '价格待定', '-1', '1.1234567', '1.']) {
    assert.equal(formatContractPaperPrice(value), value)
  }
})

test('合同签字日期保留自由文本，缺值只展示手填提示', () => {
  assert.equal(formatContractPaperDate('2026-10-24'), '2026 年 10 月 24 日')
  assert.equal(formatContractPaperDate('双方另议'), '双方另议')
  assert.equal(formatContractPaperDate('').replace(/\s/g, ''), '年月日')
})
