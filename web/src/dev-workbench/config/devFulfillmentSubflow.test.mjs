import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { ROLE_DISPLAY_NAMES } from '../../erp/utils/roleKeys.mjs'
import { fulfillmentExceptionPath } from '../../erp/utils/workflowFulfillment.mjs'
import { buildFulfillmentSubflow, buildSubflowMermaid } from './devFulfillmentSubflow.mjs'

const step = (key) => catalog.fulfillment_flow.find((item) => item.stage === key)

test('complex stages have bounded subflows and simple counting keeps direct instructions', () => {
  assert.equal(catalog.fulfillment_flow.filter((item) => item.subflow).length, 15)
  assert.deepEqual(catalog.fulfillment_flow.filter((item) => !item.subflow).map((item) => item.stage), ['purchase_count', 'cutting_return'])
  for (const item of catalog.fulfillment_flow) {
    const flow = buildFulfillmentSubflow(item)
    if (!flow) continue
    assert(flow.nodes.length <= 12 && flow.edges.length <= 18, item.stage)
    for (const node of flow.nodes) {
      assert(node.details.length && node.details.every((detail) => detail.text), `${item.stage}/${node.key}`)
      for (const role of node.role_keys || []) assert(Object.hasOwn(ROLE_DISPLAY_NAMES, role), role)
    }
    const graph = buildSubflowMermaid(flow)
    assert.equal(new Set(graph.nodes.map((node) => node.id)).size, flow.nodes.length)
  }
})

test('approval, parallel preparation, internal work and outsourced work keep their boundaries', () => {
  const sales = buildFulfillmentSubflow(step('sales_order'))
  assert.deepEqual(sales.edges.filter((edge) => edge.from === 'prepare').map((edge) => edge.to), ['order_approval', 'engineering'])
  assert(sales.edges.some((edge) => edge.from === 'boss_review' && edge.to === 'finance_review'))
  assert(sales.edges.some((edge) => edge.from === 'finance_review' && edge.to === 'revise'))
  for (const key of ['sewing_execute', 'handwork_execute']) {
    const flow = buildFulfillmentSubflow(step(key))
    assert.deepEqual(flow.edges.filter((edge) => edge.from === 'route').map((edge) => edge.label), ['本厂', '委外'])
    assert(!flow.edges.some((edge) => edge.from === 'internal' && edge.to === 'contract'))
    assert(flow.edges.some((edge) => edge.from === 'return' && edge.to === 'next'))
  }
  const purchase = buildFulfillmentSubflow(step('purchasing'))
  assert(!purchase.edges.some((edge) => edge.from === 'generated' && edge.to === 'approval'), '用料生成单不重复审批')
  const shipping = buildFulfillmentSubflow(step('shipment'))
  assert(!shipping.edges.some((edge) => edge.from === 'approval' && edge.to === 'fact'), '放行不直接成为实际发货')
  assert(shipping.edges.some((edge) => edge.from === 'actual' && edge.to === 'fact'))
  const quality = buildFulfillmentSubflow(step('finished_quality'))
  assert(quality.edges.some((edge) => edge.to === 'customer' && edge.label === '订单要求时'))
  assert.match(quality.summary, /不固定.*先后顺序/u)
})

test('node details always read the existing handoff and approval text', () => {
  const original = step('shipment')
  const revised = { ...original, handoffs: [...original.handoffs] }
  revised.handoffs[1] = '本次变更后的正式交接说明'
  assert(buildFulfillmentSubflow(revised).nodes.find((node) => node.key === 'actual').details.some((detail) => detail.text === revised.handoffs[1]))
  assert.throws(() => buildFulfillmentSubflow({ ...original, handoffs: [] }), /Unknown subflow detail/u)
  assert.throws(() => buildSubflowMermaid({ nodes: [{ key: 'only', label: '唯一节点' }], edges: [{ from: 'only', to: 'missing' }] }), /Unknown subflow edge/u)
})

test('all normal and exception diagrams parse without inventing exception steps', async () => {
  const window = new Window()
  Object.assign(globalThis, { window, document: window.document, Element: window.Element, SVGElement: window.SVGElement })
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    const flows = catalog.fulfillment_flow.map(buildFulfillmentSubflow).filter(Boolean)
    for (const guide of catalog.exception_guides) {
      for (const plan of guide.plans) {
        const { steps } = fulfillmentExceptionPath(guide, plan.key)
        flows.push({ nodes: steps, edges: steps.slice(1).map((node, index) => ({ from: steps[index].key, to: node.key })) })
      }
    }
    for (const flow of flows) {
      const graph = buildSubflowMermaid(flow)
      const parsed = await mermaid.mermaidAPI.getDiagramFromText(graph.chart)
      assert.equal(parsed.db.getVertices().size, flow.nodes.length)
      assert.equal(parsed.db.getEdges().length, flow.edges.length)
    }
    const hostile = buildSubflowMermaid({ nodes: [{ key: 'safe', label: '"]; click N0 callback <script>alert(1)</script>' }], edges: [] })
    assert.equal((await mermaid.mermaidAPI.getDiagramFromText(hostile.chart)).db.getVertices().size, 1)
    assert.doesNotMatch(hostile.chart, /<script>/u)
  } finally {
    await window.happyDOM.close()
  }
})
