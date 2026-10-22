import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentChain, buildFulfillmentChainWires, fulfillmentChainColumns } from './devFulfillmentChain.mjs'
import { fulfillmentWireCollisions } from '../../../scripts/style-l1/fulfillmentChainAssertions.mjs'

test('the chain retains all canonical positions and keeps payments conditional', () => {
  const chain = buildFulfillmentChain()
  assert.deepEqual(chain.phases.flatMap((phase) => phase.entries).map(({ step }) => step), catalog.fulfillment_flow)
  assert.deepEqual(chain.conditionalEdges, [{ from: 'sales_order', to: 'customer_advance' }, { from: 'purchasing', to: 'supplier_advance' }])
  assert(chain.readingEdges.every((edge) => !['customer_advance', 'supplier_advance'].includes(edge.from) && !['customer_advance', 'supplier_advance'].includes(edge.to)))
  assert.deepEqual([fulfillmentChainColumns(1400), fulfillmentChainColumns(600), fulfillmentChainColumns(320)], [6, 3, 2])
  assert.deepEqual(buildFulfillmentChainWires(chain, {}).paths, [])
})

test('reading and conditional wires avoid normal and exception buttons across density and responsive changes', () => {
  const chain = buildFulfillmentChain()
  for (const columns of [2, 3, 6]) {
    for (const offset of [28, 44]) {
      let y = 40
      const stages = {}
      const buttons = []
      for (const phase of chain.phases) {
        for (const [i, { step }] of phase.entries.entries()) {
          const box = { x: 22 + i % columns * 124, y: y + Math.floor(i / columns) * 166 + (step.branch ? offset : 0), width: 106, height: 64 }
          stages[step.stage] = box
          buttons.push({ key: `${step.stage}:exception`, x: box.x + 26, y: box.y + 76, width: 54, height: 32 })
        }
        y += Math.ceil(phase.entries.length / columns) * 166 + 50
      }
      const { paths } = buildFulfillmentChainWires(chain, { width: columns * 124 + 26, height: y, stages })
      const boxes = [...Object.entries(stages).map(([key, box]) => ({ key, ...box })), ...buttons]
      assert(paths.every((path) => !/NaN|Infinity/.test(path.d)))
      for (const path of paths) {
        const edge = [...chain.readingEdges, ...chain.conditionalEdges].find((item) => path.key === `${item.from}:${item.to}` || path.key === `conditional:${item.to}`)
        assert.deepEqual(fulfillmentWireCollisions({ boxes, paths: [path], source: edge.from, target: edge.to }), [], `${columns}/${offset}/${path.key}`)
      }
    }
  }
})
