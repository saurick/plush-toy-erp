import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_FLOW_PATH_KINDS,
  DEV_FLOW_STATE_CATALOG,
} from '../config/devFlowStateCatalog.mjs'
import {
  DEV_FLOW_STATE_PATH_GROUP_PRESENTATION,
  DEV_FLOW_STATE_PATH_KIND_PRESENTATION,
  buildDevFlowStateNodeSummary,
  buildDevFlowRecordRelationship,
  buildDevFlowStateRelatedViews,
  buildDevFlowStateRuleMermaid,
  getDevFlowStateHumanActionLabel,
  getDevFlowStateTransitionDiagramLabel,
  getDevFlowStateTransitionPresentation,
  listDevFlowStatePathGroups,
} from './devFlowStateRulePresentation.mjs'

test('不可变记录只投影反向记录到原记录的引用，不补造状态边', () => {
  for (const key of ['fact.finance_credit_note', 'fact.finance_allocation']) {
    const value = flow(key)
    const relation = buildDevFlowRecordRelationship(value)
    assert.deepEqual(relation.nodes.map((node) => node.key).sort(), value.states.map((state) => state.key).sort())
    assert.equal(relation.edges.length, 1)
    assert.equal(relation.edges[0].from, 'REVERSED')
    assert.equal(relation.edges[0].to, 'POSTED')
    assert.equal(relation.edges[0].label, '引用原记录')
    assert.equal(value.transitions.length, 0)
  }
  assert.equal(buildDevFlowRecordRelationship(flow('source.sales_order')), null)
})

function flow(key) {
  const value = DEV_FLOW_STATE_CATALOG.flows.find((item) => item.key === key)
  assert(value, `missing flow ${key}`)
  return value
}

function transition(value, key) {
  const item = value.transitions.find((candidate) => candidate.key === key)
  assert(item, `missing transition ${value.key}:${key}`)
  return item
}

