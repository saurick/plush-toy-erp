import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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
import {
  DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS,
  DEV_BUSINESS_CHAIN_EVIDENCE_MODES,
  DEV_BUSINESS_CHAIN_SCENARIO_KINDS,
} from './devBusinessChainStepContracts.mjs'
import { yoyoosunRoleFlowMatrix } from '../../../../config/customers/yoyoosun/roleFlowMatrix.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

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
  'purchase_posting_corrections',
]

test('business chain catalog covers every business machine and process variant', () => {
  const catalog = DEV_FLOW_STATE_CATALOG
  assert.deepEqual(
    catalog.businessChains.map((item) => item.key),
    EXPECTED_CHAIN_KEYS
  )
  assert.equal(catalog.businessChainCoverage.complete, true)
  assert.equal(catalog.businessChainCoverage.chainCount, 11)
  assert.equal(catalog.businessChainCoverage.overviewComplete, true)
  assert.equal(catalog.businessChainCoverage.overviewKey, 'all')
  assert.equal(catalog.businessChainCoverage.overviewLaneCount, 4)
  assert.equal(catalog.businessChainCoverage.overviewRelationCount, 13)
  assert.deepEqual(
    new Set(catalog.businessChainCoverage.overviewChainKeys),
    new Set(EXPECTED_CHAIN_KEYS)
  )
  assert.equal(catalog.businessChainCoverage.requiredMachineKeys.length, 27)
  assert.equal(catalog.businessChainCoverage.coveredMachineKeys.length, 27)
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
      assert.ok(
        existsSync(resolve(repoRoot, sourceRef)),
        `${relation.key} missing ${sourceRef}`
      )
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
          existsSync(resolve(repoRoot, sourceRef)),
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

test('business chain steps bind formal responsibility, state, action, process, Fact, and registered scenarios', () => {
  const flowByKey = new Map(
    DEV_FLOW_STATE_CATALOG.flows.map((flow) => [flow.key, flow])
  )
  const processByKey = new Map(
    processDefinitions.map((definition) => [definition.key, definition])
  )
  const factKeys = new Set(
    DEV_FLOW_STATE_CATALOG.factDefinitions.map(
      (definition) => definition.factKey
    )
  )
  const roleProfiles = yoyoosunRoleFlowMatrix.roles

  assert.equal(DEV_FLOW_STATE_CATALOG.businessChainCoverage.stepCount, 67)
  assert.equal(DEV_FLOW_STATE_CATALOG.businessChainCoverage.scenarioCount, 66)
  assert.equal(
    DEV_FLOW_STATE_CATALOG.businessChainCoverage.stepContractComplete,
    true
  )
  assert.equal(
    DEV_FLOW_STATE_CATALOG.businessChainCoverage.scenarioContractComplete,
    true
  )

  for (const chain of DEV_FLOW_STATE_CATALOG.businessChains) {
    assert.equal(chain.steps.length, chain.edges.length, chain.key)
    assert.deepEqual(
      chain.acceptanceScenarios.map((scenario) => scenario.kind),
      DEV_BUSINESS_CHAIN_SCENARIO_KINDS,
      `${chain.key} scenario kinds`
    )

    const edgeKeys = new Set(chain.edges.map((edge) => edge.key))
    for (const step of chain.steps) {
      assert(edgeKeys.has(step.edgeKey), `${chain.key}/${step.key}`)
      assert.equal(step.readOnly, true, `${chain.key}/${step.key}`)
      assert.equal(
        step.allowsActionExecution,
        false,
        `${chain.key}/${step.key}`
      )
      assert(step.actionRefs.length > 0, `${chain.key}/${step.key} actions`)
      assert(step.scenarioKeys.length > 0, `${chain.key}/${step.key} scenarios`)
      assert(
        step.preconditionStateRefs.length > 0 ||
          step.resultStateRefs.length > 0 ||
          step.processNodeRefs.length > 0 ||
          step.factKeys.length > 0,
        `${chain.key}/${step.key} bindings`
      )
      for (const ref of step.stateTransitionRefs) {
        const flow = flowByKey.get(ref.machineKey)
        assert(flow, `${chain.key}/${step.key}/${ref.machineKey}`)
        assert(
          flow.transitions.some(
            (transition) => transition.key === ref.transitionKey
          ),
          `${chain.key}/${step.key}/${ref.transitionKey}`
        )
      }
      for (const ref of step.processNodeRefs) {
        const definition = processByKey.get(ref.processDefinitionKey)
        assert(
          definition,
          `${chain.key}/${step.key}/${ref.processDefinitionKey}`
        )
        assert(
          definition.nodes.some((node) => node.key === ref.nodeKey),
          `${chain.key}/${step.key}/${ref.nodeKey}`
        )
      }
      step.factKeys.forEach((factKey) =>
        assert(factKeys.has(factKey), `${chain.key}/${step.key}/${factKey}`)
      )
      if (step.responsibility.mode === 'human') {
        assert(
          step.responsibility.ownerPoolKeys.length > 0 ||
            step.responsibility.capabilityKeys.length > 0,
          `${chain.key}/${step.key} human responsibility`
        )
        const matchingRoles = roleProfiles.filter(
          (role) =>
            role.ownerPools.some((key) =>
              step.responsibility.ownerPoolKeys.includes(key)
            ) ||
            role.capabilityKeys.some((key) =>
              step.responsibility.capabilityKeys.includes(key)
            )
        )
        assert(
          matchingRoles.length > 0,
          `${chain.key}/${step.key} has no yoyoosun role projection`
        )
      }
    }

    for (const scenario of chain.acceptanceScenarios) {
      assert.equal(scenario.readOnly, true, scenario.key)
      assert.equal(scenario.allowsActionExecution, false, scenario.key)
      assert(scenario.stepKeys.length > 0, `${scenario.key} steps`)
      assert(
        scenario.stepKeys.every((key) => edgeKeys.has(key)),
        `${scenario.key} step coverage`
      )
      assert(
        scenario.evidenceModes.every((mode) =>
          DEV_BUSINESS_CHAIN_EVIDENCE_MODES.includes(mode)
        ),
        `${scenario.key} evidence modes`
      )
      assert(
        scenario.dataStageKeys.every((key) =>
          DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS.includes(key)
        ),
        `${scenario.key} data stages`
      )
      if (
        scenario.responsibilityRefs.some(
          (responsibility) => responsibility.mode === 'human'
        )
      ) {
        assert(
          scenario.dataStageKeys.includes('role'),
          `${scenario.key} human role stage`
        )
      }
      if (
        ['unauthorized', 'wrong_state', 'idempotency'].includes(scenario.kind)
      ) {
        assert.equal(scenario.stepKeys.length, 1, scenario.key)
      }
    }
  }
})

test('production exception chain keeps the decision as a source document and exposes every approved or rejected branch', () => {
  const chain = DEV_FLOW_STATE_CATALOG.businessChains.find(
    (item) => item.key === 'production_exception'
  )
  const decision = chain.nodes.find(
    (node) => node.key === 'production_exception_decision'
  )
  const execution = chain.nodes.find(
    (node) => node.key === 'production_exception_execution'
  )
  const branchLabels = chain.edges
    .filter((edge) => edge.from === 'production_exception_task')
    .map((edge) => edge.label)

  assert.equal(decision.layer, 'source_document')
  assert.deepEqual(decision.factKeys, [])
  assert.equal(execution.layer, 'source_document')
  assert.deepEqual(execution.factKeys, [])
  assert.deepEqual(decision.machineKeys, [
    'source.production_exception_decision',
  ])
  assert.deepEqual(execution.machineKeys, [
    'source.production_exception_execution',
  ])
  assert.deepEqual(branchLabels, [
    '拒绝或取消后结束，不进入执行',
    '批准超领额度，转正常领料路径使用',
    '批准报废或在制让步后创建执行任务',
  ])
  assert(
    chain.nodes.some(
      (node) => node.key === 'production_exception_execution_task'
    )
  )
  assert(
    chain.edges.some(
      (edge) =>
        edge.from === 'production_exception_execution_task' &&
        edge.to === 'production_exception_execution'
    )
  )
  assert(
    chain.edges.some(
      (edge) =>
        edge.from === 'production_exception_over_issue' &&
        edge.to === 'affected_production_fact' &&
        edge.factBoundary === 'later_material_issue_fact_only'
    )
  )
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
})
