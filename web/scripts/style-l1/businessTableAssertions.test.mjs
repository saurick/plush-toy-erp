import assert from 'node:assert/strict'
import test from 'node:test'
import { assertBusinessHeaderCompact } from './businessTableAssertions.mjs'

test('business header assertion rejects missing or malformed pagination for populated tables', async () => {
  const metrics = {
    primaryCount: 1,
    titles: ['订单'],
    redundantStats: 0,
    headers: [{ empty: false, left: 0, right: 100 }],
    viewportWidth: 100,
    pageWidth: 100,
    hasTableRows: true,
    pagination: [],
  }
  const page = {
    locator: () => ({ first: () => ({ waitFor: async () => {} }) }),
    evaluate: async () => metrics,
  }
  await assert.rejects(
    assertBusinessHeaderCompact(page, { scenarioName: 'populated' }),
    /应显示分页/u
  )
  metrics.pagination = ['格式错误']
  await assert.rejects(
    assertBusinessHeaderCompact(page, { scenarioName: 'populated' }),
    /分页应保留/u
  )
  metrics.pagination = ['第 1–10 条，共 10 条']
  await assertBusinessHeaderCompact(page, { scenarioName: 'populated' })
  metrics.hasTableRows = false
  metrics.pagination = []
  await assertBusinessHeaderCompact(page, { scenarioName: 'empty' })
})
