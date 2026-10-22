import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertFulfillmentChainGeometry, openFulfillmentExceptionDirectory } from './fulfillmentChainAssertions.mjs'
import { clickMermaidControl, verifyCompactMermaidViewer } from './mermaidViewerAssertions.mjs'
import { WorkflowTaskDiscoveryCatalog as taskCatalog } from '../../src/common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath } from '../../src/erp/utils/workflowFulfillment.mjs'
import { getFulfillmentSupplement } from '../../src/dev-workbench/config/devFulfillmentPresentation.mjs'

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
      const stageButton = (stage) => guide.locator(`[data-fulfillment-stage="${stage}"]`).locator(':scope > button, .erp-dev-chain__stage-main')
      const verifySubflowPreview = async ({ fit = false } = {}) => {
        await subflow.locator('[data-mermaid-status="rendered"]').waitFor()
        if (fit) await clickMermaidControl(subflowDiagram, 'fit')
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
            overflowX: getComputedStyle(viewport).overflowX,
            overflowY: getComputedStyle(viewport).overflowY,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
          }
        })
        assert(metrics.width > 0 && metrics.height > 0, '子流程画布必须可见')
        assert(metrics.documentWidth <= metrics.viewportWidth + 1, `子流程溢出必须留在图内: ${JSON.stringify(metrics)}`)
        if (fit) assert(metrics.scrollWidth <= metrics.width + 2 && metrics.scrollHeight <= metrics.height + 2 && metrics.left >= -1 && metrics.top >= -1 && metrics.right <= metrics.width + 2 && metrics.bottom <= metrics.height + 2, `主动适配后完整展示子流程: ${JSON.stringify(metrics)}`)
        else {
          if (metrics.scrollWidth > metrics.width + 2) assert.match(metrics.overflowX, /^(auto|scroll)$/u)
          if (metrics.scrollHeight > metrics.height + 2) assert.match(metrics.overflowY, /^(auto|scroll)$/u)
        }
      }
      const nodes = guide.locator('[data-fulfillment-stage]')
      const count = await nodes.count()
      assert.equal(count, 17, '完整流程必须包含全部 17 个环节')
      assert.equal(await guide.locator('[data-chain-phase]').count(), 3)
      assert.equal(await guide.locator('[data-chain-stage][data-conditional]').count(), 2)
      assert.equal(await guide.locator('.erp-dev-fulfillment-guide__result').count(), 0, '总图初始不展开详情')
      for (const [index, step] of taskCatalog.fulfillment_flow.entries()) {
        assert.equal(await stageButton(step.stage).getAttribute('aria-label'), `${index + 1} ${step.label}`)
        assert.equal(await stageButton(step.stage).getAttribute('aria-expanded'), 'false')
      }
      const verifyOverview = async ({ firstScreen = !mobile && page.viewportSize().width >= 1920 } = {}) => {
        const layout = await guide.evaluate((element) => {
          const overview = element.querySelector('.erp-dev-chain__map') || element.querySelector('.erp-dev-fulfillment-guide__steps').parentElement
          const detail = element.querySelector('.erp-dev-fulfillment-guide__result')
          const steps = [...element.querySelectorAll('[data-fulfillment-stage]')].map((item) => {
            const button = item.querySelector('.erp-dev-chain__stage-main') || item.querySelector('button')
            const title = item.querySelector('strong')
            const rect = button.getBoundingClientRect()
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, font: parseFloat(getComputedStyle(title).fontSize), clipped: title.scrollHeight > title.clientHeight + 1 || button.scrollWidth > button.clientWidth + 1 }
          })
          return { steps, width: innerWidth, height: innerHeight, overviewBottom: overview.getBoundingClientRect().bottom, detailTop: detail?.getBoundingClientRect().top, inline: detail?.closest('.erp-dev-chain__inline') !== null, selectedBottom: element.querySelector('[data-stage-card][data-selected]')?.getBoundingClientRect().bottom }
        })
        assert(layout.steps.every((step) => step.font >= 14 && !step.clipped), '流程名称保持正常字号并完整显示')
        assert(layout.steps.every((step) => step.left >= 0 && step.right <= layout.width), '全部环节不能横向溢出')
        if (layout.detailTop !== undefined) {
          if (layout.selectedBottom !== undefined) assert(layout.inline && layout.detailTop >= layout.selectedBottom - 1, '步骤详情在所选主链行下方原地展开')
          else assert(layout.detailTop >= layout.overviewBottom, '专题详情位于专题总览下方')
        }
        if (firstScreen) assert(layout.steps.every((step) => step.top >= 0 && step.bottom <= layout.height), `桌面首屏必须看完全部 17 个环节: ${JSON.stringify(layout)}`)
        return layout
      }
      await page.evaluate(() => document.fonts.ready)
      await verifyOverview()
      await page.screenshot({ path: path.join(outputDir, `order-flow-overview-${mobile ? 'mobile' : 'desktop'}-4k.png`), fullPage: mobile, scale: 'device' })
      await stageButton('sales_order').click()
      await verifySubflowPreview()
      await verifyCompactMermaidViewer(page, subflowDiagram, assert)
      if (!mobile) {
        for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
          await page.setViewportSize(viewport)
          await page.reload()
          await verifySubflowPreview()
          await verifyOverview()
          await page.screenshot({ path: path.join(outputDir, `order-flow-overview-${viewport.width}.png`), scale: 'device' })
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.reload()
        await verifySubflowPreview()
      }
      const overviewPosition = () => guide.locator('.erp-dev-chain__map').evaluate((node) => ({ top: node.getBoundingClientRect().top + scrollY, stages: node.querySelectorAll('[data-chain-stage]').length }))
      const overviewBeforeSelection = await overviewPosition()
      await stageButton('incoming_quality').click()
      await page.waitForURL(/flow_stage=incoming_quality/u)
      await guide.locator('.erp-dev-fulfillment-guide__result').getByRole('heading', { name: '来料检验与材料入库', exact: true }).waitFor()
      if (!mobile) assert.deepEqual(await overviewPosition(), overviewBeforeSelection, '切换详情不改变流程总览的位置')
      await page.reload()
      await guide.getByRole('button', { name: '6 来料检验与材料入库', exact: true, expanded: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.has('flow_view'), false)
      await verifySubflowPreview()
      const verifyDiagramFont = async () => {
        const fontSizes = await subflowDiagram.locator('svg .nodeLabel').evaluateAll((labels) => labels.map((label) => {
          const scale = label.ownerSVGElement?.getScreenCTM() || label.closest('svg').getScreenCTM()
          return parseFloat(getComputedStyle(label).fontSize) * Math.hypot(scale.a, scale.b)
        }))
        assert(fontSizes.length && fontSizes.every((size) => size >= 14), `子流程保持正常字号: ${fontSizes}`)
      }
      await clickMermaidControl(subflowDiagram, 'reset')
      await subflowDiagram.getByRole('button', { name: '仓库确认材料入库', exact: true }).click()
      await verifyDiagramFont()
      await page.waitForURL(/flow_substep=inbound/u)
      await subflow.locator('[data-selected-substep="inbound"]').waitFor()
      const selectedShape = subflowDiagram.locator('[data-mermaid-node-id][aria-pressed="true"] .label-container')
      assert.equal(await selectedShape.evaluate((node) => getComputedStyle(node).strokeWidth), '2px')
      await page.reload()
      await subflowDiagram.getByRole('button', { name: '仓库确认材料入库', exact: true, pressed: true }).waitFor()
      await verifySubflowPreview()
      if (mobile) {
        await verifySubflowPreview({ fit: true })
        await clickMermaidControl(subflowDiagram, 'reset')
        await verifyDiagramFont()
        await subflow.scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(outputDir, 'order-subflow-incoming-mobile.png'), scale: 'device' })
      }
      if (!mobile) {
        await clickMermaidControl(subflowDiagram, 'layout')
        await verifySubflowPreview()
        await clickMermaidControl(subflowDiagram, 'layout')
        await verifySubflowPreview()
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
      await guide.locator('[data-fulfillment-stage][data-role-match="true"]').filter({ hasText: '正式成品入库' }).waitFor()
      await guide.locator('[data-fulfillment-stage][data-role-match="false"]').filter({ hasText: '皮套检验' }).waitFor()
      if (!mobile) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.setViewportSize({ width: 1366, height: 768 })
        await verifyOverview()
        await page.setViewportSize({ width: 1920, height: 1080 })
      }
      const emphasis = await nodes.evaluateAll((items) => items.map((item) => {
        const button = item.querySelector('.erp-dev-chain__stage-main') || item.querySelector('button')
        const card = item.querySelector('[data-stage-card]') || button
        const style = getComputedStyle(card)
        return {
          stage: item.dataset.fulfillmentStage,
          selected: button.getAttribute('aria-expanded') === 'true',
          matchesRole: item.dataset.roleMatch === 'true',
          background: style.backgroundColor,
          shadow: style.boxShadow,
          left: style.borderLeftWidth,
          right: style.borderRightWidth,
          overflow: button.scrollWidth > button.clientWidth,
        }
      }))
      assert.equal(emphasis.filter((item) => item.selected).length, 1)
      assert(emphasis.every((item) => item.left === item.right && item.shadow === 'none' && !item.overflow))
      assert.deepEqual(emphasis.filter((item) => item.matchesRole).map((item) => item.stage).sort(), taskCatalog.fulfillment_flow.filter((step) => step.role_keys.includes('warehouse')).map((step) => step.stage).sort())
      assert.notEqual(emphasis.find((item) => item.selected).background, emphasis.find((item) => !item.selected).background)
      await page.reload()
      await guide.getByRole('combobox', { name: '关注岗位' }).waitFor()
      assert.match(await guide.locator('.erp-dev-fulfillment-guide__role').innerText(), /仓库/u)
      await chooseRole('财务')
      assert.equal(new URL(page.url()).searchParams.get('flow_stage'), 'incoming_quality', '切换岗位保留当前环节')
      if (!mobile) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.setViewportSize({ width: 1366, height: 768 })
        await verifyOverview()
        await page.setViewportSize({ width: 1920, height: 1080 })
      }
      const result = guide.locator('.erp-dev-fulfillment-guide__result')
      const openInstructions = async () => {
        const details = result.locator('.erp-dev-fulfillment-guide__detail-content > .erp-dev-fulfillment-guide__instructions')
        const stage = new URL(page.url()).searchParams.get('flow_stage')
        const step = taskCatalog.fulfillment_flow.find((item) => item.stage === stage)
        assert(step, `必须能从正式目录定位当前环节：${stage}`)
        const supplement = getFulfillmentSupplement(step)
        const hasSupplement = Boolean(supplement.handoffs.length || supplement.approvals.length || supplement.exception)
        if (!step.subflow && !hasSupplement) {
          assert.equal(await details.count(), 0, '已归属子步骤的说明不重复展示')
          return
        }
        await details.waitFor()
        assert.equal(await details.count(), 1)
        if (!await details.evaluate((node) => node.open)) await details.locator('summary').click()
        assert.equal(await details.evaluate((node) => node.open), true)
      }
      await stageButton('sales_order').click()
      await result.getByRole('heading', { name: '接单、工程与用料审批', exact: true }).waitFor()
      await openInstructions()
      await result.getByRole('region', { name: '当前环节的子流程', exact: true }).getByText('工程用料两级审核', { exact: true }).waitFor()
      assert.match(await result.innerText(), /重新经过老板和财务审核/u)
      assert.equal(await result.locator('a[href$="stage_key=engineering"]').count(), 1)
      await stageButton('shipment').click()
      await result.getByRole('heading', { name: '放行与实际发货', exact: true }).waitFor()
      assert.equal(await result.locator('.erp-dev-fulfillment-guide__detail-content > .erp-dev-fulfillment-guide__instructions').count(), 1, '背景与完整环节条件合为一个按需入口')
      await result.getByRole('region', { name: '当前环节的子流程', exact: true }).getByText('出货财务放行', { exact: true }).waitFor()
      assert.match(await result.innerText(), /不算已经发货/u)
      await stageButton('incoming_quality').click()
      const stageExceptions = taskCatalog.exception_guides.filter((item) => item.entry_stages.includes('incoming_quality'))
      const incomingException = stageExceptions.find((item) => item.label === '首次来料不合格')
      assert(incomingException, '来料环节必须登记首次来料不合格分支')
      await guide.getByRole('button', { name: '查看第6环节异常分支', exact: true }).click()
      if (stageExceptions.length > 1) {
        const source = guide.getByRole('combobox', { name: '异常来源', exact: true })
        await source.locator('xpath=ancestor::div[contains(@class,"ant-select-selector")][1]').click()
        await page.getByRole('option', { name: incomingException.label, exact: true }).click()
      }
      const exception = guide
      const activeGuide = guide.locator('[data-exception-guide]')
      const exceptionHandling = guide.locator('[data-exception-handling]')
      const exceptionDiagram = exceptionHandling.locator('.erp-dev-chain__handling-steps')
      const exceptionSteps = exceptionDiagram.getByRole('listitem').filter({ has: page.getByRole('button') })
      const exceptionDetail = exceptionHandling
      const openExceptionHandling = async () => {
        await activeGuide.waitFor()
        const definition = taskCatalog.exception_guides.find((item) => item.key === new URL(page.url()).searchParams.get('flow_exception'))
        assert(definition)
        const expand = definition.entry_stages.length ? guide.locator('[data-chain-work]')
          : guide.locator('.erp-dev-chain__independent-path').getByRole('button', { name: /^点开/u })
        await expand.waitFor()
        if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click()
        await exceptionHandling.waitFor()
        assert.equal(await exceptionHandling.count(), 1)
        const conditions = exceptionHandling.locator(':scope > .erp-dev-fulfillment-guide__instructions')
        if (!await conditions.evaluate((node) => node.open)) await conditions.locator(':scope > summary').click()
        assert.equal(await conditions.evaluate((node) => node.open), true)
      }
      const expectSelectedStep = async (name) => {
        await openExceptionHandling()
        await page.waitForFunction((expected) => document.querySelector('[data-exception-handling] button[aria-pressed="true"] > strong')?.textContent === expected, name)
        const selected = exceptionDiagram.locator('button[aria-pressed="true"] > strong')
        assert.equal(await selected.count(), 1)
        assert.equal(await selected.innerText(), name)
      }
      const expectExceptionStepCount = async (count) => {
        await openExceptionHandling()
        const definition = taskCatalog.exception_guides.find((item) => item.key === new URL(page.url()).searchParams.get('flow_exception'))
        assert(definition)
        const query = new URL(page.url()).searchParams
        const { plan, steps } = fulfillmentExceptionPath(definition, query.get('flow_decision'))
        assert.equal(steps.length, count, '正式方案的办理步骤数保持完整')
        assert.equal(await exceptionSteps.count(), count, '全部办理步骤都在展开的分工中')
        const labels = await exceptionSteps.locator('button > strong').allTextContents()
        assert.deepEqual(labels, steps.map((step) => step.label), '步骤内容及次序与正式方案完全一致')
        assert.equal(await nodes.count(), 17, '异常与处理分工保留全部 17 环节')
        const origins = definition.entry_stages
        const origin = origins.includes(query.get('flow_exception_origin')) ? query.get('flow_exception_origin')
          : origins.includes(query.get('flow_stage')) ? query.get('flow_stage') : origins[0]
        const target = plan.continuation.target === 'origin' ? origin
          : plan.continuation.target === 'next' ? taskCatalog.fulfillment_flow[taskCatalog.fulfillment_flow.findIndex((step) => step.stage === origin) + 1]?.stage
            : taskCatalog.fulfillment_flow.find((step) => step.stage === plan.continuation.target)?.stage
        assert.equal(await guide.locator('[data-chain-stage][data-origin]').count(), Number(Boolean(origin)))
        if (origin) await guide.locator(`[data-chain-stage="${origin}"][data-origin]`).waitFor()
        const resume = plan.continuation.reentry?.stage || target
        const returns = guide.locator('[data-chain-wire="exception-return"]')
        assert.equal(await returns.count(), Number(Boolean(resume)), '终止或独立外部业务不能伪造接回总链')
        if (resume) assert.equal(await returns.getAttribute('data-return-stage'), resume, '回线必须落到正式约定的同一个总链节点')
        if (target) await guide.locator(`[data-chain-stage="${target}"][data-return]`).waitFor()
        if (plan.continuation.reentry) {
          await guide.locator(`[data-chain-stage="${plan.continuation.reentry.stage}"][data-reentry]`).waitFor()
          const start = taskCatalog.fulfillment_flow.findIndex((step) => step.stage === plan.continuation.reentry.stage)
          const end = taskCatalog.fulfillment_flow.findIndex((step) => step.stage === target)
          assert.deepEqual(await guide.locator('[data-chain-stage][data-repeat]').evaluateAll((items) => items.map((item) => item.dataset.chainStage)), taskCatalog.fulfillment_flow.slice(start, end + 1).map((step) => step.stage), '重新进入的实际主链路径不可缺环节')
        }
        const terminal = plan.continuation.kind === 'stop' || Boolean(plan.continuation.original_terminal)
        assert.equal(await guide.locator('[data-chain-terminal]').count(), Number(Boolean(origin) && terminal))
        await waitForFiniteAnimations(page)
        await assertFulfillmentChainGeometry(guide.locator('[data-fulfillment-chain]'))
      }
      const chooseSource = async (name) => {
        const definition = taskCatalog.exception_guides.find((item) => item.label === name)
        assert(definition, name)
        await openFulfillmentExceptionDirectory(guide)
        const directory = page.getByRole('dialog', { name: '异常目录', exact: true })
        await directory.waitFor()
        assert.equal(await directory.locator('[data-exception-entry]').count(), taskCatalog.exception_guides.length)
        await directory.locator(`[data-exception-entry="${definition.key}"]`).getByRole('button').click()
        await directory.waitFor({ state: 'hidden' })
        await guide.locator(`[data-exception-guide="${definition.key}"]`).waitFor()
        assert.equal(await activeGuide.count(), 1)
      }
      const selectPlan = async (index) => {
        const definition = taskCatalog.exception_guides.find((item) => item.key === new URL(page.url()).searchParams.get('flow_exception'))
        const plan = definition.plans[index]
        assert(plan)
        const control = guide.getByRole('combobox', { name: '异常处理方案', exact: true })
        const legendLayout = () => guide.locator('.erp-dev-chain__legend').evaluate((node) => ({ height: node.getBoundingClientRect().height, width: node.clientWidth, display: getComputedStyle(node).display, scrollY }))
        await control.scrollIntoViewIfNeeded()
        await waitForFiniteAnimations(page)
        const before = await control.locator('xpath=ancestor::div[contains(@class,"ant-select")][contains(@class,"ant-select-single")][1]').boundingBox()
        const legendBefore = await legendLayout()
        await control.locator('xpath=ancestor::div[contains(@class,"ant-select-selector")][1]').click()
        await page.getByRole('option', { name: plan.label, exact: true }).click()
        await waitForFiniteAnimations(page)
        const after = await control.locator('xpath=ancestor::div[contains(@class,"ant-select")][contains(@class,"ant-select-single")][1]').boundingBox()
        const legendAfter = await legendLayout()
        assert.equal(new URL(page.url()).searchParams.get('flow_decision'), plan.key)
        for (const axis of ['x', 'y', 'width', 'height']) assert(Math.abs(after[axis] - before[axis]) <= 1, `选择处理方案时控件位置与大小稳定 ${axis}: ${JSON.stringify({ before, after, legendBefore, legendAfter })}`)
      }
      assert.equal(await nodes.count(), 17)
      assert.equal(await exceptionHandling.count(), 0, '异常总览初始不展开办理分工')
      await chooseSource('首次来料不合格')
      await chooseRole('采购')
      await expectSelectedStep('采购登记退厂范围')
      await expectExceptionStepCount(3)
      const purchaseDuty = exceptionDiagram.getByText('采购登记退厂范围', { exact: true }).locator('..')
      await purchaseDuty.waitFor()
      assert.equal(await purchaseDuty.locator('..').getAttribute('data-role-match'), 'true')
      const { steps: purchaseSteps } = fulfillmentExceptionPath(incomingException, new URL(page.url()).searchParams.get('flow_decision'))
      const purchaseDuties = purchaseSteps.filter((step) => step.role_keys.includes('purchase'))
      assert.equal(purchaseDuties.length, 1, '退厂办理仍只有一个采购职责步骤')
      const origin = taskCatalog.fulfillment_flow.find((step) => step.stage === 'incoming_quality')
      const highlightedLabels = await exceptionDiagram.locator('[data-role-match="true"] > button > strong').allTextContents()
      assert.deepEqual(highlightedLabels.sort(), purchaseDuties.map((step) => step.label).sort(), '办理岗位强调精确对应正式职责')
      assert.equal(await guide.locator('[data-chain-stage="incoming_quality"]').getAttribute('data-role-match'), String(origin.role_keys.includes('purchase')), '总链岗位强调独立核对')
      assert.equal(await exception.getByText('方案审批', { exact: true }).count(), 0)
      await selectPlan(1)
      assert.equal(await exceptionHandling.count(), 1, '切换方案保留已展开的办理分工')
      await page.waitForURL(/flow_decision=replacement/u)
      await expectExceptionStepCount(5)
      await exceptionDiagram.getByRole('button', { name: /仓库登记新到货/u }).click()
      await expectSelectedStep('仓库登记新到货')
      const selectionKeys = ['flow_role', 'flow_stage', 'flow_exception', 'flow_exception_origin', 'flow_decision', 'flow_exception_step']
      const selectionContext = () => {
        const query = new URL(page.url()).searchParams
        return Object.fromEntries(selectionKeys.map((key) => [key, query.get(key)]))
      }
      const savedSelection = selectionContext()
      assert.equal(savedSelection.flow_role, 'purchase')
      assert.equal(savedSelection.flow_exception_step, 'arrival', '跨岗位选择必须写入 URL，不能只保留在组件状态里')
      await page.reload()
      await exceptionHandling.waitFor()
      assert.equal(await exceptionHandling.count(), 1, '刷新直接恢复已展开步骤，无需再次点开分支')
      assert.deepEqual(selectionContext(), savedSelection, '刷新保留岗位、来源、处理方案及显式步骤')
      await expectSelectedStep('仓库登记新到货')
      assert.match(await exceptionDetail.innerText(), /不表示新货已入库/u)
      await exceptionHandling.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(outputDir, `order-exception-selection-restored-${mobile ? 'mobile' : 'desktop'}-4k.png`), fullPage: mobile, scale: 'device' })
      await chooseSource('裁片、皮套与成品不合格')
      await chooseRole('业务')
      await expectSelectedStep('业务提出处理方案')
      await selectPlan(3)
      assert.equal(await exceptionHandling.count(), 1, '切换方案保留已展开的办理分工')
      await page.waitForURL(/flow_decision=scrap/u)
      await expectExceptionStepCount(4)
      const scrapLabels = await exceptionSteps.evaluateAll((nodes) => nodes.map((node) => node.querySelector('button > strong').textContent))
      assert(scrapLabels.every((label) => typeof label === 'string' && label.length > 0))
      assert.doesNotMatch(scrapLabels.join(' '), /回货|重新检验/u)
      assert.match(await exceptionDetail.innerText(), /不再安排本批回货、复检或恢复生产/u)
      assert.match(await exceptionDetail.innerText(), /本次审批结束/u)
      await exceptionDiagram.getByRole('button', { name: /实际执行报废/u }).click()
      await expectSelectedStep('实际执行报废')
      await selectPlan(0)
      assert.equal(await exceptionHandling.count(), 1, '切换方案保留已展开的办理分工')
      await expectSelectedStep('业务提出处理方案')
      const productionDefinition = taskCatalog.exception_guides.find((item) => item.key === 'production_quality')
      const expectedReworkStep = fulfillmentExceptionPath(productionDefinition, 'original_rework').steps.find((step) => step.role_keys.includes('sales'))
      assert.equal(new URL(page.url()).searchParams.get('flow_exception_step'), expectedReworkStep.key, '切换方案后不能在链接中留下旧报废步骤')
      await expectExceptionStepCount(6)
      await exceptionDiagram.getByRole('button', { name: /IQC 重新检验/u }).waitFor()
      await chooseRole('财务')
      assert.equal(await exceptionDiagram.locator('[data-role-match="true"]').count(), 0, '未登记财务办理职责')
      assert.match(await guide.locator('[data-chain-work] > small').innerText(), /^财务参与 0 步/u)
      assert.equal(await activeGuide.getAttribute('data-exception-guide'), 'production_quality')
      await chooseSource('生产超领材料')
      await expectExceptionStepCount(3)
      assert.match(await exceptionDetail.innerText(), /审批通过不等于已经发料/u)
      await chooseSource('已入库后的退货与纠正')
      await expectSelectedStep('财务核对后续影响')
      await chooseSource('委外产品回货拒收')
      await expectExceptionStepCount(3)
      assert.match(await exceptionDetail.innerText(), /正式冲正/u)
      await chooseSource('款项、抵扣与退款异常')
      await expectExceptionStepCount(5)
      await exceptionDiagram.getByRole('button', { name: /财务确认实际退款/u }).click()
      await expectSelectedStep('财务确认实际退款')
      assert.match(await exceptionDetail.innerText(), /可退余额/u)
      await selectPlan(1)
      assert.equal(await exceptionHandling.count(), 1, '切换方案保留已展开的办理分工')
      await expectExceptionStepCount(3)
      await exceptionDiagram.getByRole('button', { name: /财务撤销原抵扣/u }).click()
      await expectSelectedStep('财务撤销原抵扣')
      assert.match(await exceptionDetail.innerText(), /不改变实际收付/u)
      await guide.getByRole('button', { name: '收起异常分支', exact: true }).click()
      assert.equal(new URL(page.url()).searchParams.has('flow_view'), false)
      assert.equal(new URL(page.url()).searchParams.has('flow_exception'), false)
      assert.equal(new URL(page.url()).searchParams.has('flow_decision'), false)
      await guide.getByRole('button', { name: '返回完整流程', exact: true }).click()
      await stageButton('customer_advance').click()
      await result.getByRole('heading', { name: '客户首款与分期收款', exact: true }).waitFor()
      await openInstructions()
      assert.match(await result.innerText(), /关联已生效销售订单/u)
      await stageButton('financial_settlement').click()
      await result.getByRole('heading', { name: '尾款、对账与结清', exact: true }).waitFor()
      await openInstructions()
      await subflowDiagram.getByRole('button', { name: '核对剩余未结余额', exact: true }).click()
      await subflow.locator('[data-selected-substep="balance"]').waitFor()
      assert.match(await result.innerText(), /发票、对账、出货完成都不代表款项结清/u)
      if (mobile) {
        await result.getByRole('button', { name: '收起环节', exact: true }).click()
        await result.waitFor({ state: 'detached' })
        await page.waitForFunction(() => document.activeElement?.closest('[data-fulfillment-stage]')?.dataset.fulfillmentStage === 'financial_settlement')
        assert.equal(await result.count(), 0)
        assert.equal(await stageButton('financial_settlement').getAttribute('aria-expanded'), 'false')
        assert.equal(await stageButton('financial_settlement').evaluate((node) => document.activeElement === node), true, '收起后焦点返回原环节')
        assert.equal(new URL(page.url()).searchParams.get('flow_role'), 'finance')
      } else {
        await page.evaluate(() => window.scrollTo(0, 0))
        await verifyOverview()
      }

      const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
      assert(metrics.scroll <= metrics.width + 1, `岗位流程页面横向溢出: ${JSON.stringify(metrics)}`)
      await page.screenshot({ path: path.join(outputDir, `order-role-flow-${mobile ? 'mobile' : 'desktop'}-4k.png`), fullPage: mobile, scale: 'device' })
      if (!mobile) {
        for (const step of taskCatalog.fulfillment_flow) {
          await stageButton(step.stage).click()
          await result.getByRole('heading', { name: step.label, exact: true }).waitFor()
          if (!step.subflow) {
            assert.equal(await subflow.count(), 0, '简单点数环节直接显示办理说明')
            continue
          }
          await verifySubflowPreview()
          for (const node of step.subflow.nodes) {
            await subflowDiagram.getByRole('button', { name: node.label, exact: true }).click()
            const exceptionGuide = taskCatalog.exception_guides.find((item) => item.entry_stages.includes(step.stage))
            if (node.detail_refs.includes('exception') && exceptionGuide) {
              await activeGuide.waitFor()
              assert.equal(await activeGuide.getAttribute('data-exception-guide'), exceptionGuide.key)
              assert.equal(new URL(page.url()).searchParams.get('flow_stage'), step.stage)
              assert.equal(new URL(page.url()).searchParams.get('flow_substep'), node.key)
              await guide.getByRole('button', { name: '收起异常分支', exact: true }).click()
              await activeGuide.waitFor({ state: 'detached' })
              assert.equal(new URL(page.url()).searchParams.has('flow_exception'), false)
              assert.equal(await activeGuide.count(), 0)
            }
            await subflow.locator(`[data-selected-substep="${node.key}"]`).waitFor()
          }
          assert.equal(await subflowDiagram.locator('[data-mermaid-node-id]').count(), step.subflow.nodes.length)
          await clickMermaidControl(subflowDiagram, 'reset')
          await verifyDiagramFont()
        }
        await stageButton('sewing_execute').click()
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
        assert.equal(await result.count(), 0)
        await verifyOverview({ firstScreen: false })
        await stageButton('sales_order').click()
        await verifySubflowPreview()
        await stageButton('financial_settlement').click()
        await result.getByRole('heading', { name: '尾款、对账与结清', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'order-flow-overview-drawer-4k.png'), scale: 'device' })
      }
    },
  }))
}
