import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import { BUSINESS_RULES } from './devBusinessRules.mjs'
import {
  businessRuleTests,
  businessTestKey,
} from '../../../../scripts/qa/lib/business-rule-catalog.mjs'
import {
  chainStepAuditURL,
  chainStepRuleRows,
  chainStepEvidenceLayers,
  chainStepSourceAccessFacts,
  readChainVerificationBatch,
  readChainVerificationEvidence,
} from './devBusinessChainVerification.mjs'
import {
  buildChainRuleCheckReport,
  planChainRuleCheck,
} from '../../../../scripts/qa/business-chain-rule-check.mjs'
import { filterChainAuditSteps } from './devBusinessChainAudit.mjs'

const chain = catalog.businessChains.find(
  (entry) => entry.key === 'purchase_to_inventory'
)

function ruleBatchFixture() {
  const plan = planChainRuleCheck('production_exception')
  const repository = { commit: 'a'.repeat(40), dirty: true, fingerprint: 'b'.repeat(64) }
  const value = buildChainRuleCheckReport({
    plan,
repositoryBefore: repository,
repositoryAfter: repository,
    generatedAt: '2026-11-03T00:00:00.000Z',
    runs: plan.commands.map((command) => ({
      ...command,
status: 0,
      stdout: plan.tests.filter((test) => test.gate === 'server' && command.args.includes(`./${test.package.slice('server/'.length)}`))
        .flatMap((test) => ['run', 'pass'].map((Action) => JSON.stringify({ Package: test.package, Test: test.name, Action }))).join('\n'),
    })),
  })
  return {
    plan,
results: value.results,
    envelope: { batch: 'rules-fixture',
report: value.report,
      currentRepository: repository,
freshness: 'unverified',
      files: [{ path: 'test-results.json' }] },
  }
}

test('具名规则报告核对工作区指纹，单层通过不提升数据库或链路实测', async () => {
  const fixture = ruleBatchFixture()
  const read = (envelope, results) => readChainVerificationBatch({
    batch: 'rules-fixture',
chain: fixture.plan.chain,
    fetchImpl: async (url) => ({ ok: true, json: async () => url.includes('/report?') ? envelope : results }),
  })
  const value = await read(fixture.envelope, fixture.results)
  assert.equal(value.ruleResult.current, true)
  const step = fixture.plan.chain.steps[5]
  const layers = chainStepEvidenceLayers(step, { ruleResult: value.ruleResult }, value.audit)
  assert.equal(layers.find((layer) => layer.key === 'server').status, 'passed')
  assert.equal(layers.find((layer) => layer.key === 'postgres').status, 'missing')
  assert.equal(layers.find((layer) => layer.key === 'chain').status, 'missing')
  const historical = await read({ ...fixture.envelope,
currentRepository: {
    ...fixture.envelope.currentRepository, fingerprint: 'c'.repeat(64),
  } }, fixture.results)
  assert.equal(historical.ruleResult.current, false)
  assert.equal(chainStepEvidenceLayers(step, { ruleResult: historical.ruleResult })[0].status, 'stale')
  const invalid = structuredClone(fixture.results)
  invalid.tests.find((test) => test.status === 'passed').counts.executed = 0
  const rejected = await read(fixture.envelope, invalid)
  assert.equal(rejected.ruleResult, null)
  assert.match(rejected.error, /计数不完整/u)
})

test('历史记录关联变化仍可阅读原报告，跨链记录不能借相同名称套用', async () => {
  const fixture = ruleBatchFixture()
  const old = structuredClone(fixture.results)
  old.steps[0].testIds = []
  const value = await readChainVerificationBatch({
    batch: 'rules-fixture',
chain: fixture.plan.chain,
    fetchImpl: async (url) => ({ ok: true,
json: async () => url.includes('/report?')
      ? { ...fixture.envelope, freshness: 'historical' } : old }),
  })
  assert(value.audit)
  assert.equal(value.ruleResult, null)
  assert.match(value.warning, /当前目录不同/u)
  await assert.rejects(() => readChainVerificationBatch({
    batch: 'rules-fixture',
chain,
    fetchImpl: async () => ({ ok: true, json: async () => fixture.envelope }),
  }), /范围不匹配/u)
})
const database = (current = true) => ({
  kind: 'plush.integration-evidence',
  current,
  scenarios: [],
  run: {
    status: 'passed',
    cleanupComplete: true,
    receipt: 'output/dev-workbench/database/ci-test.json',
  },
  ruleTests: businessRuleTests('postgres').map((test) => ({
    id: businessTestKey(test),
    status: 'passed',
    counts: { executed: 1, passed: 1, failed: 0, skipped: 0 },
  })),
})

test('采购交接展示同源的来源只读与商业字段要求', () => {
  const receipt = chain.steps.find((step) => step.key === 'purchase_approval:creates_fact_draft:purchase_receipt')
  const payable = chain.steps.find((step) => step.toNodeKey === 'purchase_payable_draft')
  const receiptFacts = chainStepSourceAccessFacts(receipt)
  assert(receiptFacts.some((row) => row.label === '来源只读权限' && row.value === '查看采购'))
  assert(receiptFacts.some((row) => row.label === '采购价格与金额' && row.value.includes('不要求价格权限')))
  assert(chainStepSourceAccessFacts(payable).some((row) => row.label === '采购价格与金额' && row.value.includes('查看采购商业字段')))
  assert.deepEqual(chainStepSourceAccessFacts({}), [])
})

