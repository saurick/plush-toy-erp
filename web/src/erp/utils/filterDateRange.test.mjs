import test from 'node:test'
import assert from 'node:assert/strict'
import { isCompleteDateRange, selectDateRangeDay } from './filterDateRange.mjs'
import { isWorkflowHistoryDateFilter } from './workflowRoleTaskHistory.mjs'
import { progressQueryFromURL } from './businessProgress.mjs'

test('日期草稿只有完整合法范围才能应用，允许同日、跨月和跨年', () => {
  for (const range of [
    { dateFrom: '2026-10-16', dateTo: '2026-10-16' },
    { dateFrom: '2026-10-31', dateTo: '2026-11-02' },
    { dateFrom: '2026-12-31', dateTo: '2027-01-01' },
  ]) {
    assert(isCompleteDateRange(range))
    assert(isWorkflowHistoryDateFilter({ period: 'custom', ...range }))
  }
  for (const range of [
    {}, { dateFrom: '2026-10-16' },
    { dateFrom: '2026-10-18', dateTo: '2026-10-16' },
    { dateFrom: '2026-02-30', dateTo: '2026-03-01' },
    { dateFrom: '2026/10/16', dateTo: '2026/10/18' },
  ]) assert.equal(isCompleteDateRange(range), false)
})

test('日期先选开始再选结束，提前日期重选开始，已完成范围可重新选取', () => {
  const start = selectDateRangeDay({}, '2026-10-16')
  assert.deepEqual(start, { dateFrom: '2026-10-16', dateTo: '' })
  assert.deepEqual(selectDateRangeDay(start, '2026-10-16'), { dateFrom: '2026-10-16', dateTo: '2026-10-16' })
  assert.deepEqual(selectDateRangeDay(start, '2026-10-12'), { dateFrom: '2026-10-12', dateTo: '' })
  const full = selectDateRangeDay(start, '2026-11-03')
  assert.deepEqual(selectDateRangeDay(full, '2026-11-05'), { dateFrom: '2026-11-05', dateTo: '' })
  assert.deepEqual(selectDateRangeDay(start, '2026-02-30'), start)
})

test('进度两端共用日期恢复规则，拒绝不存在日期及倒置范围', () => {
  for (const search of ['from=2026-02-30', 'from=2026-10-18&to=2026-10-16']) {
    const query = progressQueryFromURL(new URLSearchParams(search))
    assert.equal(query.date_from, '')
    assert.equal(query.date_to, '')
  }
})
