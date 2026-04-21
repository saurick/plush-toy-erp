import assert from 'node:assert/strict'
import test from 'node:test'

import {
  documentationCards,
  fieldTruthRows,
  getNavigationSections,
  getRoleWorkbench,
  pendingFieldTruthRows,
  plannedModules,
  roleWorkbenches,
  sourceReadiness,
} from './seedData.mjs'
import { appDefinitions } from './appRegistry.mjs'

test('seedData: 初始化模块至少覆盖文档、移动端和扫码 deferred 边界', () => {
  const moduleKeys = plannedModules.map((item) => item.key)
  assert(moduleKeys.includes('help-docs'))
  assert(moduleKeys.includes('mobile-topology'))
  assert(moduleKeys.includes('photo-scan'))
})

test('seedData: 每个角色都有桌面端、移动端和默认角色路由', () => {
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
  const navPaths = getNavigationSections('boss').flatMap((section) =>
    section.items.map((item) => item.path)
  )
  documentationCards.forEach((card) => {
    assert(navPaths.includes(card.path))
  })
  assert(fieldTruthRows.length >= 10)
  assert(pendingFieldTruthRows.length >= 3)
  assert(sourceReadiness.received.length >= 6)
  assert(sourceReadiness.pending.length >= 3)
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
