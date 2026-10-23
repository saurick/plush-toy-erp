import assert from 'node:assert/strict'
import test from 'node:test'
import { getNavigationSections, getAuthenticatedNavigationSections } from '../config/seedData.mjs'
import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'
import {
  businessNavigationSections,
  getBusinessModule,
} from '../config/businessModules.mjs'
import {
  getBusinessModuleGroup,
  groupSidebarNavigationSections,
  getBusinessModuleSidebarKey,
  getBusinessModuleTabs,
  projectBusinessModuleSections,
  projectRoleGuidedModuleNavigation,
  rememberBusinessModuleLocation,
  restoreBusinessModuleTabPath,
  resolveBusinessModuleMenuTarget,
} from './businessModuleGroups.mjs'

const section = (...keys) => ({
  title: '业务',
  items: keys.map(getBusinessModule),
})

test('委外以独立模块直达订单，只有一个页面时不增加页签', () => {
  const item = getBusinessModule('processing-contracts')
  const projected = projectBusinessModuleSections(businessNavigationSections)
  const outsourcing = projected.find((entry) => entry.key === 'outsourcing')
  assert.equal(outsourcing.items.length, 1)
  assert.equal(outsourcing.items[0].label, '委外管理')
  assert.equal(outsourcing.items[0].path, item.path)
  assert.equal(outsourcing.items[0].sidebarKey, 'module:outsourcing')
  assert.equal(getBusinessModuleTabs(item.path, businessNavigationSections), null)
  const restricted = projectBusinessModuleSections([section('production-orders')])
  assert.deepEqual(restricted[0].items.map((entry) => entry.label), ['生产管理'])
})

test('标准菜单合并出货三页，以出货单为默认入口且财务保持独立', () => {
  const sections = projectBusinessModuleSections(businessNavigationSections)
  const shipping = sections.find((item) => item.key === 'shipment')
  const finance = sections.find((item) => item.key === 'finance')
  assert.equal(shipping.items.length, 1)
  assert.equal(finance.items.length, 1)
  assert.deepEqual(
    [
      shipping.items[0].label,
      shipping.items[0].sidebarKey,
      shipping.items[0].path,
    ],
    ['出货管理', 'module:shipment', '/erp/warehouse/shipments']
  )
  assert.equal(finance.items[0].sidebarKey, 'module:finance')
  assert.equal(finance.items[0].label, '财务管理')
  const workspace = getBusinessModuleTabs(
    '/erp/warehouse/outbound',
    businessNavigationSections
  )
  assert.equal(workspace.activeKey, 'outbound')
  assert.deepEqual(
    workspace.tabs.map((tab) => tab.label),
    ['出货单', '库存预留']
  )
})

test('出货页签只呈现获准页面，保留仅出货或仅预留岗位入口', () => {
  for (const key of ['shipments', 'outbound']) {
    const visible = [section(key)]
    const item = getBusinessModule(key)
    const projected = projectBusinessModuleSections(visible)[0].items
    assert.equal(projected.length, 1)
    assert.equal(projected[0].path, item.path)
    assert.equal(projected[0].sidebarKey, 'module:shipment')
    const workspace = getBusinessModuleTabs(item.path, visible)
    assert.deepEqual(
      workspace.tabs.map((tab) => tab.path),
      [item.path]
    )
    assert.equal(workspace.activeKey, key)
  }
  assert.deepEqual(
    getBusinessModuleTabs('/erp/warehouse/shipments', []).tabs,
    []
  )
})

test('岗位优先出货时合并后保留该入口，其他入口不重复出货模块', () => {
  const navigation = projectRoleGuidedModuleNavigation({
    dashboardItems: [],
    primaryItems: section('shipments').items,
    secondarySections: [
      section('outbound'),
      section('receivables'),
    ],
  })
  assert.equal(navigation.primaryItems[0].label, '出货管理')
  assert.equal(
    navigation.primaryItems[0].path,
    '/erp/warehouse/shipments'
  )
  assert.deepEqual(
    navigation.secondaryItems.map((item) => item.label),
    ['财务管理']
  )
})

