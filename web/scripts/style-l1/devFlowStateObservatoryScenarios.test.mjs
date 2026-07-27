import assert from 'node:assert/strict'
import test from 'node:test'

import { createDevFlowStateObservatoryScenarios } from './devFlowStateObservatoryScenarios.mjs'

test('dev flow state observatory L1 scenario stays DEV-only and no-write', () => {
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
      'dev-flow-state-observatory-workflow-graph-dark',
      'dev-flow-state-observatory-path-filter-recovery',
      'dev-flow-state-observatory-mobile-dark',
    ]
  )
  assert(
    scenarios.every(
      (scenario) =>
        scenario.path.startsWith('/__dev/status-flows') &&
        typeof scenario.beforeNavigate === 'function' &&
        typeof scenario.verify === 'function' &&
        !Object.hasOwn(scenario, 'mockAdminRpc') &&
        !Object.hasOwn(scenario, 'auth')
    )
  )
  assert.deepEqual(scenarios[0].viewport, { width: 1440, height: 900 })
  assert.deepEqual(scenarios[1].viewport, { width: 1440, height: 900 })
  assert.equal(scenarios[1].themeMode, 'dark')
  assert.match(scenarios[1].path, /flow=workflow\.task/u)
  assert.match(scenarios[1].path, /layers=/u)
  assert.deepEqual(scenarios[2].viewport, { width: 1280, height: 800 })
  assert.match(scenarios[2].path, /path_mode=overlay/u)
  assert.match(scenarios[2].path, /path_kind=adjusted/u)
  assert.deepEqual(scenarios[3].viewport, { width: 390, height: 844 })
  assert.equal(scenarios[3].themeMode, 'dark')
})
