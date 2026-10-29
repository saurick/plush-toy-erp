import {
  buildBusinessRuleRows,
  normalizeBusinessRuleEvidence,
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
  return buildBusinessRuleRows(evidence).filter((rule) => ids.has(rule.id))
}

export function chainStepAuditURL(chainKey, stepKey) {
  return `${DEV_BUSINESS_CHAIN_AUDIT_ROUTE}?${new URLSearchParams({ chain: chainKey, step: stepKey })}`
}

export function chainRuleTestingURL(ruleId) {
  return `${DEV_TESTING_ROUTE}?${new URLSearchParams({ view: 'coverage', coverage: 'rules', rule: ruleId })}`
}

// Both reports retain their existing identity and count checks. Reading a step
// never runs a test or promotes a historical result to current evidence.
export async function readChainVerificationEvidence({
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const [coverage, database] = await Promise.allSettled([
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
  ])
  return {
    report: coverage.status === 'fulfilled' ? coverage.value.report : null,
    reportCurrent:
      coverage.status === 'fulfilled' && coverage.value.status === 'current',
    evidence: database.status === 'fulfilled' ? database.value : null,
    errors: [
      ...(coverage.status === 'rejected' ? ['普通测试报告读取失败'] : []),
      ...(database.status === 'rejected' ? ['数据库测试证据读取失败'] : []),
    ],
  }
}
