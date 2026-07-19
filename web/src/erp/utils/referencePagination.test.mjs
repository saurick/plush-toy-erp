import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REFERENCE_PAGE_SIZE,
  listAllPaginatedRecords,
  listAllReferenceRecords,
} from './referencePagination.mjs'

function records(start, count) {
  return Array.from({ length: count }, (_, index) => ({ id: start + index }))
}

test('reference pagination reads every 200-row page without caller limits', async () => {
  const offsets = []
  const options = { signal: new AbortController().signal }
  const result = await listAllReferenceRecords(
    async (params, receivedOptions) => {
      offsets.push(params.offset)
      assert.equal(receivedOptions, options)
      assert.equal(params.limit, REFERENCE_PAGE_SIZE)
      assert.equal(params.active_only, true)
      return {
        product_skus:
          params.offset === 0 ? records(1, 200) : records(201, 2),
        total: 202,
        limit: 200,
        offset: params.offset,
      }
    },
    { active_only: true, limit: 500, offset: 50 },
    'product_skus',
    options
  )

  assert.deepEqual(offsets, [0, 200])
  assert.equal(result.product_skus.length, 202)
  assert.equal(result.total, 202)
  assert.equal(result.offset, 0)
})

test('reference pagination rejects partial and duplicate responses', async () => {
  await assert.rejects(
    listAllReferenceRecords(
      async () => ({
        product_skus: records(1, 20),
        total: 201,
        limit: 200,
        offset: 0,
      }),
      {},
      'product_skus'
    ),
    (error) => error?.isInvalidResponse === true
  )

  await assert.rejects(
    listAllReferenceRecords(
      async (params) => ({
        product_skus:
          params.offset === 0 ? records(1, 200) : [{ id: 200 }],
        total: 201,
        limit: 200,
        offset: params.offset,
      }),
      {},
      'product_skus'
    ),
    (error) => error?.isInvalidResponse === true
  )
})

test('strict pagination collects outsourcing facts beyond the backend default and across pages', async () => {
  const offsets = []
  const allFacts = records(1, 201).map((fact) => ({
    ...fact,
    fact_no: `OUT-RR-PAGE-${fact.id}`,
  }))
  const result = await listAllPaginatedRecords(
    async (params) => {
      offsets.push(params.offset)
      return {
        outsourcing_facts: allFacts.slice(
          params.offset,
          params.offset + params.limit
        ),
        total: allFacts.length,
        limit: params.limit,
        offset: params.offset,
      }
    },
    { source_type: 'OUTSOURCING_ORDER', source_id: 9, limit: 500 },
    'outsourcing_facts',
    {},
    {
      invalidResponseMessage: '服务器返回的委外业务记录不完整，请刷新后重试',
    }
  )

  assert.deepEqual(offsets, [0, 200])
  assert.equal(result.outsourcing_facts.length, 201)
  assert.equal(result.outsourcing_facts.at(-1).fact_no, 'OUT-RR-PAGE-201')
  assert.equal(result.limit, 200)
  assert.equal(result.offset, 0)
})

test('strict pagination keeps an active quality return beyond the old 20-row window and across pages', async () => {
  const offsets = []
  const allReturns = records(1, 201).map((record, index) => ({
    ...record,
    status: index === 200 ? 'DRAFT' : 'CANCELLED',
  }))
  const result = await listAllPaginatedRecords(
    async (params) => {
      offsets.push(params.offset)
      return {
        purchase_returns: allReturns.slice(
          params.offset,
          params.offset + params.limit
        ),
        total: allReturns.length,
        limit: params.limit,
        offset: params.offset,
      }
    },
    { quality_inspection_id: 9, limit: 20 },
    'purchase_returns'
  )

  assert.deepEqual(offsets, [0, 200])
  assert.equal(result.purchase_returns.length, 201)
  assert.equal(
    result.purchase_returns.find((item) => item.status !== 'CANCELLED')?.id,
    201
  )
})
