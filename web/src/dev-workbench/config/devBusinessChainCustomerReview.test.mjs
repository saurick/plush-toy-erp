import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'
import {
  DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_COMPLETION_BOUNDARY,
  DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_FOOTER,
  DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED,
  buildDevBusinessChainCustomerReview,
} from './devBusinessChainCustomerReview.mjs'

const generatedAt = '2026-08-08T08:00:00.000Z'

function visibleReviewText(review) {
  const common = [
    review.documentTitle,
    review.designScope,
    review.customerBinding,
    review.releaseVersion,
    review.generatedAt,
    review.applicableScope,
    review.completionBoundary,
    review.footer,
  ]
  if (review.overview) {
    return [
      ...common,
      review.overview.overviewName,
      review.overview.purpose,
      review.overview.detailBoundary,
      review.overview.diagram.title,
      review.overview.diagram.description,
      ...review.overview.diagram.legend.map((item) => item.label),
      ...review.overview.lanes.flatMap((lane) => [
        lane.name,
        lane.purpose,
        ...lane.chains.flatMap((chain) => [chain.name, chain.purpose]),
      ]),
    ].join('\n')
  }
  return [
    ...common,
    review.chain.chainName,
    review.chain.chainKind,
    review.chain.purpose,
    review.chain.diagram.title,
    review.chain.diagram.description,
    ...review.chain.diagram.legend.map((item) => item.label),
    ...review.chain.steps.flatMap((step) => [
      step.name,
      step.action,
      step.responsibleRole,
      step.trigger,
      step.systemAction,
      step.personAction,
      step.completion,
      step.next,
      ...step.exceptionPaths,
    ]),
    ...review.chain.exceptionPaths,
  ].join('\n')
}

function customerDiagramSources(review) {
  return [review.overview?.diagram, review.chain?.diagram]
    .filter(Boolean)
    .map((diagram) => diagram.mermaidSource)
}

test('customer review exports only the selected business chain with complete business questions', () => {
  const review = buildDevBusinessChainCustomerReview({
    catalog: DEV_FLOW_STATE_CATALOG,
    chainKey: 'production_exception',
    generatedAt,
  })

  assert.equal(review.documentTitle, '业务链甲方校对版｜生产异常决策与执行')
  assert.equal(review.generatedAt, generatedAt)
  assert.equal(review.designScope, '产品通用设计校对稿')
  assert.equal(review.customerBinding, '未绑定客户发布版本')
  assert.equal(review.releaseVersion, '未绑定发布版本')
  assert.equal(review.chain.chainName, '生产异常决策与执行')
  assert.equal(review.chain.steps.length, 9)
  assert.equal(Object.hasOwn(review, 'overview'), false)
  assert.equal(
    visibleReviewText(review).includes('采购下单到合格入库'),
    false,
    '单链导出不得夹带其他业务链'
  )

  for (const step of review.chain.steps) {
    assert(step.number > 0)
    for (const field of [
      'name',
      'action',
      'responsibleRole',
      'trigger',
      'systemAction',
      'personAction',
      'completion',
      'next',
    ]) {
      assert.equal(typeof step[field], 'string', `${step.name}/${field}`)
      assert.notEqual(step[field].trim(), '', `${step.name}/${field}`)
    }
    assert(step.exceptionPaths.length > 0, step.name)
    assert(step.systemAction.length <= 24, `${step.name}/systemAction too long`)
    assert(step.personAction.length <= 24, `${step.name}/personAction too long`)
    assert(step.completion.length <= 120, `${step.name}/completion too long`)
    assert(
      review.chain.diagram.mermaidSource.includes(
        `${step.number}. ${step.name}`
      ),
      `diagram missing ${step.name}`
    )
  }

  const exceptionText = review.chain.exceptionPaths.join('\n')
  for (const keyword of ['拒绝', '取消', '超领', '报废', '让步', '冲正']) {
    assert(exceptionText.includes(keyword), `missing exception ${keyword}`)
  }
  assert(review.chain.displayExceptionPaths.length <= 6)
  assert(
    review.chain.displayExceptionPaths.length <
      review.chain.exceptionPaths.length,
    '客户版异常提示必须去重，完整合同仍留在共享模型中'
  )
  assert(
    review.chain.steps.every(
      (step) =>
        step.responsibleRole !== DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED
    ),
    '每个链路步骤必须从责任池、权限或系统责任得到业务语言投影'
  )
})

