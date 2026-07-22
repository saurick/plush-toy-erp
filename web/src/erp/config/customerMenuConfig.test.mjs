import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCustomerMenuConfig,
  getCustomerNavigationPresentation,
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
