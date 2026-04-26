import assert from 'node:assert/strict'
import test from 'node:test'

import { dashboardModules, dashboardStatusGroups } from './dashboardModules.mjs'
import { BUSINESS_WORKFLOW_STATES } from './workflowStatus.mjs'
import {
  buildDashboardModuleRows,
  buildDashboardSummary,
} from '../utils/dashboardStats.mjs'
import {
  businessModuleDefinitions,
  getBusinessNavigationSections,
} from './businessModules.mjs'
import {
  businessMainlineDocGroups,
  documentationCards,
  fieldTruthRows,
  getNavigationSections,
  getRoleWorkbench,
  helpCenterAdvancedDocItems,
  helpCenterReadingPath,
  helpCenterNavItems,
  helpCenterPrimaryNavKeys,
  helpCenterRoleNavGroups,
  pendingFieldTruthRows,
  plannedModules,
  qaNavItems,
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
  assert(roleWorkbenches.some((role) => role.key === 'sales'))
  roleWorkbenches.forEach((role) => {
    assert(role.desktopFocus.length > 0)
    assert(role.mobileFocus.length > 0)
    assert(role.defaultPath.startsWith('/erp/roles/'))
    assert(role.allowedNavKeys.length > 0)
    assert.equal(getRoleWorkbench(role.key)?.title, role.title)
  })
  assert.equal(
    appDefinitions.find((app) => app.port === 5187)?.roleKey,
    'sales'
  )
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
  const qaSection = navigationSections.find(
    (section) => section.title === '开发与验收'
  )
  const advancedSection = navigationSections.find(
    (section) => section.title === '高级文档'
  )

  assert(helpSection)
  assert(advancedSection)
  assert(qaSection)
  assert(systemSection)
  assert.deepEqual(
    navigationSections.map((section) => section.title),
    [
      '看板中心',
      '销售链路',
      '采购/仓储',
      '生产环节',
      '财务环节',
      '单据模板',
      '系统管理',
      '帮助中心',
      '开发与验收',
      '高级文档',
    ]
  )
  assert.deepEqual(
    navigationSections
      .find((section) => section.title === '看板中心')
      ?.items.map((item) => item.path),
    ['/erp/dashboard', '/erp/business-dashboard']
  )
  assert.deepEqual(
    helpSection.items.map((item) => item.path),
    [
      '/erp/docs/operation-flow-overview',
      '/erp/docs/operation-guide',
      '/erp/docs/role-collaboration-guide',
      '/erp/docs/mobile-role-guide',
      '/erp/docs/task-flow-v1',
      '/erp/docs/notification-alert-v1',
      '/erp/docs/finance-v1',
      '/erp/docs/warehouse-quality-v1',
    ]
  )
  assert.deepEqual(helpCenterPrimaryNavKeys, [
    'help-operation-flow-overview',
    'help-operation-guide',
    'help-role-collaboration-guide',
    'help-mobile-role-guide',
    'help-task-flow-v1',
    'help-notification-alert-v1',
    'help-finance-v1',
    'help-warehouse-quality-v1',
  ])
  assert.deepEqual(
    advancedSection.items.map((item) => item.path),
    [
      '/erp/docs/role-page-document-matrix',
      '/erp/docs/task-document-mapping',
      '/erp/docs/workflow-status-guide',
      '/erp/docs/workflow-schema-draft',
      '/erp/docs/workflow-usecase-review',
      '/erp/docs/industry-schema-review',
      '/erp/docs/role-permission-matrix-v1',
      '/erp/docs/log-trace-audit-v1',
      '/erp/docs/desktop-role-guide',
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
    helpCenterAdvancedDocItems.map((item) => item.path),
    advancedSection.items.map((item) => item.path)
  )
  assert.deepEqual(
    qaSection.items.map((item) => item.path),
    [
      '/erp/qa/acceptance-overview',
      '/erp/qa/business-chain-debug',
      '/erp/qa/field-linkage-coverage',
      '/erp/qa/run-records',
      '/erp/qa/reports',
    ]
  )
  assert.deepEqual(
    qaNavItems.map((item) => item.path),
    qaSection.items.map((item) => item.path)
  )
  assert.deepEqual(
    systemSection.items.map((item) => item.path),
    ['/erp/system/permissions']
  )
  assert(!navPaths.includes('/erp/help-center'))
  documentationCards.forEach((card) => {
    assert(card.path.startsWith('/erp/docs/'))
  })
  assert.equal(helpCenterNavItems.length, 8)
  assert(
    !helpCenterNavItems.some((item) =>
      /debug|seed|cleanup|调试数据|清理调试/u.test(
        `${item.label} ${item.summary || ''} ${item.path}`
      )
    )
  )
  assert.equal(helpCenterRoleNavGroups.length, 8)
  assert.deepEqual(
    helpCenterRoleNavGroups.map((group) => group.role),
    ['老板', '业务', 'PMC', '采购', '生产', '仓库', '品质', '财务']
  )
  assert.equal(businessMainlineDocGroups.length, 6)
  assert.deepEqual(
    businessMainlineDocGroups.map((group) => group.title),
    [
      '订单到工程',
      '采购到入库',
      '委外到入库',
      '生产到出货',
      '出货到应收/开票',
      '采购/委外到应付/对账',
    ]
  )
  assert.deepEqual(
    helpCenterReadingPath.map((item) => item.path),
    [
      '/erp/docs/operation-guide',
      '/erp/docs/operation-flow-overview',
      '/erp/docs/role-collaboration-guide',
      '/erp/docs/mobile-role-guide',
    ]
  )
  assert(!navPaths.includes('/erp/docs/system-init'))
  assert(
    !helpSection.items
      .map((item) => item.path)
      .includes('/erp/docs/workflow-usecase-review')
  )
  assert(
    !helpSection.items
      .map((item) => item.path)
      .includes('/erp/docs/industry-schema-review')
  )
  assert(navPaths.includes('/erp/docs/workflow-usecase-review'))
  assert(navPaths.includes('/erp/docs/industry-schema-review'))
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

test('businessModules: 业务页菜单按毛绒业务收口且不回退到旧外贸主线', () => {
  const businessSections = getBusinessNavigationSections()
  const navLabels = businessSections.flatMap((section) =>
    section.items.map((item) => item.label)
  )
  const navPaths = businessSections.flatMap((section) =>
    section.items.map((item) => item.path)
  )

  assert.equal(businessSections.length, 4)
  assert(!navLabels.includes('客户/供应商'))
  assert(!navLabels.includes('产品'))
  assert(navLabels.includes('客户/款式立项'))
  assert(navLabels.includes('材料 BOM'))
  assert(navLabels.includes('加工合同/委外下单'))
  assert(navLabels.includes('品质检验'))
  assert(navLabels.includes('对账/结算'))
  assert(navLabels.includes('应收/开票登记'))
  assert(navLabels.includes('发票登记'))
  assert(!navLabels.includes('外销'))

  businessModuleDefinitions.forEach((moduleItem) => {
    if (moduleItem.sectionKey === 'master') {
      assert(!navPaths.includes(moduleItem.path))
      return
    }
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
  assert.equal(mobileApps.length, 8)
  assert.deepEqual(
    mobileApps.map((app) => app.port),
    [5186, 5187, 5188, 5189, 5190, 5191, 5192, 5193]
  )
})

test('dashboardModules: 业务看板按业务模块聚合状态', () => {
  assert.deepEqual(
    dashboardModules.map((item) => item.key),
    businessModuleDefinitions.map((item) => item.key)
  )

  const rows = buildDashboardModuleRows(dashboardModules, [
    {
      module_key: 'project-orders',
      total: 3,
      status_counts: {
        project_pending: 1,
        material_preparing: 1,
        blocked: 1,
      },
    },
    {
      module_key: 'reconciliation',
      total: 2,
      status_counts: {
        reconciling: 1,
        settled: 1,
      },
    },
  ])
  const summary = buildDashboardSummary(rows)

  assert(rows.every((row) => row.path.startsWith('/erp/')))
  assert.equal(summary.totalRecords, 5)
  assert.equal(summary.statusGroupCount.project, 1)
  assert.equal(summary.statusGroupCount.material, 1)
  assert.equal(summary.statusGroupCount.blocked, 1)
  assert.equal(summary.statusGroupCount.finance, 2)
  assert.equal(summary.completedCount, 1)
  assert.equal(summary.completionRatio, 20)
})

test('dashboardModules: 状态分组覆盖全部业务状态且不重复', () => {
  const groupedStatusKeys = dashboardStatusGroups.flatMap(
    (group) => group.statusKeys
  )
  assert.equal(groupedStatusKeys.length, new Set(groupedStatusKeys).size)
  assert.deepEqual(
    [...groupedStatusKeys].sort(),
    BUSINESS_WORKFLOW_STATES.map((state) => state.key).sort()
  )
})