test('采购退货调整及不合格处置的导入入口同源展示权限与规则', () => {
  const steps = catalog.businessChains.flatMap((entry) => entry.steps)
  for (const key of ['receiptReturn', 'receiptAdjustment', 'qualityReturn', 'rejectionDisposition']) {
    const step = steps.find((entry) => entry.sourceActionKeys.includes(key))
    assert(step, key)
    assert(step.verificationRuleIds.includes('purchase-source-permissions'))
    assert(chainStepSourceAccessFacts(step).some((row) => row.label.endsWith('来源只读权限') && row.value.includes('查看采购入库')))
    assert(step.resultStateRefs.some((ref) => ref.stateKey === 'DRAFT'))
    assert(!step.stateTransitionRefs.some((ref) => ref.transitionKey === 'DRAFT->POSTED'))
  }
})

test('采购每个交接均绑定真实规则，质检、入库和应付独立转换', () => {
  for (const step of chain.steps) {
    assert(step.verificationRuleIds.length > 0, step.key)
    assert(
      step.verificationRuleIds.every((id) =>
        BUSINESS_RULES.some((rule) => rule.id === id)
      )
    )
    assert.equal(step.allowsActionExecution, false)
  }
  const quality = chain.steps.find(
    (step) => step.key === 'purchase_quality:posts_fact:purchase_accepted'
  )
  const inbound = chain.steps.find(
    (step) => step.key === 'purchase_accepted:posts_fact:purchase_lot'
  )
  assert.deepEqual(quality.responsibility.ownerPoolKeys, ['quality'])
  assert.deepEqual(
    quality.stateTransitionRefs.map((ref) => ref.machineKey),
    ['fact.quality_inspection']
  )
  assert(!quality.factKeys.includes('inventory_lot'))
  assert.deepEqual(inbound.responsibility.ownerPoolKeys, ['warehouse'])
  assert(
    inbound.preconditionStateRefs.some(
      (ref) =>
        ref.machineKey === 'fact.quality_inspection' &&
        ref.stateKey === 'PASSED'
    )
  )
  assert(
    inbound.stateTransitionRefs.some(
      (ref) => ref.machineKey === 'fact.purchase_receipt'
    )
  )
  const payable = chain.steps.find(
    (step) => step.toNodeKey === 'purchase_payable_draft'
  )
  assert(
    payable.resultStateRefs.some(
      (ref) => ref.machineKey === 'fact.finance' && ref.stateKey === 'DRAFT'
    )
  )
  assert.equal(payable.stateTransitionRefs.length, 0)
})

test('交接证据保留缺失、历史、失败、跳过和清理未证明，零执行不能算通过', () => {
  const step = chain.steps.find(
    (step) => step.toNodeKey === 'purchase_accepted'
  )
  const statuses = (evidence) =>
    chainStepRuleRows(step, { evidence })
      .flatMap((rule) => rule.tests)
      .filter((test) => test.gate === 'postgres')
      .map((test) => test.status)
  assert(statuses(undefined).every((status) => status === 'missing'))
  assert(statuses(database()).every((status) => status === 'passed'))
  assert(statuses(database(false)).every((status) => status === 'stale'))
  for (const status of ['failed', 'skipped']) {
    const evidence = database()
    evidence.ruleTests.forEach((test) => {
      test.status = status
    })
    assert(statuses(evidence).every((value) => value === status))
  }
  const unclean = database()
  unclean.run.cleanupComplete = false
  assert(statuses(unclean).every((status) => status === 'blocked'))
  const empty = database()
  empty.ruleTests.forEach((test) => {
    test.counts.executed = 0
  })
  assert(statuses(empty).every((status) => status === 'missing'))
})

test('报告只读且独立失败；普通证据失败不隐藏有效数据库回执', async () => {
  const requests = []
  const value = await readChainVerificationEvidence({
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith('/business-chain-audit')) return { ok: true, status: 200, json: async () => ({ batches: [] }) }
      if (url.endsWith('/coverage'))
        { throw new Error('private diagnostic must not leak') }
      return { ok: true, json: async () => database() }
    },
  })
  assert.deepEqual(value.errors, ['普通测试报告读取失败'])
  assert.equal(value.reportCurrent, false)
  assert.equal(value.evidence.current, true)
  assert.equal(requests.length, 3)
  assert(
    requests.every(
      ({ options }) =>
        (!options.method || options.method === 'GET') &&
        options.cache === 'no-store'
    )
  )
  const invalid = await readChainVerificationEvidence({
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/business-chain-audit')
          ? { batches: [] }
          : url.endsWith('/coverage')
          ? { status: 'missing' }
          : { ...database(), ruleTests: [] },
    }),
  })
  assert.equal(invalid.evidence, null)
  assert.deepEqual(invalid.errors, ['数据库测试证据读取失败'])
})

test('实测报告按稳定交接标识定位，不用旧合并步骤或相似名称补证据', () => {
  const key = 'purchase_accepted:posts_fact:purchase_lot'
  const url = new URL(chainStepAuditURL(chain.key, key), 'http://localhost')
  assert.equal(url.searchParams.get('chain'), chain.key)
  assert.equal(url.searchParams.get('step'), key)
  const selected = new URL(chainStepAuditURL(chain.key, key, 'rules-20261103'), 'http://localhost')
  assert.equal(selected.searchParams.get('batch'), 'rules-20261103')
  assert.throws(() => chainStepAuditURL(chain.key, key, '../other'))
  const report = {
    chains: [
      {
        key: chain.key,
        label: chain.label,
        steps: [
          {
            key: 'purchase_quality:posts_fact:purchase_lot',
            label: '入库',
            status: 'passed',
          },
          { key, label: '入库', status: 'not_run' },
        ],
      },
    ],
  }
  assert.deepEqual(
    filterChainAuditSteps(report, { chain: chain.key, stepKey: key }).map(
      (step) => step.status
    ),
    ['not_run']
  )
  assert.equal(
    filterChainAuditSteps(report, { chain: chain.key, stepKey: 'missing' })
      .length,
    0
  )
})
