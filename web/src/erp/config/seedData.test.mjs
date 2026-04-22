import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TASK_STATUS,
  TASK_STATUS_ORDER,
  buildDashboardTaskRows,
  buildDashboardTaskSummary,
  dashboardTaskModules,
} from './dashboardTasks.mjs'
import {
  businessModuleDefinitions,
  getBusinessNavigationSections,
} from './businessModules.mjs'
import {
  documentationCards,
  fieldTruthRows,
  getNavigationSections,
  getRoleWorkbench,
  helpCenterNavItems,
  pendingFieldTruthRows,
  plannedModules,
  roleWorkbenches,
  sourceReadiness,
} from './seedData.mjs'
import { appDefinitions } from './appRegistry.mjs'

test('seedData: 初始化模块至少覆盖文档、移动端和打印中心', () => {
  const moduleKeys = plannedModules.map((item) => item.key)
  assert(moduleKeys.includes('help-docs'))
  assert(moduleKeys.includes('mobile-topology'))
  assert(moduleKeys.includes('print-center'))
})

test('seedData: 每个移动角色都有端口职责数据与兼容路由', () => {
  assert(roleWorkbenches.length >= 6)
  roleWorkbenches.forEach((role) => {
    assert(role.desktopFocus.length > 0)
    assert(role.mobileFocus.length > 0)
    assert(role.defaultPath.startsWith('/erp/roles/'))
    assert(role.allowedNavKeys.length > 0)
    assert.equal(getRoleWorkbench(role.key)?.title, role.title)
  })
  assert.equal(getRoleWorkbench('missing-role'), null)
})

test('seedData: 文档卡片、导航、字段真源和资料清单保持可用', () => {
  const navigationSections = getNavigationSections()
  const navPaths = navigationSections.flatMap((section) =>
    section.items.map((item) => item.path)
  )
  const helpSection = navigationSections.find(
    (section) => section.title === '帮助中心'
  )
  const systemSection = navigationSections.find(
    (section) => section.title === '系统管理'
  )

  assert(helpSection)
  assert(systemSection)
  assert.deepEqual(
    helpSection.items.map((item) => item.path),
    [
      '/erp/docs/operation-flow-overview',
      '/erp/docs/operation-guide',
      '/erp/docs/role-collaboration-guide',
      '/erp/docs/desktop-role-guide',
      '/erp/docs/mobile-role-guide',
      '/erp/docs/field-linkage-guide',
      '/erp/docs/calculation-guide',
      '/erp/docs/print-snapshot-guide',
      '/erp/docs/exception-handling-guide',
      '/erp/docs/current-boundaries',
    ]
  )
  assert.deepEqual(
    helpCenterNavItems.map((item) => item.path),
    helpSection.items.map((item) => item.path)
  )
  assert.deepEqual(
    systemSection.items.map((item) => item.path),
    ['/erp/system/permissions']
  )
  assert(!navPaths.includes('/erp/help-center'))
  documentationCards.forEach((card) => {
    assert(card.path.startsWith('/erp/docs/'))
  })
  assert(!navPaths.includes('/erp/docs/system-init'))
  assert(!navPaths.includes('/erp/flows/overview'))
  assert(!navPaths.includes('/erp/source-readiness'))
  assert(!navPaths.includes('/erp/mobile-workbenches'))
  assert(navPaths.includes('/erp/docs/operation-flow-overview'))
  assert(navPaths.includes('/erp/print-center'))
  assert(fieldTruthRows.length >= 10)
  assert(pendingFieldTruthRows.length >= 3)
  assert(sourceReadiness.received.length >= 6)
  assert(sourceReadiness.pending.length >= 3)
})

test('businessModules: 业务页菜单按毛绒业务收口且不回退到 trade-erp 外贸主线', () => {
  const businessSections = getBusinessNavigationSections()
  const navLabels = businessSections.flatMap((section) =>
    section.items.map((item) => item.label)
  )
  const navPaths = businessSections.flatMap((section) =>
    section.items.map((item) => item.path)
  )

  assert(businessSections.length >= 5)
  assert(navLabels.includes('客户/供应商'))
  assert(navLabels.includes('产品'))
  assert(navLabels.includes('材料 BOM'))
  assert(navLabels.includes('加工合同/委外下单'))
  assert(navLabels.includes('对账/结算'))
  assert(!navLabels.includes('外销'))

  businessModuleDefinitions.forEach((moduleItem) => {
    assert(navPaths.includes(moduleItem.path))
    assert(moduleItem.path.startsWith('/erp/'))
    assert(moduleItem.relatedLinks.length > 0)
    assert(moduleItem.sourceRefs.length > 0)
  })

  const accessoriesModule = businessModuleDefinitions.find(
    (moduleItem) => moduleItem.key === 'accessories-purchase'
  )
  const processingModule = businessModuleDefinitions.find(
    (moduleItem) => moduleItem.key === 'processing-contracts'
  )

  assert.equal(
    accessoriesModule?.relatedLinks[0]?.path,
    '/erp/print-center?source=business&template=material-purchase-contract'
  )
  assert.equal(
    processingModule?.relatedLinks[0]?.path,
    '/erp/print-center?source=business&template=processing-contract'
  )
})

test('appRegistry: 桌面后台单入口，移动端按角色拆端口', () => {
  const desktopApps = appDefinitions.filter((app) => app.kind === 'desktop')
  const mobileApps = appDefinitions.filter((app) => app.kind === 'mobile')

  assert.equal(desktopApps.length, 1)
  assert.equal(desktopApps[0].port, 5175)
  assert.equal(mobileApps.length, 6)
  assert.deepEqual(
    mobileApps.map((app) => app.port),
    [5186, 5187, 5188, 5189, 5190, 5191]
  )
})

test('dashboardTasks: 首页任务看板按模块聚合任务状态', () => {
  assert.equal(dashboardTaskModules.length, plannedModules.length)

  const rows = buildDashboardTaskRows()
  const summary = buildDashboardTaskSummary(rows)

  assert(rows.every((row) => row.total >= 3))
  assert(rows.every((row) => row.path.startsWith('/erp/')))
  assert.equal(
    summary.totalTasks,
    rows.reduce((sum, row) => sum + row.total, 0)
  )
  assert(summary.statusCount[TASK_STATUS.DONE] > 0)
  assert(summary.statusCount[TASK_STATUS.IN_PROGRESS] > 0)
  assert(summary.statusCount[TASK_STATUS.REVIEW] > 0)
  assert(summary.statusCount[TASK_STATUS.BLOCKED] > 0)
  assert(summary.statusCount[TASK_STATUS.TODO] > 0)
  assert.deepEqual(Object.keys(summary.statusCount), [...TASK_STATUS_ORDER])
})
