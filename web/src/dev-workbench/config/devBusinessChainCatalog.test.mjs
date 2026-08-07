import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  DEV_BUSINESS_CHAIN_CROSS_CUTTING_EXCLUSIONS,
  DEV_BUSINESS_CHAIN_EDGE_KINDS,
  DEV_BUSINESS_CHAIN_KINDS,
  DEV_BUSINESS_CHAIN_LAYERS,
  DEV_BUSINESS_CHAIN_OVERVIEW_KEY,
  DEV_BUSINESS_CHAIN_RELATION_KINDS,
  buildDevBusinessChainCatalog,
} from './devBusinessChainCatalog.mjs'
import {
  DEV_FLOW_STATE_CATALOG,
  processDefinitions,
} from './devFlowStateCatalog.mjs'

const EXPECTED_CHAIN_KEYS = [
  'sales_to_production',
  'purchase_to_inventory',
  'production_to_inventory',
  'outsourcing_to_inventory',
  'delivery_to_settlement',
  'finance_payment_and_reversal',
  'inventory_adjustment',
  'production_exception',
  'purchase_quality_disposition',
  'outsourcing_quality_disposition',
  'rework_return_and_reshipment',
  'purchase_posting_corrections',
]

test('business chain catalog covers every business machine and process variant', () => {
  const catalog = DEV_FLOW_STATE_CATALOG
  assert.deepEqual(
    catalog.businessChains.map((item) => item.key),
    EXPECTED_CHAIN_KEYS
  )
  assert.equal(catalog.businessChainCoverage.complete, true)
  assert.equal(catalog.businessChainCoverage.chainCount, 12)
  assert.equal(catalog.businessChainCoverage.overviewComplete, true)
  assert.equal(catalog.businessChainCoverage.overviewKey, 'all')
  assert.equal(catalog.businessChainCoverage.overviewLaneCount, 4)
  assert.equal(catalog.businessChainCoverage.overviewRelationCount, 16)
  assert.deepEqual(
    new Set(catalog.businessChainCoverage.overviewChainKeys),
    new Set(EXPECTED_CHAIN_KEYS)
  )
  assert.equal(catalog.businessChainCoverage.requiredMachineKeys.length, 28)
  assert.equal(catalog.businessChainCoverage.coveredMachineKeys.length, 28)
  assert.deepEqual(
    new Set(catalog.businessChainCoverage.requiredMachineKeys),
    new Set(catalog.businessChainCoverage.coveredMachineKeys)
  )
  assert.deepEqual(
    catalog.businessChainCoverage.excludedMachineKeys,
    Object.keys(DEV_BUSINESS_CHAIN_CROSS_CUTTING_EXCLUSIONS)
  )
  assert.equal(
    catalog.businessChainCoverage.requiredProcessDefinitionKeys.length,
    7
  )
  assert.deepEqual(
    new Set(catalog.businessChainCoverage.requiredProcessDefinitionKeys),
    new Set(catalog.businessChainCoverage.coveredProcessDefinitionKeys)
  )
  assert.deepEqual(
    new Set(catalog.businessChainCoverage.requiredFactKeys),
    new Set(catalog.businessChainCoverage.coveredFactKeys)
  )
  assert.deepEqual(DEV_BUSINESS_CHAIN_KINDS, [
    'primary',
    'supporting',
    'exception',
    'rework',
    'reversal',
  ])
  assert.deepEqual(DEV_BUSINESS_CHAIN_RELATION_KINDS, [
    'continues',
    'supplies',
    'branches_to',
    'returns_to',
    'corrects',
    'cross_cuts',
    'reworks',
  ])
})

test('business chain overview covers every real chain once with explicit read-only relations', () => {
  const overview = DEV_FLOW_STATE_CATALOG.businessChainOverview
  const chainKeys = new Set(EXPECTED_CHAIN_KEYS)
  const allowedRelationKinds = new Set(DEV_BUSINESS_CHAIN_RELATION_KINDS)

  assert.equal(overview.key, DEV_BUSINESS_CHAIN_OVERVIEW_KEY)
  assert.equal(overview.label, '全部业务链（设计总图）')
  assert.equal(overview.readOnly, true)
  assert.equal(overview.allowsActionExecution, false)
  assert.equal(overview.runtimeAuthority, 'design_projection_only')
  assert.deepEqual(new Set(overview.chainKeys), chainKeys)
  assert.equal(overview.chainKeys.length, EXPECTED_CHAIN_KEYS.length)
  assert.equal(new Set(overview.lanes.map((lane) => lane.key)).size, 4)
  assert.equal(
    overview.lanes.flatMap((lane) => lane.chainKeys).length,
    EXPECTED_CHAIN_KEYS.length
  )

  for (const lane of overview.lanes) {
    assert.equal(lane.readOnly, true, lane.key)
    assert.ok(lane.chainKeys.length > 0, lane.key)
    assert.ok(lane.sourceRefs.length > 0, lane.key)
  }
  assert.equal(
    new Set(overview.relations.map((relation) => relation.key)).size,
    overview.relations.length
  )
  for (const relation of overview.relations) {
    assert.equal(relation.readOnly, true, relation.key)
    assert.ok(chainKeys.has(relation.fromChainKey), relation.key)
    assert.ok(chainKeys.has(relation.toChainKey), relation.key)
    assert.notEqual(relation.fromChainKey, relation.toChainKey, relation.key)
    assert.ok(allowedRelationKinds.has(relation.kind), relation.key)
    assert.ok(relation.sourceRefs.length > 0, relation.key)
    relation.sourceRefs.forEach((sourceRef) => {
      assert.ok(existsSync(resolve(sourceRef)), `${relation.key} missing ${sourceRef}`)
    })
  }
})

