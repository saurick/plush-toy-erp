const DEV_FLOW_STATE_OBSERVATORY_PATH = '/__dev/status-flows'
const EMPTY_QUERY = '__qa_no_matching_state_machine__'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const WORKFLOW_GRAPH_PATH = `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=machine&flow=workflow.task&layers=${encodeURIComponent(
  [
    'business',
    'state',
    'workflow',
    'approval',
    'task',
    'exception',
    'notification',
    'automation',
    'fact',
  ].join(',')
)}`
const ADJUSTMENT_PATH_OVERLAY_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=machine` +
  '&flow=fact.inventory_operation&path_mode=overlay' +
  '&path_kind=adjusted&path_objects=with'

async function collectBoxMetrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-dev-flow-state-observatory]')
    const rootRect = root?.getBoundingClientRect()
    return {
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      root: rootRect
        ? {
            left: Math.round(rootRect.left),
            right: Math.round(rootRect.right),
            width: Math.round(rootRect.width),
            scrollWidth: root.scrollWidth,
          }
        : null,
    }
  })
}

async function collectGraphLayoutMetrics(page, rootSelector) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector)
    const viewport = root?.querySelector('.erp-markdown-mermaid__viewport')
    const svg = root?.querySelector('.erp-markdown-mermaid__canvas svg')
    const labels = [...(svg?.querySelectorAll('g.edgeLabel') || [])]
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          text: String(node.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
      .filter((item) => item.width > 0 && item.height > 0)
    const overlaps = []
    for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < labels.length;
        rightIndex += 1
      ) {
        const left = labels[leftIndex]
        const right = labels[rightIndex]
        const overlapWidth =
          Math.min(left.right, right.right) - Math.max(left.left, right.left)
        const overlapHeight =
          Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
        if (overlapWidth > 2 && overlapHeight > 2) {
          overlaps.push({
            left: left.text,
            right: right.text,
            overlapWidth: Math.round(overlapWidth),
            overlapHeight: Math.round(overlapHeight),
          })
        }
      }
    }
    const viewportRect = viewport?.getBoundingClientRect()
    const svgRect = svg?.getBoundingClientRect()
    return {
      edgeLabels: labels.map((item) => item.text),
      maxEdgeLabelLength: labels.reduce(
        (max, item) => Math.max(max, Array.from(item.text).length),
        0
      ),
      technicalEdgeLabels: labels
        .map((item) => item.text)
        .filter((text) =>
          /(?:server|web|docs)\/|workflow\.task\.|version|幂等|必须提供|Guard|Permission/iu.test(
            text
          )
        ),
      overlaps,
      viewport: viewportRect
        ? {
            width: Math.round(viewportRect.width),
            height: Math.round(viewportRect.height),
            scrollWidth: viewport.scrollWidth,
            scrollHeight: viewport.scrollHeight,
          }
        : null,
      svg: svgRect
        ? {
            width: Math.round(svgRect.width),
            height: Math.round(svgRect.height),
          }
        : null,
    }
  }, rootSelector)
}

function reportScenarioEvidence(name, boxMetrics, writeRequests) {
  console.info(
    `[style:l1:evidence] ${JSON.stringify({
      scenario: name,
      boxMetrics,
      auditedWriteMethods: [...WRITE_METHODS],
      writeRequestCount: writeRequests.length,
      writeRequests,
    })}`
  )
}

export function createDevFlowStateObservatoryScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectText,
  gotoScenarioPath,
}) {
  const writeRequestsByPage = new WeakMap()

  return [
    {
      name: 'dev-flow-state-observatory-readonly',
      path: DEV_FLOW_STATE_OBSERVATORY_PATH,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const writeRequests = []
        writeRequestsByPage.set(page, writeRequests)
        page.on('request', (request) => {
          if (WRITE_METHODS.has(request.method().toUpperCase())) {
            writeRequests.push({
              method: request.method(),
              url: request.url(),
            })
          }
        })
      },
      verify: async (page) => {
        await expectText(page, '流程与状态观察台')
        await expectText(page, '只读观察，不改写任何业务状态')
        await expectText(page, 'Product Core')
        await expectText(page, '甲方差异')
        await expectText(page, '状态字典')
        await expectText(page, '单机状态图')
        await expectText(page, '流程编排')
        await expectText(page, '客户差异')
        await expectText(page, '运行轨迹')
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-readonly:default'
        )
        const defaultBoxMetrics = await collectBoxMetrics(page)

        await page
          .getByRole('button', { name: /单机状态图/u })
          .first()
          .click()
        await page
          .locator('[data-flow-state-view="machine"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '允许迁移')
        await expectText(page, 'Fact boundary')
        await page
          .locator('.erp-markdown-mermaid__canvas svg')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        const evidenceHierarchy = await page.evaluate(() => {
          const machineView = document.querySelector(
            '[data-flow-state-view="machine"]'
          )
          const cards = machineView?.querySelectorAll(
            '.erp-dev-flow-state-transition'
          )
          const disclosure = machineView?.querySelector(
            'details[data-evidence-disclosure="machine"]'
          )
          return {
            transitionCardCount: cards?.length || 0,
            transitionDisclosureCount:
              machineView?.querySelectorAll(
                '.erp-dev-flow-state-transition details[data-evidence-disclosure]'
              ).length || 0,
            openTransitionDisclosureCount:
              machineView?.querySelectorAll(
                '.erp-dev-flow-state-transition details[open]'
              ).length || 0,
            disclosureExists: Boolean(disclosure),
            disclosureOpen: Boolean(disclosure?.open),
          }
        })
        assert(
          evidenceHierarchy.transitionCardCount > 0 &&
            evidenceHierarchy.transitionDisclosureCount ===
              evidenceHierarchy.transitionCardCount &&
            evidenceHierarchy.openTransitionDisclosureCount === 0 &&
            evidenceHierarchy.disclosureExists &&
            !evidenceHierarchy.disclosureOpen,
          `迁移卡默认展示决策信息，逐边与整机依据都必须折叠: ${JSON.stringify(
            evidenceHierarchy
          )}`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-readonly:machine'
        )
        const machineView = page.locator('[data-flow-state-view="machine"]')
        await machineView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-evidence-collapsed.png',
          animations: 'disabled',
        })
        const machineEvidence = machineView.locator(
          'details[data-evidence-disclosure="machine"]'
        )
        const machineEvidenceSummary = machineEvidence.locator('summary')
        await machineEvidenceSummary.focus()
        await machineEvidenceSummary.press('Enter')
        assert.equal(
          await machineEvidence.evaluate((element) => element.open),
          true,
          '实现依据应支持键盘按需展开'
        )
        await machineEvidence
          .locator('.erp-dev-flow-state-evidence-list code')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-readonly:evidence-expanded'
        )
        await machineView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-evidence-expanded.png',
          animations: 'disabled',
        })
        await machineEvidenceSummary.press('Enter')
        assert.equal(
          await machineEvidence.evaluate((element) => element.open),
          false,
          '实现依据再次按 Enter 后应恢复折叠'
        )

        await page
          .getByRole('button', { name: /状态字典/u })
          .first()
          .click()
        await page
          .locator('[data-flow-state-view="dictionary"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '全局状态字典树')
        await expectText(page, '初态')
        await page.locator('.erp-dev-flow-state-state-item').first().click()
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-readonly:dictionary'
        )
        const dictionaryLocation = await page.evaluate(() => ({
          pathname: window.location.pathname,
          search: window.location.search,
        }))
        assert.equal(
          dictionaryLocation.pathname,
          DEV_FLOW_STATE_OBSERVATORY_PATH
        )
        assert.match(
          dictionaryLocation.search,
          /(?:\?|&)view=dictionary(?:&|$)/u
        )
        assert.match(dictionaryLocation.search, /(?:\?|&)flow=[^&]+/u)
        assert.match(dictionaryLocation.search, /(?:\?|&)state=[^&]+/u)

        await page
          .getByRole('button', { name: /运行轨迹/u })
          .first()
          .click()
        await page
          .locator('[data-flow-state-view="runtime"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '任务 task_id')
        await expectText(page, '输入 task_id 后读取运行轨迹与证据')

        await gotoScenarioPath(
          page,
          `${DEV_FLOW_STATE_OBSERVATORY_PATH}?q=${EMPTY_QUERY}`,
          { waitUntil: 'domcontentloaded' }
        )
        const emptyState = page
          .getByText(/没有匹配|暂无匹配|暂无符合|未找到/u)
          .first()
        await emptyState.waitFor({ state: 'visible', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-readonly:empty'
        )
        const emptyBoxMetrics = await collectBoxMetrics(page)

        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(
          writeRequests,
          [],
          '流程与状态观察台的加载、overlay 展示和空态不得发出写请求'
        )
        reportScenarioEvidence(
          'dev-flow-state-observatory-readonly',
          {
            default: defaultBoxMetrics,
            empty: emptyBoxMetrics,
          },
          writeRequests
        )
      },
    },
    {
      name: 'dev-flow-state-observatory-workflow-graph-dark',
      path: WORKFLOW_GRAPH_PATH,
      viewport: { width: 1440, height: 900 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        const writeRequests = []
        writeRequestsByPage.set(page, writeRequests)
        page.on('request', (request) => {
          if (WRITE_METHODS.has(request.method().toUpperCase())) {
            writeRequests.push({
              method: request.method(),
              url: request.url(),
            })
          }
        })
      },
      verify: async (page) => {
        await expectText(page, 'Workflow 协同任务')
        const machineView = page.locator('[data-flow-state-view="machine"]')
        await machineView.waitFor({ state: 'visible', timeout: 10_000 })
        await machineView
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })

        const graphMetrics = await collectGraphLayoutMetrics(
          page,
          '[data-flow-state-view="machine"] .erp-dev-flow-state-mermaid'
        )
        assert.equal(
          graphMetrics.edgeLabels.length,
          4,
          `Workflow 四条迁移必须各自保留一个短标签: ${JSON.stringify(
            graphMetrics
          )}`
        )
        assert.deepEqual(
          graphMetrics.edgeLabels,
          [
            '阻塞 · 仅工作流',
            '已完成 · 审批 · 仅工作流',
            '退回 / 拒绝 · 仅工作流',
            '恢复 · 仅工作流',
          ],
          `全图层标签必须使用 pathKinds、审批语义及 Fact 边界: ${JSON.stringify(
            graphMetrics
          )}`
        )
        assert(
          graphMetrics.maxEdgeLabelLength <= 20,
          `图内边标签必须保持短小: ${JSON.stringify(graphMetrics)}`
        )
        assert.deepEqual(
          graphMetrics.technicalEdgeLabels,
          [],
          `图内不得放源码路径、完整 Guard 或权限串: ${JSON.stringify(
            graphMetrics
          )}`
        )
        assert.deepEqual(
          graphMetrics.overlaps,
          [],
          `Workflow 往返边标签不得互相覆盖: ${JSON.stringify(graphMetrics)}`
        )
        assert(
          graphMetrics.viewport &&
            graphMetrics.viewport.height <= 562 &&
            graphMetrics.svg &&
            graphMetrics.svg.height <= 620,
          `普通页面中的状态图必须保持紧凑高度: ${JSON.stringify(graphMetrics)}`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-workflow-graph-dark:compact'
        )
        await machineView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-workflow-graph-dark-compact.png',
          animations: 'disabled',
        })

        await machineView
          .getByRole('button', { name: '全屏查看 Mermaid 图表' })
          .click()
        const fullscreen = page.getByRole('dialog', {
          name: 'Mermaid 图表全屏查看',
        })
        await fullscreen.waitFor({ state: 'visible', timeout: 10_000 })
        await fullscreen
          .locator('[data-mermaid-zoom-label]')
          .getByText('100%')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const fullscreenMetrics = await collectGraphLayoutMetrics(
          page,
          '[role="dialog"][aria-label="Mermaid 图表全屏查看"]'
        )
        assert.deepEqual(
          fullscreenMetrics.technicalEdgeLabels,
          [],
          `全屏图同样不得恢复技术长标签: ${JSON.stringify(fullscreenMetrics)}`
        )
        assert.deepEqual(
          fullscreenMetrics.overlaps,
          [],
          `全屏 Workflow 往返边标签不得重叠: ${JSON.stringify(
            fullscreenMetrics
          )}`
        )
        await fullscreen.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-workflow-graph-dark-fullscreen.png',
          animations: 'disabled',
        })
        await page.keyboard.press('Escape')
        await fullscreen.waitFor({ state: 'detached', timeout: 10_000 })

        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(
          writeRequests,
          [],
          'Workflow 状态图查看、图层叠加和全屏不得发出写请求'
        )
        reportScenarioEvidence(
          'dev-flow-state-observatory-workflow-graph-dark',
          {
            compact: graphMetrics,
            fullscreen: fullscreenMetrics,
          },
          writeRequests
        )
      },
    },
    {
      name: 'dev-flow-state-observatory-path-filter-recovery',
      path: ADJUSTMENT_PATH_OVERLAY_PATH,
      viewport: { width: 1280, height: 800 },
      beforeNavigate: async (page) => {
        const writeRequests = []
        writeRequestsByPage.set(page, writeRequests)
        page.on('request', (request) => {
          if (WRITE_METHODS.has(request.method().toUpperCase())) {
            writeRequests.push({
              method: request.method(),
              url: request.url(),
            })
          }
        })
      },
      verify: async (page) => {
        await expectText(page, '库存操作单')
        await expectText(page, '在完整图中高亮')
        const machineView = page.locator('[data-flow-state-view="machine"]')
        await machineView.waitFor({ state: 'visible', timeout: 10_000 })
        await machineView
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await machineView.locator('.erp-dev-flow-state-transition').count(),
          9,
          'overlay 模式必须保留完整迁移图和详情'
        )
        const highlightedEdges = await machineView.evaluate((root) =>
          [...root.querySelectorAll('.erp-markdown-mermaid__canvas svg path')]
            .filter((path) => {
              const style = `${path.getAttribute('style') || ''} ${
                path.getAttribute('stroke-width') || ''
              }`
              return /stroke-width:\s*3px|(?:^|\s)3px(?:\s|$)/u.test(style)
            })
            .length
        )
        assert(
          highlightedEdges >= 2,
          `overlay 必须高亮命中的调整路径: ${highlightedEdges}`
        )

        const pathModeSelect = page.getByRole('combobox', {
          name: '路径呈现',
        })
        await pathModeSelect
          .locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
          )
          .locator('.ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('仅看异常、纠正与恢复路径', { exact: true })
          .click()
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('path_mode') ===
            'only'
        )
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-flow-state-view="machine"] .erp-dev-flow-state-transition'
            ).length === 2
        )
        assert.equal(
          await machineView.locator('.erp-dev-flow-state-transition').count(),
          2,
          'only 模式只保留命中的两条人工调整边'
        )
        await expectText(page, '调整')
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-path-filter-recovery:only'
        )
        await machineView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-adjusted-only.png',
          animations: 'disabled',
        })

        await gotoScenarioPath(
          page,
          `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=machine&flow=fact.inventory_operation&path_mode=only&path_kind=unknown`,
          { waitUntil: 'domcontentloaded' }
        )
        await expectText(page, 'fail closed 拒绝放宽')
        assert.equal(
          await page
            .locator(
              '[data-flow-state-view="machine"] .erp-dev-flow-state-view-stack'
            )
            .count(),
          0,
          '未知路径类型不得回退到全量图'
        )

        await page.goBack({ waitUntil: 'domcontentloaded' })
        await machineView.waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('path_kind') ===
              'adjusted' &&
            new URLSearchParams(window.location.search).get('path_mode') ===
              'only'
        )
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-flow-state-view="machine"] .erp-dev-flow-state-transition'
            ).length === 2
        )
        assert.equal(
          await machineView.locator('.erp-dev-flow-state-transition').count(),
          2,
          '浏览器返回必须恢复路径类型、模式、对象和详情'
        )

        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(
          writeRequests,
          [],
          '路径高亮、筛选、fail closed 和恢复不得发出写请求'
        )
        reportScenarioEvidence(
          'dev-flow-state-observatory-path-filter-recovery',
          {
            only: await collectBoxMetrics(page),
            highlightedEdges,
          },
          writeRequests
        )
      },
    },
    {
      name: 'dev-flow-state-observatory-mobile-dark',
      path: DEV_FLOW_STATE_OBSERVATORY_PATH,
      viewport: { width: 390, height: 844 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        const writeRequests = []
        writeRequestsByPage.set(page, writeRequests)
        page.on('request', (request) => {
          if (WRITE_METHODS.has(request.method().toUpperCase())) {
            writeRequests.push({
              method: request.method(),
              url: request.url(),
            })
          }
        })
      },
      verify: async (page) => {
        await expectText(page, '流程与状态观察台')
        await expectText(page, '只读观察，不改写任何业务状态')
        await page
          .locator(
            '[data-dev-flow-state-observatory][data-catalog-status="ready"]'
          )
          .waitFor({ state: 'visible', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-mobile-dark:overview'
        )

        const metrics = await page.evaluate(() => {
          const root = document.querySelector(
            '[data-dev-flow-state-observatory]'
          )
          const workspaceNav = document.querySelector('.erp-dev-workspace-nav')
          const viewNav = document.querySelector(
            'nav[aria-label="流程状态观察视图"]'
          )
          return {
            theme:
              document.documentElement.getAttribute('data-erp-theme') || '',
            rootExists: Boolean(root),
            workspaceNavVisible: Boolean(
              workspaceNav &&
                workspaceNav.getBoundingClientRect().width > 0 &&
                workspaceNav.getBoundingClientRect().height > 0
            ),
            workspaceRouteCount: document.querySelectorAll(
              '.erp-dev-workspace-nav__route'
            ).length,
            currentWorkspaceRouteCount: document.querySelectorAll(
              '.erp-dev-workspace-nav__route[aria-current="page"]'
            ).length,
            layerToggleCount: document.querySelectorAll(
              '[data-flow-layer-controls] input[type="checkbox"]'
            ).length,
            viewButtonCount: viewNav?.querySelectorAll('button').length || 0,
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }
        })

        assert.deepEqual(
          {
            theme: metrics.theme,
            rootExists: metrics.rootExists,
            workspaceNavVisible: metrics.workspaceNavVisible,
            workspaceRouteCount: metrics.workspaceRouteCount,
            currentWorkspaceRouteCount: metrics.currentWorkspaceRouteCount,
            layerToggleCount: metrics.layerToggleCount,
            viewButtonCount: metrics.viewButtonCount,
          },
          {
            theme: 'dark',
            rootExists: true,
            workspaceNavVisible: true,
            workspaceRouteCount: 4,
            currentWorkspaceRouteCount: 1,
            layerToggleCount: 9,
            viewButtonCount: 5,
          },
          `移动端 dark 导航、九层开关和五个只读视图必须可用: ${JSON.stringify(
            metrics
          )}`
        )
        assert(
          metrics.scrollWidth <= metrics.clientWidth + 1,
          `移动端观察台不应横向溢出: ${JSON.stringify(metrics)}`
        )
        const overviewBoxMetrics = await collectBoxMetrics(page)

        await page
          .getByRole('button', { name: /单机状态图/u })
          .first()
          .click()
        const mobileMachineView = page.locator(
          '[data-flow-state-view="machine"]'
        )
        await mobileMachineView.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        const mobileEvidenceHierarchy = await page.evaluate(() => {
          const machineView = document.querySelector(
            '[data-flow-state-view="machine"]'
          )
          const disclosure = machineView?.querySelector(
            'details[data-evidence-disclosure="machine"]'
          )
          return {
            transitionDisclosureCount:
              machineView?.querySelectorAll(
                '.erp-dev-flow-state-transition details[data-evidence-disclosure]'
              ).length || 0,
            openTransitionDisclosureCount:
              machineView?.querySelectorAll(
                '.erp-dev-flow-state-transition details[open]'
              ).length || 0,
            disclosureOpen: Boolean(disclosure?.open),
          }
        })
        assert(
          mobileEvidenceHierarchy.transitionDisclosureCount > 0 &&
            mobileEvidenceHierarchy.openTransitionDisclosureCount === 0 &&
            mobileEvidenceHierarchy.disclosureOpen === false,
          `移动端暗色模式也应默认收起逐边和整机依据: ${JSON.stringify(
            mobileEvidenceHierarchy
          )}`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-mobile-dark:machine'
        )
        await mobileMachineView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-evidence-collapsed-mobile-dark.png',
          animations: 'disabled',
        })

        const orchestrationButton = page
          .getByRole('button', { name: /流程编排/u })
          .first()
        await orchestrationButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await orchestrationButton.click()
        await page
          .locator('[data-flow-state-view="orchestration"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '客户差异')
        const orchestrationMetrics = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth
          const overflowers = [...document.querySelectorAll('body *')]
            .filter((node) => !node.closest('.erp-dev-workspace-nav__routes'))
            .map((node) => {
              const rect = node.getBoundingClientRect()
              const style = window.getComputedStyle(node)
              return {
                tag: node.tagName.toLowerCase(),
                className:
                  typeof node.className === 'string' ? node.className : '',
                text: String(node.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim()
                  .slice(0, 100),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
                display: style.display,
                minWidth: style.minWidth,
                overflowX: style.overflowX,
              }
            })
            .filter(
              (item) =>
                item.right > viewportWidth + 1 ||
                item.scrollWidth > item.clientWidth + 1
            )
            .sort(
              (left, right) =>
                Math.max(right.right - viewportWidth, 0) -
                Math.max(left.right - viewportWidth, 0)
            )
            .slice(0, 12)
          return {
            viewportWidth,
            bodyScrollWidth: document.body.scrollWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            overflowers,
          }
        })
        assert(
          orchestrationMetrics.bodyScrollWidth <=
            orchestrationMetrics.viewportWidth + 1 &&
            orchestrationMetrics.documentScrollWidth <=
              orchestrationMetrics.viewportWidth + 1,
          `移动端客户差异视图不应横向溢出: ${JSON.stringify(
            orchestrationMetrics
          )}`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-mobile-dark:orchestration'
        )
        const orchestrationBoxMetrics = await collectBoxMetrics(page)

        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(
          writeRequests,
          [],
          '移动端 dark 导航和客户差异查看不得发出写请求'
        )
        reportScenarioEvidence(
          'dev-flow-state-observatory-mobile-dark',
          {
            overview: overviewBoxMetrics,
            orchestration: {
              ...orchestrationBoxMetrics,
              overflowers: orchestrationMetrics.overflowers,
            },
          },
          writeRequests
        )
      },
    },
  ]
}
