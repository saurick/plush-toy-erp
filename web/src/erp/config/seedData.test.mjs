import assert from 'node:assert/strict'
import test from 'node:test'

import { getBusinessNavigationSections } from './businessModules.mjs'
import {
  getNavigationSections,
  getRoleWorkbench,
  roleWorkbenches,
} from './seedData.mjs'
import { appDefinitions } from './appRegistry.mjs'
import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'

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
      '主数据',
      '销售管理',
      '产品工程',
      '采购管理',
      '质检管理',
      '库存管理',
      '委外管理',
      '生产管理',
      '出货管理',
      '财务业务',
      '运营工具',
      '系统管理',
    ]
  )
  assert.deepEqual(
    navigationSections
      .find((section) => section.title === '看板中心')
      ?.items.map((item) => item.path),
    ['/erp/dashboard', '/erp/task-board', '/erp/business-dashboard']
  )
  assert.equal(
    navigationSections.find((section) => section.title === '事实闭环'),
    undefined
  )
  assert(!navPaths.includes('/erp/operations/facts'))
  assert.deepEqual(
    navigationSections
      .find((section) => section.title === '运营工具')
      ?.items.map((item) => item.path),
    ['/erp/print-center', '/erp/operations/exceptions']
  )
  assert.deepEqual(
    navigationSections
      .find((section) => section.title === '系统管理')
      ?.items.map((item) => item.path),
    ['/erp/system/permissions', '/erp/system/audit-logs']
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

  assert.equal(businessSections.length, 10)
  assert(navLabels.includes('客户档案'))
  assert(navLabels.includes('供应商档案'))
  assert(navLabels.includes('产品档案'))
  assert(navLabels.includes('材料档案'))
  assert(navLabels.includes('销售订单'))
  assert(navLabels.includes('BOM 管理'))
  assert(navLabels.includes('加工环节'))
  assert(navLabels.includes('采购订单'))
  assert(navLabels.includes('入库管理'))
  assert(navLabels.includes('来料质检'))
  assert(navLabels.includes('库存台账'))
  assert(navLabels.includes('委外订单'))
  assert(navLabels.includes('生产排程'))
  assert(navLabels.includes('生产进度'))
  assert(navLabels.includes('生产异常'))
  assert(navLabels.includes('出货放行'))
  assert(navLabels.includes('出库管理'))
  assert(navLabels.includes('出货单'))
  assert(navLabels.includes('对账管理'))
  assert(navLabels.includes('应付管理'))
  assert(navLabels.includes('应收管理'))
  assert(navLabels.includes('发票管理'))
  assert(!navLabels.includes('客户/供应商'))
  assert(!navLabels.includes('订单/款式立项'))
  assert(!navLabels.includes('外销'))
  assert(navPaths.includes('/erp/master/partners/customers'))
  assert(navPaths.includes('/erp/master/partners/suppliers'))
  assert(navPaths.includes('/erp/sales/project-orders/sales-orders'))
  assert(navPaths.includes('/erp/master/products'))
  assert(navPaths.includes('/erp/master/materials'))
  assert(navPaths.includes('/erp/purchase/material-bom'))
  assert(navPaths.includes('/erp/engineering/processes'))
  assert(navPaths.includes('/erp/purchase/accessories'))
  assert(navPaths.includes('/erp/warehouse/inbound'))
  assert(navPaths.includes('/erp/production/quality-inspections'))
  assert(navPaths.includes('/erp/warehouse/shipments'))
  assert(navPaths.includes('/erp/finance/receivables'))
  assert(!navPaths.includes('/erp/master/partners'))
  assert(!navPaths.includes('/erp/sales/project-orders'))
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
          items: ['permission-center', 'system-audit-logs'],
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

test('customerMenuConfig: yoyoosun 保留任务看板并隐藏高级和预览入口', () => {
  const navigationSections = getNavigationSections(yoyoosunMenuConfig)
  const navPaths = navigationSections.flatMap((section) =>
    section.items.map((item) => item.path)
  )

  assert(navPaths.includes('/erp/task-board'))
  assert(navPaths.includes('/erp/dashboard'))
  assert(navPaths.includes('/erp/production/progress'))
  assert(navPaths.includes('/erp/warehouse/outbound'))
  assert(navPaths.includes('/erp/warehouse/shipments'))
  assert(!navPaths.includes('/erp/business-dashboard'))
  assert(!navPaths.includes('/erp/operations/exceptions'))
  assert(!navPaths.includes('/erp/production/scheduling'))
  assert(!navPaths.includes('/erp/production/exceptions'))
  assert(!navPaths.includes('/erp/warehouse/shipping-release'))
})
