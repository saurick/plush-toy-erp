import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_PROTOTYPES_ROUTE,
  DEV_PROTOTYPE_ASSETS,
  DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY,
  DEV_PROTOTYPE_FILTER_OPTIONS,
  DEV_PROTOTYPE_FILTERS,
  DEV_PROTOTYPE_PINNED_STORAGE_KEY,
  DEV_PROTOTYPE_SELECTED_STORAGE_KEY,
  DEV_PROTOTYPE_STATUSES,
  DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY,
  applyDevPrototypePinnedState,
  buildDevPrototypeItems,
  filterDevPrototypeItems,
  groupDevPrototypeItemsByDirectory,
  isDevPrototypesEnabled,
  normalizeDevPrototypeExpandedGroupKeys,
  normalizeDevPrototypePinnedKeys,
  normalizeDevPrototypeSelectedKey,
  normalizeDevPrototypeStatusFilter,
} from './devPrototypes.mjs'

test('devPrototypes: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_PROTOTYPES_ROUTE, '/__dev/prototypes')
  assert.equal(isDevPrototypesEnabled({ DEV: true }), true)
  assert.equal(isDevPrototypesEnabled({ DEV: false }), false)
  assert(!DEV_PROTOTYPES_ROUTE.startsWith('/erp/'))
})

test('devPrototypes: 登记当前原型资产并区分类型和状态', () => {
  assert.equal(DEV_PROTOTYPE_ASSETS.length, 13)
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) => item.type === 'HTML').length,
    7
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) => item.type === 'PNG').length,
    6
  )

  const statuses = new Set(
    DEV_PROTOTYPE_ASSETS.flatMap((item) => item.statuses)
  )
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.CURRENT))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.DRAFT))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.HISTORY))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.EVIDENCE))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.COMPARISON))
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) =>
      item.statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT)
    ).length,
    6
  )
  assert.deepEqual(
    DEV_PROTOTYPE_FILTER_OPTIONS.map((option) => option.value),
    [
      DEV_PROTOTYPE_FILTERS.ALL,
      DEV_PROTOTYPE_FILTERS.CURRENT,
      DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
      DEV_PROTOTYPE_FILTERS.REFERENCE,
    ]
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find((item) => item.key === 'admin-command-center')
      ?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-task-collab-entry'
    )?.statuses[0],
    DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.find(
      (item) => item.key === 'business-direction-sidebar'
    )?.statuses[0],
    DEV_PROTOTYPE_STATUSES.DRAFT
  )
})

test('devPrototypes: 构建 HTML source 和 PNG URL 资产', () => {
  const items = buildDevPrototypeItems({
    htmlModules: {
      '../../../../docs/product/prototypes/admin-command-center-v1/index.html':
        '<!doctype html><title>极简后台工作台原型</title>',
      '../../../../docs/product/prototypes/business-module-page-standard-v1/index.html':
        '<!doctype html><title>极简业务模块标准页原型</title>',
      '../../../../docs/product/prototypes/business-detail-page-standard-v1/index.html':
        '<!doctype html><title>业务详情页标准样板</title>',
      '../../../../docs/product/prototypes/business-form-page-standard-v1/index.html':
        '<!doctype html><title>新建编辑表单标准样板</title>',
      '../../../../docs/product/prototypes/action-modal-drawer-standard-v1/index.html':
        '<!doctype html><title>弹窗抽屉动作标准样板</title>',
      '../../../../docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html':
        '<!doctype html><title>岗位任务端</title>',
    },
    imageModules: {
      '../../../../docs/product/prototypes/mobile-role-tasks-v1/images/mobile-role-tasks-list-reference.png':
        '/assets/mobile-role-tasks-list-reference.png',
    },
  })

  const businessPrototype = items.find(
    (item) => item.key === 'business-module-standard-page'
  )
  const commandCenterPrototype = items.find(
    (item) => item.key === 'admin-command-center'
  )
  const mobileList = items.find((item) => item.key === 'mobile-role-tasks-list')
  const detailPrototype = items.find(
    (item) => item.key === 'business-detail-standard-page'
  )
  const formPrototype = items.find(
    (item) => item.key === 'business-form-standard-page'
  )
  const actionPrototype = items.find(
    (item) => item.key === 'action-modal-drawer-standard'
  )

  assert.equal(commandCenterPrototype?.available, true)
  assert.match(commandCenterPrototype?.source || '', /极简后台工作台原型/)
  assert.equal(businessPrototype?.available, true)
  assert.match(businessPrototype?.source || '', /极简业务模块标准页原型/)
  assert.equal(detailPrototype?.available, true)
  assert.match(detailPrototype?.source || '', /业务详情页标准样板/)
  assert.equal(formPrototype?.available, true)
  assert.match(formPrototype?.source || '', /新建编辑表单标准样板/)
  assert.equal(actionPrototype?.available, true)
  assert.match(actionPrototype?.source || '', /弹窗抽屉动作标准样板/)
  assert.equal(mobileList?.available, true)
  assert.equal(mobileList?.url, '/assets/mobile-role-tasks-list-reference.png')
})

