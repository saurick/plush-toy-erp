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
    assert(guide.summary)
    assert(guide.priorities.length >= 2)
    assert(guide.workflow.length >= 4)
    assert(guide.handoff)
    assert(guide.cautions.length >= 3)
    assert(guide.questions.length >= 2)
    contentSignatures.add(
      JSON.stringify([
        guide.headline,
        guide.priorities.map((item) => item.title),
        guide.workflow,
        guide.handoff,
        guide.cautions,
      ])
    )
  })
  assert.equal(contentSignatures.size, ROLE_HELP_GUIDES.length)
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
