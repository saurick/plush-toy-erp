import {
  buildBusinessRuleRows,
  BUSINESS_RULES,
  normalizeBusinessRuleEvidence,
  summarizeBusinessRuleStatus,
} from './devBusinessRules.mjs'
import { readIntegrationEvidence } from './devIntegration.mjs'
import {
  DEV_TESTING_COVERAGE_API_PATH,
  normalizeDevTestingCoverageEnvelope,
} from './devTesting.mjs'
import {
  DEV_BUSINESS_CHAIN_AUDIT_ROUTE,
  DEV_TESTING_ROUTE,
} from './devRoutes.mjs'
import { PurchaseSourceActions } from '../../common/consts/purchaseSourceActions.mjs'
import { PermissionLabel } from '../../common/consts/permissions.generated.mjs'
import {
  CHAIN_AUDIT_BATCH_PATTERN,
  DEV_CHAIN_AUDIT_API,
  chainAuditArtifactURL,
  validateBusinessChainReport,
} from './devBusinessChainAudit.mjs'
import { requestWorkbenchJson } from './devWorkbenchRequest.mjs'
import { inspectBusinessChainRuleResults } from '../../../../scripts/qa/lib/business-chain-rule-contract.mjs'

export function chainStepSourceAccessFacts(step) {
  return (step.sourceActionKeys || []).flatMap((key) => {
    const action = PurchaseSourceActions[key]
    const labels = (keys) => keys.map((key) => PermissionLabel[key]).join('、')
    const facts = [
      { label: '本岗办理权限', value: PermissionLabel[action.permission] },
      { label: '来源只读权限', value: labels(action.sourcePermissions) },
      ...(action.preparationPermissions.length
        ? [{ label: '带入前资料读取', value: labels(action.preparationPermissions) }] : []),
      { label: '采购价格与金额',
value: action.sensitivePermissions.length
        ? `需另有${labels(action.sensitivePermissions)}；来源数据不能手工绕过。`
        : '此操作不要求价格权限；无权字段由后端移除，数量与来源关联仍可带入。' },
    ]
    return step.sourceActionKeys.length > 1
      ? facts.map((fact) => ({ ...fact, label: `${action.label}：${fact.label}` }))
      : facts
  })
}

export function chainStepRuleRows(step, evidence = {}) {
  const ids = new Set(step.verificationRuleIds || [])
  const results = new Map((evidence.ruleResult?.tests || []).map((test) => [test.id, test]))
  return buildBusinessRuleRows(evidence).filter((rule) => ids.has(rule.id)).map((rule) => {
    const tests = rule.tests.map((test) => {
      const result = test.gate === 'server' && results.get(test.id)
      return result ? {
        ...test,
        status: result.status === 'missing' || evidence.ruleResult.current
          ? result.status
          : 'stale',
      } : test
    })
    return { ...rule, tests, status: summarizeBusinessRuleStatus(tests.map((test) => test.status)) }
  })
}

export function chainStepEvidenceLayers(step, evidence = {}, audit = null) {
  const tests = [...new Map(chainStepRuleRows(step, evidence).flatMap((rule) => rule.tests).map((test) => [test.id, test])).values()]
  const layer = (key, label, gate, source, time) => {
    const selected = tests.filter((test) => test.gate === gate)
    return { key,
label,
status: summarizeBusinessRuleStatus(selected.map((test) => test.status)),
      count: selected.length,
source: selected.length ? source : '本动作尚未登记此层检查',
time }
  }
  const layers = [
    layer('server', '后端规则', 'server', evidence.ruleResult ? evidence.ruleResult.current ? '本次链路规则检查' : '历史链路规则检查'
        : evidence.reportCurrent ? '当前工作区覆盖报告' : evidence.report ? '历史覆盖报告' : '未采集', evidence.ruleResult?.generatedAt || evidence.report?.generatedAt),
  ]
  if (tests.some((test) => test.gate === 'web')) {
    layers.push(layer('web', '前端合同', 'web', evidence.reportCurrent ? '当前工作区覆盖报告' : evidence.report ? '历史覆盖报告' : '未采集', evidence.report?.generatedAt))
  }
  layers.push(layer('postgres', '真实数据库', 'postgres', evidence.evidence?.current ? '源码一致的数据库回执'
      : evidence.evidence?.run ? '历史数据库回执' : '未采集', evidence.evidence?.run?.finishedAt))
  const observed = audit?.report?.chains.find((chain) => chain.key === audit.chainKey)?.steps.find((row) => row.key === step.key)
  layers.push({
    key: 'chain',
label: '链路实测',
    status: observed && !['not_proven', 'not_run'].includes(observed.status) ? 'stale' : 'missing',
    source: observed ? audit.freshness === 'historical' ? '历史批次，不计入本次' : '批次未证明完整工作区一致' : '本批次没有此动作的实测证据',
    time: audit?.report?.generatedAt,
    observed,
  })
  return layers
}

