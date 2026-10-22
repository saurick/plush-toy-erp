import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPaginationTotal } from '../../common/utils/pagination.mjs'

import {
  BUSINESS_PAGE_SIZE_OPTIONS,
  createBusinessTablePagination,
  getBusinessPaginationParams,
  normalizeBusinessPageSize,
  resetBusinessPaginationCurrent,
  resolveExactRecordPage,
} from './businessPagination.mjs'

test('businessPagination: builds limit and offset from current page', () => {
  assert.deepEqual(getBusinessPaginationParams({ current: 3, pageSize: 50 }), {
    limit: 50,
    offset: 100,
  })
  assert.deepEqual(getBusinessPaginationParams({ current: 0, pageSize: 50 }), {
    limit: 50,
    offset: 0,
  })
})

test('businessPagination: creates Ant Design table pagination config', () => {
  const changes = []
  const onChange = (...args) => changes.push(args)
  const pagination = createBusinessTablePagination({
    pagination: { current: 2, pageSize: 50 },
    total: 123,
    onChange,
  })

  assert.equal(pagination.current, 2)
  assert.equal(pagination.pageSize, 50)
  assert.equal(pagination.total, 123)
  assert.equal(pagination.showSizeChanger, true)
  assert.deepEqual(pagination.pageSizeOptions, BUSINESS_PAGE_SIZE_OPTIONS)
  pagination.onChange(3, 50)
  assert.deepEqual(changes, [[3, 50]])
  assert.equal(pagination.showTotal, formatPaginationTotal)
  assert.equal(pagination.showTotal(123, [51, 100]), '第 51-100 条 / 共 123 条')
})

test('businessPagination: offers 50 through 500 rows per page', () => {
  assert.deepEqual(BUSINESS_PAGE_SIZE_OPTIONS, [50, 100, 200, 300, 500])
  assert.equal(BUSINESS_PAGE_SIZE_OPTIONS.every(Number.isFinite), true)
})

test('businessPagination: request and table use 50 rows by default and reject unsupported sizes', () => {
  for (const value of [undefined, null, '', 0, -1, 10, 20, 400, 501, 'bad']) {
    assert.equal(normalizeBusinessPageSize(value), 50)
    assert.deepEqual(getBusinessPaginationParams({ current: 2, pageSize: value }), {
      limit: 50,
      offset: 50,
    })
    assert.equal(createBusinessTablePagination({ pagination: { pageSize: value } }).pageSize, 50)
  }
  for (const pageSize of BUSINESS_PAGE_SIZE_OPTIONS) {
    assert.equal(normalizeBusinessPageSize(String(pageSize)), pageSize)
    assert.deepEqual(getBusinessPaginationParams({ current: 3, pageSize }), { limit: pageSize, offset: pageSize * 2 })
    assert.equal(createBusinessTablePagination({ pagination: { pageSize } }).pageSize, pageSize)
  }
  assert.deepEqual(getBusinessPaginationParams({ current: 2, pageSize: 100 }), {
    limit: 100,
    offset: 100,
  })
})

test('businessPagination: resets current page without changing page size', () => {
  let nextValue
  resetBusinessPaginationCurrent((updater) => {
    nextValue = updater({ current: 4, pageSize: 50 })
  })
  assert.deepEqual(nextValue, { current: 1, pageSize: 50 })
})

test('businessPagination: exact route context is a one-record page without duplicate totals', () => {
  const records = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }))
  const exactRecord = { id: 45 }

  assert.deepEqual(
    resolveExactRecordPage({
      records,
      exactRecord,
      hasExactContext: true,
      total: 45,
    }),
    { records: [exactRecord], total: 1 }
  )
  assert.deepEqual(
    resolveExactRecordPage({
      records,
      exactRecord: null,
      hasExactContext: true,
      total: 45,
    }),
    { records: [], total: 0 }
  )
})

test('businessPagination: ordinary pages preserve server rows and total', () => {
  const records = [{ id: 2 }, { id: 1 }]
  assert.deepEqual(resolveExactRecordPage({ records, total: 22 }), {
    records,
    total: 22,
  })
})

test('businessPagination: changing page size resets to page one while ordinary paging keeps its target', () => {
  const changes = []
  const pagination = createBusinessTablePagination({
    pagination: { current: 2, pageSize: 500 },
    total: 677,
    onChange: (...args) => changes.push(args),
  })
  pagination.onChange(2, 50)
  pagination.onChange(1, 500)
  pagination.onChange(2)
  assert.deepEqual(changes, [[1, 50], [1, 500], [2, 500]])
  assert.equal(createBusinessTablePagination({ total: 1 }).onChange, undefined)
})
