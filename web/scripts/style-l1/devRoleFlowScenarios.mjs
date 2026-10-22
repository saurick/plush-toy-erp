import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertFulfillmentChainGeometry, assertFulfillmentDetailGeometry, openFulfillmentExceptionDirectory } from './fulfillmentChainAssertions.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../src/common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath } from '../../src/erp/utils/workflowFulfillment.mjs'

export function createDevRoleFlowScenarios({ assert, outputDir, path }) {
  return [false, true].map((mobile) => ({
    name: `dev-order-role-flow-${mobile ? 'mobile' : 'desktop'}`,
    path: '/__dev/status-flows?view=chain&chain=all',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      const panel = guide.locator('[aria-label="流程详情"]')
      const normal = guide.locator('[data-stage-normal]')
      const selectStage = (key) => guide.locator(`[data-chain-stage="${key}"] [data-stage-card]`).click()
      const initialBoxes = await guide.locator('[data-chain-stage]').evaluateAll((items) => items.map((item) => ({ x: item.offsetLeft, y: item.offsetTop })))
      assert.equal(await guide.locator('[data-stage-exception]').count(), 17)
      for (const step of catalog.fulfillment_flow) {
        await selectStage(step.stage)
        await normal.waitFor()
        if (step.subflow) {
          assert.equal(await normal.locator('.erp-dev-fulfillment-guide__substeps button').count(), step.subflow.nodes.length)
          for (const node of step.subflow.nodes.filter((item) => !item.exception_guide)) {
            await normal.getByRole('button', { name: node.role ? `${node.label} ${node.role}` : node.label, exact: true }).click()
            await normal.locator(`[data-selected-substep="${node.key}"]`).waitFor()
          }
          await normal.locator('summary').click()
          assert((await normal.innerText()).includes(step.subflow.summary))
          assert((await normal.innerText()).includes(step.result))
        }
        for (const key of step.stages) assert.equal(await panel.locator(`a[href="/erp/task-board?stage_key=${key}"]`).count(), 1)
        await assertFulfillmentDetailGeometry(panel.locator('.erp-dev-fulfillment-guide__result'))
        await guide.locator(`[data-stage-exception="${step.stage}"]`).click()
        assert((await panel.innerText()).includes(step.handling.issues))
        assert.equal(await normal.count(), 0)
        await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      }
      const afterBoxes = await guide.locator('[data-chain-stage]').evaluateAll((items) => items.map((item) => ({ x: item.offsetLeft, y: item.offsetTop })))
      assert.deepEqual(afterBoxes, initialBoxes, 'switching stage details never inserts space into the main map')
      for (const source of catalog.exception_guides) {
        await openFulfillmentExceptionDirectory(guide)
        await guide.locator(`[data-exception-entry="${source.key}"] button`).click()
        assert.equal(new URL(page.url()).searchParams.has('flow_exception_origin'), false)
        if (source.plans.length > 1) assert.equal(await panel.locator('[data-exception-handling]').count(), 0)
        for (const plan of source.plans) {
          if (source.plans.length > 1) await panel.getByRole('button', { name: plan.label, exact: true }).click()
          const expected = fulfillmentExceptionPath(source, plan.key).steps
          assert.deepEqual(await panel.locator('.erp-dev-chain__handling-steps button strong').allTextContents(), expected.map((step) => step.label))
          for (const [index, step] of expected.entries()) {
            await panel.locator('.erp-dev-chain__handling-steps button').nth(index).click()
            await panel.locator(`[data-selected-exception-node="${step.key}"]`).waitFor()
          }
          assert((await panel.innerText()).includes(plan.closure))
          assert.equal(await panel.locator('.erp-dev-chain__reentry-note').count(), Number(Boolean(plan.continuation.reentry)))
          await assertFulfillmentDetailGeometry(panel.locator('.erp-dev-fulfillment-guide__result'))
        }
      }
      await guide.getByRole('button', { name: '返回完整流程', exact: true }).click()
      await guide.locator('[data-stage-exception="cutting_quality"]').click()
      await panel.getByRole('button', { name: '补料重做', exact: true }).click()
      await panel.getByRole('button', { name: /11 皮套检验/u }).click()
      assert.equal(new URL(page.url()).searchParams.get('flow_decision'), 'remake')
      assert.equal(new URL(page.url()).searchParams.get('flow_exception_origin'), 'shell_quality')
      await panel.locator('.erp-dev-chain__handling-steps button').last().click()
      const selected = await panel.locator('[data-selected-exception-node]').getAttribute('data-selected-exception-node')
      await page.reload()
      await panel.locator(`[data-selected-exception-node="${selected}"]`).waitFor()
      await waitForFiniteAnimations(page)
      for (const width of mobile ? [390] : [1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: mobile ? 844 : 1080 })
        await waitForFiniteAnimations(page)
        await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
        await assertFulfillmentDetailGeometry(panel.locator('.erp-dev-fulfillment-guide__result'))
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      }
      await page.screenshot({ path: path.join(outputDir, `order-role-flow-${mobile ? 'mobile' : 'desktop'}-4k.png`), fullPage: mobile, scale: 'device' })
      if (!mobile) {
        await page.goto(new URL('/__dev/status-flows?view=chain&chain=purchase_to_inventory&flow_role=finance', page.url()).href)
        await guide.getByRole('heading', { name: '办理环节', exact: true }).waitFor()
        assert.equal(await guide.locator('[data-fulfillment-stage]').count(), 5)
        await guide.getByRole('button', { name: /财务确认并过账应付/u }).click()
        await panel.getByRole('heading', { name: '财务确认并过账应付', exact: true }).waitFor()
        await page.goto(new URL('/__dev/ui-design?page=task-handling', page.url()).href)
        await page.frameLocator('iframe[title="ERP 最新可交互设计"]').locator('.task-handling-board').waitFor()
        await page.getByRole('button', { name: '岗位流程与异常分支', exact: true }).click()
        await guide.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        assert.equal(await guide.locator('[data-chain-stage]').count(), 17)
        await selectStage('sales_order')
        await assertFulfillmentDetailGeometry(panel.locator('.erp-dev-fulfillment-guide__result'))
      }
    },
  }))
}
