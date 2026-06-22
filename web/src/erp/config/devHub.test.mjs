import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_HUB_ALL_GROUP,
  DEV_HUB_ITEMS,
  DEV_HUB_MAX_PINNED_ITEMS,
  DEV_HUB_PINNED_STORAGE_KEY,
  DEV_HUB_ROUTE,
  buildDevHubPinnedItems,
  buildDevHubSummary,
  filterDevHubItems,
  getDevHubGroupOptions,
  isDevHubEnabled,
  normalizeDevHubPinnedRoutes,
  toggleDevHubPinnedRoute,
} from './devHub.mjs'

test('devHub: route and dev gate stay dev-only', () => {
  assert.equal(DEV_HUB_ROUTE, '/__dev')
  assert.equal(DEV_HUB_PINNED_STORAGE_KEY, 'plush_erp_dev_hub_pinned_routes')
  assert.equal(DEV_HUB_ALL_GROUP, 'all')
  assert.equal(DEV_HUB_MAX_PINNED_ITEMS, 5)
  assert.equal(isDevHubEnabled({ DEV: true }), true)
  assert.equal(isDevHubEnabled({ DEV: false }), false)
  assert.equal(isDevHubEnabled({}), false)
})

test('devHub: lists existing dev-only entry routes without backend assumptions', () => {
  assert.deepEqual(
    DEV_HUB_ITEMS.map((item) => item.route),
    [
      '/__dev/governance',
      '/__dev/docs',
      '/__dev/testing',
      '/__dev/prototypes',
      '/__dev/capability-ledger',
      '/__dev/customer-config',
    ]
  )
  assert(
    DEV_HUB_ITEMS.every((item) => item.route.startsWith('/__dev/')),
    'all child entries must remain under /__dev'
  )
  assert(
    DEV_HUB_ITEMS.every(
      (item) =>
        item.truthSource &&
        Array.isArray(item.guardrails) &&
        item.guardrails.length > 0
    ),
    'all dev hub entries must expose truth source and guardrail metadata'
  )
})

test('devHub: summary records dev-only boundary', () => {
  const summary = buildDevHubSummary()

  assert.equal(summary.entryCount, 6)
  assert.equal(summary.groupCount, 5)
  assert(summary.guardrailCount >= 10)
  assert.equal(summary.devOnly, true)
  assert.match(summary.boundary, /no menu/)
  assert.match(summary.boundary, /no backend business/)
})

test('devHub: filters by title, group, source and route', () => {
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, '测试').map((item) => item.key),
    ['testing']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, 'capability-ledger').map(
      (item) => item.key
    ),
    ['capability-ledger']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, 'config/customers').map(
      (item) => item.key
    ),
    ['customer-config']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, '不替代测试结果').map((item) => item.key),
    ['testing']
  )
  assert.equal(filterDevHubItems(DEV_HUB_ITEMS, 'missing').length, 0)
})

test('devHub: filters by governance group and keyword together', () => {
  assert.deepEqual(
    getDevHubGroupOptions(DEV_HUB_ITEMS).map((item) => item.value),
    [
      'all',
      '文档治理 / Docs',
      '验证治理 / QA',
      '产品设计 / Product Design',
      '产品治理 / Product Governance',
      '客户治理 / Customer Governance',
    ]
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, {
      group: '产品治理 / Product Governance',
    }).map((item) => item.key),
    ['capability-ledger']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, {
      group: '产品治理 / Product Governance',
      keyword: '测试',
    }),
    []
  )
  assert.equal(filterDevHubItems(DEV_HUB_ITEMS, { group: 'unknown' }).length, 0)
})

test('devHub: pinned routes keep valid unique dev entries up to the pin limit', () => {
  assert.deepEqual(
    normalizeDevHubPinnedRoutes([
      '/__dev/testing',
      '/__dev/governance',
      '/__dev/docs',
      '/__dev/customer-config',
      '/__dev/prototypes',
      '/__dev/capability-ledger',
      '/erp/dashboard',
      '/__dev/docs',
    ]),
    [
      '/__dev/testing',
      '/__dev/governance',
      '/__dev/docs',
      '/__dev/customer-config',
      '/__dev/prototypes',
    ]
  )
  assert.deepEqual(normalizeDevHubPinnedRoutes('invalid'), [])
})

test('devHub: toggling pinned routes adds, removes and ignores invalid routes', () => {
  assert.deepEqual(toggleDevHubPinnedRoute('/__dev/testing', ['/__dev/docs']), [
    '/__dev/testing',
    '/__dev/docs',
  ])
  assert.deepEqual(
    toggleDevHubPinnedRoute('/__dev/testing', [
      '/__dev/testing',
      '/__dev/docs',
    ]),
    ['/__dev/docs']
  )
  assert.deepEqual(toggleDevHubPinnedRoute('/erp/dashboard', ['/__dev/docs']), [
    '/__dev/docs',
  ])
})

test('devHub: builds pinned items in stored route order', () => {
  assert.deepEqual(
    buildDevHubPinnedItems(DEV_HUB_ITEMS, [
      '/__dev/prototypes',
      '/__dev/docs',
    ]).map((item) => item.key),
    ['prototypes', 'docs']
  )
})