export function chainStepAuditURL(chainKey, stepKey, batch = '') {
  const query = new URLSearchParams({ chain: chainKey })
  if (stepKey) query.set('step', stepKey)
  if (batch) {
    if (!CHAIN_AUDIT_BATCH_PATTERN.test(batch)) throw new Error('链路批次无效')
    query.set('batch', batch)
  }
  return `${DEV_BUSINESS_CHAIN_AUDIT_ROUTE}?${query}`
}

export function chainRuleTestingURL(ruleId) {
  return `${DEV_TESTING_ROUTE}?${new URLSearchParams({ view: 'coverage', coverage: 'rules', rule: ruleId })}`
}

// Reports retain their existing identity and count checks. Reading a step
// never runs a test or promotes a historical result to current evidence.
export async function readChainVerificationEvidence({
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const [coverage, database, audits] = await Promise.allSettled([
    (async () => {
      const response = await fetchImpl(DEV_TESTING_COVERAGE_API_PATH, {
        signal,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const value = normalizeDevTestingCoverageEnvelope(await response.json(), {
        httpStatus: response.status,
      })
      if (value.status === 'failed') throw new Error('coverage unavailable')
      return value
    })(),
    readIntegrationEvidence({ signal, fetchImpl }).then(
      normalizeBusinessRuleEvidence
    ),
    (async () => {
      const value = await requestWorkbenchJson(fetchImpl, DEV_CHAIN_AUDIT_API, {
        signal, method: 'GET', headers: { Accept: 'application/json' },
      })
      if (!Array.isArray(value.batches) || value.batches.length > 200 ||
        value.batches.some((batch) => !CHAIN_AUDIT_BATCH_PATTERN.test(batch.id) ||
          !['ready', 'invalid'].includes(batch.status) ||
          (batch.status === 'ready' && (!Array.isArray(batch.chainKeys) || !batch.chainKeys.every((key) => typeof key === 'string') || !Number.isFinite(Date.parse(batch.generatedAt)))))) {
        throw new Error('invalid chain report index')
      }
      return value.batches
    })(),
  ])
  return {
    report: coverage.status === 'fulfilled' ? coverage.value.report : null,
    reportCurrent:
      coverage.status === 'fulfilled' && coverage.value.status === 'current',
    evidence: database.status === 'fulfilled' ? database.value : null,
    batches: audits.status === 'fulfilled' ? audits.value : [],
    batchesLoaded: audits.status === 'fulfilled',
    errors: [
      ...(coverage.status === 'rejected' ? ['普通测试报告读取失败'] : []),
      ...(database.status === 'rejected' ? ['数据库测试证据读取失败'] : []),
      ...(audits.status === 'rejected' ? ['链路报告目录读取失败'] : []),
    ],
  }
}

export async function readChainVerificationBatch({
  batch, chain, signal, fetchImpl = globalThis.fetch,
}) {
  if (!CHAIN_AUDIT_BATCH_PATTERN.test(batch)) throw new Error('链路批次无效')
  const value = await requestWorkbenchJson(fetchImpl, `${DEV_CHAIN_AUDIT_API}/report?${new URLSearchParams({ batch })}`, {
    signal, method: 'GET', headers: { Accept: 'application/json' },
  })
  validateBusinessChainReport(value.report)
  if (value.batch !== batch || !value.report.chains.some((row) => row.key === chain.key) ||
    !Array.isArray(value.files) || !['historical', 'unverified', 'unknown'].includes(value.freshness)) {
    throw new Error('链路报告范围不匹配')
  }
  const result = { audit: { ...value, chainKey: chain.key }, ruleResult: null, error: '' }
  if (value.files.some((file) => file.path === 'test-results.json')) {
    let tests
    try {
      tests = await requestWorkbenchJson(fetchImpl, chainAuditArtifactURL(batch, 'test-results.json'), {
        signal, method: 'GET', headers: { Accept: 'application/json' },
      })
      if (tests.repositoryBefore?.commit !== value.report.scope.sourceCommit) throw new Error('source mismatch')
      result.ruleResult = inspectBusinessChainRuleResults(tests, {
        chain, rules: BUSINESS_RULES, repository: value.currentRepository,
      })
    } catch {
      signal?.throwIfAborted()
      if (/^[a-f0-9]{64}$/u.test(tests?.repositoryBefore?.fingerprint || '') &&
        (value.freshness === 'historical' || tests.repositoryBefore.fingerprint !== value.currentRepository?.fingerprint)) {
        result.warning = '该批次的规则关联与当前目录不同，保留原报告，本次仍需验证'
      } else {
        result.error = '具名规则结果的关联或计数不完整，不能作为本次通过证据'
      }
    }
  }
  return result
}
