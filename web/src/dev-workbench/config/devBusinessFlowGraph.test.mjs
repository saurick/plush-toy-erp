import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import { WorkflowTaskDiscoveryCatalog as tasks } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentExceptionGraph } from './devFulfillmentExceptionGraph.mjs'
import { buildFulfillmentSubflow } from './devFulfillmentSubflow.mjs'
import {
  buildBusinessFlowLayout,
  buildBusinessFlowWires,
} from './devBusinessFlowGraph.mjs'
import { buildFulfillmentOverview } from './devFulfillmentPresentation.mjs'

test('business graph ordering follows dependencies independently of declaration order', () => {
  const graphs = [
    ...catalog.businessChains,
    ...catalog.processDefinitions.map((flow) => ({ ...flow, entryNodeKeys: [flow.initial] })),
    ...tasks.fulfillment_flow.map(buildFulfillmentSubflow).filter(Boolean),
    ...tasks.exception_guides.flatMap((guide) =>
      guide.plans.flatMap((plan) =>
        [null, ...guide.entry_stages].map((originStage) =>
          buildFulfillmentExceptionGraph(guide, {
            planKey: plan.key,
            originStage,
            overview: !originStage,
          })
        )
      )
    ),
  ]
  for (const graph of graphs) {
    const a = buildBusinessFlowLayout(graph)
    const b = buildBusinessFlowLayout({
      ...graph,
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
    })
    assert.deepEqual([...a.ranks].sort(), [...b.ranks].sort())
    for (const edge of a.edges) {
      if (!a.cycles.has(edge.key)) {
        assert(a.ranks.get(edge.from) < a.ranks.get(edge.to))
      }
    }
  }
})
test('remake enters the registered new-batch path before material issue, while original scrap stays terminal', () => {
  const guide = tasks.exception_guides.find(
    (g) => g.key === 'production_quality'
  )
  for (const originStage of guide.entry_stages) {
    const graph = buildFulfillmentExceptionGraph(guide, {
      planKey: 'remake',
      originStage,
    })
    const layout = buildBusinessFlowLayout(graph)
    assert(layout.ranks.get('main:reentry') < layout.ranks.get('issue'))
    assert(!graph.edges.some((e) => e.from === 'end:original'))
  }
  const shipping = catalog.businessChains.find(
    (c) => c.key === 'delivery_to_settlement'
  )
  assert(!shipping.edges.some((e) => e.from === 'shipment_rejected'))
  assert(
    shipping.edges.some(
      (e) => e.from === 'shipment_release_task' && e.to === 'shipment_rejected'
    )
  )
  const production = catalog.businessChains.find(
    (c) => c.key === 'production_exception'
  )
  assert(!production.edges.some((e) => e.from === 'scrapped_wip'))
  assert(production.nodes.find((n) => n.key === 'scrapped_wip').terminal)
})
test('graph validation fails closed and measured conditions determine routing', () => {
  assert.throws(
    () =>
      buildBusinessFlowLayout({
        nodes: [{ key: 'a' }],
        edges: [{ from: 'a', to: 'missing' }],
      }),
    /endpoint/
  )
  const layout = buildBusinessFlowLayout({
    nodes: [{ key: 'a' }, { key: 'b' }],
    edges: [{ from: 'a', to: 'b', label: '全部条件满足后' }],
  })
  const { key } = layout.edges[0]
  const paths = buildBusinessFlowWires(layout, {
    width: 400,
    nodes: {
      a: { x: 100, y: 20, width: 160, height: 66 },
      b: { x: 100, y: 180, width: 160, height: 66 },
    },
    labels: { [key]: { x: 100, y: 120, width: 160, height: 30 } },
  })
  assert.equal(paths.length, 1)
  assert.equal(paths[0].label, '全部条件满足后')
  assert(!paths[0].d.includes('NaN'))
})
test('new registered fulfillment stages remain visible without invented sequential dependencies', () => {
  const groups = buildFulfillmentOverview([
    ...tasks.fulfillment_flow,
    { stage: 'new_registered_stage', label: '新增环节', role_keys: [] },
  ])
  assert.equal(groups.at(-1).key, 'unclassified')
  assert.equal(groups.at(-1).stages[0].label, '新增环节')
})
