import assert from 'node:assert/strict'
import test from 'node:test'

import { createDevFlowStateObservatoryScenarios } from './devFlowStateObservatoryScenarios.mjs'

test('dev flow state observatory L1 scenarios cover five-view read-only boundaries', () => {
  const scenarios = createDevFlowStateObservatoryScenarios({
    assert,
    assertNoHorizontalOverflow: async () => {},
    expectText: async () => {},
    gotoScenarioPath: async () => {},
  })

  assert.deepEqual(
    scenarios.map((scenario) => scenario.name),
    [
      'dev-flow-state-observatory-readonly',
      'dev-flow-state-observatory-chain-drill-dark',
      'dev-flow-state-observatory-customer-review-chain-print',
      'dev-flow-state-observatory-customer-review-overview-print',
      'dev-flow-state-observatory-invalid-deep-link',
      'dev-flow-state-observatory-task-lookup',
      'dev-flow-state-observatory-mobile-dark',
    ]
  )
  assert(
    scenarios.every(
      (scenario) =>
        scenario.path.startsWith('/__dev/status-flows') &&
        typeof scenario.beforeNavigate === 'function' &&
        typeof scenario.verify === 'function' &&
        !Object.hasOwn(scenario, 'mockAdminRpc')
    )
  )
  assert(
    scenarios
      .filter(
        (scenario) => scenario.name !== 'dev-flow-state-observatory-task-lookup'
      )
      .every((scenario) => !Object.hasOwn(scenario, 'auth'))
  )
  assert.deepEqual(scenarios[0].viewport, { width: 1440, height: 900 })
  assert.match(scenarios[0].path, /chain=all/u)
  assert.doesNotMatch(scenarios[0].path, /node=/u)
  assert.deepEqual(scenarios[1].viewport, { width: 1440, height: 900 })
  assert.equal(scenarios[1].themeMode, 'dark')
  assert.match(scenarios[1].path, /chain=delivery_to_settlement/u)
  assert.match(scenarios[1].path, /node=shipment_draft/u)
  assert.deepEqual(scenarios[2].viewport, { width: 1440, height: 900 })
  assert.equal(scenarios[2].themeMode, 'dark')
  assert.match(scenarios[2].path, /chain=production_exception/u)
  assert.match(scenarios[2].path, /node=production_exception_decision/u)
  assert.deepEqual(scenarios[3].viewport, { width: 1440, height: 900 })
  assert.equal(scenarios[3].themeMode, 'dark')
  assert.match(scenarios[3].path, /chain=all/u)
  assert.doesNotMatch(scenarios[3].path, /node=/u)
  assert.deepEqual(scenarios[4].viewport, { width: 1280, height: 800 })
  assert.match(scenarios[4].path, /chain=retired-chain/u)
  assert.match(scenarios[4].path, /task_id=abc/u)
  assert.deepEqual(scenarios[5].viewport, { width: 1440, height: 900 })
  assert.match(scenarios[5].path, /view=chain/u)
  assert.match(scenarios[5].path, /chain=all/u)
  assert.equal(scenarios[5].auth, 'admin')
  assert.deepEqual(scenarios[5].effectiveSession, {
    actions: ['workflow.task.read'],
  })
  assert.equal(scenarios[5].workflowTaskFixtures.length, 4)
  assert.equal(scenarios[5].workflowProcessContextFixtures.length, 3)
  assert.deepEqual(scenarios[6].viewport, { width: 390, height: 844 })
  assert.equal(scenarios[6].themeMode, 'dark')
  assert.match(scenarios[6].path, /chain=all/u)
  assert.doesNotMatch(scenarios[6].path, /node=/u)
})
