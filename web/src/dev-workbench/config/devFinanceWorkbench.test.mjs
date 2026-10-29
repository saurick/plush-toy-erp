import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  buildFinanceRelationships,
  FINANCE_RULES,
  financeRuleEvidence,
  illustrateChinaMonthEnd,
  purchaseFinanceScenario,
} from './devFinanceWorkbench.mjs'
import {
  financeTracePage,
  financeTraceFact,
} from '../components/flow-state/financeTraceModel.mjs'

test('财务概览引用正式链路，采购已记账差额必须由财务显式确认', () => {
  const model = buildFinanceRelationships(catalog)
  assert.equal(model.groups.length, 5)
  assert.deepEqual(
    model.lanes.map(({ label }) => label),
    ['销售与出货', '采购与仓库', '委外与生产']
  )
  assert(
    model.lanes.every(
      (lane) =>
        lane.nodes.length === 4 &&
        lane.nodes.every((node) => node.chain.nodes.includes(node.node))
    )
  )
  assert.throws(
    () => buildFinanceRelationships({ businessChains: [] }),
    /Missing finance relationship source/
  )
  assert(
    !catalog.businessChains.some((chain) => chain.key === 'finance_relations')
  )
  assert(model.groups.every((group) => group.chain.nodes.includes(group.node)))
  const chain = catalog.businessChains.find(
    (item) => item.key === 'purchase_posting_corrections'
  )
  const adjustment = chain.steps.find(
    (step) => step.toNodeKey === 'purchase_finance_adjustment'
  )
  assert.equal(adjustment.responsibility.mode, 'human')
  assert.deepEqual(adjustment.responsibility.ownerPoolKeys, ['finance'])
  assert.match(
    purchaseFinanceScenario('posted', 'return').detail,
    /撤销足额核销记录/
  )
  assert.match(purchaseFinanceScenario('posted', 'increase').title, /重新打开/)
  assert.match(purchaseFinanceScenario('draft', 'return').title, /先取消/)
  assert.equal(
    purchaseFinanceScenario('posted', 'transfer').title,
    '没有账款差额'
  )
  assert(
    FINANCE_RULES.every((rule) => financeRuleEvidence(rule.key).length > 0)
  )
})

test('中国自然月示例覆盖月初、跨年、闰年及非法日期，不改变真实账款', () => {
  assert.deepEqual(illustrateChinaMonthEnd('2026-10-01', 30), {
    monthEnd: '2026-10-31',
    dueDate: '2026-11-30',
  })
  assert.equal(illustrateChinaMonthEnd('2026-12-31', 1).dueDate, '2027-01-01')
  assert.equal(illustrateChinaMonthEnd('2028-02-01', 1).dueDate, '2028-03-01')
  for (const [date, days] of [
    ['2026-02-30', 30],
    ['2026-13-01', 30],
    ['', 1],
    ['2026-10-01', 0],
    ['2026-10-01', 1.5],
  ]) {
    assert.equal(illustrateChinaMonthEnd(date, days), null)
  }
})

test('财务读取区分空页和错误数据，并拒绝跨账款、跨原款混入', () => {
  assert.deepEqual(
    financeTracePage({ payments: [], total: 0 }, 'payments', {}),
    { rows: [], total: 0 }
  )
  const row = {
    id: 2,
    allocations: [{ finance_fact_id: 9, status: 'REVERSED' }],
  }
  assert.equal(
    financeTracePage({ payments: [row], total: 1 }, 'payments', {
      finance_fact_id: 9,
    }).rows[0],
    row
  )
  assert.throws(() =>
    financeTracePage({ payments: [row], total: 1 }, 'payments', {
      finance_fact_id: 8,
    })
  )
  assert.throws(() =>
    financeTracePage(
      { payments: [{ id: 2, refund_of_payment_id: 4 }], total: 1 },
      'payments',
      { refund_of_payment_id: 5 }
    )
  )
  assert.throws(() => financeTracePage({}, 'payments', {}))
  assert.throws(() =>
    financeTracePage({ payments: [row], total: 0 }, 'payments', {})
  )
  assert.throws(() =>
    financeTraceFact({ id: 2, fact_type: 'PAYABLE' }, { id: 9 })
  )
  assert.throws(() => financeTraceFact(null, { id: 9 }))
})
