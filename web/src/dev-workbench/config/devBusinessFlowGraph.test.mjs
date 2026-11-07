import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import { WorkflowTaskDiscoveryCatalog as tasks } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentExceptionGraph } from './devFulfillmentExceptionGraph.mjs'
import { buildFulfillmentSubflow } from './devFulfillmentSubflow.mjs'
import { buildBusinessFlowMermaid, splitBusinessFlowForPrint } from '../../common/components/markdown/mermaidGraph.mjs'
import { buildFulfillmentOverview } from './devFulfillmentPresentation.mjs'
import { buildMasterLifecycleGraph, buildFactRuleGraph } from './devBusinessRuleGraphs.mjs'

const graphs = [
  ...catalog.businessChains,
  ...catalog.processDefinitions,
  ...tasks.fulfillment_flow.map(buildFulfillmentSubflow).filter(Boolean),
  ...tasks.exception_guides.flatMap((guide) => guide.plans.flatMap((plan) => [null, ...guide.entry_stages].map((originStage) => buildFulfillmentExceptionGraph(guide, { planKey: plan.key, originStage, overview: !originStage })))),
]

test('paper parts retain every relationship and isolated node without inventing links', () => {
  for (const flow of [...graphs, { nodes: [{ key: 'a', label: '独立分类' }, { key: 'b', label: '另一分类' }], edges: [] }]) {
    const parts = splitBusinessFlowForPrint(flow)
    const relationships = (edges) => edges.map(({ from, to, label, condition }) => JSON.stringify([from, to, label, condition])).sort()
    assert.deepEqual(relationships(parts.flatMap((part) => part.edges)), relationships(flow.edges))
    assert.deepEqual([...new Set(parts.flatMap((part) => part.nodes.map((node) => node.key)))].sort(), flow.nodes.map((node) => node.key).sort())
    for (const part of parts) {
      assert(part.edges.length <= 3)
      assert(part.nodes.length <= 6)
      buildBusinessFlowMermaid(part)
    }
  }
  assert.throws(() => splitBusinessFlowForPrint(graphs[0], 0), /positive/u)
})

test('the installed Mermaid parser preserves every registered node and edge', async () => {
  const window = new Window()
  Object.assign(globalThis, { window, document: window.document, Element: window.Element, SVGElement: window.SVGElement })
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    for (const flow of graphs) {
      const graph = buildBusinessFlowMermaid(flow)
      const parsed = await mermaid.mermaidAPI.getDiagramFromText(graph.chart)
      assert.equal(parsed.db.getVertices().size, flow.nodes.length)
      assert.equal(parsed.db.getEdges().length, flow.edges.length)
    }
  } finally { await window.happyDOM.close() }
})

test('all registered relationships survive Mermaid projection including cycles and branches', () => {
  for (const flow of graphs) {
    const graph = buildBusinessFlowMermaid(flow)
    assert.equal(graph.nodes.length, flow.nodes.length)
    assert.equal(graph.edges.length, flow.edges.length)
    assert.equal((graph.chart.match(/^ {2}N\d+ E\d+@/gm) || []).length, flow.edges.length)
    assert.deepEqual(graph.nodes.map((node) => node.key), flow.nodes.map((node) => node.key))
    for (const [index, edge] of flow.edges.entries()) {
      assert.equal(graph.edges[index].from, edge.from)
      assert.equal(graph.edges[index].to, edge.to)
      assert.equal(graph.edges[index].description, edge.condition || edge.label || '')
    }
    const reversed = buildBusinessFlowMermaid({ ...flow, nodes: [...flow.nodes].reverse(), edges: [...flow.edges].reverse() })
    const relationships = (value) => value.edges.map(({ from, to, description }) => [from, to, description].join(':')).sort()
    assert.deepEqual(relationships(graph), relationships(reversed))
  }
})

test('terminal original scrap and rejection remain disconnected from the success path', () => {
  const guide = tasks.exception_guides.find((item) => item.key === 'production_quality')
  for (const originStage of guide.entry_stages) {
    const graph = buildBusinessFlowMermaid(buildFulfillmentExceptionGraph(guide, { planKey: 'remake', originStage }))
    assert(!graph.edges.some((edge) => edge.from === 'end:original'))
    assert(graph.edges.some((edge) => edge.from === 'main:reentry' && edge.to === 'issue'))
  }
  const shipping = buildBusinessFlowMermaid(catalog.businessChains.find((flow) => flow.key === 'delivery_to_settlement'))
  assert(!shipping.edges.some((edge) => edge.from === 'shipment_rejected'))
  assert(shipping.edges.some((edge) => edge.from === 'shipment_release_task' && edge.to === 'shipment_rejected'))
})

