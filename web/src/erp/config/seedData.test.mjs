import assert from 'node:assert/strict'
import test from 'node:test'

import {
  documentationCards,
  getRoleWorkbench,
  navigationSections,
  plannedModules,
  roleWorkbenches,
  sourceReadiness,
} from './seedData.mjs'

test('seedData: 初始化模块至少覆盖文档、移动端和扫码边界', () => {
  const moduleKeys = plannedModules.map((item) => item.key)
  assert(moduleKeys.includes('help-docs'))
  assert(moduleKeys.includes('mobile'))
  assert(moduleKeys.includes('photo-scan'))
})

test('seedData: 每个角色都有桌面端和移动端关注点', () => {
  assert(roleWorkbenches.length >= 5)
  roleWorkbenches.forEach((role) => {
    assert(role.desktopFocus.length > 0)
    assert(role.mobileFocus.length > 0)
    assert.equal(getRoleWorkbench(role.key)?.title, role.title)
  })
  assert.equal(getRoleWorkbench('missing-role'), null)
})

test('seedData: 文档卡片与导航、资料清单保持可用', () => {
  const navPaths = navigationSections.flatMap((section) =>
    section.items.map((item) => item.path)
  )
  documentationCards.forEach((card) => {
    assert(navPaths.includes(card.path))
  })
  assert(sourceReadiness.received.length >= 6)
  assert(sourceReadiness.pending.length >= 3)
})
