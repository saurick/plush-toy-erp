import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkbenchSummaryOptions,
  readSalesSummaryFilters,
  summaryPage,
  updateSummarySearch,
} from './workbenchSummary.mjs'

const actions = [
  'erp.workbench.read',
  'sales_order.read',
  'sales_order_item.read',
  'engineering.material.read',
]
function profile(permissions = actions) {
  return {
    permissions,
    roles: [{ role_key: 'custom-combined-role' }],
    effective_session: { pages: ['global-dashboard'], actions },
  }
}

test('workbench summaries follow effective capabilities for custom and combined roles', () => {
  assert.deepEqual(
    getWorkbenchSummaryOptions(profile()).map((item) => item.value),
    ['sales-orders', 'materials']
  )
  assert.deepEqual(
    getWorkbenchSummaryOptions(
      profile(actions.filter((key) => key !== 'engineering.material.read'))
    ).map((item) => item.value),
    ['sales-orders']
  )
  assert.deepEqual(
    getWorkbenchSummaryOptions(
      profile(actions.filter((key) => key !== 'sales_order_item.read'))
    ).map((item) => item.value),
    ['materials']
  )
  for (const missing of ['erp.workbench.read', 'sales_order.read']) {
    assert.deepEqual(
      getWorkbenchSummaryOptions(
        profile(actions.filter((key) => key !== missing))
      ),
      []
    )
  }
  assert.deepEqual(
    getWorkbenchSummaryOptions({
      ...profile(),
      is_super_admin: true,
      effective_session: { pages: [], actions },
    }),
    []
  )
  assert.deepEqual(
    getWorkbenchSummaryOptions({
      ...profile(),
      effective_session: { pages: ['global-dashboard'], actions: [] },
    }),
    []
  )
  assert.deepEqual(getWorkbenchSummaryOptions(null), [])
})

test('switching summary filters preserves workbench and other summary state', () => {
  const params = new URLSearchParams(
    'view=summary&queue=ready&page=3&materials.status=APPROVED&sales.page=4'
  )
  const updated = updateSummarySearch(params, 'sales', {
    q: 'SO-TEST',
    from: '2026-09-01',
    to: '2026-09-02',
  })
  assert.equal(updated.get('sales.page'), null)
  assert.equal(updated.get('materials.status'), 'APPROVED')
  assert.equal(updated.get('page'), '3')
  assert.equal(params.get('sales.page'), '4')
  assert.deepEqual(readSalesSummaryFilters(updated), {
    keyword: 'SO-TEST',
    customer: '',
    sales_owner: '',
    lifecycle_status: '',
    date_field: 'order_date',
    date_from: '2026-09-01T00:00:00+08:00',
    date_to: '2026-09-02T23:59:59+08:00',
    limit: 20,
    offset: 0,
  })
  assert.equal(
    readSalesSummaryFilters(updateSummarySearch(updated, 'sales', { page: 2 }))
      .offset,
    20
  )
})

test('URL paging and filters reject malformed values without inventing dates', () => {
  for (const value of ['1.2', '-1', '100001', 'Infinity', 'oops', null]) {
    assert.equal(summaryPage(value), 1)
  }
  const result = readSalesSummaryFilters(
    new URLSearchParams(
      'sales.status=unknown&sales.date=actual&sales.from=2026-02-31&sales.to=x&sales.page=-1'
    )
  )
  assert.equal(result.lifecycle_status, '')
  assert.equal(result.date_field, 'order_date')
  assert.equal(result.offset, 0)
  assert.equal(result.date_from, undefined)
  assert.equal(result.date_to, undefined)
})
