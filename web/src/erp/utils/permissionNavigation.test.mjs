import assert from 'node:assert/strict'
import test from 'node:test'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import { getNavigationSections } from '../config/seedData.mjs'
import {
  buildRoleGuidedNavigationPreview,
  reconcileRoleNavigationPaths,
} from '../config/roleGuidedNavigation.mjs'
import {
  buildRoleNavigationModules,
  serializeRoleNavigationModules,
  groupPermissionPages,
  getPermissionPageAccessReason,
} from './permissionNavigation.mjs'

const definitions = businessModuleDefinitions.filter(
  (item) =>
    ['finance', 'sales', 'master', 'shipment'].includes(item.sectionKey) &&
    item.sidebarVisible !== false
)
const options = definitions.map((menuItem) => ({
  value: menuItem.path,
  label: menuItem.label,
  menuItem,
  effective: true,
}))
const path = (key) => definitions.find((item) => item.key === key).path
const finance = options.filter((item) => item.menuItem.sectionKey === 'finance')

test('同一模块多个页面只占一个常用入口，完整保存所有授权页面', () => {
  const modules = buildRoleNavigationModules({
    options,
    primaryMenuPaths: finance.map((page) => page.value),
    secondaryMenuPaths: [path('sales-orders')],
  })
  assert.equal(modules.primaryItems.length, 1)
  assert.equal(modules.primaryItems[0].label, '财务管理')
  assert.equal(modules.primaryItems[0].pages.length, 5)
  const saved = serializeRoleNavigationModules(modules)
  assert.equal(saved.primaryMenuPaths.length, 1)
  assert.equal(
    new Set([...saved.primaryMenuPaths, ...saved.secondaryMenuPaths]).size,
    options.length
  )
  assert.equal(saved.secondaryMenuPaths.length, options.length - 1)
})

test('模块默认页面、位置与顺序在保存读回和实际导航预览中一致', () => {
  const initial = buildRoleNavigationModules({
    options,
    primaryMenuPaths: [path('receivables')],
    secondaryMenuPaths: [
      path('sales-orders'),
      path('customers'),
      path('shipments'),
    ],
  })
  const financeModule = { ...initial.primaryItems[0], path: path('payables') }
  const sales = initial.secondaryItems.find((item) => item.label === '销售管理')
  const next = {
    primaryItems: [sales],
    secondaryItems: [
      financeModule,
      ...initial.secondaryItems.filter((item) => item !== sales),
    ],
  }
  const saved = serializeRoleNavigationModules(next)
  assert.equal(saved.secondaryMenuPaths[0], path('payables'))
  const restored = buildRoleNavigationModules({ options, ...saved })
  assert.deepEqual(
    restored.primaryItems.map((item) => item.key),
    next.primaryItems.map((item) => item.key)
  )
  assert.deepEqual(
    restored.secondaryItems.map((item) => [item.key, item.path]),
    next.secondaryItems.map((item) => [item.key, item.path])
  )
  const preview = buildRoleGuidedNavigationPreview({
    navigationSections: getNavigationSections(),
    effectiveAccess: {
      is_final: true,
      pages: options.map((item) => ({
        key: item.menuItem.key,
        path: item.value,
        effective: true,
      })),
    },
    roleKey: 'finance',
    navigationMode: 'custom',
    ...saved,
  })
  assert.deepEqual(
    preview.primaryItems.map((item) => item.label),
    ['销售管理']
  )
  assert.equal(preview.secondaryItems[0].label, '财务管理')
  assert.equal(preview.secondaryItems[0].path, path('payables'))
})

test('权限收窄后剔除无权页面，保留同模块有效入口和其他模块', () => {
  const availableMenuPaths = [
    path('receivables'),
    path('payables'),
    path('sales-orders'),
  ]
  const reconciled = reconcileRoleNavigationPaths({
    primaryMenuPaths: [
      path('invoices'),
      path('receivables'),
      path('payables'),
      path('sales-orders'),
    ],
    secondaryMenuPaths: [],
    effectivePaths: availableMenuPaths,
  })
  assert.deepEqual(reconciled.primaryMenuPaths, [
    path('receivables'),
    path('sales-orders'),
  ])
  assert.deepEqual(reconciled.secondaryMenuPaths, [path('payables')])
  const visible = buildRoleNavigationModules({
    options: options.filter((item) => availableMenuPaths.includes(item.value)),
    ...reconciled,
  })
  assert.deepEqual(
    visible.primaryItems[0].pages.map((item) => item.value).sort(),
    [path('receivables'), path('payables')].sort()
  )
})

test('页面按正式模块归属分组并保留逐页访问结果，未知页面不丢失', () => {
  const pages = [
    {
      key: 'material-bom',
      label: 'BOM 管理',
      path: businessModuleDefinitions.find(
        (item) => item.key === 'material-bom'
      ).path,
      effective: false,
    },
    { key: 'processes', label: '工序档案', effective: true },
    { key: 'payables', path: path('payables'), effective: true },
    { key: 'unknown', path: '/custom', label: '待登记页面', effective: false },
  ]
  const groups = groupPermissionPages(pages)
  assert.deepEqual(
    groups.map((group) => group.title),
    ['产品工程', '财务管理', '其他页面']
  )
  assert.deepEqual(
    groups[0].items.map((item) => item.label),
    ['物料清单（BOM）', '加工环节']
  )
  assert.equal(groups.flatMap((group) => group.items).length, 4)
  assert.equal(groups[0].items[0].effective, false)
})

test('访问原因只解释服务端结果，不从岗位授权推断最终可进入', () => {
  assert.match(
    getPermissionPageAccessReason({
      rbac_granted: true,
      effective: false,
      reasons: [{ code: 'page_not_configured_or_projected' }],
    }),
    /公司配置.*或未分配/
  )
  assert.match(
    getPermissionPageAccessReason({
      effective: false,
      reasons: [{ code: 'missing_rbac_permission' }],
    }),
    /岗位尚未授权/
  )
  assert.equal(
    getPermissionPageAccessReason({
      effective: true,
      reasons: [{ label: '过期原因' }],
    }),
    '—'
  )
  assert.equal(
    getPermissionPageAccessReason({
      effective: false,
      reasons: [{ code: 'future', label: '新的业务限制' }],
    }),
    '新的业务限制'
  )
  assert.match(
    getPermissionPageAccessReason({ effective: false }),
    /尚未取得具体原因/
  )
})
