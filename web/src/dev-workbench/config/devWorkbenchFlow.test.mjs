import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_HUB_ITEMS } from './devHub.mjs'
import { DEV_WORKSPACE_NAV_ITEMS } from './devRoutes.mjs'
import { DEV_WORKBENCH_GUIDE, DEV_TOOL_USAGE } from './devWorkbenchFlow.mjs'

test('every guide action points to a registered runtime entry and every tool describes its usage', () => {
  const registeredRoutes = new Set([
    ...DEV_HUB_ITEMS.map((item) => item.route),
    ...DEV_WORKSPACE_NAV_ITEMS.map((item) => item.route),
  ])
  for (const item of DEV_HUB_ITEMS) {
    assert(DEV_TOOL_USAGE[item.key]?.trim(), item.key)
  }
  for (const step of DEV_WORKBENCH_GUIDE) {
    const destination = new URL(step.route, 'http://localhost')
    assert(registeredRoutes.has(destination.pathname), step.route)
    assert.equal(
      Object.hasOwn(step, 'status'),
      false,
      'selection must not imply completion'
    )
  }
  assert.equal(
    new URL(
      DEV_WORKBENCH_GUIDE.at(-1).route,
      'http://localhost'
    ).searchParams.get('view'),
    'history'
  )
})
