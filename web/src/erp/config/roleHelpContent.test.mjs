import assert from 'node:assert/strict'
import test from 'node:test'

import { mobileRoleDefinitions } from './appRegistry.mjs'
import { getNavigationSections } from './seedData.mjs'
import {
  GENERIC_HELP_GUIDE,
  ROLE_HELP_GUIDES,
  filterRoleHelpPriorities,
  getDesktopHelpRoleOrder,
  getRoleHelpGuide,
  getRoleHelpGuidesForProfile,
} from './roleHelpContent.mjs'

const requiredRoleKeys = [
  ...mobileRoleDefinitions.map((role) => role.roleKey),
  'admin',
]

test('roleHelpContent: 覆盖九个业务岗位和系统管理员且正文各不相同', () => {
  assert.deepEqual(getDesktopHelpRoleOrder(), requiredRoleKeys)
  assert.deepEqual(
    ROLE_HELP_GUIDES.map((guide) => guide.key),
    requiredRoleKeys
  )

  const contentSignatures = new Set()
  ROLE_HELP_GUIDES.forEach((guide) => {
    assert(guide.label)
    assert(guide.headline)
    assert(guide.priorities.length >= 2)
    assert(guide.workflow.length >= 4)
    assert(guide.completion)
    assert(guide.handoff)
    assert(guide.exception?.title)
    assert(guide.exception?.trigger)
    assert(guide.exception?.steps?.length >= 2)
    assert(guide.exception?.returnTo)
    assert(guide.exception?.doneWhen)
    assert(guide.caution)
    assert.equal('summary' in guide, false)
    assert.equal('cautions' in guide, false)
    assert.equal('questions' in guide, false)
    contentSignatures.add(
      JSON.stringify([
        guide.headline,
        guide.priorities.map((item) => item.title),
        guide.workflow,
        guide.completion,
        guide.handoff,
        guide.exception,
        guide.caution,
      ])
    )
  })
  assert.equal(contentSignatures.size, ROLE_HELP_GUIDES.length)
  assert(GENERIC_HELP_GUIDE.caution)
  assert.equal('summary' in GENERIC_HELP_GUIDE, false)
  assert.equal('cautions' in GENERIC_HELP_GUIDE, false)
  assert.equal('questions' in GENERIC_HELP_GUIDE, false)
})

test('roleHelpContent: 快捷入口全部来自当前正式导航', () => {
  const knownPaths = new Set(
    getNavigationSections().flatMap((section) =>
      section.items.map((item) => item.path)
    )
  )

  ROLE_HELP_GUIDES.forEach((guide) => {
    guide.priorities.forEach((priority) => {
      assert(
        knownPaths.has(priority.path),
        `${guide.key} 使用了未登记的快捷入口 ${priority.path}`
      )
    })
  })
})

test('roleHelpContent: 当前有效岗位优先，多岗位按稳定顺序展示', () => {
  const guides = getRoleHelpGuidesForProfile({
    roles: [
      { role_key: 'sales' },
      { role_key: 'warehouse' },
      { role_key: 'admin' },
    ],
    effective_session: {
      roles: ['finance', 'purchase', 'finance'],
    },
  })

  assert.deepEqual(
    guides.map((guide) => guide.key),
    ['purchase', 'finance']
  )
})

test('roleHelpContent: 没有有效投影时使用账号岗位，未知岗位使用中性帮助', () => {
  assert.deepEqual(
    getRoleHelpGuidesForProfile({
      roles: [{ role_key: 'engineering' }, { role_key: 'admin' }],
    }).map((guide) => guide.key),
    ['engineering', 'admin']
  )

  const unknownGuides = getRoleHelpGuidesForProfile({
    roles: [{ role_key: 'customer-special-role' }],
  })
  assert.deepEqual(unknownGuides, [GENERIC_HELP_GUIDE])
  assert.doesNotMatch(JSON.stringify(unknownGuides), /customer-special-role/u)
})

