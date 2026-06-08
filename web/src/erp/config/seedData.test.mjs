import assert from 'node:assert/strict'
import test from 'node:test'

import {
  businessModuleDefinitions,
  getBusinessNavigationSections,
} from './businessModules.mjs'
import {
  getNavigationSections,
  getRoleWorkbench,
  roleWorkbenches,
} from './seedData.mjs'
import { appDefinitions } from './appRegistry.mjs'

test('seedData: 每个岗位任务端入口都有运行时角色标签', () => {
  const mobileApps = appDefinitions.filter((app) => app.kind === 'mobile')
  assert.equal(roleWorkbenches.length, mobileApps.length)
  assert(roleWorkbenches.some((role) => role.key === 'sales'))

  roleWorkbenches.forEach((role) => {
    assert(role.key)
    assert(role.title)
    assert(role.label)
    assert(Number.isInteger(role.port))
    assert.equal(getRoleWorkbench(role.key)?.title, role.title)
  })
  assert.equal(getRoleWorkbench('missing-role'), null)
})

test('seedData: 桌面导航移除前端文档与开发验收入口', () => {
  const navigationSections = getNavigationSections()
  const navPaths = navigationSections.flatMap((section) =>
    section.items.map((item) => item.path)
  )

  assert.deepEqual(
    navigationSections.map((section) => section.title),
    [
      '看板中心',
      '基础资料',
      '销售链路',
      '采购/仓储',
      '生产环节',
      '财务环节',
      '单据模板',
      '系统管理',
    ]
  )
  assert.deepEqual(
    navigationSections
      .find((section) => section.title === '看板中心')
      ?.items.map((item) => item.path),
    ['/erp/dashboard', '/erp/business-dashboard']
  )
  assert.deepEqual(
    navigationSections
      .find((section) => section.title === '单据模板')
      ?.items.map((item) => item.path),
    ['/erp/print-center']
  )
  assert.deepEqual(
    navigationSections
      .find((section) => section.title === '系统管理')
      ?.items.map((item) => item.path),
    ['/erp/system/permissions']
  )
  assert(!navPaths.includes('/erp/help-center'))
  assert(!navPaths.some((path) => path.startsWith('/erp/docs/')))
  assert(!navPaths.some((path) => path.startsWith('/erp/qa/')))
})

test('businessModules: 业务页菜单按毛绒业务收口且不依赖前端文档链接', () => {
  const businessSections = getBusinessNavigationSections()
  const navLabels = businessSections.flatMap((section) =>
    section.items.map((item) => item.label)
  )
  const navPaths = businessSections.flatMap((section) =>
    section.items.map((item) => item.path)
  )

  assert.equal(businessSections.length, 5)
  assert(navLabels.includes('客户档案'))
  assert(navLabels.includes('供应商档案'))
  assert(navLabels.includes('产品'))
  assert(navLabels.includes('销售订单'))
  assert(navLabels.includes('材料 BOM'))
  assert(navLabels.includes('加工合同/委外下单'))
  assert(navLabels.includes('品质检验'))
  assert(navLabels.includes('对账/结算'))
  assert(navLabels.includes('应收/开票登记'))
  assert(navLabels.includes('发票登记'))
  assert(!navLabels.includes('客户/供应商'))
  assert(!navLabels.includes('订单/款式立项'))
  assert(!navLabels.includes('外销'))
  assert(navPaths.includes('/erp/master/partners/customers'))
  assert(navPaths.includes('/erp/master/partners/suppliers'))
  assert(navPaths.includes('/erp/sales/project-orders/sales-orders'))
  assert(!navPaths.includes('/erp/master/partners'))
  assert(!navPaths.includes('/erp/sales/project-orders'))

  businessModuleDefinitions.forEach((moduleItem) => {
    assert(navPaths.includes(moduleItem.path))
  })
  businessModuleDefinitions.forEach((moduleItem) => {
    assert(moduleItem.path.startsWith('/erp/'))
    assert(moduleItem.sourceRefs.length > 0)
    assert.equal(moduleItem.relatedLinks, undefined)
  })
})

test('customerMenuConfig: 客户菜单配置可控制桌面菜单显隐、排序和文案', () => {
  const navigationSections = getNavigationSections({
    customerKey: 'demo',
    desktopMenu: {
      sections: [
        {
          title: '销售试用',
          items: ['sales-orders', 'customers', 'suppliers'],
        },
        {
          title: '系统',
          items: ['permission-center'],
        },
      ],
      hiddenItemKeys: ['suppliers'],
      itemOverrides: {
        'sales-orders': {
          label: '客户订单',
          shortLabel: '订单',
          description: '客户试用菜单里的销售订单入口。',
        },
      },
    },
  })

  assert.deepEqual(
    navigationSections.map((section) => section.title),
    ['销售试用', '系统']
  )
  assert.deepEqual(
    navigationSections[0].items.map((item) => item.key),
    ['sales-orders', 'customers']
  )
  assert.equal(navigationSections[0].items[0].label, '客户订单')
  assert.equal(navigationSections[0].items[0].shortLabel, '订单')
  assert(!navigationSections[0].items.some((item) => item.key === 'suppliers'))
})
