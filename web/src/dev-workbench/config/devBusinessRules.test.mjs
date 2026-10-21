import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUSINESS_RULES,
  buildBusinessRuleRows,
  filterBusinessRuleRows,
  normalizeBusinessRuleEvidence,
  parseBusinessRuleSearch,
} from './devBusinessRules.mjs'

const unit = BUSINESS_RULES[0].tests[0]
const database = BUSINESS_RULES.find(
  (entry) => entry.id === 'inventory-atomicity'
).tests[0]
const unitReport = (status = 'passed', name = unit.name) => ({
  businessCoverage: {
    domains: [
      { scenarios: [{ package: unit.package, status, matchedTests: [name] }] },
    ],
  },
})
const pgEvidence = (status = 'passed') => ({
  current: true,
  run: { status: 'passed', cleanupComplete: true },
  ruleTests: [
    {
      id: `${database.package}:${database.name}`,
      status,
      counts: { executed: 2, passed: 2, failed: 0, skipped: 0 },
    },
  ],
})
const status = (rows, id, index = 0) =>
  rows.find((entry) => entry.id === id).tests[index].status

test('static associations never imply execution and unit evidence needs exact names and current identity', () => {
  assert(buildBusinessRuleRows().every((entry) => entry.status === 'missing'))
  assert.equal(
    status(
      buildBusinessRuleRows({ report: unitReport(), reportCurrent: true }),
      'unit-quantity'
    ),
    'passed'
  )
  assert.equal(
    status(buildBusinessRuleRows({ report: unitReport() }), 'unit-quantity'),
    'stale'
  )
  assert.equal(
    status(
      buildBusinessRuleRows({
        report: unitReport('passed', `${unit.name}Extra`),
        reportCurrent: true,
      }),
      'unit-quantity'
    ),
    'missing'
  )
  assert.equal(
    status(
      buildBusinessRuleRows({
        report: unitReport('skipped'),
        reportCurrent: true,
      }),
      'unit-quantity'
    ),
    'skipped'
  )
  assert.equal(
    status(
      buildBusinessRuleRows({
        report: {
          businessCoverage: {
            domains: [
              {
                scenarios: [
                  {
                    package: 'other',
                    status: 'passed',
                    matchedTests: [unit.name],
                  },
                ],
              },
            ],
          },
        },
        reportCurrent: true,
      }),
      'unit-quantity'
    ),
    'missing'
  )
})

test('database evidence cannot turn stale, failed lifecycle, failed cleanup or zero execution green', () => {
  const baseline = pgEvidence()
  assert.equal(
    status(
      buildBusinessRuleRows({ evidence: baseline }),
      'inventory-atomicity'
    ),
    'passed'
  )
  assert.equal(
    status(
      buildBusinessRuleRows({ evidence: { ...baseline, current: false } }),
      'inventory-atomicity'
    ),
    'stale'
  )
  for (const run of [
    { status: 'failed', cleanupComplete: true },
    { status: 'passed', cleanupComplete: false },
    null,
  ]) {
    assert.equal(
      status(
        buildBusinessRuleRows({ evidence: { ...baseline, run } }),
        'inventory-atomicity'
      ),
      'blocked'
    )
  }
  for (const counts of [
    { executed: 0, passed: 0, failed: 0, skipped: 0 },
    { executed: 1, passed: 1, failed: 0, skipped: 1 },
    undefined,
  ]) {
    assert.equal(
      status(
        buildBusinessRuleRows({
          evidence: {
            ...baseline,
            ruleTests: [{ ...baseline.ruleTests[0], counts }],
          },
        }),
        'inventory-atomicity'
      ),
      'missing'
    )
  }
  assert.equal(
    status(
      buildBusinessRuleRows({ evidence: pgEvidence('failed') }),
      'inventory-atomicity'
    ),
    'failed'
  )
  assert.notEqual(
    buildBusinessRuleRows({ evidence: baseline }).find(
      (entry) => entry.id === 'inventory-atomicity'
    ).status,
    'passed'
  )
})

test('evidence transport rejects missing, duplicate, unknown and unproved passing tests', () => {
  const tests = [
    ...new Map(
      BUSINESS_RULES.flatMap((entry) => entry.tests)
        .filter((entry) => entry.gate === 'postgres')
        .map((entry) => [
          `${entry.package}:${entry.name}`,
          { id: `${entry.package}:${entry.name}`, status: 'missing' },
        ])
    ).values(),
  ]
  assert.equal(
    normalizeBusinessRuleEvidence({ ruleTests: tests }).ruleTests.length,
    tests.length
  )
  assert.throws(() => normalizeBusinessRuleEvidence({}))
  assert.throws(() =>
    normalizeBusinessRuleEvidence({ ruleTests: tests.slice(1) })
  )
  assert.throws(() =>
    normalizeBusinessRuleEvidence({ ruleTests: [tests[1], ...tests.slice(1)] })
  )
  assert.throws(() =>
    normalizeBusinessRuleEvidence({
      ruleTests: [{ ...tests[0], status: 'passed' }, ...tests.slice(1)],
    })
  )
})

test('category, search and selected rule restore from URL with invalid values rejected', () => {
  const value = parseBusinessRuleSearch(
    new URLSearchParams(
      'ruleCategory=quantity&ruleQuery=取整&rule=unit-quantity'
    )
  )
  assert.equal(value.category, 'quantity')
  assert.equal(value.rule, 'unit-quantity')
  assert.equal(
    filterBusinessRuleRows(buildBusinessRuleRows(), value)[0].id,
    'unit-quantity'
  )
  assert.equal(
    filterBusinessRuleRows(buildBusinessRuleRows(), { query: 'no-such-rule' })
      .length,
    0
  )
  assert.deepEqual(
    parseBusinessRuleSearch(
      new URLSearchParams(
        'rule=wrong&ruleCategory=quantity&ruleCategory=quantity'
      )
    ),
    { category: '', query: '', rule: '' }
  )
})
