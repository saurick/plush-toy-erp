import assert from 'node:assert/strict'
import test from 'node:test'
import { statisticsFixtureData } from '../../../scripts/style-l1/businessStatisticsFixtures.mjs'
import {
  requireStatisticsBoard,
  requireStatisticsSources,
  statisticsNumber,
  statisticsQueryFromURL,
  statisticsPaginationFromURL,
  statisticsRatio,
  statisticsSum,
} from './businessStatistics.mjs'

test('statistics contracts preserve exact amounts, absent values and complete filtered totals', () => {
  assert.equal(
    statisticsNumber('12345678901234567890.12', true),
    '12,345,678,901,234,567,890.12'
  )
  assert.equal(statisticsNumber(null, true), '—')
  assert.equal(statisticsSum(['0.1', '0.2']), '0.3')
  assert.equal(statisticsSum(['0.1', null]), null)
  assert.equal(statisticsRatio('1', '3'), 33.33)
  const board = statisticsFixtureData({ limit: 1 })
  requireStatisticsBoard(board, 'delivery', 'customer')
  assert.equal(board.totals.count, 48)
  assert.equal(board.groups.length, 1)
  const source = statisticsFixtureData(
    { group_key: board.groups[0].key },
    { sources: true }
  )
  requireStatisticsSources(source, 'delivery')
  assert.equal(source.total, board.groups[0].count)
  requireStatisticsBoard(
    statisticsFixtureData({}, { restricted: true }),
    'delivery',
    'customer'
  )
  const finance = statisticsFixtureData({}, { ages: true })
  requireStatisticsBoard(finance, 'receivables', 'customer')
  assert.equal(finance.totals.balance, '358100')
})
test('malformed statistics fail closed without fabricating facts', () => {
  for (const mutate of [
    (data) => data.totals.done++,
    (data) => (data.groups[0].amount = 123),
    (data) => (data.total = -1),
    (data) => (data.groups[0].key = 'p:1'),
    (data) => (data.snapshot_at = ''),
    (data) => data.groups.push(data.groups[0]),
  ]) {
    const data = statisticsFixtureData()
    mutate(data)
    assert.throws(() => requireStatisticsBoard(data, 'delivery', 'customer'))
  }
  const finance = statisticsFixtureData({}, { ages: true })
  finance.totals.late_7 = '1'
  assert.throws(() =>
    requireStatisticsBoard(finance, 'receivables', 'customer')
  )
})
test('URL conditions keep statistics isolated from progress and normalize bounded pagination', () => {
  const query = statisticsQueryFromURL(
    new URLSearchParams(
      'view=statistics&report=receivables&group=product&q=other&sq=客户&stats_page=2&currency=USD&status=overdue'
    )
  )
  assert.equal(query.keyword, '客户')
  assert.equal(query.group_by, 'customer')
  assert.equal(query.period, 'all')
  assert.equal(query.limit, 8)
  assert.equal(query.offset, 8)
  assert.equal(query.currency, 'USD')
})

test('summary and source pagination preserve their own sizes and API offset bounds', () => {
  const params = new URLSearchParams(
    'stats_page=2&stats_size=20&source_page=2&source_size=8&page=3&page_size=50'
  )
  const summary = statisticsQueryFromURL(params)
  assert.equal(summary.limit, 20)
  assert.equal(summary.offset, 20)
  assert.deepEqual(
    statisticsPaginationFromURL(params, {
      source: true,
      fallbackSize: summary.limit,
    }),
    { limit: 8, offset: 8 }
  )
  params.delete('source_size')
  assert.deepEqual(
    statisticsPaginationFromURL(params, {
      source: true,
      fallbackSize: summary.limit,
    }),
    { limit: 20, offset: 20 }
  )
  for (const value of ['-1', 'NaN', 'Infinity']) {
    assert.deepEqual(
      statisticsPaginationFromURL(
        new URLSearchParams(`stats_page=${value}&stats_size=50`)
      ),
      { limit: 50, offset: 0 }
    )
  }
  assert.deepEqual(
    statisticsPaginationFromURL(
      new URLSearchParams('stats_page=999999&stats_size=50')
    ),
    { limit: 50, offset: 1000000 }
  )
  assert.deepEqual(
    statisticsPaginationFromURL(new URLSearchParams('stats_size=10')),
    { limit: 8, offset: 0 }
  )
})
