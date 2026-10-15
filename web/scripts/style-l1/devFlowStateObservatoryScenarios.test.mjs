import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createDevFlowStateObservatoryScenarios } from './devFlowStateObservatoryScenarios.mjs'

test('dev flow state observatory keeps one read-only desktop smoke', () => {
  const scenarios = createDevFlowStateObservatoryScenarios({
    assert,
    assertNoHorizontalOverflow: async () => {},
    expectText: async () => {},
  })

  assert.deepEqual(
    scenarios.map((scenario) => ({
      name: scenario.name,
      path: scenario.path,
      viewport: scenario.viewport,
    })),
    [
      {
        name: 'dev-flow-state-observatory-desktop-light',
        path: '/__dev/status-flows?view=chain&chain=all',
        viewport: { width: 1440, height: 900 },
      },
    ]
  )
  assert.equal(typeof scenarios[0].beforeNavigate, 'function')
  assert.equal(typeof scenarios[0].verify, 'function')
  assert.equal(Object.hasOwn(scenarios[0], 'themeMode'), false)
  assert.equal(Object.hasOwn(scenarios[0], 'auth'), false)
})

test('dev flow state observatory has no mobile, dark, screenshot, density or keyboard contract', () => {
  const source = readFileSync(
    new URL('./devFlowStateObservatoryScenarios.mjs', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /mobile|themeMode|\.screenshot\s*\(/u)
  assert.doesNotMatch(
    source,
    /keyboard\.press|cardCount|documentHeight|scrollHeight/u
  )
  assert.match(source, /assertNoHorizontalOverflow/u)
})
