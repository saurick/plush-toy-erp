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
  }, {
    name: 'dev-exception-selector-width',
    path: '/__dev/status-flows?view=chain&chain=all',
    viewport: { width: 1920, height: 1080 },
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      const directorySelect = guide.locator('.erp-dev-exception-directory > .ant-select')
      const typeSelect = guide.getByRole('combobox', { name: '异常类型', exact: true })
      const selectedType = guide.locator('.erp-dev-fulfillment-guide__choices > .ant-select').filter({ has: page.getByRole('combobox', { name: '异常类型', exact: true }) })
      const popup = page.locator('.ant-select-dropdown:visible')
      const assertCompact = async (control, state) => {
        await control.waitFor({ state: 'visible' })
        await waitForFiniteAnimations(page)
        const box = await control.boundingBox()
        assert(box.width >= 240 && box.width <= 300, `${state}: unexpected width ${box.width}`)
        assert(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, `${state}: outside viewport`)
        return box.width
      }
      for (const width of [1024, 1920, 3840]) {
        await page.setViewportSize({ width, height: width === 3840 ? 2160 : 1080 })
        await openFulfillmentExceptionDirectory(guide)
        const sources = width === 3840 ? catalog.exception_guides : catalog.exception_guides.slice(1, 2)
        for (const source of sources) {
          const emptyWidth = await assertCompact(directorySelect, `${width}: empty`)
          await typeSelect.click()
          await page.getByRole('option', { name: source.label, exact: true }).waitFor({ state: 'visible' })
          const popupWidth = await assertCompact(popup, `${width}: options`)
          assert(Math.abs(popupWidth - emptyWidth) <= 2, 'Options must follow the bounded trigger width')
          assert.deepEqual(await popup.getByRole('option').allTextContents(), catalog.exception_guides.map((item) => item.label))
          assert.equal(await popup.locator('.ant-select-item-option-content').evaluateAll((items) => items.some((item) => item.scrollWidth > item.clientWidth + 1)), false, 'Exception labels must remain readable')
          if (width === 3840 && source === sources[0]) {
            await page.screenshot({ path: path.join(outputDir, 'exception-selector-open-4k.png'), scale: 'css' })
          }
          await page.getByRole('option', { name: source.label, exact: true }).click()
          await popup.waitFor({ state: 'hidden' })
          await guide.locator(`[data-exception-guide="${source.key}"]`).waitFor({ state: 'visible' })
          assert.equal(new URL(page.url()).searchParams.get('flow_exception'), source.key)
          assert(Math.abs(await assertCompact(selectedType, `${width}: selected`) - emptyWidth) <= 2, 'Empty and selected types must keep the same width')
          for (const control of await guide.locator('.erp-dev-fulfillment-guide__choices > .ant-select').all()) {
            await assertCompact(control, `${width}: exception choice`)
          }
          await selectedType.locator('.ant-select-clear').click()
          await assertCompact(directorySelect, `${width}: cleared`)
          assert.equal(new URL(page.url()).searchParams.has('flow_exception'), false)
          if (width === 3840 && source === sources[0]) {
            await page.goBack()
            await assertCompact(selectedType, 'history restored')
            assert.equal(new URL(page.url()).searchParams.get('flow_exception'), source.key)
            await page.reload()
            await assertCompact(selectedType, 'reload restored')
            await selectedType.locator('.ant-select-clear').click()
            await assertCompact(directorySelect, 'cleared after restore')
          }
        }
        await guide.getByRole('radiogroup', { name: '流程视图' }).getByText('订单全流程', { exact: true }).click()
        await guide.locator('[data-fulfillment-chain]').waitFor({ state: 'visible' })
        const [chainBox, guideBox] = await Promise.all([guide.locator('[data-fulfillment-chain]').boundingBox(), guide.boundingBox()])
        assert(chainBox.width >= guideBox.width * 0.9, 'Flow content must retain its full reading area')
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Page must not overflow horizontally')
      }
    },
  }]
}
