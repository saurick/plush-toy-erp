import {
  BUSINESS_RULES,
  BUSINESS_RULE_CATEGORIES,
  BUSINESS_RULE_DIAGRAMS,
  businessTestKey,
  businessRuleTests,
} from '../../../../scripts/qa/lib/business-rule-catalog.mjs'

export { BUSINESS_RULES, BUSINESS_RULE_CATEGORIES, BUSINESS_RULE_DIAGRAMS }

export function normalizeBusinessRuleEvidence(value) {
  const ids = new Set(businessRuleTests('postgres').map(businessTestKey))
  if (!Array.isArray(value?.ruleTests) || value.ruleTests.length !== ids.size) {
    throw new Error('关键场景证据不完整')
  }
  for (const entry of value.ruleTests) {
    if (
      !ids.delete(entry.id) ||
      !['passed', 'failed', 'skipped', 'missing'].includes(entry.status)
    ) {
      throw new Error('关键场景证据无效')
    }
    if (
      entry.status === 'passed' &&
      (!Number.isInteger(entry.counts?.executed) ||
        entry.counts.executed < 1 ||
        entry.counts.passed !== entry.counts.executed ||
        entry.counts.failed !== 0 ||
        entry.counts.skipped !== 0)
    ) {
      throw new Error('关键场景执行数不完整')
    }
  }
  return value
}

export const BUSINESS_RULE_STATUS = Object.freeze({
  passed: ['用例通过', 'green'],
  failed: ['用例失败', 'red'],
  blocked: ['验证受阻', 'red'],
  skipped: ['已跳过', 'gold'],
  stale: ['历史证据', 'gold'],
  missing: ['未验证', 'default'],
})

export function summarizeBusinessRuleStatus(statuses) {
  return (
    ['failed', 'blocked', 'skipped', 'missing', 'stale'].find((status) =>
      statuses.includes(status)
    ) ||
    (statuses.length > 0 && statuses.every((status) => status === 'passed')
      ? 'passed'
      : 'missing')
  )
}

export function parseBusinessRuleSearch(params) {
  const value = (key) =>
    params.getAll(key).length === 1 ? params.get(key) : ''
  return {
    category: BUSINESS_RULE_CATEGORIES.some(
      (entry) => entry.value === value('ruleCategory')
    )
      ? value('ruleCategory')
      : '',
    query: (value('ruleQuery') || '').trim().slice(0, 120),
    rule: BUSINESS_RULES.some((entry) => entry.id === value('rule'))
      ? value('rule')
      : '',
  }
}

export function buildBusinessRuleRows({
  report,
  reportCurrent = false,
  evidence,
} = {}) {
  const unitScenarios = (report?.businessCoverage?.domains || []).flatMap(
    (entry) => entry.scenarios || []
  )
  const databaseTests = new Map(
    (evidence?.ruleTests || []).map((entry) => [entry.id, entry])
  )
  return BUSINESS_RULES.map((rule) => {
    const tests = rule.tests.map((test) => {
      let status = 'missing'
      if (test.gate === 'server') {
        const match = unitScenarios.find(
          (entry) =>
            entry.package === test.package &&
            entry.matchedTests?.some(
              (name) => name === test.name || name.startsWith(`${test.name}/`)
            )
        )
        if (match) {
          status = BUSINESS_RULE_STATUS[match.status] ? match.status : 'missing'
          if (status !== 'missing' && !reportCurrent) status = 'stale'
        }
      } else {
        const match = databaseTests.get(businessTestKey(test))
        if (match && BUSINESS_RULE_STATUS[match.status]) {
          status = match.status
          if (
            status === 'passed' &&
            (!Number.isInteger(match.counts?.executed) ||
              match.counts.executed < 1 ||
              match.counts.passed !== match.counts.executed ||
              match.counts.failed !== 0 ||
              match.counts.skipped !== 0)
          ) {
            status = 'missing'
          }
          if (status !== 'missing' && evidence.current !== true) {
            status = 'stale'
          }
          if (
            status === 'passed' &&
            (evidence.run?.cleanupComplete !== true ||
              evidence.run?.status !== 'passed')
          ) {
            status = 'blocked'
          }
        }
      }
      return { ...test, id: businessTestKey(test), status }
    })
    return {
      ...rule,
      tests,
      status: summarizeBusinessRuleStatus(tests.map((entry) => entry.status)),
    }
  })
}

export function filterBusinessRuleRows(
  rows,
  { category = '', query = '' } = {}
) {
  const keyword = query.trim().toLocaleLowerCase()
  return rows.filter(
    (entry) =>
      (!category || entry.category === category) &&
      (!keyword ||
        [
          entry.label,
          entry.standard,
          entry.domain,
          ...entry.tests.map((test) => test.name),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(keyword))
  )
}
