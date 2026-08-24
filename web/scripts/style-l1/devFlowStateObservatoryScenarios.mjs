const DEV_FLOW_STATE_OBSERVATORY_PATH = '/__dev/status-flows'
const DEFAULT_CHAIN_PATH = `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=chain&chain=all`
const DELIVERY_CHAIN_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=chain` +
  '&chain=delivery_to_settlement&node=shipment_draft'
const PRODUCTION_EXCEPTION_CHAIN_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=chain` +
  '&chain=production_exception&node=production_exception_decision'
const INVALID_DEEP_LINK_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=facts` +
  '&chain=retired-chain&fact=fact.retired&task_id=abc&extra=1'
const STALE_PRODUCTION_EXCEPTION_PROCESS_PATH =
  `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=chain&chain=all` +
  '&process=production_exception_approval%2Fexception_decision_approval'
const SALES_ORDER_STATE_RULES_PATH = `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=states&flow=source.sales_order`
const PRODUCTION_FACT_STATE_RULES_PATH = `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=states&flow=fact.production`
const PROCESS_RUNTIME_SELECTOR_PATH = `${DEV_FLOW_STATE_OBSERVATORY_PATH}?view=runtime&process=sales_order_acceptance%2Fapproval_pmc`
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
      current_responsibilities: [
        {
          node_instance_id: node.id,
          owner_role_key: task.owner_role_key,
        },
      ],
      completed_nodes: [],
    },
  }
}

async function waitForCatalog(page) {
  await page
    .locator('[data-dev-flow-state-observatory][data-catalog-status="ready"]')
    .waitFor({ state: 'visible', timeout: 10_000 })
}

async function waitForDefinitionSelectPopupSettled(page, expectedGroupCount) {
  await page.waitForFunction(
    ({ groupCount }) =>
      Array.from(
        document.querySelectorAll('.erp-dev-flow-definition-select-popup')
      ).some((node) => {
        const style = window.getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number.parseFloat(style.opacity || '1') >= 0.99 &&
          node.clientWidth > 0 &&
          rect.width >= node.clientWidth - 1 &&
          rect.height > 0 &&
          node.querySelectorAll('.ant-select-item-group').length === groupCount
        )
      }),
    { groupCount: expectedGroupCount },
    { timeout: 10_000 }
  )
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

async function collectCustomerReviewPrintMetrics(page) {
  return page.locator('[data-customer-review-print-root]').evaluate((root) => {
    const stepRects = [
      ...root.querySelectorAll(
        '.erp-dev-flow-customer-review__step-table tbody tr'
      ),
    ].map((step) => {
      const rect = step.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        clientWidth: step.clientWidth,
        scrollWidth: step.scrollWidth,
        clientHeight: step.clientHeight,
        scrollHeight: step.scrollHeight,
      }
    })
    const diagram = root.querySelector(
      '[data-customer-review-diagram] .erp-markdown-mermaid'
    )
    const diagramSVG = diagram?.querySelector(
      '.erp-markdown-mermaid__canvas > svg'
    )
    const diagramRect = diagramSVG?.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const toolbar = diagram?.querySelector('.erp-markdown-mermaid__toolbar')
    const diagramText = diagramSVG
      ? [...diagramSVG.querySelectorAll('text')]
          .map((node) => node.textContent || '')
          .join(' ')
      : ''
    return {
      mode: root.getAttribute('data-review-mode') || '',
      backgroundColor: window.getComputedStyle(root).backgroundColor,
      color: window.getComputedStyle(root).color,
      width: root.getBoundingClientRect().width,
      height: root.getBoundingClientRect().height,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      stepCount: stepRects.length,
      stepOverflowCount: stepRects.filter(
        (step) =>
          step.scrollWidth > step.clientWidth + 1 ||
          step.scrollHeight > step.clientHeight + 1
      ).length,
      stepOverlapCount: stepRects
        .slice(1)
        .filter((step, index) => step.top < stepRects[index].bottom - 1).length,
      overviewLaneCount: root.querySelectorAll(
        '.erp-dev-flow-customer-review__overview-index tbody tr'
      ).length,
      overviewChainCount: root.querySelectorAll(
        '.erp-dev-flow-customer-review__overview-index tbody td:nth-child(2) span'
      ).length,
      diagramStatus: diagram?.getAttribute('data-mermaid-status') || '',
      diagramTheme: diagram?.getAttribute('data-mermaid-theme') || '',
      diagramHtmlLabels:
        diagram?.getAttribute('data-mermaid-html-labels') || '',
      diagramSVGCount: diagramSVG ? 1 : 0,
      diagramForeignObjectCount:
        diagramSVG?.querySelectorAll('foreignObject').length || 0,
      diagramTextElementCount: diagramSVG?.querySelectorAll('text').length || 0,
      diagramText,
      diagramWidth: diagramRect?.width || 0,
      diagramHeight: diagramRect?.height || 0,
      diagramOverflow:
        Boolean(diagramRect) &&
        (diagramRect.left < rootRect.left - 1 ||
          diagramRect.right > rootRect.right + 1),
      diagramToolbarDisplay: toolbar
        ? window.getComputedStyle(toolbar).display
        : '',
      diagramSourceCount: diagram?.querySelectorAll(
        '.erp-markdown-mermaid__source'
      ).length,
    }
  })
}

async function triggerCustomerReviewPrint(page) {
  const beforeURL = page.url()
  const printRoot = page.locator('[data-customer-review-print-root]')
  const beforePrintRootCount = await printRoot.count()
  const beforeGeneratedAt = beforePrintRootCount
    ? await printRoot.getAttribute('data-review-generated-at')
    : null
  await page.evaluate(() => {
    window.__devBusinessChainPrintCalls = 0
    window.__devBusinessChainPrintDiagramStatus = ''
    window.__devBusinessChainPrintDiagramTheme = ''
    window.print = () => {
      window.__devBusinessChainPrintCalls += 1
      const diagram = document.querySelector(
        '[data-customer-review-print-root] [data-customer-review-diagram] .erp-markdown-mermaid'
      )
      window.__devBusinessChainPrintDiagramStatus =
        diagram?.getAttribute('data-mermaid-status') || ''
      window.__devBusinessChainPrintDiagramTheme =
        diagram?.getAttribute('data-mermaid-theme') || ''
    }
  })
  await page.getByRole('button', { name: '导出甲方校对版' }).click()
  await page.waitForFunction(() => window.__devBusinessChainPrintCalls === 1)
  const afterGeneratedAt = await printRoot.getAttribute(
    'data-review-generated-at'
  )
  const printState = await page.evaluate(() => ({
    mermaidStatusAtPrint: window.__devBusinessChainPrintDiagramStatus,
    mermaidThemeAtPrint: window.__devBusinessChainPrintDiagramTheme,
  }))
  return {
    beforeURL,
    beforePrintRootCount,
    beforeGeneratedAt,
    afterGeneratedAt,
    ...printState,
  }
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

async function collectStateRuleEdgeStyles(graph) {
  return graph.locator('.erp-markdown-mermaid__canvas svg').evaluate((svg) =>
    [...svg.querySelectorAll('path.flowchart-link')].map((path) => {
      const style = window.getComputedStyle(path)
      return {
        stroke: style.stroke,
        strokeDasharray: style.strokeDasharray,
        strokeWidth: style.strokeWidth,
      }
    })
  )
}

async function expectTaskID(page, taskId) {
  await page.waitForFunction(
    (expected) =>
      new URLSearchParams(window.location.search).get('task_id') === expected,
    String(taskId)
  )
}

async function expectTaskScopedOutsideGlobalContext(
  assert,
  page,
  taskId,
  view
) {
  await expectTaskID(page, taskId)
  const context = page.locator('.erp-dev-flow-context')
  await context.waitFor({ state: 'visible', timeout: 10_000 })
  const evidence = await context.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return {
      text: node.innerText,
      width: rect.width,
      height: rect.height,
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }
  })
  assert(
    !evidence.text.includes('真实任务上下文') &&
      !evidence.text.includes(`task_id ${taskId}`) &&
      !evidence.text.includes(`任务 ${taskId}`),
    `${view} Tab 的全局上下文不得重复展示任务 ${taskId}：${evidence.text}`
  )
  assert(
    evidence.scrollWidth <= evidence.clientWidth + 1,
    `${view} Tab 的全局上下文不得横向溢出`
  )
  return evidence
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
    const contextRect = context?.getBoundingClientRect()
    return {
      value: input?.value || '',
      active: document.activeElement === input,
      composing: section?.dataset.searchComposing || '',
      sectionHeight: section?.getBoundingClientRect().height || 0,
      contextTop: contextRect?.top || 0,
      contextDocumentTop: contextRect ? contextRect.top + window.scrollY : 0,
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
        'input[placeholder="例如：销售订单、销售 PMC、已提交"]'
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
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0,
          '业务链观察子页不应重复常驻双环境事实'
        )
        await expectText(page, '业务链与运行观察台')
        const root = page.locator('[data-dev-flow-state-observatory]')
        const header = root.locator('.erp-dev-flow-header')
        const conceptDetails = root.locator('.erp-dev-flow-concepts')
        const conceptSummary = conceptDetails.locator('summary')
        const definitionDetails = root.locator('.erp-dev-flow-definition-tools')
        const definitionSummary = definitionDetails.locator('summary')
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
          null,
          '全局定义搜索默认必须折叠，仍允许按需展开'
        )
        const definitionIndexPlacement = await root.evaluate((node) => {
          const workspaceNavNode = node.querySelector('.erp-dev-workspace-nav')
          const headerNode = node.querySelector('.erp-dev-flow-header')
          const customerScopeNode = node.querySelector(
            '.erp-dev-customer-scope'
          )
          const indexNode = node.querySelector('.erp-dev-flow-definition-tools')
          const navNode = node.querySelector('.erp-dev-flow-nav')
          const headerRect = headerNode?.getBoundingClientRect()
          const customerScopeRect = customerScopeNode?.getBoundingClientRect()
          const indexRect = indexNode?.getBoundingClientRect()
          const navRect = navNode?.getBoundingClientRect()
          return {
            workspaceNavNextIsHeader:
              workspaceNavNode?.nextElementSibling === headerNode,
            headerNextIsCustomerScope:
              headerNode?.nextElementSibling === customerScopeNode,
            customerScopeNextIsIndex:
              customerScopeNode?.nextElementSibling === indexNode,
            nextIsPrimaryNav: indexNode?.nextElementSibling === navNode,
            headerTop: headerRect?.top || 0,
            headerBottom: headerRect?.bottom || 0,
            customerScopeTop: customerScopeRect?.top || 0,
            customerScopeBottom: customerScopeRect?.bottom || 0,
            indexTop: indexRect?.top || 0,
            indexBottom: indexRect?.bottom || 0,
            indexHeight: indexRect?.height || 0,
            navTop: navRect?.top || 0,
          }
        })
        assert.equal(
          definitionIndexPlacement.workspaceNavNextIsHeader,
          true,
          '业务链页头必须直接紧跟 DEV 导航'
        )
        assert.equal(
          definitionIndexPlacement.headerNextIsCustomerScope,
          true,
          '甲方校对范围必须紧跟业务链页头'
        )
        assert.equal(
          definitionIndexPlacement.customerScopeNextIsIndex,
          true,
          '定义总索引必须紧跟甲方校对范围'
        )
        assert.equal(
          definitionIndexPlacement.nextIsPrimaryNav,
          true,
          '定义总索引必须位于五个主 Tab 之前'
        )
        assert(
          definitionIndexPlacement.headerBottom <=
            definitionIndexPlacement.customerScopeTop + 1
        )
        assert(
          definitionIndexPlacement.customerScopeBottom <=
            definitionIndexPlacement.indexTop + 1
        )
        assert(
          definitionIndexPlacement.indexBottom <=
            definitionIndexPlacement.navTop + 1
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-definition-index-collapsed-default.png',
          animations: 'disabled',
        })
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
        await expectText(page, '基础资料提供标准')
        await expectText(page, '客户、供应商、产品、材料和仓库')
        await expectText(page, '销售订单、采购订单、生产订单和加工合同')
        await expectText(page, '不代表库存、出货或财务结果已经发生')
        await expectText(page, '权限、客户配置与审计贯穿全部视图')
        await expectText(page, '本页定义总索引')
        await definitionSummary.focus()
        await definitionSummary.press('Enter')
        await page.waitForFunction(
          () => document.querySelector('.erp-dev-flow-definition-tools')?.open
        )
        const expandedDefinitionHeight = await definitionDetails.evaluate(
          (node) => node.getBoundingClientRect().height
        )
        assert(
          expandedDefinitionHeight > definitionIndexPlacement.indexHeight,
          '展开定义总索引后必须显示完整搜索内容'
        )
        await expectText(page, '跨视图查定义')
        await expectText(page, '覆盖 5 个视图')
        await expectText(page, '不属于当前 Tab')
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
        const overviewView = chainView.locator('[data-business-chain-overview]')
        const overviewGraph = overviewView.locator(
          '.erp-dev-flow-overview-graph'
        )
        assert.equal(
          await overviewView.locator('.erp-dev-flow-graph-disclosure').count(),
          0,
          '业务总图不应提供 Mermaid 展开或收起动作'
        )
        await overviewGraph
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await overviewView.locator('[data-overview-chain]').count(),
          11,
          '默认总图必须只展示 11 条正式设计链的链级节点'
        )
        assert.deepEqual(
          await overviewView
            .locator('[data-overview-lane]')
            .evaluateAll((nodes) =>
              nodes.map((node) => [node.dataset.overviewLane, node.open])
            ),
          [
            ['primary', true],
            ['supply', false],
            ['exception', false],
            ['correction', false],
          ],
          '总览默认只展开履约主链，其余分区按需展开'
        )
        const collapsedLaneMetrics = await overviewView
          .locator('[data-overview-lane]:not([open])')
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const summary = node.querySelector('summary')
              return {
                key: node.dataset.overviewLane,
                detailsHeight: node.getBoundingClientRect().height,
                summaryHeight: summary?.getBoundingClientRect().height || 0,
              }
            })
          )
        assert.equal(collapsedLaneMetrics.length, 3)
        for (const metric of collapsedLaneMetrics) {
          assert(
            metric.summaryHeight > 0 &&
              metric.detailsHeight >= metric.summaryHeight &&
              metric.detailsHeight <= metric.summaryHeight + 3,
            `折叠分区不得被同一 Grid 行的展开分区拉伸：${JSON.stringify(metric)}`
          )
        }
        assert.equal(
          await overviewView.locator('[data-overview-relation]').count(),
          13,
          '总图必须展示目录登记的 13 条明确链间衔接'
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
        const exceptionLane = overviewView.locator(
          '[data-overview-lane="exception"]'
        )
        await exceptionLane.locator('summary').click()
        assert.equal(
          await exceptionLane.evaluate((node) => node.open),
          true,
          '异常与返工分区必须可用键盘或指针展开'
        )
        await overviewView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-business-chain-exception-expanded.png',
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
        const chainGraph = chainView.locator('.erp-dev-flow-chain-graph')
        assert.equal(
          await chainView.locator('.erp-dev-flow-graph-disclosure').count(),
          0,
          '单链不应提供 Mermaid 展开或收起动作'
        )
        await expectText(page, '这一步做什么')
        await expectText(page, '谁来处理')
        await expectText(page, '怎样算完成')
        await expectText(page, '异常时怎么办')
        await chainGraph
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const mermaidToolbar = chainView.locator(
          '.erp-dev-flow-chain-graph .erp-markdown-mermaid__toolbar'
        )
        const zoomInButton = mermaidToolbar.locator(
          '[data-mermaid-zoom-action="zoom-in"]'
        )
        const fitHeightButton = mermaidToolbar.locator(
          '[data-mermaid-zoom-action="fit-height"]'
        )
        assert.equal(await fitHeightButton.getAttribute('title'), '适配高度')
        assert.equal(
          await fitHeightButton.getAttribute('aria-label'),
          '适配Mermaid 图表高度'
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
          mermaidToolbarInteraction.actions,
          ['fit', 'fit-height', 'zoom-out', 'zoom-in', 'reset', 'open'],
          `流程状态页 Mermaid 应明确区分适配宽度与适配高度：${JSON.stringify(
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
        await mermaidToolbar
          .locator('[data-mermaid-fullscreen-action="open"]')
          .click()
        await page.setViewportSize({ width: 900, height: 360 })
        for (let index = 0; index < 7; index += 1) {
          await mermaidToolbar
            .locator('[data-mermaid-zoom-action="zoom-in"]')
            .click()
        }
        const heightFitBefore = await mermaidToolbar.evaluate((toolbar) => {
          const shell = toolbar.closest('.erp-markdown-mermaid')
          const viewport = shell?.querySelector(
            '.erp-markdown-mermaid__viewport'
          )
          const canvas = shell?.querySelector('.erp-markdown-mermaid__canvas')
          const diagram = canvas?.querySelector('svg')
          const canvasStyle = canvas ? window.getComputedStyle(canvas) : null
          const availableHeight = Math.max(
            0,
            (viewport?.clientHeight || 0) -
              (Number.parseFloat(canvasStyle?.paddingTop || '0') || 0) -
              (Number.parseFloat(canvasStyle?.paddingBottom || '0') || 0)
          )
          return {
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            diagramHeight: diagram?.getBoundingClientRect().height || 0,
            availableHeight,
          }
        })
        assert.equal(heightFitBefore.zoom, '240')
        assert(
          heightFitBefore.diagramHeight > heightFitBefore.availableHeight + 2,
          `适配高度回归必须先构造真实纵向溢出：${JSON.stringify(
            heightFitBefore
          )}`
        )
        await fitHeightButton.click()
        await page.waitForFunction(
          () =>
            document
              .querySelector(
                '.erp-dev-flow-chain-graph .erp-markdown-mermaid__canvas'
              )
              ?.getAttribute('data-mermaid-zoom') !== '240'
        )
        const heightFitAfter = await mermaidToolbar.evaluate((toolbar) => {
          const shell = toolbar.closest('.erp-markdown-mermaid')
          const viewport = shell?.querySelector(
            '.erp-markdown-mermaid__viewport'
          )
          const canvas = shell?.querySelector('.erp-markdown-mermaid__canvas')
          const diagram = canvas?.querySelector('svg')
          const canvasStyle = canvas ? window.getComputedStyle(canvas) : null
          const availableHeight = Math.max(
            0,
            (viewport?.clientHeight || 0) -
              (Number.parseFloat(canvasStyle?.paddingTop || '0') || 0) -
              (Number.parseFloat(canvasStyle?.paddingBottom || '0') || 0)
          )
          return {
            zoom: Number(canvas?.getAttribute('data-mermaid-zoom') || 0),
            diagramHeight: diagram?.getBoundingClientRect().height || 0,
            availableHeight,
            viewportOverflowY: viewport
              ? viewport.scrollHeight - viewport.clientHeight
              : 0,
          }
        })
        assert(
          heightFitAfter.zoom >= 10 && heightFitAfter.zoom <= 100,
          `适配高度应得到 10%-100% 的可恢复缩放：${JSON.stringify(
            heightFitAfter
          )}`
        )
        assert(
          heightFitAfter.diagramHeight <= heightFitAfter.availableHeight + 2,
          `适配高度后图表应进入可见高度：${JSON.stringify(heightFitAfter)}`
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-mermaid-fit-height-tight-fullscreen.png',
          animations: 'disabled',
        })
        await page.setViewportSize({ width: 1440, height: 900 })
        await mermaidToolbar
          .locator('[data-mermaid-fullscreen-action="close"]')
          .click()
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
        {
          const params = new URL(page.url()).searchParams
          assert.equal(params.get('view'), 'states')
          assert.equal(params.get('flow'), 'source.sales_order')
          for (const key of ['chain', 'node', 'process', 'fact']) {
            assert.equal(
              params.has(key),
              false,
              `状态规则深链接不得保留 ${key}`
            )
          }
        }
        assert.equal(
          await root.locator('.erp-dev-flow-definition-tools').count(),
          1,
          '状态规则 Tab 必须继续共用页面级定义总索引'
        )
        const stateSelector = page.getByRole('combobox', {
          name: '选择状态对象',
        })
        await stateSelector.waitFor({ state: 'visible', timeout: 10_000 })
        await stateSelector
          .locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
          )
          .locator('.ant-select-selector')
          .click()
        const stateDropdown = page.locator(
          '.erp-dev-flow-definition-select-popup:visible'
        )
        await stateDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 10)
        const stateGroupLabels = await stateDropdown
          .locator('.ant-select-item-group')
          .allTextContents()
        assert.deepEqual(stateGroupLabels, [
          '源单生命周期 · 7',
          'MasterData 生命周期 · 2',
          'Workflow 协同任务 · 1',
          '业务进度投影 · 1',
          'ProcessRuntime · 2',
          'Fact / Ledger · 采购与质量 · 5',
          'Fact / Ledger · 生产与库存 · 6',
          'Fact / Ledger · 委外与返工 · 2',
          'Fact / Ledger · 出货与财务 · 6',
          '客户配置控制面 · 1',
        ])
        assert.equal(
          await stateDropdown.locator('.ant-select-item-option').count(),
          33,
          '状态对象必须按正式 scope 与 Fact 导航分类精确覆盖 33 条定义'
        )
        const stateOptionMetrics = await stateDropdown
          .locator('.ant-select-item-option')
          .first()
          .evaluate((node) => {
            const label = node.querySelector(
              '.erp-dev-flow-definition-option__label'
            )
            const key = node.querySelector(
              '.erp-dev-flow-definition-option__key'
            )
            const labelStyle = label ? window.getComputedStyle(label) : null
            const keyStyle = key ? window.getComputedStyle(key) : null
            return {
              groupCount: node
                .closest('.ant-select-dropdown')
                ?.querySelectorAll('.ant-select-item-group').length,
              optionCount: node
                .closest('.ant-select-dropdown')
                ?.querySelectorAll('.ant-select-item-option').length,
              labelColor: labelStyle?.color || '',
              keyColor: keyStyle?.color || '',
              labelWeight: Number(labelStyle?.fontWeight || 0),
              keyWeight: Number(keyStyle?.fontWeight || 0),
              labelFontSize: Number.parseFloat(labelStyle?.fontSize || '0'),
              keyFontSize: Number.parseFloat(keyStyle?.fontSize || '0'),
            }
          })
        assert.notEqual(
          stateOptionMetrics.labelColor,
          stateOptionMetrics.keyColor
        )
        assert(stateOptionMetrics.labelWeight > stateOptionMetrics.keyWeight)
        assert(
          stateOptionMetrics.labelFontSize > stateOptionMetrics.keyFontSize
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-state-definition-groups.png',
        })
        await stateSelector.press('Escape')
        await stateDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
        await expectCollapsedGuidance(page, 'states')
        await expectText(page, '规则视图不是运行实例或事实凭证')
        await page.getByRole('button', { name: '返回业务链' }).click()
        await chainView.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await root.locator('.erp-dev-flow-definition-tools').count(),
          1,
          '返回业务链后仍只能保留一个页面级定义总索引'
        )

        await chainView.locator('[data-chain-node="sales_acceptance"]').click()
        await chainView
          .getByRole('button', { name: /查看.*销售订单受理/u })
          .first()
          .click()
        const runtimeView = page.locator('[data-flow-state-view="runtime"]')
        await runtimeView.waitFor({ state: 'visible', timeout: 10_000 })
        {
          const params = new URL(page.url()).searchParams
          assert.equal(params.get('view'), 'runtime')
          assert(params.get('process'))
          for (const key of ['chain', 'node', 'flow', 'state', 'fact']) {
            assert.equal(
              params.has(key),
              false,
              `运行路径深链接不得保留 ${key}`
            )
          }
        }
        assert.equal(
          await root.locator('.erp-dev-flow-definition-tools').count(),
          1,
          '运行路径 Tab 必须继续共用页面级定义总索引'
        )
        const runtimeSelector = page.getByRole('combobox', {
          name: '选择流程定义',
        })
        await runtimeSelector.waitFor({ state: 'visible', timeout: 10_000 })
        const runtimeSelectRoot = runtimeSelector.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
        )
        const runtimeProcessKey = new URL(page.url()).searchParams.get(
          'process'
        )
        const runtimeLabel = String(
          await runtimeSelectRoot
            .locator('.ant-select-selection-item')
            .textContent()
        ).trim()
        await runtimeSelectRoot.locator('.ant-select-selector').click()
        const runtimeDropdown = page.locator('.ant-select-dropdown:visible')
        await runtimeDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 6)
        assert.deepEqual(
          await runtimeDropdown
            .locator('.ant-select-item-group')
            .allTextContents(),
          [
            '销售订单受理 · 2',
            '物料供应 · 1',
            '成品交付 · 1',
            '收付款审批 · 1',
            '人工库存调整 · 1',
            '生产异常决策 · 1',
          ]
        )
        assert.equal(
          await runtimeDropdown.locator('.ant-select-item-option').count(),
          7,
          '流程定义分组必须精确覆盖 7 条正式定义'
        )
        await runtimeSelector.press('Escape')
        await runtimeDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
        await runtimeSelectRoot.locator('.ant-select-selector').click()
        await runtimeDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 6)
        assert.equal(
          String(
            await runtimeSelectRoot
              .locator('.ant-select-selection-item')
              .textContent()
          ).trim(),
          runtimeLabel,
          '关闭并重新打开流程定义下拉后必须保留当前业务选项'
        )
        assert.equal(
          new URL(page.url()).searchParams.get('process'),
          runtimeProcessKey,
          '关闭并重新打开流程定义下拉不得改写运行路径深链接'
        )
        await runtimeSelector.press('Escape')
        await runtimeDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
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
        const chainDropdown = page.locator(
          '.erp-dev-flow-definition-select-popup:visible'
        )
        await chainDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 4)
        assert.deepEqual(
          await chainDropdown
            .locator('.ant-select-item-group')
            .allTextContents(),
          [
            '履约主链 · 3',
            '供给与库存支撑 · 3',
            '异常与返工 · 3',
            '冲正与纠正 · 2',
          ]
        )
        assert.equal(
          await chainDropdown.locator('.ant-select-item-option').count(),
          12,
          '业务总图固定在顶部，四个现有 lane 必须精确覆盖 11 条业务链'
        )
        const chainGroupMetrics = await chainDropdown.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            viewportWidth: window.innerWidth,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            groupCount: node.querySelectorAll('.ant-select-item-group').length,
            optionCount: node.querySelectorAll('.ant-select-item-option')
              .length,
          }
        })
        assert(chainGroupMetrics.left >= 0)
        assert(chainGroupMetrics.right <= chainGroupMetrics.viewportWidth + 1)
        assert(
          chainGroupMetrics.scrollWidth <= chainGroupMetrics.clientWidth + 1
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-business-chain-groups.png',
        })
        await chainSelector.fill('生产 入库')
        const filteredChainOptions = chainDropdown.locator(
          '.ant-select-item-option'
        )
        await filteredChainOptions
          .filter({ hasText: '生产执行到成品入库' })
          .waitFor({ state: 'visible', timeout: 10_000 })
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
        const search = page.getByPlaceholder('例如：销售订单、销售 PMC、已提交')
        const searchGuideTrigger = page.getByRole('button', {
          name: '可以搜什么',
        })
        await searchGuideTrigger.click()
        const searchGuide = page.locator('[data-definition-search-guide]')
        await searchGuide.waitFor({ state: 'visible', timeout: 10_000 })
        const searchGuidePopover = page
          .locator('.ant-popover:visible')
          .filter({ has: searchGuide })
        await searchGuidePopover.waitFor({ state: 'visible', timeout: 10_000 })
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
        await page.waitForFunction(
          () => {
            const guide = document.querySelector(
              '[data-definition-search-guide]'
            )
            const popover = guide?.closest('.ant-popover')
            const popoverStyle = popover
              ? window.getComputedStyle(popover)
              : null
            const buttons = [...(guide?.querySelectorAll('button') || [])]
            return (
              popoverStyle?.transform === 'none' &&
              popoverStyle.opacity === '1' &&
              buttons.length > 0 &&
              buttons.every(
                (button) => button.getBoundingClientRect().height >= 36
              )
            )
          },
          undefined,
          { timeout: 10_000 }
        )
        const searchGuideMetrics = await searchGuidePopover.evaluate((node) => {
          const content = node.querySelector('[data-definition-search-guide]')
          return {
            clientWidth: content?.clientWidth || 0,
            scrollWidth: content?.scrollWidth || 0,
            buttonHeights: [
              ...(content?.querySelectorAll('button') || []),
            ].map((button) => button.getBoundingClientRect().height),
          }
        })
        assert(
          searchGuideMetrics.scrollWidth <= searchGuideMetrics.clientWidth + 1,
          `搜索范围说明不得横向溢出：${JSON.stringify(searchGuideMetrics)}`
        )
        assert(
          searchGuideMetrics.buttonHeights.every((height) => height >= 36),
          `搜索示例按钮必须具备稳定触屏高度：${JSON.stringify(searchGuideMetrics)}`
        )
        await searchGuidePopover.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-search-guide.png',
          animations: 'disabled',
        })
        await searchGuidePopover
          .getByRole('button', { name: '销售 PMC', exact: true })
          .click()
        await page.waitForFunction(
          () =>
            document.querySelector(
              'input[placeholder="例如：销售订单、销售 PMC、已提交"]'
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
          imeEvidence.secondComposition.contextDocumentTop,
          imeEvidence.baseline.contextDocumentTop,
          '拼音组合期间不得推动下方观察上下文'
        )
        assert.equal(
          imeEvidence.committed.sectionHeight,
          imeEvidence.baseline.sectionHeight,
          '提交中文后结果浮层也不得撑高搜索区'
        )
        assert.equal(
          imeEvidence.committed.contextDocumentTop,
          imeEvidence.baseline.contextDocumentTop,
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
              document.querySelectorAll('[data-overview-chain]').length ===
                11 &&
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
          definitionIndex: definitionIndexPlacement,
          definitionSelects: {
            chain: chainGroupMetrics,
            state: stateOptionMetrics,
            runtime: { groupCount: 0, optionCount: 7 },
          },
          overviewLanes: { collapsed: collapsedLaneMetrics },
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
        const chainGraph = chainView.locator('.erp-dev-flow-chain-graph')
        assert.equal(
          await chainView.locator('.erp-dev-flow-graph-disclosure').count(),
          0,
          '单链不应提供 Mermaid 展开或收起动作'
        )
        for (const copy of [
          '按步骤看业务链',
          '这一步做什么',
          '谁来处理',
          '怎样算完成',
          '异常时怎么办',
          '查看开发者信息',
        ]) {
          await expectText(page, copy)
        }
        const defaultStableKeyVisible = await chainView
          .locator('.erp-dev-flow-node-technical .erp-dev-flow-key-copy')
          .evaluate((node) => node.checkVisibility())
        assert.equal(
          defaultStableKeyVisible,
          false,
          '稳定 key 必须留在默认折叠的开发者信息中'
        )
        await chainGraph
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
        await chainView.getByRole('button', { name: /查看.*出货事实/u }).click()
        const factView = page.locator('[data-flow-state-view="facts"]')
        await factView.waitFor({ state: 'visible', timeout: 10_000 })
        {
          const params = new URL(page.url()).searchParams
          assert.equal(params.get('view'), 'facts')
          assert.equal(params.get('fact'), 'fact.shipment')
          for (const key of ['chain', 'node', 'flow', 'state', 'process']) {
            assert.equal(
              params.has(key),
              false,
              `事实定义深链接不得保留 ${key}`
            )
          }
        }
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
      name: 'dev-flow-state-observatory-state-rules-dark',
      path: SALES_ORDER_STATE_RULES_PATH,
      viewport: { width: 1440, height: 900 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        const stateView = page.locator('[data-flow-state-view="states"]')
        const graph = stateView.locator('.erp-dev-flow-state-graph')
        const transitions = stateView.locator(
          '.erp-dev-flow-transitions > ol > li'
        )
        await graph
          .locator('.erp-markdown-mermaid__canvas svg')
          .waitFor({ state: 'visible', timeout: 10_000 })

        const overviewText = await stateView
          .locator('.erp-dev-flow-state-overview')
          .innerText()
        for (const copy of [
          '5\n个状态',
          '6\n条合法转换',
          '3\n条异常或纠正路径',
          '2\n有明确终态',
        ]) {
          assert(overviewText.includes(copy), `销售订单状态概览缺少：${copy}`)
        }
        assert.equal(
          await stateView
            .locator('.erp-dev-flow-state-overview article')
            .count(),
          4
        )
        assert.equal(
          await stateView
            .locator(
              '.erp-dev-flow-state-path-legend [data-path-group="normal"]'
            )
            .count(),
          1
        )
        assert.equal(
          await stateView
            .locator('.erp-dev-flow-state-path-legend [data-path-group="stop"]')
            .count(),
          1
        )
        const diagramEdgeStyles = await collectStateRuleEdgeStyles(graph)
        assert(
          diagramEdgeStyles.some(
            (item) =>
              item.stroke === 'rgb(43, 138, 62)' &&
              Number.parseFloat(item.strokeWidth) >= 2.25
          ),
          `销售订单图缺少绿色正常推进线：${JSON.stringify(diagramEdgeStyles)}`
        )
        assert(
          diagramEdgeStyles.some(
            (item) =>
              item.stroke === 'rgb(207, 19, 34)' &&
              Number.parseFloat(item.strokeWidth) >= 2.75
          ),
          `销售订单图缺少红色终止线：${JSON.stringify(diagramEdgeStyles)}`
        )
        assert.equal(await transitions.count(), 6)
        assert.equal(
          await stateView
            .locator(
              '.erp-dev-flow-transitions > ol > li[data-exceptional="true"]'
            )
            .count(),
          3
        )
        assert.deepEqual(
          await transitions.evaluateAll((nodes) =>
            nodes.map(
              (node) =>
                node.querySelectorAll(
                  '.erp-dev-flow-transition-explanation > div'
                ).length
            )
          ),
          [4, 4, 4, 4, 4, 4]
        )

        await stateView
          .getByRole('button', { name: /已提交，中间状态/u })
          .click()
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('state') ===
              'submitted' &&
            document.querySelectorAll(
              '[data-flow-state-view="states"] .erp-dev-flow-transitions > ol > li'
            ).length === 3
        )
        assert.equal(
          await stateView
            .getByRole('button', { name: '当前状态 3' })
            .getAttribute('aria-pressed'),
          'true'
        )
        const selectedStateText = await stateView
          .locator('.erp-dev-flow-selected-state')
          .innerText()
        for (const copy of [
          '1 条登记路径',
          '2 条登记路径',
          '其中 1 条属于异常或纠正',
        ]) {
          assert(
            selectedStateText.includes(copy),
            `已提交状态说明缺少：${copy}`
          )
        }

        await stateView.getByRole('button', { name: '异常与纠正 3' }).click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-flow-state-view="states"] .erp-dev-flow-transitions > ol > li'
            ).length === 3
        )
        assert.equal(
          await stateView
            .locator(
              '.erp-dev-flow-transitions > ol > li[data-exceptional="true"]'
            )
            .count(),
          3
        )
        await stateView.getByRole('button', { name: '全部 6' }).click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-flow-state-view="states"] .erp-dev-flow-transitions > ol > li'
            ).length === 6
        )

        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-state-rules-dark'
        )
        const metrics = await stateView.evaluate((node) => {
          const overview = node.querySelector('.erp-dev-flow-state-overview')
          const graphNode = node.querySelector('.erp-dev-flow-state-graph')
          const filterButtons = [
            ...node.querySelectorAll('.erp-dev-flow-transition-filters button'),
          ]
          const explanation = node.querySelector(
            '.erp-dev-flow-transition-explanation'
          )
          return {
            overviewColumns: window
              .getComputedStyle(overview)
              .gridTemplateColumns.trim()
              .split(/\s+/u).length,
            graphDisplay: window.getComputedStyle(graphNode).display,
            graphVisible: graphNode.checkVisibility(),
            filterButtonMinHeight: Math.min(
              ...filterButtons.map(
                (button) => button.getBoundingClientRect().height
              )
            ),
            explanationColumns: window
              .getComputedStyle(explanation)
              .gridTemplateColumns.trim()
              .split(/\s+/u).length,
          }
        })
        assert.equal(metrics.overviewColumns, 4)
        assert.notEqual(metrics.graphDisplay, 'none')
        assert.equal(metrics.graphVisible, true)
        assert(metrics.filterButtonMinHeight >= 32)
        assert.equal(metrics.explanationColumns, 2)
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '状态规则查阅不得发出写请求')
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' })
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-state-rules-dark-detail.png',
          fullPage: true,
          animations: 'disabled',
        })

        await stateView.getByRole('button', { name: '查看相关业务链' }).click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('view') === 'chain' &&
            params.get('chain') === 'sales_to_production' &&
            params.get('node') === 'sales_order'
          )
        })
        {
          const params = new URL(page.url()).searchParams
          for (const key of ['flow', 'state', 'process', 'fact']) {
            assert.equal(
              params.has(key),
              false,
              `状态规则跨视图跳转不得保留 ${key}`
            )
          }
        }
        assert.deepEqual(writeRequests, [], '跨视图查阅不得发出写请求')
        reportScenarioEvidence('dev-flow-state-observatory-state-rules-dark', {
          metrics,
          diagramEdgeStyles,
          writeRequests,
        })
      },
    },
    {
      name: 'dev-flow-state-observatory-state-rules-mobile-dark',
      path: PRODUCTION_FACT_STATE_RULES_PATH,
      viewport: { width: 390, height: 844 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        const stateView = page.locator('[data-flow-state-view="states"]')
        const graph = stateView.locator('.erp-dev-flow-state-graph')
        const transitions = stateView.locator(
          '.erp-dev-flow-transitions > ol > li'
        )
        assert.equal(await graph.isVisible(), false)
        assert.equal(await transitions.count(), 2)
        await stateView.getByRole('button', { name: '异常与纠正 2' }).click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-flow-state-view="states"] .erp-dev-flow-transitions > ol > li[data-exceptional="true"]'
            ).length === 2
        )
        await expectText(page, '返工与再处理')
        await expectText(page, '纠正与退回')
        await expectText(
          page,
          '仅当本次生产事实登记为“返工”时；其他类型仍按正常过账路径理解。'
        )

        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-state-rules-mobile-dark'
        )
        const metrics = await stateView.evaluate((node) => {
          const columns = (selector) =>
            window
              .getComputedStyle(node.querySelector(selector))
              .gridTemplateColumns.trim()
              .split(/\s+/u).length
          const graphNode = node.querySelector('.erp-dev-flow-state-graph')
          const stateList = node.querySelector('.erp-dev-flow-state-list ul')
          return {
            overviewColumns: columns('.erp-dev-flow-state-overview'),
            explanationColumns: columns('.erp-dev-flow-transition-explanation'),
            relatedActionColumns: columns(
              '.erp-dev-flow-state-related-actions'
            ),
            graphDisplay: window.getComputedStyle(graphNode).display,
            stateListClientHeight: stateList.clientHeight,
            stateListScrollHeight: stateList.scrollHeight,
            stateListOverflowY: window.getComputedStyle(stateList).overflowY,
          }
        })
        assert.equal(metrics.overviewColumns, 2)
        assert.equal(metrics.explanationColumns, 1)
        assert.equal(metrics.relatedActionColumns, 1)
        assert.equal(metrics.graphDisplay, 'none')
        assert.equal(metrics.stateListOverflowY, 'visible')
        assert(
          metrics.stateListScrollHeight <= metrics.stateListClientHeight + 1,
          '移动端状态清单不得形成嵌套滚动'
        )
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '移动端状态规则查阅不得发出写请求')
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' })
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-state-rules-mobile-dark.png',
          fullPage: true,
          animations: 'disabled',
        })
        reportScenarioEvidence(
          'dev-flow-state-observatory-state-rules-mobile-dark',
          { metrics, writeRequests }
        )
      },
    },
    {
      name: 'dev-flow-state-observatory-customer-review-chain-print',
      path: PRODUCTION_EXCEPTION_CHAIN_PATH,
      viewport: { width: 1440, height: 900 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        const chainView = page.locator('[data-flow-state-view="chain"]')
        assert.equal(
          await chainView.locator('[data-chain-node]').count(),
          9,
          '生产异常链必须展示拒绝、超领和报废或让步执行分支'
        )
        const printRequest = await triggerCustomerReviewPrint(page)
        assert.equal(page.url(), printRequest.beforeURL)
        assert.equal(
          printRequest.beforePrintRootCount,
          0,
          '打印专用 DOM 与 Mermaid 必须在用户点击导出后才创建'
        )
        assert(printRequest.afterGeneratedAt)
        assert.equal(printRequest.mermaidStatusAtPrint, 'rendered')
        assert.equal(printRequest.mermaidThemeAtPrint, 'light')

        await page.emulateMedia({ media: 'print' })
        const printRoot = page.locator('[data-customer-review-print-root]')
        await printRoot.waitFor({ state: 'visible', timeout: 10_000 })
        const printText = await printRoot.innerText()
        for (const copy of [
          '业务链甲方校对版｜生产异常决策与执行',
          '客户配置预览校对稿',
          '永绅 yoyoosun 客户配置包（仅配置预览）',
          '未绑定发布版本',
          '第 9 步',
          '先看图：业务怎么走',
          '再看表：每一步谁办、怎么办',
          '拒绝或取消后结束',
          '超领批准额度',
          '报废或在制让步执行任务',
          '人员与系统怎么配合',
          '整条业务链的异常与纠正路径',
          '流程或任务完成不等于库存、出货、生产或财务事实已经生效',
          '本文件用于业务需求校对，不单独证明已经实现、发布或经甲方验收',
        ]) {
          assert(printText.includes(copy), `甲方单链打印稿缺少：${copy}`)
        }
        for (const forbidden of [
          'ProcessRuntime',
          'Fact / Ledger',
          'Source Document',
          'RBAC',
          'task_id',
          'server/',
          'fact.production_exception',
        ]) {
          assert(
            !printText.includes(forbidden),
            `甲方单链打印稿不得出现开发信息：${forbidden}`
          )
        }
        assert(
          !printText.includes('本步骤适用的异常路径'),
          '甲方单链打印稿不得逐步骤重复异常说明'
        )
        const metrics = await collectCustomerReviewPrintMetrics(page)
        assert.equal(metrics.mode, 'chain')
        assert.equal(metrics.backgroundColor, 'rgb(255, 255, 255)')
        assert.equal(metrics.stepCount, 9)
        assert.equal(metrics.stepOverflowCount, 0)
        assert.equal(metrics.stepOverlapCount, 0)
        assert.equal(metrics.diagramStatus, 'rendered')
        assert.equal(metrics.diagramTheme, 'light')
        assert.equal(metrics.diagramHtmlLabels, 'false')
        assert.equal(metrics.diagramSVGCount, 1)
        assert.equal(metrics.diagramForeignObjectCount, 0)
        assert(metrics.diagramTextElementCount > 0)
        assert(metrics.diagramText.includes('生产异常决策单'))
        assert(metrics.diagramText.includes('提交后启动审批'))
        assert(metrics.diagramWidth > 0)
        assert(metrics.diagramHeight > 0)
        assert.equal(metrics.diagramOverflow, false)
        assert.equal(metrics.diagramToolbarDisplay, 'none')
        assert.equal(metrics.diagramSourceCount, 0)
        assert(metrics.scrollWidth <= metrics.clientWidth + 1)
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-customer-review-chain-print.png',
          fullPage: true,
          animations: 'disabled',
        })
        await page.pdf({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-customer-review-chain.pdf',
          format: 'A4',
          preferCSSPageSize: true,
          printBackground: true,
        })
        await page.emulateMedia({ media: 'screen' })
        assert.equal(await printRoot.isVisible(), false)
        assert.equal(page.url(), printRequest.beforeURL)
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '甲方单链导出不得发出写请求')
        reportScenarioEvidence(
          'dev-flow-state-observatory-customer-review-chain-print',
          { metrics, printRequest, writeRequests }
        )
      },
    },
    {
      name: 'dev-flow-state-observatory-customer-review-overview-print',
      path: DEFAULT_CHAIN_PATH,
      viewport: { width: 1440, height: 900 },
      themeMode: 'dark',
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        assert.equal(
          await page.locator('[data-business-chain-overview]').count(),
          1
        )
        const printRequest = await triggerCustomerReviewPrint(page)
        assert.equal(page.url(), printRequest.beforeURL)
        assert.equal(
          printRequest.beforePrintRootCount,
          0,
          '总览打印专用 DOM 与 Mermaid 必须在用户点击导出后才创建'
        )
        assert.equal(printRequest.mermaidStatusAtPrint, 'rendered')
        assert.equal(printRequest.mermaidThemeAtPrint, 'light')

        await page.emulateMedia({ media: 'print' })
        const printRoot = page.locator('[data-customer-review-print-root]')
        await printRoot.waitFor({ state: 'visible', timeout: 10_000 })
        const printText = await printRoot.innerText()
        assert(printText.includes('业务链甲方校对版｜业务链总览'))
        assert(printText.includes('先看图：全部业务链怎样衔接'))
        assert(printText.includes('不展开每条链的内部步骤'))
        assert.equal(
          await printRoot
            .locator('.erp-dev-flow-customer-review__step-table')
            .count(),
          0,
          '总览打印不得展开单链内部步骤'
        )
        const metrics = await collectCustomerReviewPrintMetrics(page)
        assert.equal(metrics.mode, 'overview')
        assert.equal(metrics.backgroundColor, 'rgb(255, 255, 255)')
        assert.equal(metrics.overviewLaneCount, 4)
        assert.equal(metrics.overviewChainCount, 11)
        assert.equal(metrics.stepCount, 0)
        assert.equal(metrics.diagramStatus, 'rendered')
        assert.equal(metrics.diagramTheme, 'light')
        assert.equal(metrics.diagramHtmlLabels, 'false')
        assert.equal(metrics.diagramSVGCount, 1)
        assert.equal(metrics.diagramForeignObjectCount, 0)
        assert(metrics.diagramTextElementCount > 0)
        assert(metrics.diagramText.includes('销售受理到生产准备'))
        assert(metrics.diagramText.includes('生产准备进入执行'))
        assert(metrics.diagramWidth > 0)
        assert(metrics.diagramHeight > 0)
        assert.equal(metrics.diagramOverflow, false)
        assert.equal(metrics.diagramToolbarDisplay, 'none')
        assert.equal(metrics.diagramSourceCount, 0)
        assert(metrics.scrollWidth <= metrics.clientWidth + 1)
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-customer-review-overview-print.png',
          fullPage: true,
          animations: 'disabled',
        })
        await page.pdf({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-customer-review-overview.pdf',
          format: 'A4',
          preferCSSPageSize: true,
          printBackground: true,
        })
        await page.emulateMedia({ media: 'screen' })
        assert.equal(await printRoot.isVisible(), false)
        assert.equal(page.url(), printRequest.beforeURL)
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(writeRequests, [], '甲方总览导出不得发出写请求')
        reportScenarioEvidence(
          'dev-flow-state-observatory-customer-review-overview-print',
          { metrics, printRequest, writeRequests }
        )
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
        await expectText(page, '未知 Fact Key：fact.retired')
        await expectText(page, 'task_id 必须是大于 0 的整数')
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
            '/__dev/status-flows?view=chain&chain=all&customer=yoyoosun'
        )
        await page
          .locator('[data-business-chain-overview]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.goto(
          new URL(STALE_PRODUCTION_EXCEPTION_PROCESS_PATH, page.url()).href
        )
        await waitForCatalog(page)
        await page.waitForFunction(
          () =>
            `${window.location.pathname}${window.location.search}` ===
            '/__dev/status-flows?view=chain&chain=all&customer=yoyoosun'
        )
        await page
          .locator('[data-business-chain-overview]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await page.getByText('无效或过期深链接', { exact: false }).count(),
          0,
          '旧 process 选择不得让业务总图进入错误态'
        )
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
        const definitionDetails = page.locator('.erp-dev-flow-definition-tools')
        await expectText(page, '本页定义总索引')
        assert.equal(
          await definitionDetails.getAttribute('open'),
          null,
          '真实任务跳转场景进入页面时定义总索引必须默认折叠'
        )
        await definitionDetails.locator('summary').click()
        await page.waitForFunction(
          () => document.querySelector('.erp-dev-flow-definition-tools')?.open
        )
        await expectText(page, '跨视图查定义')
        await expectText(page, '覆盖 5 个视图')
        const definitionSearch =
          page.getByPlaceholder('例如：销售订单、销售 PMC、已提交')
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
          1,
          'Workflow Tab 必须继续共用页面级定义总索引'
        )
        assert.equal(
          await definitionSearch.inputValue(),
          '',
          '把关键词交给真实任务查询后必须清空页面级定义搜索'
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
        const taskContextEvidence = {
          workflow: await expectTaskScopedOutsideGlobalContext(
            assert,
            page,
            1901,
            'Workflow'
          ),
        }
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
          1,
          'ProcessRuntime Tab 必须继续共用页面级定义总索引'
        )
        const runtimeGuidance = await expectCollapsedGuidance(page, 'runtime')
        await expectCollapsedGuidance(page, 'process-definition')
        await expectText(page, '具体运行实例')
        await expectText(page, '7019')
        await expectText(page, '尚未证明业务事实已落账')
        const runtimeResponsibility = runtimeView.getByLabel(
          '流程责任来源核对'
        )
        await runtimeResponsibility.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await expectText(runtimeResponsibility, '版本化静态定义')
        await expectText(runtimeResponsibility, 'v1')
        await expectText(runtimeResponsibility, '当前节点定义责任池')
        await expectText(runtimeResponsibility, '订单审批：老板')
        await expectText(runtimeResponsibility, '运行实例当前责任')
        await expectText(runtimeResponsibility, '当前任务岗位')
        await expectText(
          runtimeResponsibility,
          '静态责任池、运行实例当前责任与当前任务岗位一致。'
        )
        assert.equal(
          await runtimeResponsibility
            .locator('dt')
            .filter({ hasText: /处理人/u })
            .count(),
          0,
          '责任来源核对不应补造具体处理人字段'
        )
        taskContextEvidence.runtime =
          await expectTaskScopedOutsideGlobalContext(
            assert,
            page,
            1901,
            'ProcessRuntime'
          )
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
          '业务链 Tab 仍只能保留一个页面级定义总索引'
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
        taskContextEvidence.chain = await expectTaskScopedOutsideGlobalContext(
          assert,
          page,
          1901,
          '业务链'
        )
        await chainView.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-overview-runtime-highlight.png',
          animations: 'disabled',
        })

        await page.getByRole('tab', { name: /看已生效结果/u }).click()
        const factsView = page.locator('[data-flow-state-view="facts"]')
        await factsView.waitFor({ state: 'visible', timeout: 10_000 })
        taskContextEvidence.facts = await expectTaskScopedOutsideGlobalContext(
          assert,
          page,
          1901,
          'Fact / Ledger'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-facts-with-preserved-task.png',
          fullPage: true,
          animations: 'disabled',
        })

        await page.getByRole('tab', { name: /查状态规则/u }).click()
        const statesView = page.locator('[data-flow-state-view="states"]')
        await statesView.waitFor({ state: 'visible', timeout: 10_000 })
        taskContextEvidence.states = await expectTaskScopedOutsideGlobalContext(
          assert,
          page,
          1901,
          '状态规则'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-states-with-preserved-task.png',
          fullPage: true,
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
        await page.waitForFunction(
          (expected) =>
            document.getElementById('dev-flow-task-search')?.value === expected,
          UNIQUE_TASK_NAME,
          { timeout: 10_000 }
        )
        assert.equal(await taskInput.inputValue(), UNIQUE_TASK_NAME)
        await searchTask(page, 'SO-RISK-19')
        await expectTaskID(page, 1901)
        await page.waitForFunction(
          (expected) =>
            document.getElementById('dev-flow-task-search')?.value === expected,
          UNIQUE_TASK_NAME,
          { timeout: 10_000 }
        )
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
          taskContextEvidence,
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
        const mobileDefinitionDetails = page.locator(
          '.erp-dev-flow-definition-tools'
        )
        assert.equal(await mobileConceptDetails.count(), 1)
        assert.equal(await mobileConceptDetails.getAttribute('open'), null)
        assert.equal(await mobileDefinitionDetails.getAttribute('open'), null)
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
          11,
          '移动端总图必须保留全部 11 条链级入口'
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
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-definition-index-mobile-dark-collapsed.png',
          animations: 'disabled',
        })
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

        await mobileDefinitionDetails.locator('summary').click()
        await page.waitForFunction(
          () => document.querySelector('.erp-dev-flow-definition-tools')?.open
        )
        const definitionSearch =
          page.getByPlaceholder('例如：销售订单、销售 PMC、已提交')
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
            if (!popover) return false
            const popoverStyle = window.getComputedStyle(popover)
            return (
              popoverStyle.transform === 'none' && popoverStyle.opacity === '1'
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
        await page.screenshot({
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
          1,
          'Fact / Ledger Tab 必须继续共用页面级定义总索引'
        )
        const factSelector = page.getByRole('combobox', {
          name: '选择事实定义',
        })
        await factSelector.waitFor({ state: 'visible', timeout: 10_000 })
        await factSelector
          .locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
          )
          .locator('.ant-select-selector')
          .click()
        const factDropdown = page.locator(
          '.erp-dev-flow-definition-select-popup:visible'
        )
        await factDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 4)
        assert.deepEqual(
          await factDropdown
            .locator('.ant-select-item-group')
            .allTextContents(),
          [
            '采购与质量 · 5',
            '生产与库存 · 6',
            '委外与返工 · 2',
            '出货与财务 · 6',
          ]
        )
        assert.equal(
          await factDropdown.locator('.ant-select-item-option').count(),
          19,
          'Fact 下拉必须按四个导航分组精确覆盖全部定义'
        )
        assert.equal(
          await factDropdown
            .locator('.erp-dev-flow-definition-option__key')
            .count(),
          19,
          '开发观察台必须保留全部机器键，但降低其视觉权重'
        )
        const factSelectMetrics = await factDropdown.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          const firstOption = node.querySelector('.ant-select-item-option')
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            viewportWidth: window.innerWidth,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            firstOptionHeight: firstOption?.getBoundingClientRect().height || 0,
          }
        })
        assert(factSelectMetrics.left >= 0)
        assert(factSelectMetrics.right <= factSelectMetrics.viewportWidth + 1)
        assert(
          factSelectMetrics.scrollWidth <= factSelectMetrics.clientWidth + 1
        )
        assert(factSelectMetrics.firstOptionHeight >= 44)
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-fact-groups-mobile-dark.png',
        })
        await factSelector.press('Escape')
        await factDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
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
          factSelect: factSelectMetrics,
          guidance: factGuidance.metrics,
          facts: factMetrics,
          writeRequests,
        })
      },
    },
    {
      name: 'dev-flow-state-observatory-runtime-selector-readonly',
      path: PROCESS_RUNTIME_SELECTOR_PATH,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await waitForCatalog(page)
        const runtimeView = page.locator('[data-flow-state-view="runtime"]')
        await runtimeView.waitFor({ state: 'visible', timeout: 10_000 })
        const initialParams = new URL(page.url()).searchParams
        assert.equal(initialParams.get('view'), 'runtime')
        assert.equal(
          initialParams.get('process'),
          'sales_order_acceptance/approval_pmc'
        )
        for (const key of ['chain', 'node', 'flow', 'state', 'fact']) {
          assert.equal(
            initialParams.has(key),
            false,
            `独立运行路径下拉场景不得引入 ${key}`
          )
        }

        const runtimeSelector = page.getByRole('combobox', {
          name: '选择流程定义',
        })
        await runtimeSelector.waitFor({ state: 'visible', timeout: 10_000 })
        await runtimeSelector.focus()
        assert.equal(
          await runtimeSelector.evaluate(
            (node) => document.activeElement === node
          ),
          true,
          '流程定义下拉必须可通过键盘获得焦点'
        )
        const runtimeSelectRoot = runtimeSelector.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
        )
        await runtimeSelectRoot.locator('.ant-select-selector').click()
        const runtimeDropdown = page.locator('.ant-select-dropdown:visible')
        await runtimeDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 6)
        const expectedGroups = [
          '销售订单受理 · 2',
          '物料供应 · 1',
          '成品交付 · 1',
          '收付款审批 · 1',
          '人工库存调整 · 1',
          '生产异常决策 · 1',
        ]
        assert.deepEqual(
          await runtimeDropdown
            .locator('.ant-select-item-group')
            .allTextContents(),
          expectedGroups
        )
        assert.equal(
          await runtimeDropdown.locator('.ant-select-item-option').count(),
          7,
          '独立运行路径下拉必须精确覆盖 7 条正式流程定义'
        )
        assert.equal(
          await runtimeDropdown
            .locator('.erp-dev-flow-definition-option__key')
            .count(),
          7,
          '每条流程定义必须保留机器键'
        )
        await runtimeSelector.press('Escape')
        await runtimeDropdown.waitFor({ state: 'hidden', timeout: 10_000 })

        await runtimeSelectRoot.locator('.ant-select-selector').click()
        await runtimeDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 6)
        await runtimeDropdown
          .locator('.ant-select-item-option')
          .filter({ hasText: '销售订单受理（审批 + PMC）' })
          .click()
        await page.waitForFunction(
          (expected) =>
            new URLSearchParams(window.location.search).get('process') ===
            expected,
          'sales_order_acceptance/approval_pmc'
        )
        const selectedLabel = String(
          await runtimeSelectRoot
            .locator('.ant-select-selection-item')
            .textContent()
        ).trim()
        assert.match(selectedLabel, /销售订单受理（审批 \+ PMC）/u)

        await runtimeSelectRoot.locator('.ant-select-selector').click()
        await runtimeDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await waitForDefinitionSelectPopupSettled(page, 6)
        assert.deepEqual(
          await runtimeDropdown
            .locator('.ant-select-item-group')
            .allTextContents(),
          expectedGroups
        )
        assert.equal(
          String(
            await runtimeSelectRoot
              .locator('.ant-select-selection-item')
              .textContent()
          ).trim(),
          selectedLabel,
          '关闭并重新打开后必须保留已选流程定义'
        )
        assert.equal(
          new URL(page.url()).searchParams.get('process'),
          'sales_order_acceptance/approval_pmc',
          '关闭并重新打开不得改写流程定义深链接'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/dev-flow-state-observatory-runtime-selector-groups.png',
          fullPage: true,
          animations: 'disabled',
        })
        await runtimeSelector.press('Escape')
        await runtimeDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-runtime-selector-readonly'
        )
        const writeRequests = writeRequestsByPage.get(page) || []
        assert.deepEqual(
          writeRequests,
          [],
          '独立运行路径下拉浏览不得发出写请求'
        )
      },
    },
  ]
}
