import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_PROTOTYPES_ROUTE,
  DEV_PROTOTYPE_ASSETS,
  DEV_PROTOTYPE_STATUSES,
  buildDevPrototypeItems,
  filterDevPrototypeItems,
  isDevPrototypesEnabled,
} from './devPrototypes.mjs'

test('devPrototypes: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_PROTOTYPES_ROUTE, '/__dev/prototypes')
  assert.equal(isDevPrototypesEnabled({ DEV: true }), true)
  assert.equal(isDevPrototypesEnabled({ DEV: false }), false)
  assert(!DEV_PROTOTYPES_ROUTE.startsWith('/erp/'))
})

test('devPrototypes: 登记当前原型资产并区分类型和状态', () => {
  assert.equal(DEV_PROTOTYPE_ASSETS.length, 9)
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) => item.type === 'HTML').length,
    3
  )
  assert.equal(
    DEV_PROTOTYPE_ASSETS.filter((item) => item.type === 'PNG').length,
    6
  )

  const statuses = new Set(
    DEV_PROTOTYPE_ASSETS.flatMap((item) => item.statuses)
  )
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.CURRENT))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.EXPLORATION))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.HISTORY))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.EVIDENCE))
  assert(statuses.has(DEV_PROTOTYPE_STATUSES.COMPARISON))
})

test('devPrototypes: 构建 HTML source 和 PNG URL 资产', () => {
  const items = buildDevPrototypeItems({
    htmlModules: {
      '../../../../docs/product/prototypes/business-module-page-standard-v1/index.html':
        '<!doctype html><title>业务模块标准页原型</title>',
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
  const mobileList = items.find((item) => item.key === 'mobile-role-tasks-list')

  assert.equal(businessPrototype?.available, true)
  assert.match(businessPrototype?.source || '', /业务模块标准页原型/)
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
      status: DEV_PROTOTYPE_STATUSES.CURRENT,
    }).map((item) => item.key),
    ['mobile-role-tasks-implemented']
  )
  assert(
    filterDevPrototypeItems(items, {
      status: DEV_PROTOTYPE_STATUSES.EVIDENCE,
      keyword: '风险',
    }).some((item) => item.key === 'mobile-role-risk-dashboard')
  )
  assert.equal(
    filterDevPrototypeItems(items, { keyword: '../unsafe' }).length,
    0
  )
})
