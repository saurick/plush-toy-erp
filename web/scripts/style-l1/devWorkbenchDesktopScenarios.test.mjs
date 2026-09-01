import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_SECONDARY_NAV_ITEMS,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { createDevWorkbenchDesktopScenarios } from './devWorkbenchDesktopScenarios.mjs'

const SPECIALIZED_ROUTES = new Set([
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
])

test('ordinary DEV routes each expose one generated desktop smoke', () => {
  const scenarios = createDevWorkbenchDesktopScenarios({
    assert,
    assertNoHorizontalOverflow: async () => {},
    expectHeading: async () => {},
  })
  const expectedRoutes = [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS]
    .map((item) => item.route)
    .filter((route) => !SPECIALIZED_ROUTES.has(route))
    .sort()

  assert.deepEqual(
    scenarios.map((scenario) => scenario.path).sort(),
    expectedRoutes
  )
  assert.equal(new Set(scenarios.map((scenario) => scenario.name)).size, scenarios.length)
  assert(
    scenarios.every(
      (scenario) =>
        scenario.name.endsWith('-desktop-light') &&
        scenario.viewport.width === 1440 &&
        scenario.viewport.height === 900 &&
        typeof scenario.verify === 'function' &&
        !Object.hasOwn(scenario, 'themeMode')
    )
  )
})

test('ordinary DEV desktop smokes have no visual-shape or mobile contract', () => {
  const source = readFileSync(
    new URL('./devWorkbenchDesktopScenarios.mjs', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /mobile|themeMode|\.screenshot\s*\(/u)
  assert.doesNotMatch(
    source,
    /keyboard\.press|cardCount|documentHeight|scrollHeight/u
  )
  assert.match(source, /assertNoHorizontalOverflow/u)
})
