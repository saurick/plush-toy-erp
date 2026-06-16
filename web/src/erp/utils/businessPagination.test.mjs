import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUSINESS_PAGE_SIZE_OPTIONS,
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from './businessPagination.mjs'

test('businessPagination: builds limit and offset from current page', () => {
  assert.deepEqual(getBusinessPaginationParams({ current: 3, pageSize: 20 }), {
    limit: 20,
    offset: 40,
  })
  assert.deepEqual(getBusinessPaginationParams({ current: 0, pageSize: 50 }), {
    limit: 50,
    offset: 0,
  })
})

test('businessPagination: creates Ant Design table pagination config', () => {
  const onChange = () => {}
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
  assert.equal(pagination.onChange, onChange)
  assert.equal(pagination.showTotal(123, [51, 100]), '第 51-100 条 / 共 123 条')
})

test('businessPagination: resets current page without changing page size', () => {
  let nextValue
  resetBusinessPaginationCurrent((updater) => {
    nextValue = updater({ current: 4, pageSize: 50 })
  })
  assert.deepEqual(nextValue, { current: 1, pageSize: 50 })
})
