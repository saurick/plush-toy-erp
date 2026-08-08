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
  }

  const exceptionText = review.chain.exceptionPaths.join('\n')
  for (const keyword of ['拒绝', '取消', '超领', '报废', '让步', '冲正']) {
    assert(exceptionText.includes(keyword), `missing exception ${keyword}`)
  }
  assert(
    review.chain.steps.some(
      (step) =>
        step.responsibleRole === DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED
    ),
    '未登记岗位必须明确显示当前正式合同未定义'
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
  assert.equal(review.overview.lanes.flatMap((lane) => lane.chains).length, 12)
  assert(
    review.overview.lanes
      .flatMap((lane) => lane.chains)
      .every((chain) => !Object.hasOwn(chain, 'steps'))
  )
  assert.match(review.overview.detailBoundary, /不展开每条链的内部步骤/u)
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
  assert.match(text, /流程走完不代表业务结果已经生效/u)
  assert.match(text, /任务完成不等于库存、出货、生产或财务结果已经生效/u)

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
    /request|trace|RPC|错误码|幂等/u,
  ]) {
    assert.doesNotMatch(text, forbidden)
  }

  const salesReview = buildDevBusinessChainCustomerReview({
    catalog: DEV_FLOW_STATE_CATALOG,
    chainKey: 'sales_to_production',
    generatedAt,
  })
  const salesText = visibleReviewText(salesReview)
  assert.match(salesText, /老板；其余岗位当前正式合同未定义/u)
  assert.doesNotMatch(
    salesText,
    /engineering_data|order_review|responsibility pool|责任池/iu
  )
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
  assert.doesNotMatch(`${moduleSource}\n${componentSource}`, /yoyoosun|永绅/iu)
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
