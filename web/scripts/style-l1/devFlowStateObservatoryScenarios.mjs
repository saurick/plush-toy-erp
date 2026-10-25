import { expect } from 'playwright/test'
import { createDevBusinessChainScenarios } from './devBusinessChainScenarios.mjs'
import { createDevFlowDetailScenarios } from './devFlowDetailScenarios.mjs'

export const DEV_FLOW_STATE_OBSERVATORY_PATH = '/__dev/status-flows?view=chain&chain=all'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
export function startNoWriteAudit(page, store) {
  const requests = []
  store.set(page, requests)
  page.on('request', (request) => {
    if (WRITE_METHODS.has(request.method().toUpperCase())) requests.push({ method: request.method(), url: request.url() })
  })
}

export function createDevFlowStateObservatoryScenarios(deps) {
  const { assert, assertNoHorizontalOverflow } = deps
  const writes = new WeakMap()
  return [{
    name: 'dev-flow-state-observatory-desktop-light',
    path: DEV_FLOW_STATE_OBSERVATORY_PATH,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: (page) => startNoWriteAudit(page, writes),
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      await expect(guide.locator('[data-chain-stage]')).toHaveCount(17)
      await guide.getByRole('button', { name: '11 皮套检验', exact: true }).click()
      await expect(guide.locator('[data-stage-normal="shell_quality"] [data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
      await expect(page.getByRole('tab', { name: '查看规则', exact: true })).toBeVisible()
      await assertNoHorizontalOverflow(page)
      assert.deepEqual(writes.get(page), [], '结构页面保持只读')
    },
  }, ...createDevBusinessChainScenarios({ ...deps, observatoryPath: DEV_FLOW_STATE_OBSERVATORY_PATH, startNoWriteAudit }), ...createDevFlowDetailScenarios(deps)]
}
