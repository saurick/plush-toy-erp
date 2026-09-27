import assert from 'node:assert/strict'
import test from 'node:test'
import { getBusinessUsabilityEntry } from './businessUsabilityCatalog.mjs'
import {
  GENERIC_HELP_GUIDE,
  ROLE_HELP_GUIDES,
  getRoleHelpGuide,
  getRoleHelpGuidesForProfile,
} from './roleHelpContent.mjs'
import { getRoleHelpScenarios, resolveHelpScenario } from './helpScenarios.mjs'

test('每个现有岗位按独立场景提供责任、步骤、结果与异常恢复', () => {
  for (const role of ROLE_HELP_GUIDES) {
    const scenes = getRoleHelpScenarios(role, { isSuperAdmin: true })
    assert.equal(
      new Set(scenes.map((scene) => scene.key)).size,
      scenes.length,
      role.key
    )
    assert.deepEqual(
      new Set(scenes.map((scene) => scene.path)),
      new Set([
        ...role.priorities.map((entry) => entry.path),
        ...(role.key === 'finance' ? ['/erp/finance/payments'] : []),
      ]),
      role.key
    )
    for (const scene of scenes) {
      assert(scene.title && scene.description && scene.actionLabel)
      assert(scene.completion && scene.handoff)
      assert(scene.exception.trigger && scene.exception.action)
      assert(scene.steps.length >= 3)
      for (const step of scene.steps) {
        assert(
          step.title && step.owner && step.description,
          `${role.key}:${scene.key}`
        )
        assert(step.roles.length > 0)
      }
    }
  }
})

test('通用业务场景直接复用页内说明，避免办理文字产生两份真源', () => {
  const scenes = ROLE_HELP_GUIDES.flatMap((role) => getRoleHelpScenarios(role))
  for (const key of [
    'finance-payments',
    'sales-orders',
    'material-bom',
    'accessories-purchase',
    'inbound',
    'quality-inspections',
    'processing-contracts',
    'production-orders',
    'shipments',
  ]) {
    const scene = scenes.find((entry) => entry.key === key)
    const page = getBusinessUsabilityEntry(key)
    assert.deepEqual(
      scene.steps.map((step) => step.description),
      page.flowSteps,
      key
    )
    assert.equal(scene.completion, page.completion, key)
    assert.equal(scene.handoff, page.handoff, key)
  }
})

test('仓库的材料入库、成品入库、库存查询和出货互相独立', () => {
  const scenes = getRoleHelpScenarios(getRoleHelpGuide('warehouse'))
  assert.deepEqual(
    scenes.map((scene) => scene.key),
    ['inbound', 'finished-goods', 'inventory-query', 'shipments']
  )
  const finished = scenes.find((scene) => scene.key === 'finished-goods')
  assert.deepEqual(
    finished.steps.map((step) => step.roles),
    [['production'], ['warehouse'], ['warehouse'], ['warehouse']]
  )
  assert.match(finished.completion, /提交完工报告本身不代表成品已经入库/u)
  assert.match(finished.exception.action, /处理后回到同一报告重新核对/u)
  assert.doesNotMatch(JSON.stringify(finished), /采购订单|财务放行/u)
  const inventory = scenes.find((scene) => scene.key === 'inventory-query')
  assert.doesNotMatch(JSON.stringify(inventory.steps), /盘点|调拨|人工调整/u)
})

test('页面权限只控制办理入口，帮助深链不能授予权限', () => {
  const scenes = getRoleHelpScenarios(getRoleHelpGuide('warehouse'), {
    allowedMenuPaths: ['/erp/production/progress'],
  })
  assert.deepEqual(
    scenes.filter((scene) => scene.available).map((scene) => scene.key),
    ['finished-goods']
  )
  assert.equal(resolveHelpScenario(scenes, '').key, 'finished-goods')
  assert.equal(resolveHelpScenario(scenes, 'inbound').available, false)
  assert.equal(
    resolveHelpScenario(scenes, 'https://example.com').key,
    'finished-goods'
  )
  assert(
    getRoleHelpScenarios(getRoleHelpGuide('warehouse')).every(
      (scene) => !scene.available
    )
  )
})

test('跨岗位、失效场景和未知岗位恢复到当前有效帮助', () => {
  const guides = getRoleHelpGuidesForProfile({
    roles: [{ role_key: 'warehouse' }],
    effective_session: { roles: ['finance'] },
  })
  assert.deepEqual(
    guides.map((guide) => guide.key),
    ['finance']
  )
  const finance = getRoleHelpScenarios(guides[0], { isSuperAdmin: true })
  assert.equal(
    resolveHelpScenario(finance, 'finished-goods').key,
    'finance-payments'
  )
  const unknown = getRoleHelpScenarios(GENERIC_HELP_GUIDE)
  assert.equal(unknown.length, 1)
  assert.equal(unknown[0].path, '')
  assert.equal(unknown[0].available, false)
  assert.equal(resolveHelpScenario([], 'unknown'), null)
  assert.deepEqual(getRoleHelpScenarios(null), [])
})
