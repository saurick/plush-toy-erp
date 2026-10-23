import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertFulfillmentChainGeometry, assertFulfillmentDetailGeometry, openFulfillmentExceptionDirectory } from './fulfillmentChainAssertions.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../src/common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath } from '../../src/erp/utils/workflowFulfillment.mjs'

export function createDevRoleFlowScenarios({ assert, outputDir, path }) {
  return [{
    name: 'dev-order-role-flow-desktop',
    path: '/__dev/status-flows?view=chain&chain=all',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      const panel = guide.locator('[aria-label="流程详情"]')
      assert.equal(await guide.locator('[data-stage-exception]').count(), catalog.fulfillment_flow.reduce((count, step) => count + step.handling.guides.length, 0))
      for (const step of catalog.fulfillment_flow) {
        await guide.locator(`[data-chain-stage="${step.stage}"] [data-stage-card]`).click()
        const normal = guide.locator('[data-stage-normal]')
        if (step.subflow) {
          await normal.locator('[data-mermaid-status="rendered"]').waitFor()
          for (const node of step.subflow.nodes.filter((item) => !item.exception_guide)) {
            await normal.getByRole('button', { name: node.label, exact: true }).click()
            await normal.locator(`[data-selected-substep="${node.key}"]`).waitFor()
          }
        }
        await assertFulfillmentDetailGeometry(panel)
      }
      for (const source of catalog.exception_guides) {
        await openFulfillmentExceptionDirectory(guide)
        await guide.locator(`[data-exception-entry="${source.key}"]`).click()
        assert.equal(new URL(page.url()).searchParams.has('flow_exception_origin'), false)
        for (const plan of source.plans) {
          if (source.plans.length > 1) {
            await panel.getByRole('combobox', { name: '处理方案' }).click()
            await page.getByRole('option', { name: plan.label, exact: true }).click()
          }
          await panel.locator('[data-mermaid-status="rendered"]').waitFor()
          for (const step of fulfillmentExceptionPath(source, plan.key).steps) {
            await panel.getByRole('button', { name: step.label, exact: true }).click()
            await panel.locator(`[data-selected-exception-node="${step.key}"]`).waitFor()
          }
          await assertFulfillmentDetailGeometry(panel)
          if (source.approval) assert.equal(await panel.getByRole('button', { name: '审批未通过 · 本次申请结束', exact: true }).count(), 1)
        }
      }
      await guide.getByRole('radiogroup', { name: '流程视图' }).getByText('订单全流程', { exact: true }).click()
      await waitForFiniteAnimations(page)
      await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      await page.screenshot({ path: path.join(outputDir, 'order-role-flow-desktop-4k.png'), scale: 'device' })
    },
  }]
}