test('unsafe labels and business keys cannot inject diagram syntax; invalid relations fail closed', () => {
  const graph = buildBusinessFlowMermaid({ nodes: [{ key: 'a\\nclick A callback', label: '材料"<script>\\n#35;|%' }, { key: 'b', label: '停用' }], edges: [{ from: 'a\\nclick A callback', to: 'b', label: '检查"|条件' }] })
  assert(!graph.chart.includes('<script>'))
  assert(!graph.chart.includes('click A callback'))
  assert(graph.chart.replaceAll('<br/>', '').includes('#34;#60;script#62;'))
  assert.match(graph.chart, /N0 E0@-->/u)
  assert.throws(() => buildBusinessFlowMermaid({ nodes: [{ key: 'a' }], edges: [{ from: 'a', to: 'missing' }] }), /endpoint/u)
  assert.throws(() => buildBusinessFlowMermaid({ nodes: [{ key: 'a' }, { key: 'a' }], edges: [] }), /Duplicate/u)
  assert.throws(() => buildBusinessFlowMermaid({ nodes: [{ key: 'a' }], edges: [], groups: [{ label: '错误分组', nodeKeys: ['missing'] }] }), /group member/u)
})

test('wrapped diagram labels preserve complete text and grapheme clusters', () => {
  const label = '生产执行、成品入库与包装👨‍👩‍👧‍👦e\u0301'
  const condition = '质量条件满足后确认包装用料'
  const graph = buildBusinessFlowMermaid({
    nodes: [{ key: 'source', label }, { key: 'result', label: '查货与包装' }],
    edges: [{ from: 'source', to: 'result', label: condition }],
  })
  assert(graph.chart.includes('<br/>'))
  assert(graph.chart.replaceAll('<br/>', '').includes(label))
  assert(graph.chart.replaceAll('<br/>', '').includes(condition))
  assert.equal(graph.nodes[0].label, label)
  assert.equal(graph.edges[0].description, condition)
  assert(graph.chart.includes('👨‍👩‍👧‍👦'))
  assert(graph.chart.includes('e\u0301'))
})

test('missing rule diagrams derive conditions and corrections from their selected source', () => {
  const lifecycle = catalog.flows.find((flow) => flow.key === 'master.lifecycle')
  for (const rule of lifecycle.lifecycleRules) {
    const graph = buildMasterLifecycleGraph(rule)
    assert(graph.edges.find((edge) => edge.label === '停用').condition.includes(rule.blocked))
    assert.equal(graph.edges.find((edge) => edge.label === '重新启用').condition, rule.recovery)
    assert.equal(graph.nodes.find((node) => node.key === 'inactive').summary, rule.effect)
    assert(graph.nodes.some((node) => node.key === 'history'))
    buildBusinessFlowMermaid(graph)
  }
  for (const fact of catalog.factDefinitions) {
    const graph = buildFactRuleGraph(fact)
    assert.equal(graph.nodes.find((node) => node.key === 'source').summary, fact.sourceDocument)
    assert.equal(graph.edges.find((edge) => edge.to === 'correction').condition, fact.correction)
    assert.equal(graph.edges.find((edge) => edge.to === 'fact').condition, fact.occurrenceCondition)
    buildBusinessFlowMermaid(graph)
  }
  for (const flow of catalog.flows.filter((item) => item.kind === 'taxonomy' || item.kind === 'projection')) {
    if (flow.key === 'master.lifecycle') continue
    const graph = buildBusinessFlowMermaid({ nodes: flow.states, edges: flow.transitions })
    assert.equal(graph.nodes.length, flow.states.length)
    assert.equal(graph.edges.length, 0, `${flow.label}不补造分类之间的流转`)
  }
})

test('new registered fulfillment stages remain visible without invented sequential dependencies', () => {
  const groups = buildFulfillmentOverview([...tasks.fulfillment_flow, { stage: 'new_registered_stage', label: '新增环节', role_keys: [] }])
  assert.equal(groups.at(-1).key, 'unclassified')
  assert.equal(groups.at(-1).stages[0].label, '新增环节')
})
