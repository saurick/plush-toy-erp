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

test('收付款汇总需要工作台和收付款的有效读取权限，单一或组合岗位均可查看', () => {
  const options = (permissions, effective = permissions, pages = ['global-dashboard']) =>
    getWorkbenchSummaryOptions({ permissions, effective_session: { actions: effective, pages } }).map((item) => item.value)
  const finance = ['erp.workbench.read', 'finance.payment.read']
  assert.deepEqual(options(finance), ['payments'])
  assert.deepEqual(options([...actions, ...finance]), ['sales-orders', 'materials', 'payments'])
  assert.deepEqual(options(['finance.payment.read']), [])
  assert.deepEqual(options(finance, ['erp.workbench.read']), [])
  assert.deepEqual(options(['erp.workbench.read'], finance), [])
  assert.deepEqual(options(finance, finance, []), [])
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

test('summary selections use customer identity and full owner names, with visible text filters on earlier links', () => {
  const old = new URLSearchParams({ 'sales.customer': '客户', 'sales.owner': '跟单' })
  const selected = updateSummarySearch(old, 'sales', { customer_id: 42, owner_name: '跟'.repeat(128) })
  const filters = readSalesSummaryFilters(selected)
  assert.equal(filters.customer_id, 42)
  assert.equal(filters.sales_owner_name.length, 128)
  assert.equal(filters.customer, '')
  assert.equal(filters.sales_owner, '')
  assert.equal(readSalesSummaryFilters(old).customer, '客户')
  assert.equal(readSalesSummaryFilters(old).sales_owner, '跟单')
  for (const id of ['0', '-1', '1.5', '1e2', '9007199254740993']) {
    assert.equal(readSalesSummaryFilters(new URLSearchParams({ 'sales.customer_id': id })).customer_id, undefined)
  }
})