test('customer review binds a registered preview without claiming release or acceptance', () => {
  const customerOverlay = DEV_FLOW_STATE_CATALOG.overlays.find(
    (overlay) => overlay.customerKey === 'yoyoosun'
  )
  assert(customerOverlay)

  const review = buildDevBusinessChainCustomerReview({
    catalog: DEV_FLOW_STATE_CATALOG,
    chainKey: 'production_exception',
    generatedAt,
    customerOverlay,
  })

  assert.equal(review.designScope, '客户配置预览校对稿')
  assert.equal(review.customerBinding, `${customerOverlay.label}（仅配置预览）`)
  assert.equal(review.releaseVersion, '未绑定发布版本')
  assert.match(review.footer, /不单独证明已经实现、发布或经甲方验收/u)
  assert.throws(
    () =>
      buildDevBusinessChainCustomerReview({
        catalog: DEV_FLOW_STATE_CATALOG,
        chainKey: 'production_exception',
        generatedAt,
        customerOverlay: { ...customerOverlay, previewOnly: false },
      }),
    /read-only preview overlay/u
  )
})

test('customer review overview stays one-level and never expands all chain internals', () => {
  const review = buildDevBusinessChainCustomerReview({
    catalog: DEV_FLOW_STATE_CATALOG,
    chainKey: 'all',
    generatedAt,
  })

  assert.equal(review.overview.compactOnly, true)
  assert.equal(Object.hasOwn(review, 'chain'), false)
  assert.equal(review.overview.lanes.length, 4)
  assert.equal(review.overview.lanes.flatMap((lane) => lane.chains).length, 11)
  assert(
    review.overview.lanes
      .flatMap((lane) => lane.chains)
      .every((chain) => !Object.hasOwn(chain, 'steps'))
  )
  assert.match(review.overview.detailBoundary, /不展开每条链的内部步骤/u)
  const overviewDiagram = review.overview.diagram.mermaidSource
  for (const chain of review.overview.lanes.flatMap((lane) => lane.chains)) {
    assert(overviewDiagram.includes(`${chain.number}. ${chain.name}`))
  }
  assert.doesNotMatch(overviewDiagram, /生产异常决策单/u)
})

