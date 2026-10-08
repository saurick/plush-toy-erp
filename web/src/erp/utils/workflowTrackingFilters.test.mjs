import assert from 'node:assert/strict'
import test from 'node:test'
import { clearTrackingFilters, readTrackingFilters, writeTrackingFilters, readTrackingPagination, writeTrackingPagination } from './workflowTrackingFilters.mjs'

test('tracking filters preserve peer scopes and source-document deep links', () => {
  const original = new URLSearchParams('track_search_started=小熊&track_source_type=sales_order&track_source_id=12&track_kind=process&track_id=1')
  const started = writeTrackingFilters(original, 'started', { status: 'active', owner_role_key: 'engineering', date_from: '2026-10-08', date_to: '2026-10-08' })
  const both = writeTrackingFilters(started, 'participated', { source_type: 'purchase_order', attention: 'blocked', search: '布料' })
  assert.equal(readTrackingFilters(both, 'started').status, 'active')
  assert.equal(readTrackingFilters(both, 'participated').source_type, 'purchase_order')
  const reset = clearTrackingFilters(both, 'started')
  assert.ok(Object.values(readTrackingFilters(reset, 'started')).every((value) => value === ''))
  assert.equal(reset.has('track_search_started'), false)
  assert.equal(reset.get('track_search_participated'), '布料')
  assert.equal(reset.get('track_source_type'), 'sales_order')
  assert.equal(reset.get('track_source_id'), '12')
  assert.equal(reset.get('track_id'), '1')
  assert.equal(original.has('track_status_started'), false)
})

test('pagination belongs to each scope and resets only when its filters or page size change', () => {
  let params = new URLSearchParams('track_source_id=12&track_source_type=sales_order&track_kind=process&track_id=1')
  params = writeTrackingPagination(params, 'started', 3, 20)
  params = writeTrackingPagination(params, 'participated', 2, 20)
  assert.deepEqual(readTrackingPagination(params, 'started'), { page: 3, pageSize: 20 })
  assert.deepEqual(readTrackingPagination(params, 'participated'), { page: 2, pageSize: 20 })
  for (const changes of [{ search: '小熊' }, { status: 'active' }, { owner_role_key: 'boss' }, { source_type: 'sales_order' }, { attention: 'blocked' }, { date_from: '2026-10-08' }, { date_to: '2026-10-08' }]) {
    const next = writeTrackingFilters(params, 'started', changes)
    assert.equal(readTrackingPagination(next, 'started').page, 1)
    assert.equal(readTrackingPagination(next, 'participated').page, 2)
    assert.equal(next.get('track_id'), '1')
    assert.equal(next.get('track_source_id'), '12')
  }
  const resized = writeTrackingPagination(params, 'started', 3, 8)
  assert.deepEqual(readTrackingPagination(resized, 'started'), { page: 1, pageSize: 8 })
  assert.deepEqual(readTrackingPagination(writeTrackingPagination(resized, 'started', 5, 8), 'started'), { page: 5, pageSize: 8 })
  assert.deepEqual(readTrackingPagination(clearTrackingFilters(resized, 'started'), 'started'), { page: 1, pageSize: 8 })
})

test('malformed or overflowing pagination links fall back to a valid first page', () => {
  for (const page of ['0', '-1', '1.5', '20x', '1e5', '9007199254740991']) {
    assert.deepEqual(readTrackingPagination(new URLSearchParams({ track_page_started: page }), 'started'), { page: 1, pageSize: 20 })
  }
  assert.deepEqual(readTrackingPagination(new URLSearchParams('track_page_size_started=100'), 'started'), { page: 1, pageSize: 20 })
})