test('state rule presentation covers every registered exceptional path kind', () => {
  assert.deepEqual(
    new Set(Object.keys(DEV_FLOW_STATE_PATH_KIND_PRESENTATION)),
    new Set(DEV_FLOW_PATH_KINDS)
  )
  for (const item of Object.values(DEV_FLOW_STATE_PATH_KIND_PRESENTATION)) {
    assert(item.label)
    assert(item.diagramLabel)
    assert(item.groupKey)
    assert(item.color)
  }
  for (const group of Object.values(DEV_FLOW_STATE_PATH_GROUP_PRESENTATION)) {
    assert.match(group.diagramStroke, /^#[\da-f]{6}$/iu)
    assert(group.diagramStrokeWidth >= 2)
    assert.equal(typeof group.diagramStrokeDasharray, 'string')
  }
})

test('every registered transition has a plain-language action label', () => {
  const genericActions = []
  for (const item of DEV_FLOW_STATE_CATALOG.flows) {
    for (const candidate of item.transitions) {
      if (
        getDevFlowStateHumanActionLabel(candidate.action) === '按登记规则转换'
      ) {
        genericActions.push(`${item.key}:${candidate.action}`)
      }
    }
  }
  assert.deepEqual(genericActions, [])
})

test('sales order state conditions distinguish normal progress and cancellation exits', () => {
  const salesOrder = flow('source.sales_order')
  assert.deepEqual(
    listDevFlowStatePathGroups(salesOrder).map((item) => item.key),
    ['normal', 'stop']
  )

  const submitted = salesOrder.states.find((item) => item.key === 'submitted')
  assert.deepEqual(
    {
      incoming: buildDevFlowStateNodeSummary(salesOrder, submitted).incoming
        .length,
      outgoing: buildDevFlowStateNodeSummary(salesOrder, submitted).outgoing
        .length,
      incomingExceptionalCount: buildDevFlowStateNodeSummary(
        salesOrder,
        submitted
      ).incomingExceptionalCount,
      outgoingExceptionalCount: buildDevFlowStateNodeSummary(
        salesOrder,
        submitted
      ).outgoingExceptionalCount,
      positionLabel: buildDevFlowStateNodeSummary(salesOrder, submitted)
        .positionLabel,
    },
    {
      incoming: 1,
      outgoing: 2,
      incomingExceptionalCount: 0,
      outgoingExceptionalCount: 1,
      positionLabel: '中间状态',
    }
  )
})

test('diagram labels stay short while preserving cancellation, reversal, and conditional rework semantics', () => {
  const salesOrder = flow('source.sales_order')
  assert.equal(
    getDevFlowStateTransitionDiagramLabel(
      transition(salesOrder, 'draft->submitted')
    ),
    '启动流程'
  )
  assert.equal(
    getDevFlowStateTransitionDiagramLabel(
      transition(salesOrder, 'submitted->canceled')
    ),
    '取消 · 终止'
  )

  const shipment = flow('fact.shipment')
  const reversedShipment = transition(shipment, 'SHIPPED->CANCELLED')
  assert.equal(
    getDevFlowStateTransitionDiagramLabel(reversedShipment),
    '取消 · 终止 · 冲正'
  )
  assert.equal(
    getDevFlowStateTransitionPresentation(shipment, reversedShipment).groupKey,
    'correction'
  )

  const production = flow('fact.production')
  const rework = transition(production, 'DRAFT->POSTED')
  assert.equal(
    getDevFlowStateTransitionDiagramLabel(rework),
    '过账（返工按条件）'
  )
  assert.equal(
    getDevFlowStateTransitionPresentation(production, rework).conditional,
    true
  )
  assert.equal(
    getDevFlowStateTransitionPresentation(production, rework).condition,
    '仅当本次生产事实登记为“返工”时；其他类型仍按正常过账路径理解。'
  )
  assert.doesNotMatch(
    getDevFlowStateTransitionPresentation(production, rework).condition,
    /[_=]/u
  )
})

test('state rule Mermaid colors transition lines from the shared path presentation', () => {
  const salesDiagram = buildDevFlowStateRuleMermaid(flow('source.sales_order'))
  assert.match(salesDiagram, /^flowchart LR/u)
  assert.match(salesDiagram, /STATE_START\(\["开始"\]\)/u)
  assert.match(salesDiagram, /STATE_END\(\["结束"\]\)/u)
  assert.match(salesDiagram, /S0 -->\|"启动流程"\| S1/u)
  assert.match(
    salesDiagram,
    /linkStyle 1,2,5 stroke:#2b8a3e,stroke-width:2\.25px/u
  )
  assert.match(
    salesDiagram,
    /linkStyle 3,4,6 stroke:#cf1322,stroke-width:2\.75px/u
  )
  assert.doesNotMatch(salesDiagram, /undefined/u)

  const workflowDiagram = buildDevFlowStateRuleMermaid(flow('workflow.task'))
  assert.match(
    workflowDiagram,
    /stroke:#d46b08,stroke-width:2\.5px,stroke-dasharray:8 4/u
  )
  const productionDiagram = buildDevFlowStateRuleMermaid(
    flow('fact.production')
  )
  assert.match(
    productionDiagram,
    /stroke:#2b8a3e,stroke-width:2\.25px/u
  )
  assert.doesNotMatch(productionDiagram, /stroke:#722ed1/u)
})

test('用料退回保留异常分类，同接口下的业务动作仍可区分', () => {
  const materials = flow('source.engineering_material_request')
  assert.deepEqual(materials.transitions.filter((item) => getDevFlowStateTransitionPresentation(materials, item).isExceptional).map((item) => item.key), ['SUBMITTED->REJECTED', 'BOSS_APPROVED->REJECTED'])
  assert.equal(new Set(materials.transitions.map(getDevFlowStateTransitionDiagramLabel)).size, 4)
})

test('有条件的返工保留正常过账与条件异常说明', () => {
  const production = flow('fact.production')
  const post = transition(production, 'DRAFT->POSTED')
  assert.equal(getDevFlowStateTransitionPresentation(production, post).isExceptional, true)
  assert.equal(getDevFlowStateTransitionPresentation(production, post).groupKey, 'normal')
  assert.equal(getDevFlowStateTransitionPresentation(production, post).conditional, true)
  assert(listDevFlowStatePathGroups(production).some((item) => item.key === 'normal'))
  assert.match(buildDevFlowStateRuleMermaid(production), /过账/u)
  const adjustment = flow('fact.inventory_operation')
  assert.equal(getDevFlowStateTransitionPresentation(adjustment, transition(adjustment, 'DRAFT->SUBMITTED')).groupKey, 'correction')
})

test('流程结束使用中性结果维度，补偿结束不冒充成功或单一取消', () => {
  const runtime = flow('process.instance')
  const complete = transition(runtime, 'active->completed')
  const stopped = transition(runtime, 'blocked->completed')
  assert.equal(runtime.states.find((item) => item.key === 'completed').label, '已结束')
  assert.deepEqual(complete.outcomeKeys, ['succeeded', 'rejected', 'cancelled', 'compensated'])
  assert.deepEqual(stopped.outcomeKeys, ['cancelled', 'compensated'])
  for (const edge of [complete, stopped]) {
    const presentation = getDevFlowStateTransitionPresentation(runtime, edge)
    assert.equal(presentation.groupKey, 'outcome')
    assert.match(presentation.condition, /补偿结束/u)
    assert.match(presentation.condition, /结束不代表成功/u)
    assert.equal(presentation.isExceptional, true)
  }
  assert.equal(getDevFlowStateTransitionPresentation(runtime, transition(runtime, 'blocked->active')).groupKey, 'pause_restore')
})

test('state rule Mermaid fails closed when catalog transitions reference an unknown state', () => {
  const salesOrder = flow('source.sales_order')
  assert.throws(
    () =>
      buildDevFlowStateRuleMermaid({
        ...salesOrder,
        transitions: [
          ...salesOrder.transitions,
          { ...salesOrder.transitions[0], from: 'missing-state' },
        ],
      }),
    /invalid dev flow state reference at transitions\[6\]\.from/u
  )
})

test('related-view projection only creates exact catalog-backed destinations', () => {
  const salesTargets = buildDevFlowStateRelatedViews(
    DEV_FLOW_STATE_CATALOG,
    flow('source.sales_order')
  )
  assert.deepEqual(
    salesTargets.chains.map((item) => [item.chainKey, item.nodeKey]),
    [
      ['sales_to_production', 'sales_order'],
      ['finance_payment_and_reversal', 'payment_order'],
    ]
  )
  assert.deepEqual(salesTargets.facts, [])
  assert.deepEqual(salesTargets.direct, [])

  const shipmentTargets = buildDevFlowStateRelatedViews(
    DEV_FLOW_STATE_CATALOG,
    flow('fact.shipment')
  )
  assert.deepEqual(
    shipmentTargets.facts.map((item) => item.factKey),
    ['fact.shipment']
  )
  assert.deepEqual(
    shipmentTargets.chains.map((item) => [item.chainKey, item.nodeKey]),
    [
      ['delivery_to_settlement', 'shipment_draft'],
      ['delivery_to_settlement', 'shipped'],
      ['delivery_to_settlement', 'shipment_cancelled'],
    ]
  )

  assert.deepEqual(
    buildDevFlowStateRelatedViews(
      DEV_FLOW_STATE_CATALOG,
      flow('workflow.task')
    ).direct.map((item) => item.type),
    ['workflow']
  )
  assert.deepEqual(
    buildDevFlowStateRelatedViews(
      DEV_FLOW_STATE_CATALOG,
      flow('process.instance')
    ).direct.map((item) => item.type),
    ['runtime']
  )
})

test('state diagrams retain every registered state and transition', () => {
  for (const source of DEV_FLOW_STATE_CATALOG.flows) {
    const graph = buildDevFlowStateRuleMermaid(source)
    assert.equal((graph.match(/ -->\|/gu) || []).length, source.transitions.length, source.key)
    const ids = new Set([...graph.matchAll(/^ {2}(S\d+)\[/gmu)].map((match) => match[1]))
    assert.equal(ids.size, source.states.length, source.key)
    for (const edge of graph.matchAll(/(S\d+) -->\|[^\n]+\| (S\d+)/gu)) {
      assert(ids.has(edge[1]) && ids.has(edge[2]), 'every visible transition retains both endpoints')
    }
  }
})

test('state diagrams retain disconnected states and registered start and end markers', () => {
  const source = { states: [{ key: 'draft', label: '草稿' }, { key: 'active', label: '生效' }, { key: 'done', label: '结束' }], initialStates: ['draft'], terminalStates: ['done'], transitions: [] }
  const graph = buildDevFlowStateRuleMermaid(source)
  for (const label of ['生效', '草稿', '结束', 'STATE_START', 'STATE_END']) assert(graph.includes(label), label)
})
