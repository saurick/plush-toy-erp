import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentChain, buildFulfillmentPhaseGraph } from './devFulfillmentChain.mjs'
import { buildBusinessFlowMermaid } from '../../common/components/markdown/mermaidGraph.mjs'

test('the chain retains all canonical positions and keeps payments conditional', () => {
  const chain = buildFulfillmentChain()
  assert.deepEqual(chain.phases.flatMap((phase) => phase.entries).map(({ step }) => step), catalog.fulfillment_flow)
  assert.deepEqual(chain.conditionalEdges, [{ from: 'sales_order', to: 'customer_advance' }, { from: 'purchasing', to: 'supplier_advance' }])
  assert(chain.readingEdges.every((edge) => !['customer_advance', 'supplier_advance'].includes(edge.from) && !['customer_advance', 'supplier_advance'].includes(edge.to)))
})

test('phase diagrams retain every stage, conditional relationship and canonical selection identity', () => {
  const chain = buildFulfillmentChain()
  const projected = chain.phases.map((phase) => buildFulfillmentPhaseGraph(phase, chain, { selectedStage: 'sales_order', detailID: 'detail' }))
  assert.deepEqual(projected.flatMap((graph) => graph.nodes).map((node) => node.key), catalog.fulfillment_flow.map((step) => step.stage))
  const nodes = projected.flatMap((graph) => graph.nodes)
  assert.equal(nodes.filter((node) => node.expanded).length, 1)
  assert.equal(nodes.find((node) => node.key === 'sales_order').controls, 'detail')
  for (const graph of projected) {
    const mermaid = buildBusinessFlowMermaid(graph)
    assert.equal(mermaid.nodes.length, graph.nodes.length)
    assert(mermaid.nodes.every((node) => node.data['chain-stage'] === node.key && node.data['fulfillment-stage'] === node.key))
    for (const edge of graph.edges) assert(graph.nodes.some((node) => node.key === edge.from) && graph.nodes.some((node) => node.key === edge.to))
  }
  assert.deepEqual(projected.flatMap((graph) => graph.edges).filter((edge) => edge.branch).map(({ from, to }) => ({ from, to })), chain.conditionalEdges)
})
