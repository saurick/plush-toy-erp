import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentChain, buildFulfillmentChainWires, fulfillmentChainColumns, fulfillmentChainInsertion } from './devFulfillmentChain.mjs'
import { fulfillmentWireCollisions } from '../../../scripts/style-l1/fulfillmentChainAssertions.mjs'

const make = (guide, plan, origin) => buildFulfillmentChain({ exceptionKey: guide, planKey: plan, originStage: origin })

test('the integrated chain retains all 17 canonical positions and keeps payments conditional', () => {
  const chain = buildFulfillmentChain()
  const entries = chain.phases.flatMap((phase) => phase.entries)
  assert.deepEqual(entries.map(({ step }) => step.stage), catalog.fulfillment_flow.map((stage) => stage.stage))
  entries.forEach((entry, index) => assert.equal(entry.step, catalog.fulfillment_flow[index]))
  assert.deepEqual(chain.conditionalEdges, [{ from: 'sales_order', to: 'customer_advance' }, { from: 'purchasing', to: 'supplier_advance' }])
  assert(chain.readingEdges.every((edge) => !['customer_advance', 'supplier_advance'].includes(edge.from) && !['customer_advance', 'supplier_advance'].includes(edge.to)))
  const production = chain.phases[1].entries
  assert.equal(fulfillmentChainInsertion(production, 'cutting_quality', 6), 5)
  assert.equal(fulfillmentChainInsertion(production, 'cutting_quality', 3), 2)
  assert.equal(fulfillmentChainInsertion(production, 'cutting_quality', 2), 3)
  assert.equal(fulfillmentChainInsertion(production, 'incoming_quality', 2), -1)
  assert.deepEqual([fulfillmentChainColumns(1400), fulfillmentChainColumns(600), fulfillmentChainColumns(320)], [6, 3, 2])
})

test('return wires target real main nodes while remake separates original termination and new batch reentry', () => {
  const rework = make('production_quality', 'original_rework', 'shell_quality').exception
  assert.equal(rework.resume.stage, 'shell_quality')
  assert.equal(rework.terminal, null)
  const remake = make('production_quality', 'remake', 'finished_quality').exception
  assert.equal(remake.resume.stage, 'cutting_issue')
  assert.equal(remake.terminal.key, 'end:original')
  assert.deepEqual(remake.repeat, catalog.fulfillment_flow.slice(6, 14).map((stage) => stage.stage))
  assert.deepEqual(remake.branchSteps.map((step) => step.key), ['inspect', 'propose', 'approval', 'execute'])
  assert.equal(make('production_quality', 'scrap', 'cutting_quality').exception.resume, null)
  assert.equal(make('production_quality', 'concession', 'cutting_quality').exception.resume.stage, 'sewing_execute')
  assert.equal(make('purchase_rejection', 'replacement', 'incoming_quality').exception.resume.stage, 'purchase_count')
  assert.deepEqual(make('purchase_rejection', 'replacement', 'incoming_quality').exception.repeat, ['purchase_count', 'incoming_quality'])
  assert.equal(make('posted_purchase', 'adjust', 'incoming_quality').exception.resume.stage, 'incoming_quality')
  assert.equal(make('finance_settlement', 'allocation', 'customer_advance').exception.resume.stage, 'financial_settlement')
})

test('unknown selections and independent flows cannot acquire fabricated main-chain connections', () => {
  assert(make('unknown', '', '').exception.invalid)
  assert(make('purchase_rejection', 'scrap', 'incoming_quality').exception.invalid)
  assert(make('production_quality', 'scrap', 'sales_order').exception.invalid)
  for (const guide of ['over_issue', 'outsourcing_rejection']) {
    const chain = make(guide)
    assert.equal(chain.exception.origin, null)
    assert.equal(chain.exception.resume, null)
    assert.equal(chain.phases.flatMap((phase) => phase.entries).length, 17)
  }
  assert.deepEqual(buildFulfillmentChainWires(buildFulfillmentChain(), {}).paths, [])
})

test('replacement reentry avoids the earlier order, purchase and offset payment boxes', () => {
  const keys = ['sales_order', 'customer_advance', 'purchasing', 'supplier_advance', 'purchase_count', 'incoming_quality']
  const stages = Object.fromEntries(keys.map((key, index) => [key, { x: 22 + index * 110, y: [1, 3].includes(index) ? 94 : 50, width: 94, height: 88 }]))
  const chain = make('purchase_rejection', 'replacement', 'incoming_quality')
  const geometry = { width: 720, height: 500, stages, lane: { x: 22, y: 220, width: 676, height: 198 }, workHeight: 74 }
  const { paths } = buildFulfillmentChainWires(chain, geometry)
  const boxes = Object.entries(stages).map(([key, rect]) => ({ key, ...rect }))
  const original = [{ key: 'old-reentry', d: 'M 500 337 H 7 V 94 H 459' }]
  assert(fulfillmentWireCollisions({ boxes, paths: original, source: 'incoming_quality', target: 'purchase_count' }).length > 0, 'the fixture detects the obstructed route')
  assert.deepEqual(fulfillmentWireCollisions({ boxes, paths: paths.filter((path) => path.kind === 'branch'), source: 'incoming_quality', target: 'purchase_count' }), [])
})

test('all registered exception schemes use measured anchors, preserve the catalog, and fit narrow geometry', () => {
  const before = JSON.stringify(catalog)
  for (const guide of catalog.exception_guides) {
    for (const plan of guide.plans) {
      for (const origin of guide.entry_stages.length ? guide.entry_stages : [null]) {
        const chain = make(guide.key, plan.key, origin)
        const graph = chain.exception
        for (const width of [240, 320, 736, 1600]) {
          const stages = Object.fromEntries(catalog.fulfillment_flow.map((stage, index) => [stage.stage, { x: 24, y: index * 110 + 10, width: 84, height: 88 }]))
          const originY = graph.origin ? stages[graph.origin.stage].y : 0
          const geometry = { width, height: 2200, stages, lane: { x: 22, y: originY + 105, width: width - 44, height: 220 }, workHeight: width <= 320 ? 110 : 74, terminalHeight: width <= 320 ? 60 : 40 }
          const wires = buildFulfillmentChainWires(chain, geometry)
          assert(wires.paths.every((wire) => !/NaN|Infinity/u.test(wire.d)))
          const returned = wires.paths.find((wire) => wire.key === 'exception-return')
          assert.equal(returned?.to, graph.resume?.stage)
          const outbound = wires.paths.find((wire) => wire.key === 'exception-out')
          assert.equal(outbound?.from, graph.origin?.stage)
          if (plan.continuation.kind === 'stop') assert.equal(returned, undefined)
          for (const label of wires.labels) {
            assert(label.x >= 0 && label.x + label.width <= width, `${guide.key}/${plan.key}/${width}`)
          }
          if (graph.terminal && graph.origin) {
            assert(wires.placement.left + wires.placement.width < geometry.lane.width - wires.placement.terminalWidth - 4)
            const terminal = wires.paths.find((wire) => wire.key === 'exception-terminal')
            const endpoint = terminal.d.match(/V ([-\d.]+) H ([-\d.]+)$/u)
            assert(endpoint, 'wrapped cards use a terminal-centered return leg')
            assert.equal(Number(endpoint[1]), geometry.lane.y + 97 + geometry.terminalHeight / 2)
            assert(Math.abs(Number(endpoint[2]) - (geometry.lane.x + geometry.lane.width - wires.placement.terminalWidth - 7)) < 0.1)
          }
        }
      }
    }
  }
  assert.equal(JSON.stringify(catalog), before)
})
