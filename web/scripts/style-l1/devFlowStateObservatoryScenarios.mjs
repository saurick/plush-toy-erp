const DEV_FLOW_STATE_OBSERVATORY_PATH = '/__dev/status-flows'
const DEFAULT_CHAIN_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=chain&chain=all`
const DELIVERY_CHAIN_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=chain` +
  '&chain=delivery_to_settlement&node=shipment_draft'
const INVALID_DEEP_LINK_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=facts` +
  '&chain=retired-chain&fact=fact.retired&task_id=abc&extra=1'
const TASK_LOOKUP_PATH = DEFAULT_CHAIN_PATH
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const READ_ONLY_WORKFLOW_METHODS = new Set([
  'list_tasks',
  'list_task_events',
  'get_task_process_context',
])
const DUPLICATE_TASK_NAME = '看本周哪些订单可能延期（18）'
const UNIQUE_TASK_NAME = '确认本周交付风险（19）'
const DISPLAY_ONLY_TASK_NAME = '核对模拟任务是否有正式流程（18）'

const TASK_LOOKUP_FIXTURES = [
  {
    id: 1818,
    task_code: 'TRIAL-BOSS-18-A',
    task_group: 'sales_order_acceptance',
    task_name: DUPLICATE_TASK_NAME,
    source_type: 'sales_order',
    source_id: 5018,
    source_no: 'SO-DELAY-18-A',
    task_status_key: 'ready',
    owner_role_key: 'boss',
    process_instance_id: 7018,
    process_node_instance_id: 8018,
    version: 1,
    payload: {},
  },
  {
    id: 2818,
    task_code: 'TRIAL-BOSS-18-B-LONG-CODE-FOR-WRAP',
    task_group: 'sales_order_acceptance',
    task_name: DUPLICATE_TASK_NAME,
    source_type: 'sales_order',
    source_id: 6018,
    source_no: 'SO-DELAY-18-B-LONG-SOURCE-NUMBER-FOR-WRAP',
    task_status_key: 'blocked',
    owner_role_key: 'boss',
    process_instance_id: 7118,
    process_node_instance_id: 8118,
    version: 2,
    payload: {},
  },
  {
    id: 1901,
    task_code: 'TRIAL-BOSS-19',
    task_group: 'sales_order_acceptance',
    task_name: UNIQUE_TASK_NAME,
    source_type: 'sales_order',
    source_id: 5019,
    source_no: 'SO-RISK-19',
    task_status_key: 'ready',
    owner_role_key: 'boss',
    process_instance_id: 7019,
    process_node_instance_id: 8019,
    version: 1,
    payload: {},
  },
  {
    id: 430,
    task_code: 'TRIAL-DISPLAY-18',
    task_group: 'trial_task',
    task_name: DISPLAY_ONLY_TASK_NAME,
    source_type: 'simulated-manual-acceptance-task-batch',
    source_id: 18,
    source_no: '样例-老板-18',
    task_status_key: 'blocked',
    owner_role_key: 'boss',
    process_instance_id: null,
    process_node_instance_id: null,
    version: 2,
    payload: { simulated_only: true },
  },
]

function taskLookupProcessContext(task) {
  const node = {
    id: task.process_node_instance_id,
    process_instance_id: task.process_instance_id,
    node_key: 'order_approval',
    node_type: 'approval',
    attempt: 1,
    version: task.version,
    status: task.task_status_key === 'blocked' ? 'blocked' : 'active',
    outcome: '',
  }
  return {
    taskID: task.id,
    processContext: {
      source: {
        type: task.source_type,
        id: task.source_id,
        no: task.source_no,
      },
      process_instance: {
        id: task.process_instance_id,
        process_key: 'sales_order_acceptance',
        process_version: 'v1',
        status: task.task_status_key === 'blocked' ? 'blocked' : 'active',
        started_at: 1_800_000_000 + task.id,
        completed_at: null,
      },
      linked_node: node,
      approval_form: null,
      nodes: [node],
      current_nodes: [node],
      completed_nodes: [],
    },
  }
}

async function waitForCatalog(page) {
  await page
    .locator('[data-dev-flow-state-observatory][data-catalog-status="ready"]')
    .waitFor({ state: 'visible', timeout: 10_000 })
}

async function collectBoxMetrics(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-dev-flow-state-observatory]')
    const viewNav = document.querySelector(
      '[role="tablist"][aria-label="业务链与运行观察视图"]'
    )
    const graph = document.querySelector(
      '.erp-dev-flow-overview-graph, .erp-dev-flow-chain-graph'
    )
    const nestedVerticalScrollers = [
      ...document.querySelectorAll(
        '.erp-dev-flow-main, .erp-dev-flow-overview-map, .erp-dev-flow-chain-workspace, .erp-dev-flow-chain-map, .erp-dev-flow-node-detail'
      ),
    ]
      .filter((node) => {
        const style = window.getComputedStyle(node)
        return (
          /auto|scroll/u.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight + 1
        )
      })
      .map((node) => ({
        className: node.className,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }))
    return {
      theme: document.documentElement.getAttribute('data-erp-theme') || '',
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rootScrollWidth: root?.scrollWidth || 0,
      selectedTabCount:
        viewNav?.querySelectorAll('[role="tab"][aria-selected="true"]')
          .length || 0,
      tabCount: viewNav?.querySelectorAll('[role="tab"]').length || 0,
      navClientWidth: viewNav?.clientWidth || 0,
      navScrollWidth: viewNav?.scrollWidth || 0,
      graphDisplay: graph ? window.getComputedStyle(graph).display : '',
      nestedVerticalScrollers,
    }
  })
}

function startNoWriteAudit(page, store) {
  const requests = []
  store.set(page, requests)
  page.on('request', (request) => {
    if (WRITE_METHODS.has(request.method().toUpperCase())) {
      requests.push({ method: request.method(), url: request.url() })
    }
  })
}

function startWorkflowAudit(page, store) {
  const requests = []
  store.set(page, requests)
  page.on('request', (request) => {
    if (
      request.method().toUpperCase() !== 'POST' ||
      !request.url().includes('/rpc/workflow')
    ) {
      return
    }
    try {
      requests.push({
        method: request.postDataJSON()?.method || '',
        url: request.url(),
      })
    } catch {
      requests.push({ method: 'invalid-workflow-request', url: request.url() })
    }
  })
}

function reportScenarioEvidence(name, evidence) {
  console.info(
    `[style:l1:evidence] ${JSON.stringify({ scenario: name, ...evidence })}`
  )
}

async function expectTaskID(page, taskId) {
  await page.waitForFunction(
    (expected) =>
      new URLSearchParams(window.location.search).get('task_id') === expected,
    String(taskId)
  )
}

async function searchTask(page, query) {
  const input = page.getByPlaceholder(
    '粘贴完整任务名称、任务编号、来源单号或数字 task_id'
  )
  await input.fill(query)
  await input.press('Enter')
  return input
}

async function collectDefinitionSearchMetrics(page) {
  return page.evaluate(() => {
    const section = document.querySelector('.erp-dev-flow-global-search')
    const input = section?.querySelector('input')
    const context = document.querySelector('.erp-dev-flow-context')
    return {
      value: input?.value || '',
      active: document.activeElement === input,
      composing: section?.dataset.searchComposing || '',
      sectionHeight: section?.getBoundingClientRect().height || 0,
      contextTop: context?.getBoundingClientRect().top || 0,
      resultPanelCount: section?.querySelectorAll(
        '.erp-dev-flow-search-results'
      ).length,
      queryInURL: new URLSearchParams(window.location.search).has('q'),
      scrollY: window.scrollY,
    }
  })
}

async function exerciseDefinitionSearchIME(page, search) {
  await search.fill('')
  await search.click()
  await search.evaluate((input) => {
    window.__devFlowDefinitionSearchIMEEvents = []
    for (const eventName of [
      'compositionstart',
      'compositionupdate',
      'compositionend',
    ]) {
      input.addEventListener(eventName, (event) => {
        window.__devFlowDefinitionSearchIMEEvents.push({
          type: event.type,
          data: event.data || '',
          value: input.value,
        })
      })
    }
  })
  const baseline = await collectDefinitionSearchMetrics(page)
  const client = await page.context().newCDPSession(page)
  await client.send('Input.imeSetComposition', {
    text: 'xiao',
    selectionStart: 4,
    selectionEnd: 4,
    replacementStart: 0,
    replacementEnd: 0,
  })
  await page.waitForTimeout(80)
  const firstComposition = await collectDefinitionSearchMetrics(page)
  await client.send('Input.imeSetComposition', {
    text: 'xiaoshou',
    selectionStart: 8,
    selectionEnd: 8,
    replacementStart: 0,
    replacementEnd: 4,
  })
  await page.waitForTimeout(80)
  const secondComposition = await collectDefinitionSearchMetrics(page)
  await client.send('Input.insertText', { text: '销售' })
  await page.waitForFunction(
    () =>
      document.querySelector(
        'input[placeholder="例如：销售订单、销售 PMC、已提交、出货事实"]'
      )?.value === '销售'
  )
  await page
    .locator('.erp-dev-flow-search-results')
    .waitFor({ state: 'visible', timeout: 10_000 })
  const committed = await collectDefinitionSearchMetrics(page)
  const events = await page.evaluate(
    () => window.__devFlowDefinitionSearchIMEEvents || []
  )
  return { baseline, firstComposition, secondComposition, committed, events }
}

export function createDevFlowStateObservatoryScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectText,
}) {
  const writeRequestsByPage = new WeakMap()
  const workflowRequestsByPage = new WeakMap()
  const expectCollapsedGuidance = async (page, guidanceKey, maxHeight = 72) => {
    const guidance = page.locator(`[data-flow-guidance="${guidanceKey}"]`)
    await guidance.waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await guidance.evaluate((node) => {
      const summary = node.querySelector('summary')
      const body = node.querySelector('.erp-dev-flow-guidance__body')
      return {
        open: node.open,
        height: node.getBoundingClientRect().height,
        summaryHeight: summary?.getBoundingClientRect().height || 0,
        bodyHeight: body?.getBoundingClientRect().height || 0,
        bodyVisible: body?.checkVisibility() || false,
      }
    })
    assert.equal(metrics.open, false, `${guidanceKey} 说明必须默认折叠`)
    assert(
      metrics.summaryHeight >= 44,
      `${guidanceKey} 说明触屏高度不得小于 44px：${metrics.summaryHeight}`
    )
    assert(
      metrics.height <= maxHeight,
      `${guidanceKey} 折叠说明不得占用大块首屏：${metrics.height}`
    )
    assert.equal(
      metrics.bodyVisible,
      false,
      `${guidanceKey} 完整文案默认不可见`
    )
    return { guidance, metrics }
  }

  return [
    {
      name: 'dev-flow-state-observatory-readonly',
      path: DEFAULT_CHAIN_PATH,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        await expectText(page, '业务链与运行观察台')
        const root = page.locator('[data-dev-flow-state-observatory]')
        const header = root.locator('.erp-dev-flow-header')
        const conceptDetails = root.locator('.erp-dev-flow-concepts')
        const conceptSummary = conceptDetails.locator('summary')
        const definitionDetails = root.locator('.erp-dev-flow-definition-tools')
        assert.equal(
          await conceptDetails.evaluate((node) =>
            node.parentElement?.matches('.erp-dev-flow-header')
          ),
          true,
          '概念解释必须并入页头，不再单独占用一张卡片'
        )
        assert.equal(
          await conceptDetails.getAttribute('open'),
          null,
          '五层概念解释默认必须折叠'
        )
        assert.equal(
          await definitionDetails.getAttribute('open'),
          '',
          '全局定义搜索默认必须展开，仍允许按需收起'
        )
        const collapsedHeaderMetrics = await header.evaluate((node) => ({
          height: node.getBoundingClientRect().height,
          summaryHeight:
            node
              .querySelector('.erp-dev-flow-concepts > summary')
              ?.getBoundingClientRect().height || 0,
          memoryVisible:
            node.querySelector('.erp-dev-flow-memory')?.checkVisibility() ||
            false,
        }))
        assert(collapsedHeaderMetrics.summaryHeight >= 44)
        assert.equal(collapsedHeaderMetrics.memoryVisible, false)
        await conceptSummary.focus()
        await conceptSummary.press('Enter')
        await page.waitForFunction(
          () => document.querySelector('.erp-dev-flow-concepts')?.open
        )
        await expectText(page, 'Workflow 管“人”')
        await expectText(page, 'ProcessRuntime 管“路”')
        await expectText(page, 'Fact / Ledger 管“账”')
        await expectText(page, '状态机管“规则”')
        await expectText(page, '业务链负责串起来')
        await expectText(page, '跨视图查定义（不查具体任务）')
        await expectText(page, '可以搜什么')
        await expectText(page, '去查真实任务')

        const memoryItems = root.locator('[data-memory-layer]')
        const expandedHeaderMetrics = await header.evaluate((node) => ({
          height: node.getBoundingClientRect().height,
          memoryVisible:
            node.querySelector('.erp-dev-flow-memory')?.checkVisibility() ||
            false,
        }))
        assert.equal(expandedHeaderMetrics.memoryVisible, true)
        assert(
          expandedHeaderMetrics.height > collapsedHeaderMetrics.height,
          '展开概念解释后必须在同一页头内显示完整内容'
        )
        await header.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-header-concepts-expanded.png',
          animations: 'disabled',
        })
        const chainView = page.locator('[data-flow-state-view="chain"]')
        const overviewView = chainView.locator(
          '[data-business-chain-overview]'
        )
        await overviewView
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await overviewView.locator('[data-overview-chain]').count(),
          12,
          '默认总图必须只展示 12 条真实业务链的链级节点'
        )
        assert.equal(
          await overviewView.locator('[data-overview-relation]').count(),
          16,
          '总图必须展示目录登记的 16 条明确链间衔接'
        )
        assert.equal(
          await overviewView.locator('[data-chain-node]').count(),
          0,
          '总图不得展开任何单链内部节点'
        )
        const overviewGuidance = await expectCollapsedGuidance(
          page,
          'chain-overview'
        )
        await overviewView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-business-chain-overview.png',
          animations: 'disabled',
        })
        await overviewView
          .getByRole('button', {
            name: '查看业务链：销售受理到生产准备',
          })
          .click()
        await page.waitForFunction(
          () => {
            const params = new URLSearchParams(window.location.search)
            return (
              params.get('chain') === 'sales_to_production' &&
              params.get('node') === 'sales_order' &&
              document.querySelectorAll('[data-chain-node]').length === 6
            )
          },
          undefined,
          { timeout: 10_000 }
        )
        await chainView
          .locator('.erp-dev-flow-chain-graph .erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const mermaidToolbar = chainView.locator(
          '.erp-dev-flow-chain-graph .erp-markdown-mermaid__toolbar'
        )
        const zoomInButton = mermaidToolbar.locator(
          '[data-mermaid-zoom-action="zoom-in"]'
        )
        await zoomInButton.click()
        await zoomInButton.click()
        await mermaidToolbar
          .locator('[data-mermaid-fullscreen-action="open"]')
          .click()
        await page.keyboard.press('Escape')
        await mermaidToolbar.locator('[data-mermaid-zoom-action="fit"]').hover()
        const mermaidToolbarInteraction = await mermaidToolbar.evaluate(
          (toolbar) => {
            const buttons = [
              ...toolbar.querySelectorAll('.erp-markdown-mermaid__tool'),
            ]
            const readAction = (node) =>
              node?.getAttribute('data-mermaid-zoom-action') ||
              node?.getAttribute('data-mermaid-fullscreen-action') ||
              ''
            const hovered = buttons.find((button) => button.matches(':hover'))
            const focused = buttons.find(
              (button) => button === document.activeElement
            )
            const diagram = toolbar
              .closest('.erp-markdown-mermaid')
              ?.querySelector('.erp-markdown-mermaid__canvas > svg')

            return {
              zoom:
                toolbar
                  .querySelector('[data-mermaid-zoom-label]')
                  ?.textContent?.trim() || '',
              actions: buttons.map(readAction),
              centerHits: buttons.map((button) => {
                const rect = button.getBoundingClientRect()
                return readAction(
                  document
                    .elementFromPoint(
                      rect.left + rect.width / 2,
                      rect.top + rect.height / 2
                    )
                    ?.closest('.erp-markdown-mermaid__tool')
                )
              }),
              hoveredAction: readAction(hovered),
              focusedAction: readAction(focused),
              diagramMinWidth: diagram
                ? window.getComputedStyle(diagram).minWidth
                : '',
              iconWidths: buttons.map(
                (button) =>
                  button.querySelector('svg')?.getBoundingClientRect().width ||
                  0
              ),
            }
          }
        )
        assert.equal(
          mermaidToolbarInteraction.zoom,
          '140%',
          `流程状态页 Mermaid 应保留 140% 缩放：${JSON.stringify(
            mermaidToolbarInteraction
          )}`
        )
        assert.deepEqual(
          mermaidToolbarInteraction.centerHits,
          mermaidToolbarInteraction.actions,
          `流程状态页 Mermaid 工具按钮中心必须分别命中自身：${JSON.stringify(
            mermaidToolbarInteraction
          )}`
        )
        assert.equal(
          mermaidToolbarInteraction.hoveredAction,
          'fit',
          `流程状态页 Mermaid hover 必须只命中当前按钮：${JSON.stringify(
            mermaidToolbarInteraction
          )}`
        )
        assert.equal(
          mermaidToolbarInteraction.focusedAction,
          'open',
          `流程状态页退出全屏后必须恢复全屏入口焦点：${JSON.stringify(
            mermaidToolbarInteraction
          )}`
        )
        assert.equal(
          mermaidToolbarInteraction.diagramMinWidth,
          '760px',
          '业务链图仍需保留 760px 最小宽度'
        )
        assert(
          mermaidToolbarInteraction.iconWidths.every((width) => width <= 20),
          `工具栏图标不得继承业务链图的 760px 最小宽度：${JSON.stringify(
            mermaidToolbarInteraction
          )}`
        )
        await mermaidToolbar
          .locator('[data-mermaid-zoom-action="reset"]')
          .click()
        assert.equal(await memoryItems.count(), 5, '顶部必须只保留五层记忆')
        assert.equal(
          await chainView.locator('[data-chain-node]').count(),
          6,
          '默认只展示销售受理到生产准备这一条业务链'
        )
        assert.equal(
          await chainView.locator('[data-overview-chain]').count(),
          0
        )
        await conceptSummary.press('Enter')
        await page.waitForFunction(
          () => !document.querySelector('.erp-dev-flow-concepts')?.open
        )
        await definitionDetails.locator('summary').click()
        assert.equal(
          await root.locator('details[open]').count(),
          0,
          '代码证据和内部规则默认必须折叠'
        )

        const chainGuidance = await expectCollapsedGuidance(page, 'chain')
        const chainGuidanceSummary = chainGuidance.guidance.locator('summary')
        await chainGuidanceSummary.focus()
        await chainGuidanceSummary.press('Enter')
        await page.waitForFunction(
          () => document.querySelector('[data-flow-guidance="chain"]')?.open
        )
        const expandedGuidanceMetrics = await chainGuidance.guidance.evaluate(
          (node) => ({
            height: node.getBoundingClientRect().height,
            bodyHeight:
              node
                .querySelector('.erp-dev-flow-guidance__body')
                ?.getBoundingClientRect().height || 0,
            bodyVisible:
              node
                .querySelector('.erp-dev-flow-guidance__body')
                ?.checkVisibility() || false,
          })
        )
        assert(expandedGuidanceMetrics.bodyHeight > 0)
        assert.equal(expandedGuidanceMetrics.bodyVisible, true)
        assert(
          expandedGuidanceMetrics.height > chainGuidance.metrics.height,
          '展开后必须显示完整说明'
        )
        await chainGuidance.guidance.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-guidance-expanded.png',
          animations: 'disabled',
        })
        await chainGuidanceSummary.press('Enter')
        await expectCollapsedGuidance(page, 'chain')

        await chainView
          .getByRole('button', { name: /查看.*销售订单状态规则/u })
          .first()
          .click()
        await page
          .locator('[data-flow-state-view="states"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await root.locator('.erp-dev-flow-definition-tools').count(),
          0,
          '状态规则 Tab 不得重复展示业务链定义搜索'
        )
        await page
          .getByRole('combobox', { name: '选择状态对象' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectCollapsedGuidance(page, 'states')
        await expectText(page, '规则视图不是运行实例或事实凭证')
        await page.getByRole('button', { name: '返回业务链' }).click()
        await chainView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await root.locator('.erp-dev-flow-definition-tools').count(),
          1,
          '返回业务链后必须恢复业务链定义搜索'
        )

        await chainView.locator('[data-chain-node="sales_acceptance"]').click()
        await chainView
          .getByRole('button', { name: /查看.*销售订单受理/u })
          .first()
          .click()
        const runtimeView = page.locator('[data-flow-state-view="runtime"]')
        await runtimeView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await root.locator('.erp-dev-flow-definition-tools').count(),
          0,
          '运行路径 Tab 不得重复展示业务链定义搜索'
        )
        await page
          .getByRole('combobox', { name: '选择流程定义' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectCollapsedGuidance(page, 'runtime')
        await expectCollapsedGuidance(page, 'process-definition')
        const runtimeURL = page.url()
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await chainView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await chainView
            .locator('[data-chain-node="sales_acceptance"]')
            .getAttribute('aria-current'),
          'step'
        )
        await page.goForward({ waitUntil: 'domcontentloaded' })
        await runtimeView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(page.url(), runtimeURL)
        await page.getByRole('button', { name: '返回业务链' }).click()
        await chainView.waitFor({ state: 'visible', timeout: 10_000 })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await chainView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await chainView
            .locator('[data-chain-node="sales_acceptance"]')
            .getAttribute('aria-current'),
          'step',
          '刷新后必须恢复业务链与节点'
        )

        const chainSelector = page.getByRole('combobox', {
          name: '选择业务链',
        })
        await chainSelector
          .locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
          )
          .locator('.ant-select-selector')
          .click()
        await chainSelector.fill('生产 入库')
        const filteredChainOptions = page.locator(
          '.ant-select-dropdown:visible .ant-select-item-option'
        )
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('.ant-select-dropdown')].some(
              (dropdown) => {
                const rect = dropdown.getBoundingClientRect()
                const style = window.getComputedStyle(dropdown)
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.display !== 'none' &&
                  style.visibility !== 'hidden' &&
                  dropdown.querySelectorAll('.ant-select-item-option')
                    .length === 1
                )
              }
            ),
          undefined,
          { timeout: 10_000 }
        )
        assert.equal(
          await filteredChainOptions.count(),
          1,
          '业务链下拉必须按组合关键词筛选'
        )
        await expectText(page, '生产执行到成品入库')
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-chain-keyword-filter.png',
          animations: 'disabled',
        })
        await chainSelector.press('Escape')
        await page.waitForFunction(
          () => document.getElementById('dev-flow-chain-select')?.value === ''
        )
        const chooseChain = async (label) => {
          await chainSelector
            .locator(
              'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
            )
            .locator('.ant-select-selector')
            .click()
          await page
            .locator('.ant-select-dropdown:visible .ant-select-item-option')
            .filter({ hasText: label })
            .click()
        }
        await chooseChain('成品出货到应收结清')
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('chain') ===
              'delivery_to_settlement' &&
            document.querySelectorAll(
              '[data-flow-state-view="chain"] [data-chain-node]'
            ).length === 11
        )
        assert.equal(await chainView.locator('[data-chain-node]').count(), 11)
        await chooseChain('销售受理到生产准备')
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('chain') ===
              'sales_to_production' &&
            document.querySelectorAll(
              '[data-flow-state-view="chain"] [data-chain-node]'
            ).length === 6
        )
        await chainView.locator('[data-chain-node="sales_order"]').click()

        if (!(await definitionDetails.evaluate((node) => node.open))) {
          await definitionDetails.locator('summary').click()
        }
        const search = page.getByPlaceholder(
          '例如：销售订单、销售 PMC、已提交、出货事实'
        )
        const searchGuideTrigger = page.getByRole('button', {
          name: '可以搜什么',
        })
        await searchGuideTrigger.click()
        const searchGuide = page.locator('[data-definition-search-guide]')
        await searchGuide.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await searchGuideTrigger.getAttribute('aria-expanded'),
          'true',
          '“可以搜什么”必须暴露展开状态'
        )
        for (const label of [
          '业务对象或业务链',
          '流程或节点',
          '状态',
          '事实定义',
          '稳定 key（排障）',
        ]) {
          await searchGuide.getByText(label, { exact: true }).waitFor()
        }
        await searchGuide
          .getByText('这个框查目录定义，不查具体任务、运行实例或真实业务记录。')
          .waitFor()
        const searchGuideMetrics = await searchGuide.evaluate((node) => ({
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          buttonHeights: [...node.querySelectorAll('button')].map(
            (button) => button.getBoundingClientRect().height
          ),
        }))
        assert(
          searchGuideMetrics.scrollWidth <= searchGuideMetrics.clientWidth + 1,
          `搜索范围说明不得横向溢出：${JSON.stringify(searchGuideMetrics)}`
        )
        assert(
          searchGuideMetrics.buttonHeights.every((height) => height >= 36),
          `搜索示例按钮必须具备稳定触屏高度：${JSON.stringify(searchGuideMetrics)}`
        )
        await searchGuide.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-search-guide.png',
          animations: 'disabled',
        })
        await searchGuide
          .getByRole('button', { name: '销售 PMC', exact: true })
          .click()
        await page.waitForFunction(
          () =>
            document.querySelector(
              'input[placeholder="例如：销售订单、销售 PMC、已提交、出货事实"]'
            )?.value === '销售 PMC'
        )
        const searchPanel = page.locator('.erp-dev-flow-search-results')
        await searchPanel.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '销售订单受理（审批 + PMC）')
        assert.equal(
          await searchGuideTrigger.getAttribute('aria-expanded'),
          'false',
          '点击示例后必须关闭说明并展示搜索结果'
        )
        await search.fill('')
        await searchPanel.waitFor({ state: 'hidden', timeout: 10_000 })
        const imeEvidence = await exerciseDefinitionSearchIME(page, search)
        assert.equal(
          imeEvidence.events.filter(
            (event) => event.type === 'compositionstart'
          ).length,
          1,
          `中文输入只能开始一次组合态: ${JSON.stringify(imeEvidence)}`
        )
        assert.equal(
          imeEvidence.events.filter((event) => event.type === 'compositionend')
            .length,
          1,
          `中文输入必须正常结束组合态: ${JSON.stringify(imeEvidence)}`
        )
        assert.equal(imeEvidence.firstComposition.value, 'xiao')
        assert.equal(imeEvidence.secondComposition.value, 'xiaoshou')
        assert.equal(imeEvidence.committed.value, '销售')
        assert.equal(imeEvidence.firstComposition.composing, 'true')
        assert.equal(imeEvidence.secondComposition.composing, 'true')
        assert.equal(imeEvidence.committed.composing, 'false')
        assert.equal(imeEvidence.firstComposition.resultPanelCount, 0)
        assert.equal(imeEvidence.secondComposition.resultPanelCount, 0)
        assert.equal(imeEvidence.committed.resultPanelCount, 1)
        assert.equal(imeEvidence.firstComposition.queryInURL, false)
        assert.equal(imeEvidence.secondComposition.queryInURL, false)
        assert.equal(imeEvidence.committed.queryInURL, false)
        assert.equal(
          imeEvidence.firstComposition.sectionHeight,
          imeEvidence.baseline.sectionHeight,
          '拼音组合期间搜索区高度不得变化'
        )
        assert.equal(
          imeEvidence.secondComposition.contextTop,
          imeEvidence.baseline.contextTop,
          '拼音组合期间不得推动下方观察上下文'
        )
        assert.equal(
          imeEvidence.committed.sectionHeight,
          imeEvidence.baseline.sectionHeight,
          '提交中文后结果浮层也不得撑高搜索区'
        )
        assert.equal(
          imeEvidence.committed.contextTop,
          imeEvidence.baseline.contextTop,
          '提交中文后结果浮层不得推动下方页面'
        )

        await search.fill('销售 PMC')
        await searchPanel.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '销售订单受理（审批 + PMC）')
        await searchPanel.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-definition-multi-keyword.png',
          animations: 'disabled',
        })
        await search.fill('生产 入库')
        await expectText(page, '生产执行到成品入库')
        await search.fill('待出货')
        await expectText(page, '出货事实')

        await search.fill(
          '采购订单 PO-20260806-001 供应商：示例供应商 当前状态：已提交'
        )
        const groups = page.locator('.erp-dev-flow-search-groups > section')
        await groups.first().waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(await groups.count(), 5, '粘贴识别结果必须固定按五类分组')
        for (const label of [
          '业务链',
          'Workflow',
          'ProcessRuntime',
          '状态机',
          'Fact / Ledger',
        ]) {
          await expectText(page, label)
        }
        assert.equal(
          new URL(page.url()).searchParams.has('q'),
          false,
          '粘贴的后台文字不得进入 URL 或深链'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-definition-search-ime.png',
          animations: 'disabled',
        })
        await searchPanel
          .getByRole('button', { name: /采购下单到合格入库/u })
          .click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('view') === 'chain' &&
            params.get('chain') === 'purchase_to_inventory' &&
            params.get('node') === 'purchase_order' &&
            !params.has('q')
          )
        })
        assert.equal(await search.inputValue(), '')
        assert.equal(await searchPanel.count(), 0)

        await chooseChain('全部业务链（设计总图）')
        await page.waitForFunction(
          () => {
            const params = new URLSearchParams(window.location.search)
            return (
              params.get('chain') === 'all' &&
              !params.has('node') &&
              document.querySelectorAll('[data-overview-chain]').length === 12 &&
              document.querySelectorAll('[data-chain-node]').length === 0
            )
          },
          undefined,
          { timeout: 10_000 }
        )

        await page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'instant' })
        })

        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-readonly'
        )
        const metrics = await collectBoxMetrics(page)
        assert.equal(metrics.tabCount, 5)
        assert.equal(metrics.selectedTabCount, 1)
        assert.deepEqual(metrics.nestedVerticalScrollers, [])
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '目录查阅不得发出写请求')
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-desktop-default.png',
          fullPage: true,
          animations: 'disabled',
        })
        reportScenarioEvidence('dev-flow-state-observatory-readonly', {
          metrics,
          header: {
            collapsed: collapsedHeaderMetrics,
            expanded: expandedHeaderMetrics,
          },
          guidance: {
            overview: overviewGuidance.metrics,
            collapsed: chainGuidance.metrics,
            expanded: expandedGuidanceMetrics,
          },
          writeRequests,
        })
      },
    },
    {
      name: 'dev-flow-state-observatory-chain-drill-dark',
      path: DELIVERY_CHAIN_PATH,
      viewport: { width: 1440, height: 900 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        const chainView = page.locator('[data-flow-state-view="chain"]')
        await chainView
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await chainView.locator('[data-chain-node]').count(),
          11,
          '长业务链必须保留全部 11 个节点'
        )
        await chainView.locator('[data-chain-node="shipped"]').click()
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('node') ===
            'shipped'
        )
        await chainView
          .getByRole('button', { name: /查看.*出货事实.*定义/u })
          .click()
        const factView = page.locator('[data-flow-state-view="facts"]')
        await factView.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '未提供运行凭证查询')
        await expectText(page, '出货事实')
        await factView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-fact-definition-dark.png',
          animations: 'disabled',
        })

        await page.getByRole('button', { name: '返回业务链' }).click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('view') === 'chain' &&
            params.get('chain') === 'delivery_to_settlement' &&
            params.get('node') === 'shipped'
          )
        })
        assert.equal(
          await chainView
            .locator('[data-chain-node="shipped"]')
            .getAttribute('aria-current'),
          'step',
          '返回后必须恢复原业务链和节点'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-chain-drill-dark'
        )
        const metrics = await collectBoxMetrics(page)
        assert.equal(metrics.theme, 'dark')
        assert.deepEqual(metrics.nestedVerticalScrollers, [])
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '定义下钻与返回不得发出写请求')
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' })
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-chain-drill-dark.png',
          fullPage: true,
          animations: 'disabled',
        })
        reportScenarioEvidence('dev-flow-state-observatory-chain-drill-dark', {
          metrics,
          writeRequests,
        })
      },
    },
    {
      name: 'dev-flow-state-observatory-invalid-deep-link',
      path: INVALID_DEEP_LINK_PATH,
      viewport: { width: 1280, height: 800 },
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        await expectText(page, '无效或过期深链接')
        await expectText(page, '未知 query 参数：extra')
        await expectText(page, '未知或过期业务链：retired-chain')
        assert.equal(
          await page.locator('.erp-dev-flow-view-stack').count(),
          0,
          '无效深链接必须 fail closed，不得猜测渲染专项视图'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-invalid-state.png',
          fullPage: true,
          animations: 'disabled',
        })
        await page.getByRole('button', { name: '恢复到业务总图' }).click()
        await page.waitForFunction(
          () =>
            `${window.location.pathname}${window.location.search}` ===
            '/__dev/status-flows?view=chain&chain=all'
        )
        await page
          .locator('[data-business-chain-overview]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-invalid-deep-link'
        )
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '深链拒绝与恢复不得发出写请求')
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-invalid-deep-link-recovered.png',
          fullPage: true,
          animations: 'disabled',
        })
        reportScenarioEvidence('dev-flow-state-observatory-invalid-deep-link', {
          metrics: await collectBoxMetrics(page),
          writeRequests,
        })
      },
    },
    {
      name: 'dev-flow-state-observatory-task-lookup',
      path: TASK_LOOKUP_PATH,
      viewport: { width: 1440, height: 900 },
      auth: 'admin',
      effectiveSession: { actions: ['workflow.task.read'] },
      workflowTaskFixtures: TASK_LOOKUP_FIXTURES,
      workflowProcessContextFixtures: TASK_LOOKUP_FIXTURES.filter(
        (task) => task.process_instance_id && task.process_node_instance_id
      ).map(taskLookupProcessContext),
      beforeNavigate: async (page) => {
        startWorkflowAudit(page, workflowRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        await expectText(page, '跨视图查定义（不查具体任务）')
        await expectText(page, '可跨 5 个视图查业务链')
        const definitionSearch = page.getByPlaceholder(
          '例如：销售订单、销售 PMC、已提交、出货事实'
        )
        await definitionSearch.fill(DUPLICATE_TASK_NAME)
        await page.getByRole('button', { name: '去查真实任务' }).click()
        await page.waitForFunction((expected) => {
          const input = document.getElementById('dev-flow-task-search')
          return input?.value === expected && document.activeElement === input
        }, DUPLICATE_TASK_NAME)
        assert.equal(
          new URL(page.url()).searchParams.get('view'),
          'workflow',
          '定义搜索必须把具体任务文字带到 Workflow 真实任务查询'
        )
        assert.equal(
          await page.locator('.erp-dev-flow-definition-tools').count(),
          0,
          'Workflow Tab 不得重复展示业务链定义搜索'
        )
        const workflowGuidance = await expectCollapsedGuidance(page, 'workflow')
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-definition-to-task-handoff.png',
          fullPage: true,
          animations: 'disabled',
        })
        await expectText(page, '从后台「任务看板」复制完整任务名称')
        await expectText(page, '数字 task_id 仅用于开发排障')
        await expectText(page, '当前账号可见范围')
        await searchTask(page, UNIQUE_TASK_NAME)
        await expectTaskID(page, 1901)
        await expectText(page, UNIQUE_TASK_NAME)
        await expectText(page, 'SO-RISK-19')
        await expectText(page, '协同事件')
        await expectText(page, 'Workflow task done ≠ Fact posted')
        await page.locator('[data-flow-state-view="workflow"]').screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-workflow-task.png',
          animations: 'disabled',
        })

        await page.getByRole('tab', { name: /看运行路径/u }).click()
        const runtimeView = page.locator('[data-flow-state-view="runtime"]')
        await runtimeView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await page.locator('.erp-dev-flow-definition-tools').count(),
          0,
          'ProcessRuntime Tab 不得重复展示业务链定义搜索'
        )
        const runtimeGuidance = await expectCollapsedGuidance(page, 'runtime')
        await expectCollapsedGuidance(page, 'process-definition')
        await expectText(page, '具体运行实例')
        await expectText(page, '7019')
        await expectText(page, '尚未证明业务事实已落账')
        await runtimeView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-runtime-instance.png',
          animations: 'disabled',
        })

        await page.getByRole('tab', { name: /看业务链/u }).click()
        const chainView = page.locator('[data-flow-state-view="chain"]')
        await chainView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await page.locator('.erp-dev-flow-definition-tools').count(),
          1,
          '业务链 Tab 必须保留业务链定义搜索'
        )
        const currentRuntimeChains = chainView.locator(
          '[data-overview-chain][data-runtime-current="true"]'
        )
        await currentRuntimeChains.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        assert.equal(await currentRuntimeChains.count(), 1)
        assert.equal(
          await currentRuntimeChains.getAttribute('data-overview-chain'),
          'sales_to_production',
          '真实实例在总图中最多只能高亮所属的一条业务链'
        )
        assert.equal(
          await chainView.locator('[data-chain-node]').count(),
          0,
          '总图运行定位不得展开或推断单链内部节点完成情况'
        )
        await expectText(page, '只证明定位到所属链；尚未证明上下游完成')
        await chainView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-overview-runtime-highlight.png',
          animations: 'disabled',
        })

        await page.getByRole('tab', { name: /看运行路径/u }).click()
        await searchTask(page, DUPLICATE_TASK_NAME)
        await expectText(page, '找到 2 条同名或相关任务')
        await runtimeView
          .getByRole('button', {
            name: /SO-DELAY-18-B-LONG-SOURCE-NUMBER-FOR-WRAP/u,
          })
          .click()
        await expectTaskID(page, 2818)
        await expectText(page, 'SO-DELAY-18-B-LONG-SOURCE-NUMBER-FOR-WRAP')

        const taskInput = await searchTask(page, 'TRIAL-BOSS-19')
        await expectTaskID(page, 1901)
        assert.equal(await taskInput.inputValue(), UNIQUE_TASK_NAME)
        await searchTask(page, 'SO-RISK-19')
        await expectTaskID(page, 1901)
        assert.equal(await taskInput.inputValue(), UNIQUE_TASK_NAME)
        await expectText(page, 'SO-RISK-19')
        await searchTask(page, '不存在的任务名称')
        await expectText(page, '没有找到名称、任务编号或来源单号相符的可见任务')

        const beforeDisplayOnly = workflowRequestsByPage.get(page) || []
        const contextCallsBefore = beforeDisplayOnly.filter(
          (request) => request.method === 'get_task_process_context'
        ).length
        await searchTask(page, 'TRIAL-DISPLAY-18')
        await expectTaskID(page, 430)
        const unlinkedBoundary = page.locator(
          '[data-task-runtime-boundary="display-only"]'
        )
        await unlinkedBoundary.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '已找到任务，但它是模拟展示数据')
        await expectText(page, DISPLAY_ONLY_TASK_NAME)
        await expectText(page, '样例-老板-18')
        const afterDisplayOnly = workflowRequestsByPage.get(page) || []
        assert.equal(
          afterDisplayOnly.filter(
            (request) => request.method === 'get_task_process_context'
          ).length,
          contextCallsBefore,
          '任务已明确缺少两个 Runtime 锚点时不得请求 context RPC'
        )
        await unlinkedBoundary.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-display-only-unlinked.png',
          animations: 'disabled',
        })

        const rpcRequests = workflowRequestsByPage.get(page) || []
        const rpcMethods = rpcRequests.map((request) => request.method)
        assert(
          rpcMethods.includes('list_tasks') &&
            rpcMethods.includes('list_task_events') &&
            rpcMethods.includes('get_task_process_context'),
          `场景必须覆盖任务、事件和任务锚定运行实例三种真实读取：${JSON.stringify(
            rpcMethods
          )}`
        )
        assert.deepEqual(
          rpcMethods.filter(
            (method) => !READ_ONLY_WORKFLOW_METHODS.has(method)
          ),
          [],
          '任务查阅场景不得调用 Workflow 写方法'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-task-lookup'
        )
        reportScenarioEvidence('dev-flow-state-observatory-task-lookup', {
          metrics: await collectBoxMetrics(page),
          guidance: {
            workflow: workflowGuidance.metrics,
            runtime: runtimeGuidance.metrics,
          },
          rpcMethods,
        })
      },
    },
    {
      name: 'dev-flow-state-observatory-mobile-dark',
      path: DEFAULT_CHAIN_PATH,
      viewport: { width: 390, height: 844 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        await expectText(page, '业务链与运行观察台')
        const mobileHeader = page.locator('.erp-dev-flow-header')
        const mobileConceptDetails = mobileHeader.locator(
          ':scope > .erp-dev-flow-concepts'
        )
        assert.equal(await mobileConceptDetails.count(), 1)
        assert.equal(await mobileConceptDetails.getAttribute('open'), null)
        const mobileHeaderMetrics = await mobileHeader.evaluate((node) => {
          const summary = node.querySelector('.erp-dev-flow-concepts > summary')
          return {
            height: node.getBoundingClientRect().height,
            summaryHeight: summary?.getBoundingClientRect().height || 0,
            summaryClientWidth: summary?.clientWidth || 0,
            summaryScrollWidth: summary?.scrollWidth || 0,
            memoryVisible:
              node.querySelector('.erp-dev-flow-memory')?.checkVisibility() ||
              false,
          }
        })
        assert(mobileHeaderMetrics.summaryHeight >= 44)
        assert(
          mobileHeaderMetrics.summaryScrollWidth <=
            mobileHeaderMetrics.summaryClientWidth + 1
        )
        assert.equal(mobileHeaderMetrics.memoryVisible, false)
        const chainView = page.locator('[data-flow-state-view="chain"]')
        assert.equal(
          await chainView.locator('[data-overview-chain]').count(),
          12,
          '移动端总图必须保留全部 12 条链级入口'
        )
        assert.equal(await chainView.locator('[data-chain-node]').count(), 0)
        const metrics = await collectBoxMetrics(page)
        assert.equal(metrics.theme, 'dark')
        assert.equal(metrics.graphDisplay, 'none')
        assert.equal(metrics.tabCount, 5)
        assert.equal(metrics.selectedTabCount, 1)
        assert(metrics.navScrollWidth <= metrics.navClientWidth + 1)
        assert(metrics.documentScrollWidth <= metrics.viewportWidth + 1)
        assert(metrics.bodyScrollWidth <= metrics.viewportWidth + 1)
        assert.deepEqual(metrics.nestedVerticalScrollers, [])
        const touchTargetHeight = await page
          .getByRole('tab', { name: /看业务链/u })
          .evaluate((node) => node.getBoundingClientRect().height)
        assert(
          touchTargetHeight >= 44,
          `移动端主要页签触屏高度不得小于 44px：${touchTargetHeight}`
        )
        const overviewChainHeight = await chainView
          .locator('[data-overview-chain]')
          .first()
          .evaluate((node) => node.getBoundingClientRect().height)
        assert(
          overviewChainHeight >= 44,
          `移动端总图链入口高度不得小于 44px：${overviewChainHeight}`
        )
        await chainView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-overview-mobile-dark.png',
          animations: 'disabled',
        })

        const definitionSearch = page.getByPlaceholder(
          '例如：销售订单、销售 PMC、已提交、出货事实'
        )
        const mobileSearchGuideTrigger = page.getByRole('button', {
          name: '可以搜什么',
        })
        await mobileSearchGuideTrigger.evaluate((node) =>
          node.scrollIntoView({
            block: 'start',
            inline: 'nearest',
            behavior: 'instant',
          })
        )
        await page.evaluate(() => window.scrollBy(0, -16))
        await mobileSearchGuideTrigger.click()
        const mobileSearchGuide = page.locator('[data-definition-search-guide]')
        await mobileSearchGuide.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        const mobileSearchGuidePopover = page
          .locator('.ant-popover:visible')
          .filter({ has: mobileSearchGuide })
        await page.waitForFunction(
          () => {
            const guide = document.querySelector(
              '[data-definition-search-guide]'
            )
            const popover = guide?.closest('.ant-popover')
            return (
              popover && window.getComputedStyle(popover).transform === 'none'
            )
          },
          null,
          { timeout: 10_000 }
        )
        const mobileSearchGuideMetrics =
          await mobileSearchGuidePopover.evaluate((node) => {
            const rect = node.getBoundingClientRect()
            const content = node.querySelector('[data-definition-search-guide]')
            return {
              left: rect.left,
              right: rect.right,
              viewportWidth: window.innerWidth,
              clientWidth: content?.clientWidth || 0,
              scrollWidth: content?.scrollWidth || 0,
              buttonHeights: [
                ...(content?.querySelectorAll('button') || []),
              ].map((button) => button.getBoundingClientRect().height),
            }
          })
        assert(mobileSearchGuideMetrics.left >= 4)
        assert(
          mobileSearchGuideMetrics.right <=
            mobileSearchGuideMetrics.viewportWidth - 4
        )
        assert(
          mobileSearchGuideMetrics.scrollWidth <=
            mobileSearchGuideMetrics.clientWidth + 1
        )
        assert(
          mobileSearchGuideMetrics.buttonHeights.every((height) => height >= 36)
        )
        await mobileSearchGuide.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-search-guide-mobile-dark.png',
          animations: 'allow',
        })
        await page.keyboard.press('Escape')
        await mobileSearchGuide.waitFor({ state: 'hidden', timeout: 10_000 })
        assert.equal(
          await mobileSearchGuideTrigger.getAttribute('aria-expanded'),
          'false'
        )
        await definitionSearch.fill('采购订单 PO-20260806-001')
        const searchPanel = page.locator('.erp-dev-flow-search-results')
        await searchPanel.waitFor({ state: 'visible', timeout: 10_000 })
        const searchPanelMetrics = await searchPanel.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            viewportWidth: window.innerWidth,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            firstButtonHeight:
              node.querySelector('button')?.getBoundingClientRect().height || 0,
          }
        })
        assert(searchPanelMetrics.left >= 8)
        assert(searchPanelMetrics.right <= searchPanelMetrics.viewportWidth - 8)
        assert(
          searchPanelMetrics.scrollWidth <= searchPanelMetrics.clientWidth + 1
        )
        assert(searchPanelMetrics.firstButtonHeight >= 44)
        await searchPanel.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-definition-search-mobile-dark.png',
          animations: 'disabled',
        })
        await definitionSearch.press('Escape')
        await searchPanel.waitFor({ state: 'detached', timeout: 10_000 })
        assert.equal(await definitionSearch.inputValue(), '')

        await page.getByRole('tab', { name: /看已生效结果/u }).click()
        const factView = page.locator('[data-flow-state-view="facts"]')
        await factView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await page.locator('.erp-dev-flow-definition-tools').count(),
          0,
          'Fact / Ledger Tab 不得重复展示业务链定义搜索'
        )
        await page
          .getByRole('combobox', { name: '选择事实定义' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const factGuidance = await expectCollapsedGuidance(page, 'facts', 92)
        await expectText(page, '未提供运行凭证查询')
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-mobile-dark'
        )
        const factMetrics = await collectBoxMetrics(page)
        assert.deepEqual(factMetrics.nestedVerticalScrollers, [])
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '移动端定义浏览不得发出写请求')
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' })
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-mobile-dark.png',
          fullPage: true,
          animations: 'disabled',
        })
        reportScenarioEvidence('dev-flow-state-observatory-mobile-dark', {
          header: mobileHeaderMetrics,
          chain: metrics,
          definitionSearch: searchPanelMetrics,
          guidance: factGuidance.metrics,
          facts: factMetrics,
          writeRequests,
        })
      },
    },
  ]
}