test('出货来源深链和页签查询可恢复，失去权限后不重开旧页面', () => {
  const cache = new Map()
  const item = getBusinessModule('shipments')
  const reservationPath = getBusinessModule('outbound').path
  rememberBusinessModuleLocation(cache, {
    pathname: item.path,
    search: '?shipment_id=81',
    hash: '',
  })
  rememberBusinessModuleLocation(cache, {
    pathname: reservationPath,
    search: '?source_type=SALES_ORDER&source_id=12',
    hash: '',
  })
  assert.equal(
    restoreBusinessModuleTabPath(item.path, cache),
    `${item.path}?shipment_id=81`
  )
  assert.equal(
    resolveBusinessModuleMenuTarget(
      item,
      { pathname: '/erp/finance/receivables' },
      cache,
      [item.path, reservationPath]
    ),
    `${reservationPath}?source_type=SALES_ORDER&source_id=12`
  )
  assert.equal(
    resolveBusinessModuleMenuTarget(
      item,
      { pathname: '/erp/finance/receivables' },
      cache,
      [item.path]
    ),
    item.path
  )
})

test('模块入口只归并已有可访问页面，默认路径仍是已授权页面', () => {
  const visible = [
    section(
      'payables',
      'invoices',
      'production-orders',
      'production-progress',
      'quality-inspections'
    ),
  ]
  const { items } = projectBusinessModuleSections(visible)[0]
  assert.deepEqual(
    items.map((item) => item.label),
    ['财务管理', '生产管理', '质检管理']
  )
  assert.equal(items[0].path, '/erp/finance/payables')
  assert.equal(items[1].path, '/erp/production/orders')
  assert.equal(
    getBusinessModuleGroup('/erp/production/quality-inspections')?.key,
    'quality'
  )
  assert.deepEqual(
    visible[0].items.map((item) => item.key),
    [
      'payables',
      'invoices',
      'production-orders',
      'production-progress',
      'quality-inspections',
    ]
  )
})

test('岗位常用入口优先，其他入口中不重复同一模块，保留其他入口', () => {
  const navigation = projectRoleGuidedModuleNavigation({
    dashboardItems: [],
    primaryItems: section('payables', 'receivables').items,
    secondarySections: [
      section(
        'invoices',
        'production-orders',
        'production-progress',
        'quality-inspections'
      ),
    ],
  })
  assert.deepEqual(
    navigation.primaryItems.map((item) => item.label),
    ['财务管理']
  )
  assert.equal(navigation.primaryItems[0].path, '/erp/finance/payables')
  assert.deepEqual(
    navigation.secondaryItems.map((item) => item.label),
    ['生产管理', '质检管理']
  )
  assert.equal(navigation.secondaryItemCount, 2)
})

test('页签顺序遵循设计且只显示获准的类别', () => {
  const workspace = getBusinessModuleTabs('/erp/finance/payables', [
    section('invoices', 'payables'),
  ])
  assert.equal(workspace.activeKey, 'payables')
  assert.deepEqual(
    workspace.tabs.map((tab) => tab.label),
    ['应付', '发票']
  )
  assert.deepEqual(getBusinessModuleTabs('/erp/master/materials', []).tabs, [])
  assert.deepEqual(getBusinessModuleTabs('/erp/finance/payables', []).tabs, [])
})

test('排产与异常深链分别选中所属生产页签，不扩大页面权限', () => {
  const visible = [
    section(
      'production-orders',
      'production-progress',
      'production-scheduling',
      'production-exceptions'
    ),
  ]
  assert.equal(
    getBusinessModuleTabs('/erp/production/scheduling', visible).activeKey,
    'production-orders'
  )
  assert.equal(
    getBusinessModuleTabs('/erp/production/exceptions', visible, { adminProfile: { permissions: ['production.fact.read', 'production.wip.read'], effective_session: { actions: ['production.fact.read', 'production.wip.read'] } } }).activeKey,
    'production-exceptions'
  )
  const limited = getBusinessModuleTabs('/erp/production/exceptions', [
    section('production-exceptions'),
  ], { adminProfile: { permissions: ['production.fact.read', 'production.wip.read'], effective_session: { actions: ['production.fact.read', 'production.wip.read'] } } })
  assert.deepEqual(
    limited.tabs.map((tab) => tab.path),
    ['/erp/production/exceptions']
  )
  assert.equal(
    getBusinessModuleSidebarKey('/erp/production/exceptions'),
    'module:production'
  )
})