test('customer review visible content excludes developer evidence and keeps completion layers separate', () => {
  const review = buildDevBusinessChainCustomerReview({
    catalog: DEV_FLOW_STATE_CATALOG,
    chainKey: 'production_exception',
    generatedAt,
  })
  const text = visibleReviewText(review)

  assert.equal(
    review.completionBoundary,
    DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_COMPLETION_BOUNDARY
  )
  assert.equal(review.footer, DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_FOOTER)
  assert.match(text, /流程或任务完成不等于库存、出货、生产或财务事实已经生效/u)
  assert.match(text, /当前流程步骤结束；业务结果未必生效/u)
  assert.match(text, /岗位任务已有办理结果；业务结果未必生效/u)
  assert.match(text, /正式业务结果已生效，可按规则纠正/u)

  for (const forbidden of [
    /ProcessRuntime/u,
    /Fact\s*\/\s*Ledger/u,
    /Source Document/u,
    /RBAC/u,
    /task_id/u,
    /process_instance/u,
    /server\//u,
    /\.(?:mjs|jsx|go)(?:\b|$)/u,
    /(?:fact|source)\.[a-z_]/u,
    /request|trace|RPC|错误码/u,
  ]) {
    assert.doesNotMatch(text, forbidden)
  }

  const salesReview = buildDevBusinessChainCustomerReview({
    catalog: DEV_FLOW_STATE_CATALOG,
    chainKey: 'sales_to_production',
    generatedAt,
  })
  const salesText = visibleReviewText(salesReview)
  assert.match(salesText, /老板|具有对应业务权限的岗位/u)
  assert.doesNotMatch(
    salesText,
    /engineering_data|order_review|responsibility pool|责任池/iu
  )

  const allReviews = [
    DEV_FLOW_STATE_CATALOG.businessChainOverview.key,
    ...DEV_FLOW_STATE_CATALOG.businessChains.map((chain) => chain.key),
  ].map((chainKey) =>
    buildDevBusinessChainCustomerReview({
      catalog: DEV_FLOW_STATE_CATALOG,
      chainKey,
      generatedAt,
    })
  )
  const allCustomerVisibleTexts = allReviews.map(visibleReviewText)
  for (const projectionText of allCustomerVisibleTexts) {
    for (const forbidden of [
      /\b(?:variant|shipped|hold)\b/iu,
      /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/iu,
      /(?:task|process|workflow)_id/iu,
      /(?:server|web|src)\//iu,
    ]) {
      assert.doesNotMatch(projectionText, forbidden)
    }
  }
  for (const source of allReviews.flatMap(customerDiagramSources)) {
    for (const forbidden of [
      /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/iu,
      /(?:server|web|src)\//iu,
      /(?:task|process|workflow)_id/iu,
      /fact\.[a-z_]+/iu,
    ]) {
      assert.doesNotMatch(source, forbidden)
    }
  }
})

test('customer review does not hardcode a customer and fails closed for an unknown chain', () => {
  const moduleSource = readFileSync(
    fileURLToPath(
      new URL('./devBusinessChainCustomerReview.mjs', import.meta.url)
    ),
    'utf8'
  )
  const componentSource = readFileSync(
    fileURLToPath(
      new URL(
        '../pages/DevBusinessChainCustomerReviewPrint.jsx',
        import.meta.url
      )
    ),
    'utf8'
  )
  const pageSource = readFileSync(
    fileURLToPath(
      new URL('../pages/DevFlowStateObservatoryPage.jsx', import.meta.url)
    ),
    'utf8'
  )
  assert.doesNotMatch(`${moduleSource}\n${componentSource}`, /yoyoosun|永绅/iu)
  assert.match(moduleSource, /buildDevBusinessChainProjection/u)
  assert.match(pageSource, /DevCustomerScopeSelector/u)
  assert.match(pageSource, /DEV_CUSTOMER_QUERY_KEY/u)
  assert.match(pageSource, /normalize: view === 'chain'/u)
  assert.match(pageSource, /catalog\.overlays\.find/u)
  assert.match(pageSource, /disabled=\{!customerReviewReady\}/u)
  assert.match(pageSource, /通用业务链与运行观察仍可使用/u)
  assert.match(pageSource, /customerOverlay/u)
  assert.match(pageSource, /customerReviewPrintSnapshot/u)
  assert.match(
    pageSource,
    /<DevBusinessChainCustomerReviewPrint review=\{customerReviewPrint\} \/>/u,
    '打印专用 Mermaid 必须在用户请求导出后才挂载，不能在隐藏 DOM 中抢先渲染'
  )
  assert.doesNotMatch(moduleSource, /EXCEPTION_PATTERN|EXCEPTION_GROUPS/u)
  assert.match(
    componentSource,
    /flowchartHtmlLabels=\{false\}/u,
    '甲方打印图必须使用纯 SVG 文字，避免打印时丢失中文标签'
  )
  assert.doesNotMatch(
    componentSource,
    /step\.exceptionPaths/u,
    '客户打印稿不得逐步骤重复异常清单'
  )
  assert.throws(
    () =>
      buildDevBusinessChainCustomerReview({
        catalog: DEV_FLOW_STATE_CATALOG,
        chainKey: 'unknown-chain',
        generatedAt,
      }),
    /known business chain/u
  )
})
