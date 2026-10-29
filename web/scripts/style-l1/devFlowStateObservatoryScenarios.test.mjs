import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createDevFlowStateObservatoryScenarios } from './devFlowStateObservatoryScenarios.mjs'

test('dev flow state observatory covers its read-only desktop journeys', () => {
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
      { name: 'dev-business-rules-navigation-desktop', path: '/__dev/status-flows', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-business-rules-selection-recovery-desktop', path: '/__dev/business-rules', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-business-rules-context-return-desktop', path: '/__dev/status-flows?flow_stage=incoming_quality&flow_substep=inbound&flow_role=warehouse', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-business-topics-navigation-desktop', path: '/__dev/business-topics?flow_topic=finance_relations', viewport: { width: 1440, height: 900 } },
      { name: 'dev-finance-prototype-alignment', path: '/__dev/business-topics?flow_topic=finance_relations', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-finance-rules-reading-desktop', path: '/__dev/business-rules?view=finance_rules&finance_rule=sources', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-business-relations-desktop', path: '/__dev/status-flows?view=chain&chain=all', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-finished-quality-responsibility', path: '/__dev/status-flows?view=chain&chain=all&flow_stage=finished_quality&flow_substep=passed', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-business-chain-reading-and-export', path: '/__dev/status-flows?view=chain&chain=all', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-flow-state-observatory-instance', path: '/__dev/status-flows?view=tracking&chain=all&task_id=21', viewport: { width: 1440, height: 900 } },
      { name: 'dev-flow-state-details-desktop-light', path: '/__dev/status-flows?view=chain&chain=all', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-flow-rules-complete', path: '/__dev/status-flows?view=states&flow=process.instance', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-flow-action-rules-desktop-light', path: '/__dev/status-flows?view=states&flow=workflow.task', viewport: { width: 1920, height: 1080 } },
      { name: 'dev-flow-details-design-preview', path: '/__dev/ui-design?page=workbench&workbenchMode=preview', viewport: { width: 1440, height: 900 } },
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
