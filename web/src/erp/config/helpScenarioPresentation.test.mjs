import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GENERIC_HELP_GUIDE,
  ROLE_HELP_GUIDES,
  getRoleHelpGuide,
} from './roleHelpContent.mjs'
import { BUSINESS_USABILITY_CATALOG } from './businessUsabilityCatalog.mjs'
import { getRoleHelpScenarios } from './helpScenarios.mjs'
import {
  HELP_OVERVIEW_LAYOUTS,
  getHelpScenarioPresentation,
} from './helpScenarioPresentation.mjs'

const sceneFor = (role, key) =>
  getRoleHelpScenarios(getRoleHelpGuide(role)).find(
    (scene) => scene.key === key
  )

test('每个岗位场景的编号、图解热点和异常去向均有有效目标', () => {
  const keys = new Set()
  for (const role of ROLE_HELP_GUIDES) {
    for (const scenario of getRoleHelpScenarios(role, {
      allowedMenuPaths: BUSINESS_USABILITY_CATALOG.map((entry) => entry.path),
    })) {
      keys.add(scenario.key)
      const model = getHelpScenarioPresentation(scenario, role.key)
      const label = `${role.key}:${scenario.key}`
      assert.ok(['chain', 'path', 'steps'].includes(model.kind), label)
      assert.ok(model.steps.includes(model.defaultStep), label)
      assert.equal(model.defaultStep.view, 'guide', label)
      assert.equal(
        model.steps[model.exception.backNumber - 1].id,
        model.exception.back,
        label
      )
      assert.ok(
        model.steps.some((step) => step.id === model.exception.from),
        label
      )
      assert.ok(
        model.steps.every(
          (step) => step.title && step.description && step.owner
        ),
        label
      )
      if (model.visual) {
        assert.ok(
          model.steps.every(
            (step) => step.point >= 0 && step.point < model.visual.points.length
          ),
          label
        )
        model.visual.points.forEach((_, point) =>
          assert.ok(
            model.steps.some(
              (step) => step.view === 'guide' && step.point === point
            ),
            `${label}:热点 ${point}`
          )
        )
      }
    }
  }
  assert.deepEqual([...keys].sort(), Object.keys(HELP_OVERVIEW_LAYOUTS).sort())
})

test('共同办理的链路默认定位本岗位，恢复回到需要重验的步骤', () => {
  const scene = sceneFor('warehouse', 'finished-goods')
  assert.equal(
    getHelpScenarioPresentation(scene, 'warehouse').defaultStep.number,
    2
  )
  assert.equal(
    getHelpScenarioPresentation(scene, 'production').defaultStep.number,
    1
  )
  assert.equal(
    getHelpScenarioPresentation(scene, 'warehouse').exception.backNumber,
    2
  )
  const quality = sceneFor('quality', 'inbound')
  assert.equal(
    getHelpScenarioPresentation(quality, 'quality').defaultStep.number,
    3
  )
  const pmc = sceneFor('pmc', 'production-orders')
  assert.equal(getHelpScenarioPresentation(pmc, 'pmc').defaultStep.number, 2)
})

test('财务图解区分审批、过账和余额，更正仍保留正式受控说明', () => {
  const scene = sceneFor('finance', 'finance-payments')
  const model = getHelpScenarioPresentation(scene, 'finance')
  assert.deepEqual(
    model.steps.slice(2).map((step) => step.title),
    ['按配置审批', '确认过账', '核对剩余余额']
  )
  assert.match(model.steps[2].description, /审批通过仍不等于核销完成/u)
  assert.equal(model.steps[4].view, 'result')
  assert.equal(model.exception.backNumber, 2)
  assert.match(model.supplements[0].description, /冲销或红冲.*不删除原记录/u)
  assert.match(scene.completion, /只有过账后/u)
  const restricted = getRoleHelpScenarios(getRoleHelpGuide('finance'), {
    allowedMenuPaths: ['/erp/finance/receivables'],
  })
  assert.equal(
    restricted.find((entry) => entry.key === 'finance-payments').available,
    false
  )
  assert.equal(
    getRoleHelpGuide('finance').priorities.some(
      (entry) => entry.path === '/erp/finance/payments'
    ),
    false
  )
})

test('普通步骤与未知岗位直接读取正式说明，不要求额外画图配置', () => {
  const [generic] = getRoleHelpScenarios(GENERIC_HELP_GUIDE)
  const updated = {
    ...generic,
    steps: generic.steps.map((step, index) => ({
      ...step,
      description: `当前说明 ${index}`,
    })),
  }
  const model = getHelpScenarioPresentation(updated, 'generic')
  assert.equal(model.kind, 'steps')
  assert.equal(model.visual, null)
  assert.deepEqual(
    model.steps.map((step) => step.description),
    updated.steps.map((step) => step.description)
  )
})
