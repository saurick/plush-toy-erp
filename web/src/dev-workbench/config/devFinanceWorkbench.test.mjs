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
    purchaseFinanceScenario('posted', 'return').steps[2][1],
    /撤销足额核销记录/
  )
  assert.equal(purchaseFinanceScenario('posted', 'return').steps[2][2], '未核销余额足够')
  assert.match(purchaseFinanceScenario('posted', 'increase').title, /重新打开/)
  assert.equal(purchaseFinanceScenario('posted', 'increase').steps[2][2], '本次差额尚未确认')
  for (const [stage, change, expected] of [
    ['none', 'return', ['已过账入库', '采购退货过账', '形成净来源金额', '生成应付草稿']],
    ['none', 'increase', ['已过账入库', '数量调增过账', '形成净来源金额', '生成应付草稿']],
    ['none', 'transfer', ['已过账入库', '过账库存修正', '库存位置或批次更新', '生成应付草稿']],
    ['draft', 'return', ['应付草稿', '取消应付草稿', '采购退货过账', '重新生成草稿']],
    ['draft', 'increase', ['应付草稿', '取消应付草稿', '数量调增过账', '重新生成草稿']],
    ['draft', 'transfer', ['应付草稿', '取消应付草稿', '过账库存修正', '重新生成草稿']],
    ['posted', 'return', ['采购退货已过账', '采购待调整', '核对核销依赖', '财务确认调减']],
    ['posted', 'increase', ['数量调增已过账', '采购待调整', '核对来源与重复', '财务确认调增']],
    ['posted', 'transfer', ['已过账入库', '过账库存修正', '库存位置或批次更新', '账款差额为零']],
  ]) {
    const scenario = purchaseFinanceScenario(stage, change)
    const steps = scenario.steps.map(([label]) => label)
    assert.deepEqual(steps, expected, `${stage} / ${change}`)
  }
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
