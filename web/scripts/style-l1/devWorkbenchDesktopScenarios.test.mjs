import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_QUALITY_ROUTE,
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
  const expectedRoutes = [
    ...DEV_WORKSPACE_NAV_ITEMS,
    ...DEV_SECONDARY_NAV_ITEMS,
  ]
    .map((item) => item.route)
    .filter((route) => !SPECIALIZED_ROUTES.has(route))
    .sort()

  assert.deepEqual(
    scenarios.map((scenario) => scenario.path).sort(),
    expectedRoutes
  )
  assert.equal(
    new Set(scenarios.map((scenario) => scenario.name)).size,
    scenarios.length
  )
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

test('ordinary DEV desktop smokes honor route-specific landing contracts', async () => {
  const contracts = [
    {
      route: DEV_QUALITY_ROUTE,
      finalRoute: DEV_QUALITY_ROUTE,
      heading: DEV_PAGE_TITLE_BY_ROUTE[DEV_QUALITY_ROUTE],
    },
    {
      route: DEV_DATA_PREPARATION_ROUTE,
      finalRoute: DEV_DATA_PREPARATION_ROUTE,
      heading: '测试数据',
    },
  ]
  const observedHeadings = new Map()
  const overflowRoutes = new Set()
  const scenarios = createDevWorkbenchDesktopScenarios({
    assert,
    assertNoHorizontalOverflow: async (_page, route) => {
      overflowRoutes.add(route)
    },
    expectHeading: async (page, heading) => {
      observedHeadings.set(new URL(page.url()).pathname, heading)
    },
  })

  for (const contract of contracts) {
    const scenario = scenarios.find(({ path }) => path === contract.route)
    const page = {
      locator: (selector) => ({
        count: async () => {
          if (selector === '.erp-dev-tool-table tbody tr') return 3
          if (
            selector ===
            '[data-tool-key="quality-gates"] a[href="/__dev/quality-gates"]'
          ) {
            return 1
          }
          if (selector === '.erp-dev-product-task__index') return 0
          return 1
        },
        waitFor: async () => {},
      }),
      url: () => `http://127.0.0.1${contract.finalRoute}?view=server`,
    }

    assert(scenario)
    await scenario.verify(page)
    assert.equal(observedHeadings.get(contract.finalRoute), contract.heading)
    assert(overflowRoutes.has(contract.route))
  }
})

test('product and quality area smokes enforce their complete landing contracts', async () => {
  const counts = new Map([
    ['.erp-dev-workspace-page', 1],
    ['.erp-dev-product-task__index', 0],
    ['.erp-dev-tool-table tbody tr', 3],
    ['[data-tool-key="quality-gates"] a[href="/__dev/quality-gates"]', 1],
  ])
  const scenarios = createDevWorkbenchDesktopScenarios({
    assert,
    assertNoHorizontalOverflow: async () => {},
    expectHeading: async () => {},
  })

  for (const route of [DEV_PRODUCT_ENGINEERING_ROUTE, DEV_QUALITY_ROUTE]) {
    const scenario = scenarios.find(({ path }) => path === route)
    assert(scenario)
    await scenario.verify({
      getByRole: (role, options) => {
        assert.equal(role, 'tablist')
        assert.deepEqual(options, { name: '产品工程查看方式' })
        return { count: async () => 0 }
      },
      locator: (selector) => ({
        count: async () =>
          selector === '.erp-dev-tool-table tbody tr' &&
          route === DEV_PRODUCT_ENGINEERING_ROUTE
            ? 5
            : (counts.get(selector) ?? 0),
        waitFor: async () => {},
      }),
      url: () => `http://127.0.0.1${route}`,
    })
  }
})
