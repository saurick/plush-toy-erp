import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_FLOW_PATH_KINDS,
  DEV_FLOW_STATE_CATALOG,
} from '../config/devFlowStateCatalog.mjs'
import {
  DEV_FLOW_STATE_PATH_GROUP_PRESENTATION,
  DEV_FLOW_STATE_PATH_KIND_PRESENTATION,
  DEV_FLOW_STATE_TRANSITION_FILTERS,
  buildDevFlowStateNodeSummary,
  buildDevFlowStateRelatedViews,
  buildDevFlowStateRuleMermaid,
  buildDevFlowStateRuleSummary,
  filterDevFlowStateTransitions,
  getDevFlowStateHumanActionLabel,
  getDevFlowStateTransitionDiagramLabel,
  getDevFlowStateTransitionPresentation,
  listDevFlowStatePathGroups,
} from './devFlowStateRulePresentation.mjs'

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

test('sales order summary separates normal progress from cancellation exits', () => {
  const salesOrder = flow('source.sales_order')
  assert.deepEqual(buildDevFlowStateRuleSummary(salesOrder), {
    stateCount: 5,
    transitionCount: 6,
    exceptionalTransitionCount: 3,
    terminalCount: 2,
    terminalPolicyLabel: '有明确终态',
  })
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

test('state transition filters keep all, exceptional, and selected-state views distinct', () => {
  const salesOrder = flow('source.sales_order')
  assert.equal(
    filterDevFlowStateTransitions(
      salesOrder,
      '',
      DEV_FLOW_STATE_TRANSITION_FILTERS.all
    ).length,
    6
  )
  assert.equal(
    filterDevFlowStateTransitions(
      salesOrder,
      '',
      DEV_FLOW_STATE_TRANSITION_FILTERS.exceptional
    ).length,
    3
  )
  assert.deepEqual(
    filterDevFlowStateTransitions(
      salesOrder,
      'submitted',
      DEV_FLOW_STATE_TRANSITION_FILTERS.related
    ).map((item) => item.key),
    ['draft->submitted', 'submitted->active', 'submitted->canceled']
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
    '过账 · 返工 · 新轮次 · 条件适用'
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
    /stroke:#722ed1,stroke-width:2\.5px,stroke-dasharray:3 4/u
  )
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
    [['sales_to_production', 'sales_order']]
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
  assert.equal(shipmentTargets.chains.length, 2)

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