test('页签分别恢复地址查询，直接单据链接仍保持原地址', () => {
  const cache = new Map()
  rememberBusinessModuleLocation(cache, {
    pathname: '/erp/production/orders',
    search: '?keyword=订单&page=3',
    hash: '',
  })
  rememberBusinessModuleLocation(cache, {
    pathname: '/erp/production/progress',
    search: '?fact_id=28&display=process',
    hash: '#details',
  })
  assert.equal(
    restoreBusinessModuleTabPath('/erp/production/orders', cache),
    '/erp/production/orders?keyword=订单&page=3'
  )
  assert.equal(
    restoreBusinessModuleTabPath('/erp/production/progress', cache),
    '/erp/production/progress?fact_id=28&display=process#details'
  )
  assert.equal(
    restoreBusinessModuleTabPath('/erp/finance/payables', cache),
    '/erp/finance/payables'
  )
})

test('重复点击当前模块不切回首页；重新进入只恢复仍有权限的页面', () => {
  const cache = new Map()
  const item = getBusinessModule('receivables')
  const current = { pathname: '/erp/finance/invoices', search: '?fact_id=42', hash: '#details' }
  rememberBusinessModuleLocation(cache, current)
  assert.equal(
    resolveBusinessModuleMenuTarget(item, current, cache, [
      item.path,
      current.pathname,
    ]),
    `${current.pathname}${current.search}${current.hash}`
  )
  assert.equal(
    resolveBusinessModuleMenuTarget(
      item,
      { pathname: '/erp/production/orders' },
      cache,
      [item.path, current.pathname]
    ),
    '/erp/finance/invoices?fact_id=42#details'
  )
  assert.equal(
    resolveBusinessModuleMenuTarget(
      item,
      { pathname: '/erp/production/orders' },
      cache,
      [item.path]
    ),
    item.path
  )
})

test('direct production execution preserves the active menu URL while records use their own bare path', () => {
  const pathname = '/erp/production/progress'
  const location = { pathname, search: '?display=process', hash: '' }
  const cache = new Map()
  rememberBusinessModuleLocation(cache, location)
  assert.equal(
    resolveBusinessModuleMenuTarget(getBusinessModule('production-orders'), location, cache, [pathname]),
    `${pathname}?display=process`
  )
  assert.equal(restoreBusinessModuleTabPath({ path: pathname }, cache), pathname)
  assert.equal(
    resolveBusinessModuleMenuTarget({ path: '/erp/dashboard' }, { pathname: '/erp/dashboard', search: '?scope=todo', hash: '#tasks' }, cache, []),
    '/erp/dashboard?scope=todo#tasks'
  )
})

test('完整侧栏只有四个导航区，十个业务模块统一为单入口', () => {
  const visible = [
    ...getNavigationSections(),
    ...getAuthenticatedNavigationSections(),
  ]
  const sections = groupSidebarNavigationSections(
    projectBusinessModuleSections(visible)
  )
  assert.deepEqual(
    sections.map((entry) => entry.title),
    ['工作中心', '业务模块', '工具与查询', '系统与帮助']
  )
  assert.deepEqual(
    sections[1].items.map((entry) => entry.label),
    [
      '基础资料',
      '销售管理',
      '产品工程',
      '采购管理',
      '委外管理',
      '生产管理',
      '库存管理',
      '质检管理',
      '出货管理',
      '财务管理',
    ]
  )
  assert.equal(
    new Set(sections[1].items.map((entry) => entry.sidebarKey)).size,
    10
  )
  assert.deepEqual(
    sections[2].items.map((entry) => entry.key),
    ['print-center', 'history-records']
  )
  assert.deepEqual(
    sections[3].items.map((entry) => entry.key),
    ['permission-center', 'system-audit-logs', 'help-center']
  )
})

