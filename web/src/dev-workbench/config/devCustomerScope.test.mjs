import assert from 'node:assert/strict'
import test from 'node:test'

import { readDevSummarySnapshot } from './devSummarySnapshot.mjs'
import {
  DEFAULT_DEV_CUSTOMER_SCOPE_KEY,
  DEV_CUSTOMER_QUERY_KEY,
  DEV_CUSTOMER_SCOPE_REGISTRY,
  buildDevCustomerScopeSearch,
  buildDevCustomerScopedRoute,
  buildDevCustomerSnapshotKey,
  resolveDevCustomerScope,
} from './devCustomerScope.mjs'

test('dev customer scope defaults an absent or blank query to Yongshen', () => {
  for (const search of ['', 'customer=', 'view=history&customer=%20']) {
    const scope = resolveDevCustomerScope(search)
    assert.equal(scope.status, 'ready')
    assert.equal(scope.customerKey, 'yoyoosun')
    assert.equal(scope.customer.label, '永绅 yoyoosun')
    assert.equal(scope.defaulted, true)
  }
  assert.equal(DEFAULT_DEV_CUSTOMER_SCOPE_KEY, 'yoyoosun')
  assert.equal(DEV_CUSTOMER_QUERY_KEY, 'customer')
})

test('dev customer scope accepts only a registered explicit customer', () => {
  const scope = resolveDevCustomerScope('customer=yoyoosun&view=pipeline')
  assert.equal(scope.status, 'ready')
  assert.equal(scope.customerKey, 'yoyoosun')
  assert.equal(scope.requestedCustomerKey, 'yoyoosun')
  assert.equal(scope.defaulted, false)
  assert.deepEqual(
    scope.registeredCustomers.map((customer) => customer.customerKey),
    Object.keys(DEV_CUSTOMER_SCOPE_REGISTRY)
  )

  const missing = resolveDevCustomerScope('customer=missing-customer')
  assert.equal(missing.status, 'missing')
  assert.equal(missing.customerKey, '')
  assert.equal(missing.requestedCustomerKey, 'missing-customer')

  const duplicate = resolveDevCustomerScope(
    'customer=yoyoosun&customer=missing-customer'
  )
  assert.equal(duplicate.status, 'invalid')
  assert.equal(duplicate.reason, 'duplicate_customer_query')
})

test('dev customer scope preserves neighboring query state and isolates snapshots', () => {
  assert.equal(
    buildDevCustomerScopeSearch('view=history', 'yoyoosun').toString(),
    'view=history&customer=yoyoosun'
  )
  assert.equal(
    buildDevCustomerScopedRoute('/__dev/version-center', 'yoyoosun'),
    '/__dev/version-center?customer=yoyoosun'
  )
  assert.equal(
    buildDevCustomerScopedRoute(
      '/__dev/version-center?view=history#operations',
      'yoyoosun'
    ),
    '/__dev/version-center?view=history&customer=yoyoosun#operations'
  )
  const snapshotKey = buildDevCustomerSnapshotKey('version-center', 'yoyoosun')
  assert.equal(snapshotKey, 'version-center-yoyoosun')
  assert.equal(readDevSummarySnapshot(snapshotKey), null)
  assert.equal(
    buildDevCustomerSnapshotKey('delivery-summary', 'yoyoosun'),
    'delivery-summary-yoyoosun'
  )
  assert.throws(
    () => buildDevCustomerScopeSearch('', 'missing-customer'),
    /registered customer/u
  )
  assert.throws(
    () => buildDevCustomerScopedRoute('//outside.example/path', 'yoyoosun'),
    /absolute app path/u
  )
  assert.throws(
    () =>
      buildDevCustomerSnapshotKey(
        'version-center-with-an-invalid_snapshot-key',
        'yoyoosun'
      ),
    /incompatible with snapshots/u
  )
})
