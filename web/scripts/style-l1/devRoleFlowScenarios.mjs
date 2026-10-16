import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { switchMermaidLayout } from './mermaidViewerAssertions.mjs'
import { WorkflowTaskDiscoveryCatalog as taskCatalog } from '../../src/common/consts/workflowTaskDiscovery.generated.mjs'

export function createDevRoleFlowScenarios({ assert, outputDir, path }) {
  return [false, true].map((mobile) => ({
    name: `dev-order-role-flow-${mobile ? 'mobile' : 'desktop'}`,
    path: '/__dev/status-flows?view=chain&chain=all',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      await guide.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
      const subflow = guide.locator('.erp-dev-fulfillment-guide__subflow')
      const subflowDiagram = subflow.locator('.erp-markdown-mermaid')
      const verifySubflowFits = async () => {
        await subflow.locator('[data-mermaid-status="rendered"]').waitFor()
        const metrics = await subflowDiagram.evaluate((root) => {
          const viewport = root.querySelector('.erp-markdown-mermaid__viewport')
          const svg = root.querySelector('.erp-markdown-mermaid__canvas > svg')
          const bounds = viewport.getBoundingClientRect()
          const diagram = svg.getBoundingClientRect()
          return {
            width: viewport.clientWidth,
            height: viewport.clientHeight,
            scrollWidth: viewport.scrollWidth,
            scrollHeight: viewport.scrollHeight,
            left: diagram.left - bounds.left,
            top: diagram.top - bounds.top,
            right: diagram.right - bounds.left,
            bottom: diagram.bottom - bounds.top,
          }
        })
        assert(metrics.width > 0 && metrics.height > 0, '子流程画布必须可见')
        assert(metrics.scrollWidth <= metrics.width + 2 && metrics.scrollHeight <= metrics.height + 2 && metrics.left >= -1 && metrics.top >= -1 && metrics.right <= metrics.width + 2 && metrics.bottom <= metrics.height + 2, `子流程首次展示应完整，无需切换布局: ${JSON.stringify(metrics)}`)
      }
      await verifySubflowFits()
      const nodes = guide.locator('.erp-dev-fulfillment-guide__steps > li')
      const count = await nodes.count()
      assert.equal(count, 17, '完整流程必须包含全部 17 个环节')
      const verifyOverview = async ({ firstScreen = !mobile } = {}) => {
        const layout = await guide.evaluate((element) => {
          const overview = element.querySelector('.erp-dev-fulfillment-guide__steps')
          const detail = element.querySelector('.erp-dev-fulfillment-guide__result')
          const steps = [...overview.children].map((item) => {
            const button = item.querySelector('button')
            const title = item.querySelector('strong')
            const rect = button.getBoundingClientRect()
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, font: parseFloat(getComputedStyle(title).fontSize), clipped: title.scrollHeight > title.clientHeight + 1 || button.scrollWidth > button.clientWidth + 1 }
          })
          return { steps, width: innerWidth, height: innerHeight, overviewBottom: overview.getBoundingClientRect().bottom, detailTop: detail.getBoundingClientRect().top }
        })
        assert(layout.steps.every((step) => step.font >= 14 && !step.clipped), '流程名称保持正常字号并完整显示')
        assert(layout.steps.every((step) => step.left >= 0 && step.right <= layout.width), '全部环节不能横向溢出')
        assert(layout.detailTop >= layout.overviewBottom, '步骤详情必须位于完整总览下方')
        if (firstScreen) assert(layout.steps.every((step) => step.top >= 0 && step.bottom <= layout.height), `桌面首屏必须看完全部 17 个环节: ${JSON.stringify(layout)}`)
        return layout
      }
      await page.evaluate(() => document.fonts.ready)
      await verifyOverview()
      await page.screenshot({ path: path.join(outputDir, `order-flow-overview-${mobile ? 'mobile' : 'desktop'}-4k.png`), fullPage: mobile, scale: 'device' })
      if (!mobile) {
        for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
          await page.setViewportSize(viewport)
          await page.reload()
          await verifySubflowFits()
          await verifyOverview()
          await page.screenshot({ path: path.join(outputDir, `order-flow-overview-${viewport.width}.png`), scale: 'device' })
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.reload()
        await verifySubflowFits()
      }
      const overviewBeforeSelection = await guide.locator('.erp-dev-fulfillment-guide__steps').boundingBox()
      await guide.getByRole('button', { name: /来料检验与材料入库/u }).click()
      await page.waitForURL(/flow_stage=incoming_quality/u)
      await guide.locator('.erp-dev-fulfillment-guide__result').getByRole('heading', { name: '来料检验与材料入库', exact: true }).waitFor()
      if (!mobile) assert.deepEqual(await guide.locator('.erp-dev-fulfillment-guide__steps').boundingBox(), overviewBeforeSelection, '切换详情不改变流程总览的位置')
      await page.reload()
      await guide.getByRole('button', { name: /来料检验与材料入库/u, pressed: true }).waitFor()
      assert.equal(await guide.locator('.ant-segmented-item-selected').innerText(), '完整流程')
      await verifySubflowFits()
      const verifyDiagramFont = async () => {
        const fontSizes = await subflowDiagram.locator('svg .nodeLabel').evaluateAll((labels) => labels.map((label) => {
          const scale = label.ownerSVGElement?.getScreenCTM() || label.closest('svg').getScreenCTM()
          return parseFloat(getComputedStyle(label).fontSize) * Math.hypot(scale.a, scale.b)
        }))
        assert(fontSizes.length && fontSizes.every((size) => size >= 14), `子流程保持正常字号: ${fontSizes}`)
      }
      await subflowDiagram.locator('[data-mermaid-zoom-action="reset"]').click()
      await subflowDiagram.getByRole('button', { name: '仓库确认材料入库', exact: true }).click()
      await verifyDiagramFont()
      await page.waitForURL(/flow_substep=inbound/u)
      await subflow.locator('[data-selected-substep="inbound"]').waitFor()
      const selectedShape = subflowDiagram.locator('[data-mermaid-node-id][aria-pressed="true"] .label-container')
      assert.equal(await selectedShape.evaluate((node) => getComputedStyle(node).strokeWidth), '2px')
      await page.reload()
      await subflowDiagram.getByRole('button', { name: '仓库确认材料入库', exact: true, pressed: true }).waitFor()
      await verifySubflowFits()
      if (mobile) {
        await subflowDiagram.locator('[data-mermaid-zoom-action="fit"]').click()
        assert(await subflowDiagram.locator('.erp-markdown-mermaid__viewport').evaluate((node) => node.scrollWidth <= node.clientWidth + 2), '窄屏仍可主动适配图宽')
        await subflowDiagram.locator('[data-mermaid-zoom-action="reset"]').click()
        await verifyDiagramFont()
        await subflow.scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(outputDir, 'order-subflow-incoming-mobile.png'), scale: 'device' })
      }
      if (!mobile) {
        await switchMermaidLayout(page, subflowDiagram, assert)
        await verifySubflowFits()
        await switchMermaidLayout(page, subflowDiagram, assert)
        await verifySubflowFits()
        await subflowDiagram.getByRole('button', { name: 'IQC 来料检验', exact: true }).click()
        await subflow.locator('[data-selected-substep="inspect"]').waitFor()
      }
      const chooseRole = async (name) => {
        await guide.locator('.erp-dev-fulfillment-guide__role .ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText(name, { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
      }
      await chooseRole('仓库')
      await page.waitForURL(/flow_role=warehouse/u)
      assert.equal(new URL(page.url()).searchParams.has('flow_substep'), false, '切换岗位清除上一环节的子步骤')
      assert.equal(await nodes.count(), count, '选择岗位仍保留完整业务骨架')
      await guide.locator('li[data-role-match="true"]').filter({ hasText: '正式成品入库' }).waitFor()
      await guide.locator('li[data-role-match="false"]').filter({ hasText: '皮套检验' }).waitFor()
      if (!mobile) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.setViewportSize({ width: 1366, height: 768 })
        await verifyOverview()
        await page.setViewportSize({ width: 1920, height: 1080 })
      }
      const emphasis = await nodes.evaluateAll((items) => items.map((item) => {
        const button = item.querySelector('button')
        const style = getComputedStyle(button)
        return {
          selected: button.getAttribute('aria-pressed') === 'true',
          matchesRole: item.dataset.roleMatch === 'true',
          roleLabel: item.querySelector('.erp-dev-fulfillment-guide__role-match')?.textContent,
          background: style.backgroundColor,
          shadow: style.boxShadow,
          left: style.borderLeftWidth,
          right: style.borderRightWidth,
          overflow: button.scrollWidth > button.clientWidth,
        }
      }))
      assert.equal(emphasis.filter((item) => item.selected).length, 1)
      assert(emphasis.every((item) => item.left === item.right && item.shadow === 'none' && !item.overflow))
      assert(emphasis.filter((item) => item.matchesRole).every((item) => item.roleLabel === '所选岗位'))
      assert.notEqual(emphasis.find((item) => item.selected).background, emphasis.find((item) => !item.selected).background)
      await page.reload()
      await guide.getByRole('combobox', { name: '关注岗位' }).waitFor()
      assert.match(await guide.locator('.erp-dev-fulfillment-guide__role').innerText(), /仓库/u)
      await chooseRole('财务')
      if (!mobile) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.setViewportSize({ width: 1366, height: 768 })
        await verifyOverview()
        await page.setViewportSize({ width: 1920, height: 1080 })
      }
      const result = guide.locator('.erp-dev-fulfillment-guide__result')
      const openInstructions = async () => {
        const details = result.locator('.erp-dev-fulfillment-guide__instructions')
        if (await details.count() && !await details.evaluate((node) => node.open)) await details.locator('summary').click()
      }
      await openInstructions()
      await result.getByText('工程用料两级审核', { exact: true }).waitFor()
      assert.match(await result.innerText(), /重新经过老板和财务审核/u)
      assert.equal(await result.locator('a[href$="stage_key=engineering"]').count(), 1)
      await guide.getByRole('button', { name: /放行与实际发货/u }).click()
      await result.getByRole('heading', { name: '放行与实际发货', exact: true }).waitFor()
      await openInstructions()
      await result.getByText('出货财务放行', { exact: true }).waitFor()
      assert.match(await result.innerText(), /不算已经发货/u)
      await guide.locator('.ant-segmented-item').filter({ hasText: /^异常处理$/u }).click()
      const exception = guide.locator('[data-exception-guide]')
      const exceptionSteps = exception.locator('.erp-dev-fulfillment-guide__exception-steps > li')
      const exceptionDiagram = exception.locator('.erp-markdown-mermaid')
      const exceptionDetail = exception.locator('.erp-dev-fulfillment-guide__exception-detail')
      const chooseSource = async (name) => {
        await exception.locator('.erp-dev-fulfillment-guide__exception-source .ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText(name, { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
      }
      await chooseSource('首次来料不合格')
      await chooseRole('采购')
      await exceptionDetail.getByRole('heading', { name: '采购登记退厂范围', exact: true }).waitFor()
      assert.equal(await exceptionSteps.count(), 3)
      assert.equal(await exception.locator('li[data-role-match="true"]').count(), 1)
      assert.equal(await exception.getByText('方案审批', { exact: true }).count(), 0)
      await verifyMobileNavigationMotion(page, assert, '[aria-label="异常处理方案"]', 1)
      await page.waitForURL(/flow_decision=replacement/u)
      assert.equal(await exceptionSteps.count(), 5)
      await exceptionDiagram.getByRole('button', { name: /仓库登记新到货/u }).click()
      await exceptionDetail.getByRole('heading', { name: '仓库登记新到货', exact: true }).waitFor()
      await page.reload()
      await exceptionDetail.getByRole('heading', { name: '仓库登记新到货', exact: true }).waitFor()
      assert.match(await exceptionDetail.innerText(), /不表示新货已入库/u)
      await chooseSource('裁片、皮套与成品不合格')
      await chooseRole('业务')
      await exceptionDetail.getByRole('heading', { name: '业务提出处理方案', exact: true }).waitFor()
      await verifyMobileNavigationMotion(page, assert, '[aria-label="异常处理方案"]', 3)
      await page.waitForURL(/flow_decision=scrap/u)
      assert.equal(await exceptionSteps.count(), 4)
      assert.doesNotMatch((await exceptionSteps.allInnerTexts()).join(' '), /回货|重新检验/u)
      assert.match(await exceptionDetail.innerText(), /不再安排本批回货、复检或恢复生产/u)
      assert.match(await exceptionDetail.innerText(), /本次审批结束/u)
      await exceptionDiagram.getByRole('button', { name: /实际执行报废/u }).click()
      await exceptionDetail.getByRole('heading', { name: '实际执行报废', exact: true }).waitFor()
      await verifyMobileNavigationMotion(page, assert, '[aria-label="异常处理方案"]', 0, true)
      assert.equal(await exceptionSteps.count(), 6)
      await exceptionDiagram.getByRole('button', { name: /IQC 重新检验/u }).waitFor()
      await chooseRole('财务')
      await exception.getByRole('status').filter({ hasText: '本方案没有固定登记给该岗位' }).waitFor()
      assert.equal(await exception.getAttribute('data-exception-guide'), 'production_quality')
      await chooseSource('生产超领材料')
      assert.equal(await exceptionSteps.count(), 3)
      assert.match(await exceptionDetail.innerText(), /审批通过不等于已经发料/u)
      await chooseSource('已入库后的退货与纠正')
      await exceptionDetail.getByRole('heading', { name: '财务核对后续影响', exact: true }).waitFor()
      await chooseSource('委外产品回货拒收')
      assert.equal(await exceptionSteps.count(), 3)
      assert.match(await exceptionDetail.innerText(), /正式冲正/u)
      await chooseSource('款项、抵扣与退款异常')
      assert.equal(await exceptionSteps.count(), 5)
      await exceptionDiagram.getByRole('button', { name: /财务确认实际退款/u }).click()
      await exceptionDetail.getByRole('heading', { name: '财务确认实际退款', exact: true }).waitFor()
      assert.match(await exceptionDetail.innerText(), /可退余额/u)
      await verifyMobileNavigationMotion(page, assert, '[aria-label="异常处理方案"]', 1)
      assert.equal(await exceptionSteps.count(), 3)
      await exceptionDiagram.getByRole('button', { name: /财务撤销原抵扣/u }).click()
      await exceptionDetail.getByRole('heading', { name: '财务撤销原抵扣', exact: true }).waitFor()
      assert.match(await exceptionDetail.innerText(), /不改变实际收付/u)
      await guide.locator('.ant-segmented-item').filter({ hasText: /^完整流程$/u }).click()
      await guide.getByRole('button', {name: /客户首款与分期收款/u}).click()
      await result.getByRole('heading', {name: '客户首款与分期收款', exact:true}).waitFor()
      await openInstructions()
      assert.match(await result.innerText(), /关联已生效销售订单/u)
      await guide.getByRole('button', {name: /尾款、对账与结清/u}).click()
      await result.getByRole('heading', {name: '尾款、对账与结清', exact:true}).waitFor()
      await openInstructions()
      assert.match(await result.innerText(), /发票、对账、出货完成都不代表款项结清/u)
      if (mobile) {
        await result.getByRole('button', { name: '返回全部环节', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('.erp-dev-fulfillment-guide__steps').getBoundingClientRect().top >= 0)
        assert.equal(await nodes.getByRole('button', { name: /尾款、对账与结清/u }).getAttribute('aria-pressed'), 'true')
      } else {
        await page.evaluate(() => window.scrollTo(0, 0))
        await verifyOverview()
      }

      const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
      assert(metrics.scroll <= metrics.width + 1, `岗位流程页面横向溢出: ${JSON.stringify(metrics)}`)
      await page.screenshot({ path: path.join(outputDir, `order-role-flow-${mobile ? 'mobile' : 'desktop'}-4k.png`), fullPage: mobile, scale: 'device' })
      if (!mobile) {
        for (const step of taskCatalog.fulfillment_flow) {
          await guide.locator(`[data-fulfillment-stage="${step.stage}"] > button`).click()
          await result.getByRole('heading', { name: step.label, exact: true }).waitFor()
          if (!step.subflow) {
            assert.equal(await subflow.count(), 0, '简单点数环节直接显示办理说明')
            continue
          }
          await verifySubflowFits()
          for (const node of step.subflow.nodes) {
            await subflowDiagram.getByRole('button', { name: node.label, exact: true }).click()
            await subflow.locator(`[data-selected-substep="${node.key}"]`).waitFor()
          }
          assert.equal(await subflowDiagram.locator('[data-mermaid-node-id]').count(), step.subflow.nodes.length)
          await subflowDiagram.locator('[data-mermaid-zoom-action="reset"]').click()
          await verifyDiagramFont()
        }
        await guide.locator('[data-fulfillment-stage="sewing_execute"] > button').click()
        await subflowDiagram.getByRole('button', { name: '确认委外合同', exact: true }).focus()
        await page.keyboard.press('Enter')
        await subflow.locator('[data-selected-substep="contract"]').waitFor()
        await subflowDiagram.locator('[data-mermaid-fullscreen-action="open"]').click()
        await subflowDiagram.getByRole('button', { name: '仓库发出', exact: true }).click()
        await subflowDiagram.locator('[data-mermaid-fullscreen-action="open"]').waitFor()
        await subflow.locator('[data-selected-substep="issue"]').waitFor()
        await subflow.scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(outputDir, 'order-subflow-sewing-desktop-4k.png'), scale: 'device' })
        await page.goto(new URL('/__dev/status-flows?view=chain&chain=purchase_to_inventory&flow_role=finance', page.url()).href)
        await guide.getByRole('heading', { name: '岗位分工与交接', exact: true }).waitFor()
        assert.equal(await nodes.count(), 5, '采购专题仍显示自己的完整交接步骤')
        await guide.getByRole('button', { name: /财务确认并过账应付/u }).click()
        await result.getByRole('heading', { name: '财务确认并过账应付', exact: true }).waitFor()
        await verifyOverview({ firstScreen: false })
        await page.goto(new URL('/__dev/ui-design?page=task-handling', page.url()).href)
        const verifyPrototypeLoaded = async () => {
          await page.getByRole('heading', { name: 'UI 交互设计', exact: true }).waitFor()
          const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
          await frame.locator('.task-handling-board').waitFor()
          assert.equal(await frame.locator('.task-handling-table tbody tr').count(), 8, '原型页首次打开和刷新后均应完整加载任务列表')
        }
        await verifyPrototypeLoaded()
        await page.reload()
        await verifyPrototypeLoaded()
        await page.getByRole('button', { name: '岗位流程与异常分支', exact: true }).click()
        await guide.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        await page.waitForFunction(() => {
          const drawer = document.querySelector('.erp-dev-fulfillment-drawer .ant-drawer-content-wrapper')
          return drawer && Math.abs(drawer.getBoundingClientRect().right - innerWidth) < 1 && !drawer.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running')
        })
        assert.equal(await nodes.count(), 17)
        await verifySubflowFits()
        await verifyOverview()
        await guide.getByRole('button', { name: /尾款、对账与结清/u }).click()
        await result.getByRole('heading', { name: '尾款、对账与结清', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'order-flow-overview-drawer-4k.png'), scale: 'device' })
      }
    },
  }))
}