test('客户菜单顺序与产品分类一致，默认入口从获准页面按模块顺序选择', () => {
  const sections = projectBusinessModuleSections(
    getNavigationSections(yoyoosunMenuConfig)
  )
  const core = projectBusinessModuleSections(getNavigationSections())
  assert.deepEqual(
    sections.map((entry) => entry.items.map((item) => [item.label, item.path])),
    core.map((entry) => entry.items.map((item) => [item.label, item.path]))
  )
  const reordered = projectBusinessModuleSections([
    section(
      'outbound',
      'shipments',
      'invoices',
      'payables',
      'receivables'
    ),
  ])[0].items
  assert.deepEqual(
    reordered.map((entry) => entry.path),
    ['/erp/warehouse/shipments', '/erp/finance/receivables']
  )
  const limited = projectBusinessModuleSections([
    section('materials', 'suppliers'),
  ])[0].items
  assert.deepEqual(
    limited.map((entry) => entry.path),
    ['/erp/master/partners/suppliers']
  )
})

test('岗位指定的材料和库存台账入口继续优先，模块不会在其他入口重复', () => {
  const result = projectRoleGuidedModuleNavigation({
    dashboardItems: [],
    primaryItems: section('materials', 'inventory').items,
    secondarySections: [
      section('customers', 'suppliers', 'inbound', 'material-bom', 'processes'),
    ],
  })
  assert.deepEqual(
    result.primaryItems.map((entry) => [entry.label, entry.path]),
    [
      ['基础资料', '/erp/master/materials'],
      ['库存管理', '/erp/warehouse/inventory'],
    ]
  )
  assert.deepEqual(
    result.secondaryItems.map((entry) => entry.label),
    ['产品工程']
  )
})

test('目录保留每个获准页面，跨模块客户显示分组不会改变正式业务归属', () => {
  const visible = [
    section('invoices', 'quality-inspections', 'materials', 'receivables'),
  ]
  const catalog = groupSidebarNavigationSections(visible, { pageCatalog: true })
  assert.deepEqual(
    catalog.map((entry) => entry.title),
    ['基础资料', '质检管理', '财务管理']
  )
  assert.deepEqual(
    catalog.flatMap((entry) => entry.items.map((item) => item.key)).sort(),
    ['invoices', 'materials', 'quality-inspections', 'receivables']
  )
  const tabs = getBusinessModuleTabs('/erp/master/materials', visible)
  assert.deepEqual(
    tabs.tabs.map((entry) => entry.key),
    ['materials']
  )
})

test('production has four authorized business entries and execution and records restore independent queries', () => {
  const sections = [section('production-orders', 'production-progress', 'production-exceptions')]
  const options = { adminProfile: { permissions: ['production.fact.read', 'production.wip.read'], effective_session: { actions: ['production.fact.read', 'production.wip.read'] } }, search: '?display=process' }
  const workspace = getBusinessModuleTabs('/erp/production/progress', sections, options)
  assert.deepEqual(workspace.tabs.map((tab) => tab.label), ['生产订单', '生产执行', '生产记录', '异常处理'])
  assert.equal(workspace.activeKey, 'production-execution')
  const cache = new Map()
  rememberBusinessModuleLocation(cache, { pathname: '/erp/production/progress', search: '?fact_id=8' })
  rememberBusinessModuleLocation(cache, { pathname: '/erp/production/progress', search: '?display=process&source_type=PRODUCTION_ORDER&source_id=7' })
  assert.equal(restoreBusinessModuleTabPath(workspace.tabs[1], cache), '/erp/production/progress?display=process&source_type=PRODUCTION_ORDER&source_id=7')
  assert.equal(restoreBusinessModuleTabPath(workspace.tabs[2], cache), '/erp/production/progress?fact_id=8')
  const denied = getBusinessModuleTabs('/erp/production/progress', sections, { adminProfile: { permissions: ['production.fact.read'] } })
  assert.equal(denied.tabs.some((tab) => tab.key === 'production-execution'), false)
  assert.equal(getBusinessModuleTabs('/erp/production/orders', [section('production-orders')], options).tabs.length, 1)
})