test('business chain nodes and edges remain connected, read-only, and source-backed', () => {
  const allowedKinds = new Set(DEV_BUSINESS_CHAIN_KINDS)
  const allowedLayers = new Set(DEV_BUSINESS_CHAIN_LAYERS)
  const allowedEdgeKinds = new Set(DEV_BUSINESS_CHAIN_EDGE_KINDS)

  for (const chain of DEV_FLOW_STATE_CATALOG.businessChains) {
    assert.equal(chain.readOnly, true, chain.key)
    assert.equal(chain.allowsActionExecution, false, chain.key)
    assert.equal(chain.runtimeAuthority, 'design_projection_only', chain.key)
    assert.ok(allowedKinds.has(chain.kind), chain.key)

    const nodeKeys = new Set(chain.nodes.map((node) => node.key))
    assert.equal(nodeKeys.size, chain.nodes.length, chain.key)
    const reachable = new Set(chain.entryNodeKeys)
    const pending = [...chain.entryNodeKeys]
    while (pending.length > 0) {
      const currentNodeKey = pending.shift()
      for (const edge of chain.edges) {
        if (edge.from === currentNodeKey && !reachable.has(edge.to)) {
          reachable.add(edge.to)
          pending.push(edge.to)
        }
      }
    }
    assert.deepEqual(reachable, nodeKeys, `${chain.key} reachability`)

    for (const node of chain.nodes) {
      assert.equal(node.readOnly, true, `${chain.key}/${node.key}`)
      assert.ok(allowedLayers.has(node.layer), `${chain.key}/${node.key}`)
      assert.ok(node.sourceRefs.length > 0, `${chain.key}/${node.key}`)
      if (node.layer === 'fact_ledger') {
        assert.ok(
          node.factKeys.length > 0,
          `${chain.key}/${node.key} fact boundary`
        )
      }
      node.sourceRefs.forEach((sourceRef) => {
        assert.ok(
          existsSync(resolve(sourceRef)),
          `${chain.key}/${node.key} missing ${sourceRef}`
        )
      })
    }

    const edgeKeys = new Set(chain.edges.map((edge) => edge.key))
    assert.equal(edgeKeys.size, chain.edges.length, chain.key)
    for (const edge of chain.edges) {
      assert.equal(edge.readOnly, true, `${chain.key}/${edge.key}`)
      assert.ok(nodeKeys.has(edge.from), `${chain.key}/${edge.key}`)
      assert.ok(nodeKeys.has(edge.to), `${chain.key}/${edge.key}`)
      assert.ok(allowedEdgeKinds.has(edge.kind), `${chain.key}/${edge.key}`)
      assert.ok(edge.action, `${chain.key}/${edge.key} action`)
      assert.ok(edge.factBoundary, `${chain.key}/${edge.key} boundary`)
      assert.ok(edge.sourceRefs.length > 0, `${chain.key}/${edge.key}`)
    }
  }
})

test('business chain catalog fails closed when a state machine or process definition is uncovered', () => {
  assert.throws(
    () =>
      buildDevBusinessChainCatalog({
        flows: [
          ...DEV_FLOW_STATE_CATALOG.flows,
          { key: 'fact.unregistered_future_object' },
        ],
        processDefinitions,
        factDefinitions: DEV_FLOW_STATE_CATALOG.factDefinitions,
      }),
    /misses state machines: fact\.unregistered_future_object/u
  )

  assert.throws(
    () =>
      buildDevBusinessChainCatalog({
        flows: DEV_FLOW_STATE_CATALOG.flows,
        processDefinitions: [
          ...processDefinitions,
          {
            key: 'unregistered_process/unregistered_variant',
            processKey: 'unregistered_process',
          },
        ],
        factDefinitions: DEV_FLOW_STATE_CATALOG.factDefinitions,
      }),
    /misses process definitions: unregistered_process\/unregistered_variant/u
  )

  assert.throws(
    () =>
      buildDevBusinessChainCatalog({
        flows: DEV_FLOW_STATE_CATALOG.flows.filter(
          (flow) => flow.key !== 'fact.rework_intake'
        ),
        processDefinitions,
        factDefinitions: DEV_FLOW_STATE_CATALOG.factDefinitions,
      }),
    /references unknown state machines: fact\.rework_intake/u
  )
})
