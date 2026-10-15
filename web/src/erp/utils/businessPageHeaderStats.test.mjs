import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isBusinessPageHeaderStatValue,
  normalizeBusinessPageHeaderStats,
} from './businessPageHeader.mjs'

test('business page header stats accept non-negative safe integer counts', () => {
  assert.equal(isBusinessPageHeaderStatValue(0), true)
  assert.equal(isBusinessPageHeaderStatValue(496), true)
  assert.equal(isBusinessPageHeaderStatValue(Number.MAX_SAFE_INTEGER), true)

  for (const value of [
    -1,
    1.5,
    '496',
    '库存变动记录',
    true,
    null,
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.equal(isBusinessPageHeaderStatValue(value), false)
  }
})

test('business page header stats drop non-count values without coercion', () => {
  const zero = { key: 'zero', label: '本页显示', value: 0 }
  const total = { key: 'total', label: '筛选结果', value: 496 }

  assert.deepEqual(
    normalizeBusinessPageHeaderStats([
      { key: 'view', label: '查看内容', value: '库存变动记录' },
      zero,
      { key: 'string-count', label: '字符串数量', value: '20' },
      total,
      { key: 'negative', label: '错误数量', value: -1 },
    ]),
    [zero, total]
  )
  assert.deepEqual(normalizeBusinessPageHeaderStats(null), [])
})
