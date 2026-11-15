import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBusinessFlowMermaid } from '../../common/components/markdown/mermaidGraph.mjs'

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
  buildDevFlowStateRuleGraph,
  getDevFlowStateHumanActionLabel,
  getDevFlowStateTransitionDiagramLabel,
  getDevFlowStateTransitionPresentation,
  listDevFlowStatePathGroups,
} from './devFlowStateRulePresentation.mjs'

const renderStateGraph = (flow) => buildBusinessFlowMermaid(buildDevFlowStateRuleGraph(flow)).chart

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
  }
  for (const group of Object.values(DEV_FLOW_STATE_PATH_GROUP_PRESENTATION)) {
    assert(group.label)
    assert(group.description)
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

test('state rules distinguish branches without implying a completed execution', () => {
  for (const source of [flow('source.sales_order'), flow('workflow.task'), flow('fact.production')]) {
    const model = buildDevFlowStateRuleGraph(source)
    const graph = buildBusinessFlowMermaid(model)
    assert.equal(graph.edges.length, source.transitions.length)
    assert(model.edges.some((edge) => edge.branch), source.key)
    assert.doesNotMatch(graph.chart, /fa:|diagramSuccess|diagramDanger|stroke:#/u)
    for (const edge of model.edges) {
      assert.equal(edge.branch, getDevFlowStateTransitionPresentation(source, source.transitions.find((item) => item.key === edge.key)).isExceptional)
    }
  }
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
  assert.match(renderStateGraph(production), /过账/u)
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
      renderStateGraph({
        ...salesOrder,
        transitions: [
          ...salesOrder.transitions,
          { ...salesOrder.transitions[0], key: 'unknown-endpoint', from: 'missing-state' },
        ],
      }),
    /Unknown business graph endpoint/u
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

test('state diagrams retain disconnected states, terminals and every registered transition', () => {
  for (const source of DEV_FLOW_STATE_CATALOG.flows) {
    const model = buildDevFlowStateRuleGraph(source)
    const graph = buildBusinessFlowMermaid(model)
    assert.deepEqual(graph.nodes.map((node) => node.key), source.states.map((state) => state.key))
    assert.deepEqual(graph.edges.map(({ from, to }) => [from, to]), source.transitions.map(({ from, to }) => [from, to]))
    assert.deepEqual(model.nodes.filter((node) => node.kind === 'terminal').map((node) => node.key).sort(), [...source.terminalStates].sort())
  }
})