test('devPrototypes: 支持按状态和关键词筛选', () => {
  const items = buildDevPrototypeItems({
    htmlModules: {
      '../../../../docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html':
        '<!doctype html><title>岗位任务端</title>',
    },
  })

  assert.deepEqual(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.CURRENT,
    }).map((item) => item.key),
    ['mobile-role-tasks-implemented']
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.REFERENCE,
      keyword: '风险',
    }).some((item) => item.key === 'mobile-role-risk-dashboard')
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.REFERENCE,
    }).every(
      (item) =>
        !item.statuses.includes(DEV_PROTOTYPE_STATUSES.CURRENT) &&
        !item.statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT)
    )
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.CURRENT,
      keyword: '岗位任务端',
    }).some((item) => item.key === 'mobile-role-tasks-implemented')
  )
  assert.deepEqual(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
    }).map((item) => item.key),
    [
      'admin-command-center',
      'business-module-standard-page',
      'business-task-collab-entry',
      'business-detail-standard-page',
      'business-form-standard-page',
      'action-modal-drawer-standard',
    ]
  )
  assert.equal(
    filterDevPrototypeItems(items, { keyword: '../unsafe' }).length,
    0
  )
})

test('devPrototypes: 支持筛选和当前资产本地缓存归一化', () => {
  const items = buildDevPrototypeItems()

  assert.equal(
    DEV_PROTOTYPE_SELECTED_STORAGE_KEY,
    'plush_erp_dev_prototype_selected_key'
  )
  assert.equal(
    DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY,
    'plush_erp_dev_prototype_status_filter'
  )
  assert.equal(
    normalizeDevPrototypeStatusFilter(DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT),
    DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT
  )
  assert.equal(
    normalizeDevPrototypeStatusFilter('missing-filter'),
    DEV_PROTOTYPE_FILTERS.ALL
  )
  assert.equal(
    normalizeDevPrototypeSelectedKey('mobile-role-tasks-implemented', items),
    'mobile-role-tasks-implemented'
  )
  assert.equal(
    normalizeDevPrototypeSelectedKey('missing-prototype', items),
    items[0].key
  )
  assert.equal(normalizeDevPrototypeSelectedKey('', []), '')
})

test('devPrototypes: 支持置顶资产并清理无效 pin key', () => {
  const items = buildDevPrototypeItems()
  const pinnedKeys = normalizeDevPrototypePinnedKeys(
    [
      'mobile-role-tasks-list',
      'missing-key',
      'mobile-role-tasks-list',
      'business-module-standard-page',
    ],
    items
  )

  assert.equal(
    DEV_PROTOTYPE_PINNED_STORAGE_KEY,
    'plush_erp_dev_prototype_pinned_keys'
  )
  assert.deepEqual(pinnedKeys, [
    'mobile-role-tasks-list',
    'business-module-standard-page',
  ])

  const sortedItems = applyDevPrototypePinnedState(items, pinnedKeys)
  assert.deepEqual(
    sortedItems.slice(0, 2).map((item) => item.key),
    ['mobile-role-tasks-list', 'business-module-standard-page']
  )
  assert.deepEqual(
    sortedItems
      .filter((item) => item.pinned)
      .map((item) => [item.key, item.pinnedRank]),
    [
      ['mobile-role-tasks-list', 0],
      ['business-module-standard-page', 1],
    ]
  )
})

test('devPrototypes: 按所属目录分组并清理无效展开目录', () => {
  const items = buildDevPrototypeItems()
  const groups = groupDevPrototypeItemsByDirectory(items)

  assert.equal(
    DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY,
    'plush_erp_dev_prototype_expanded_groups'
  )
  assert.deepEqual(
    groups.map((group) => group.directory),
    [
      'admin-command-center-v1/',
      'business-module-page-standard-v1/',
      'business-detail-page-standard-v1/',
      'business-form-page-standard-v1/',
      'action-modal-drawer-standard-v1/',
      'business-module-page-standard-v1/images/',
      'mobile-role-tasks-v1/',
      'mobile-role-tasks-v1/images/',
    ]
  )
  assert.deepEqual(
    groups.map((group) => group.items.length),
    [1, 2, 1, 1, 1, 3, 1, 3]
  )

  assert.deepEqual(
    normalizeDevPrototypeExpandedGroupKeys(
      [
        'mobile-role-tasks-v1/images/',
        'missing-directory/',
        'mobile-role-tasks-v1/images/',
      ],
      groups.map((group) => group.key)
    ),
    ['mobile-role-tasks-v1/images/']
  )
})
