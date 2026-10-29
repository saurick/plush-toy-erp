import assert from 'node:assert/strict'
import test from 'node:test'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import {
  buildPermissionNavigationPlacement,
  groupPermissionPages,
  getPermissionPageAccessReason,
} from './permissionNavigation.mjs'

const path = (key) =>
  businessModuleDefinitions.find((item) => item.key === key).path

test('岗位导航预览按最终能力和来源投影历史入口，不以 RBAC 授权或历史页标记放行', () => {
  const access = {
    is_final: true,
    pages: [
      { path: path('processes'), effective: true },
      { path: '/erp/history', effective: true },
    ],
    permissions: [
      { permission_key: 'process.read', effective: true },
      { permission_key: 'process.update', rbac_granted: true, effective: false },
    ],
  }
  const visible = () => buildPermissionNavigationPlacement({ access }).pages.some((page) => page.path === '/erp/history')
  assert.equal(visible(), false)
  access.permissions[1].effective = true
  assert.equal(visible(), true)
  assert.equal(buildPermissionNavigationPlacement({
    access,
    navigationSections: [{ items: [{ key: 'history-records', path: '/erp/history', access: 'history' }] }],
  }).pages.length, 0, '配置隐藏唯一来源后不能保留集中入口')
  access.pages[0].effective = false
  assert.equal(visible(), false)
})

test('岗位实际菜单沿用四区导航，财务多页面合并且默认入口只取获准页面', () => {
  const result = buildPermissionNavigationPlacement({
    access: {
      is_final: true,
      pages: [
        { path: '/erp/dashboard', effective: true },
        { path: path('payables'), effective: true },
        { path: path('invoices'), effective: true },
        { path: path('receivables'), effective: false },
        { path: '/erp/print-center', effective: true },
      ],
    },
  })
  assert.deepEqual(
    result.sections.map((section) => section.title),
    ['工作中心', '业务模块', '工具与查询', '系统与帮助']
  )
  const finance = result.sections.find(
    (section) => section.key === 'business'
  ).items
  assert.deepEqual(
    finance.map((item) => [item.label, item.path]),
    [['财务管理', path('payables')]]
  )
  assert.equal(
    result.pages.some((item) => item.path === path('receivables')),
    false
  )
  assert.equal(result.pages.some((item) => item.path === '/erp/history'), false)
  assert.ok(result.pages.some((item) => item.path === '/erp/help-center'))
})

test('岗位菜单不显示仅路由入口，权限收窄后移除整个无权模块', () => {
  const result = buildPermissionNavigationPlacement({
    access: {
      is_final: true,
      pages: [
        { path: path('production-exceptions'), effective: true },
        { path: path('sales-orders'), effective: false },
        { path: path('payables'), effective: true },
      ],
    },
  })
  assert.deepEqual(
    result.sections
      .find((section) => section.key === 'business')
      .items.map((item) => item.label),
    ['财务管理']
  )
  assert.equal(
    result.pages.some((item) => item.path === path('production-exceptions')),
    false
  )
  assert.deepEqual(
    buildPermissionNavigationPlacement({
      access: {
        is_final: false,
        pages: [{ path: path('payables'), effective: true }],
      },
    }),
    { sections: [], pages: [] }
  )
  assert.deepEqual(buildPermissionNavigationPlacement(), {
    sections: [],
    pages: [],
  })
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