test('roleHelpContent: 超级管理员可审阅全部岗位帮助', () => {
  assert.deepEqual(
    getRoleHelpGuidesForProfile({ is_super_admin: true }).map(
      (guide) => guide.key
    ),
    requiredRoleKeys
  )
})

test('roleHelpContent: 快捷入口按当前账号可用页面收口', () => {
  const salesGuide = getRoleHelpGuide('sales')
  const priorities = filterRoleHelpPriorities(salesGuide, {
    allowedMenuPaths: [
      '/erp/master/partners/customers',
      '/erp/sales/project-orders/sales-orders',
    ],
  })

  assert.deepEqual(
    priorities.map((priority) => [priority.path, priority.available]),
    [
      ['/erp/master/partners/customers', true],
      ['/erp/sales/project-orders/sales-orders', true],
      ['/erp/warehouse/shipments', false],
    ]
  )
  assert(
    filterRoleHelpPriorities(salesGuide, { isSuperAdmin: true }).every(
      (priority) => priority.available
    )
  )
})

test('roleHelpContent: 用户帮助不暴露内部工程术语', () => {
  const collectStringValues = (value) => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(collectStringValues)
    if (value && typeof value === 'object') {
      return Object.values(value).flatMap(collectStringValues)
    }
    return []
  }
  const visibleCopy = collectStringValues([
    ROLE_HELP_GUIDES,
    GENERIC_HELP_GUIDE,
  ]).join('\n')
  assert.doesNotMatch(
    visibleCopy,
    /\b(?:RBAC|Workflow|Fact|API|usecase|schema|raw id)\b/iu
  )
})

test('roleHelpContent: 永绅岗位帮助只指导已开放且有权限的动作', () => {
  const financeCopy = JSON.stringify(getRoleHelpGuide('finance'))
  const financeGuide = getRoleHelpGuide('finance')
  const pmcCopy = JSON.stringify(getRoleHelpGuide('pmc'))
  const purchaseCopy = JSON.stringify(getRoleHelpGuide('purchase'))
  const salesCopy = JSON.stringify(getRoleHelpGuide('sales'))
  const warehouseCopy = JSON.stringify(getRoleHelpGuide('warehouse'))
  const warehouseGuide = getRoleHelpGuide('warehouse')
  const productionGuide = getRoleHelpGuide('production')

  assert.match(financeCopy, /收付款核销/u)
  assert.doesNotMatch(financeCopy, /直接(?:办理)?结清|手工改成已结清/u)
  assert.equal(financeGuide.recommendedPrimaryLimit, 4)
  assert.deepEqual(
    financeGuide.priorities.slice(0, 4).map((priority) => priority.path),
    [
      '/erp/finance/receivables',
      '/erp/finance/payables',
      '/erp/finance/invoices',
      '/erp/finance/reconciliation',
    ]
  )
  assert.doesNotMatch(pmcCopy, /发布生产订单/u)
  assert.match(salesCopy, /数量、单价、计税方式、报价是否含运费和交期/u)
  assert.match(salesCopy, /收货信息、数量、单价、货款、税额、总额/u)
  assert.match(purchaseCopy, /付款方式、是否需要发票、收货地址和到货日期/u)
  assert.doesNotMatch(warehouseCopy, /盘点、调拨|人工调整/u)
  assert.match(warehouseCopy, /生产提交完工报告不等于成品已经入库/u)
  assert.match(warehouseCopy, /实际运费也不等于已经形成应付或付款/u)
  assert(
    warehouseGuide.priorities.some(
      (priority) => priority.path === '/erp/production/progress'
    )
  )
  assert.equal(productionGuide.label, '生产 / 委外')
  assert.match(
    JSON.stringify(productionGuide),
    /完工报告交给仓库核对实收并确认入库/u
  )
  assert(
    productionGuide.priorities.some(
      (priority) => priority.path === '/erp/purchase/processing-contracts'
    )
  )
})
