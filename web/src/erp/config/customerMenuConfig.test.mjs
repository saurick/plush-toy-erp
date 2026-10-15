import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCustomerMenuConfig,
  getCustomerNavigationPresentation,
  getSidebarNavigationSections,
} from './customerMenuConfig.mjs'

test('customerMenuConfig: 仅接受已登记的岗位引导展示模式', () => {
  assert.equal(
    getCustomerNavigationPresentation({
      desktopMenu: { presentation: 'role_guided' },
    }),
    'role_guided'
  )
  assert.equal(
    getCustomerNavigationPresentation({
      desktopMenu: { presentation: 'unknown_mode' },
    }),
    'sectioned'
  )
  assert.equal(getCustomerNavigationPresentation(null), 'sectioned')
})

test('customerMenuConfig: 展示模式不改变菜单内容投影', () => {
  const baseSections = [
    {
      title: '基础资料',
      items: [
        { key: 'customers', path: '/erp/customers' },
        { key: 'suppliers', path: '/erp/suppliers' },
      ],
    },
  ]
  const result = applyCustomerMenuConfig(baseSections, {
    desktopMenu: {
      presentation: 'role_guided',
      hiddenItemKeys: [],
    },
  })

  assert.deepEqual(result, baseSections)
})

test('customerMenuConfig: 侧栏隐藏内部入口但保留其路由注册', () => {
  const baseSections = [
    {
      title: '生产管理',
      items: [
        { key: 'production-orders', path: '/erp/production/orders' },
        {
          key: 'production-scheduling',
          path: '/erp/production/scheduling',
          sidebarVisible: false,
        },
        { key: 'production-progress', path: '/erp/production/progress' },
        {
          key: 'production-exceptions',
          path: '/erp/production/exceptions',
          sidebarVisible: false,
        },
      ],
    },
  ]
  const configured = applyCustomerMenuConfig(baseSections, {
    desktopMenu: {
      routeOnlyItemKeys: [
        'production-scheduling',
        'production-exceptions',
      ],
      sections: [
        {
          title: '生产管理',
          items: ['production-orders', 'production-progress'],
        },
      ],
    },
  })

  assert.deepEqual(
    configured[0].items.map((item) => item.key),
    [
      'production-orders',
      'production-progress',
      'production-scheduling',
      'production-exceptions',
    ]
  )
  assert.deepEqual(
    getSidebarNavigationSections(configured)[0].items.map((item) => item.key),
    ['production-orders', 'production-progress']
  )
})
