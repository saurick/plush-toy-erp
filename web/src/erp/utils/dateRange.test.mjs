import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isDateInputAfter,
  isDateInputBefore,
  isDateInputRangeReversed,
  parseDateInputValue,
} from './dateRange.mjs'

test('dateRange: 列表筛选允许同一天范围', () => {
  assert.equal(isDateInputRangeReversed('2026-06-17', '2026-06-17'), false)
  assert.equal(isDateInputRangeReversed('2026-06-18', '2026-06-17'), true)
})

test('dateRange: 生效期可要求结束必须晚于开始', () => {
  assert.equal(
    isDateInputRangeReversed('2026-06-17', '2026-06-17', {
      allowSameDay: false,
    }),
    true
  )
  assert.equal(
    isDateInputBefore('2026-06-17', '2026-06-17', { allowSameDay: false }),
    true
  )
  assert.equal(
    isDateInputAfter('2026-06-17', '2026-06-17', { allowSameDay: false }),
    true
  )
})

test('dateRange: 空值或非法值不伪造日期关系', () => {
  assert.equal(isDateInputBefore('', '2026-06-17'), false)
  assert.equal(isDateInputAfter('not-a-date', '2026-06-17'), false)
  assert.equal(isDateInputRangeReversed('2026/06/18', '2026/06/17'), true)
})

test('dateRange: 非法日历日期不会被归一化成有效日期', () => {
  assert.equal(parseDateInputValue('2026-02-31'), null)
  assert.equal(parseDateInputValue('2026-13-01'), null)
  assert.equal(parseDateInputValue('2026-00-10'), null)
  assert.equal(isDateInputAfter('2026-02-31', '2026-02-01'), false)
  assert.equal(isDateInputBefore('2026-13-01', '2026-12-01'), false)
})
