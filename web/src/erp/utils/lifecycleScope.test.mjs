import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  LIFECYCLE_SCOPE,
  filterLifecycleStatusOptions,
  lifecycleScopeFromSearchParams,
  lifecycleScopeIncludesStatus,
  normalizeLifecycleScope,
  withLifecycleScopeSearchParam,
} from './lifecycleScope.mjs'

test('生命周期范围默认当前，且只接受三个稳定值', () => {
  assert.equal(normalizeLifecycleScope(' HISTORY '), LIFECYCLE_SCOPE.HISTORY)
  assert.equal(normalizeLifecycleScope('all'), LIFECYCLE_SCOPE.ALL)
  assert.equal(normalizeLifecycleScope('archived'), LIFECYCLE_SCOPE.CURRENT)
  assert.equal(
    lifecycleScopeFromSearchParams(new URLSearchParams('scope=history')),
    LIFECYCLE_SCOPE.HISTORY
  )
})

test('状态选项按当前与历史语义过滤并保留全部状态入口', () => {
  const options = [
    { value: '', label: '全部状态' },
    { value: 'draft', label: '草稿' },
    { value: 'closed', label: '已关闭' },
    { value: 'canceled', label: '已取消' },
  ]
  assert.deepEqual(
    filterLifecycleStatusOptions(options, 'current', [
      'closed',
      'canceled',
    ]).map((option) => option.value),
    ['', 'draft']
  )
  assert.deepEqual(
    filterLifecycleStatusOptions(options, 'history', [
      'closed',
      'canceled',
    ]).map((option) => option.value),
    ['', 'closed', 'canceled']
  )
  assert.equal(
    lifecycleScopeIncludesStatus('history', 'draft', ['closed', 'canceled']),
    false
  )
})

test('当前范围不污染 URL，历史与全部范围可稳定深链', () => {
  assert.equal(
    withLifecycleScopeSearchParam(
      new URLSearchParams('scope=history&sales_order_id=7'),
      'current'
    ).toString(),
    'sales_order_id=7'
  )
  assert.equal(
    withLifecycleScopeSearchParam(new URLSearchParams(), 'history').get(
      'scope'
    ),
    'history'
  )
})

test('六类正式业务页面都把记录范围传给原列表 API', () => {
  const pageContracts = [
    ['../pages/V1MasterDataPage.jsx'],
    ['../pages/V1SalesOrdersPage.jsx'],
    [
      '../pages/V1PurchaseOrdersPage.jsx',
      '../components/purchase-orders/PurchaseOrderOperationPanel.jsx',
    ],
    ['../pages/V1OutsourcingOrdersPage.jsx'],
    ['../pages/V1ProductionOrdersPage.jsx'],
    ['../pages/BOMVersionsPage.jsx'],
  ]
  pageContracts.forEach(([pagePath, filterOwnerPath = pagePath]) => {
    const pageSource = fs.readFileSync(
      new URL(pagePath, import.meta.url),
      'utf8'
    )
    const filterOwnerSource = fs.readFileSync(
      new URL(filterOwnerPath, import.meta.url),
      'utf8'
    )
    assert.match(pageSource, /lifecycle_scope/u, pagePath)
    assert.match(filterOwnerSource, /LifecycleScopeFilter/u, filterOwnerPath)
  })
})
