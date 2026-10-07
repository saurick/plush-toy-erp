import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
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

test('unposted rejected purchases have vendor-return and replacement paths, never posted-stock corrections', () => {
  const chain = DEV_FLOW_STATE_CATALOG.businessChains.find(
    (item) => item.key === 'purchase_quality_disposition'
  )
  assert(
    !chain.nodes.some(
      (node) =>
        node.machineKeys.includes('fact.purchase_return') ||
        node.machineKeys.includes('fact.purchase_receipt_adjustment')
    )
  )
  const branches = chain.edges.filter(
    (edge) => edge.from === 'purchase_disposition'
  )
  assert.deepEqual(
    branches.map((edge) => edge.to),
    ['vendor_return_result', 'replacement_receipt']
  )
  assert(
    branches.every(
      (edge) =>
        edge.action === 'InventoryUsecase.PostPurchaseRejectionDisposition' &&
        edge.condition
    )
  )
  const source = readFileSync(
    resolve(repoRoot, 'server/internal/biz/purchase_rejection_disposition.go'),
    'utf8'
  )
  assert.match(
    source,
    /PurchaseRejectionReturnToVendor\s*=\s*"RETURN_TO_VENDOR"/u
  )
  assert.match(source, /PurchaseRejectionReplace\s*=\s*"REPLACE"/u)
  const repository = readFileSync(
    resolve(
      repoRoot,
      'server/internal/data/purchase_rejection_disposition_repo.go'
    ),
    'utf8'
  )
  assert.match(
    repository,
    /receipt\.Status != biz\.PurchaseReceiptStatusDraft/u
  )
  assert.match(repository, /createPurchaseReplacementReceipt/u)
  assert(
    !chain.steps.some((step) => step.factKeys.includes('fact.inventory_lot'))
  )
})

test('normal purchase and outsourcing sources reach posted payables before payment allocation', () => {
  for (const prefix of ['purchase', 'outsourcing']) {
    const chain = DEV_FLOW_STATE_CATALOG.businessChains.find(
      (item) => item.key === `${prefix}_to_inventory`
    )
    const draft = chain.steps.find(
      (step) => step.toNodeKey === `${prefix}_payable_draft`
    )
    const posted = chain.steps.find(
      (step) => step.toNodeKey === `${prefix}_payable`
    )
    assert(draft.preconditionStateRefs.some((ref) => ref.stateKey === 'POSTED'))
    assert(
      draft.resultStateRefs.some(
        (ref) => ref.machineKey === 'fact.finance' && ref.stateKey === 'DRAFT'
      )
    )
    assert(
      posted.resultStateRefs.some(
        (ref) => ref.machineKey === 'fact.finance' && ref.stateKey === 'POSTED'
      )
    )
    assert(
      DEV_FLOW_STATE_CATALOG.businessChainOverview.relations.some(
        (edge) =>
          edge.fromChainKey === chain.key &&
          edge.toChainKey === 'finance_payment_and_reversal'
      )
    )
  }
})

test('allocation and credit have distinct partial and zero-balance outcomes', () => {
  const chain = DEV_FLOW_STATE_CATALOG.businessChains.find(
    (item) => item.key === 'finance_payment_and_reversal'
  )
  const allocation = chain.steps.find(
    (step) => step.toNodeKey === 'finance_allocation'
  )
  assert(!allocation.resultStateRefs.some((ref) => ref.stateKey === 'SETTLED'))
  for (const from of ['finance_allocation', 'finance_credit_note']) {
    const settled = chain.steps.find(
      (step) =>
        step.fromNodeKey === from && step.toNodeKey === 'settled_finance_fact'
    )
    const partial = chain.steps.find(
      (step) =>
        step.fromNodeKey === from &&
        step.key.includes(':derives:open_finance_fact')
    )
    assert.match(settled.condition, /金额为零/u)
    assert.match(partial.condition, /金额大于零/u)
    assert(partial.resultStateRefs.some((ref) => ref.stateKey === 'POSTED'))
  }
  const backend = readFileSync(
    resolve(
      repoRoot,
      'server/internal/data/operational_fact_finance_payment_repo.go'
    ),
    'utf8'
  )
  assert.match(backend, /if a\.Amount\.Equal\(outstanding\)/u)
  assert.match(
    backend,
    /settledAfterCredit := in\.Amount\.Equal\(outstanding\)/u
  )
})

test('approval and rejection have separate outcomes in source, inventory and shipment chains', () => {
  for (const key of [
    'sales_to_production',
    'purchase_to_inventory',
    'inventory_adjustment',
    'delivery_to_settlement',
  ]) {
    const chain = DEV_FLOW_STATE_CATALOG.businessChains.find(
      (item) => item.key === key
    )
    const rejected = chain.steps.filter((step) =>
      step.stateTransitionRefs.some(
        (ref) => ref.machineKey === 'workflow.task' && ref.to === 'rejected'
      )
    )
    assert.equal(rejected.length, 1, key)
    assert(
      !rejected[0].resultStateRefs.some((ref) =>
        ['active', 'approved', 'APPROVED', 'POSTED', 'SHIPPED'].includes(
          ref.stateKey
        )
      ),
      key
    )
    assert.match(rejected[0].condition, /拒绝/u)
    const edge = chain.edges.find((item) => item.key === rejected[0].edgeKey)
    assert(
      rejected[0].processNodeRefs.every((ref) => ref.actionKey === edge.action),
      key
    )
  }
})

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
  assert.equal(catalog.businessChainCoverage.overviewRelationCount, 16)
  assert.deepEqual(
    new Set(catalog.businessChainCoverage.overviewChainKeys),
    new Set(EXPECTED_CHAIN_KEYS)
  )
  assert.equal(catalog.businessChainCoverage.requiredMachineKeys.length, 29)
  assert.equal(catalog.businessChainCoverage.coveredMachineKeys.length, 29)
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
    const nodesByKey = new Map(chain.nodes.map((node) => [node.key, node]))
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
      if (edge.kind === 'creates_source') {
        assert.equal(
          nodesByKey.get(edge.to)?.layer,
          'source_document',
          `${chain.key}/${edge.key} source boundary`
        )
      }
      if (edge.kind === 'creates_fact_draft') {
        assert.equal(
          nodesByKey.get(edge.to)?.layer,
          'fact_ledger',
          `${chain.key}/${edge.key} fact draft boundary`
        )
      }
    }
  }
})

test('delivery creates receivable facts but leaves payment and reversal to the finance chain', () => {
  const delivery = DEV_FLOW_STATE_CATALOG.businessChains.find(
    (chain) => chain.key === 'delivery_to_settlement'
  )
  assert.ok(delivery)
  assert.deepEqual(
    delivery.nodes.map((node) => node.key),
    [
      'shipment_draft',
      'shipment_release_process',
      'shipment_release_task',
      'shipment_release',
      'shipped',
      'receivable_draft',
      'receivable',
      'shipment_cancelled',
    ]
  )
  const draft = delivery.steps.find(
    (step) => step.toNodeKey === 'receivable_draft'
  )
  const posted = delivery.steps.find((step) => step.toNodeKey === 'receivable')
  assert(
    draft.resultStateRefs.some(
      (ref) => ref.machineKey === 'fact.finance' && ref.stateKey === 'DRAFT'
    )
  )
  assert(!draft.resultStateRefs.some((ref) => ref.stateKey === 'POSTED'))
  assert(
    posted.resultStateRefs.some(
      (ref) => ref.machineKey === 'fact.finance' && ref.stateKey === 'POSTED'
    )
  )
  const source = readFileSync(
    resolve(repoRoot, 'server/internal/biz/operational_fact.go'),
    'utf8'
  )
  assert.match(source, /return repo\.CreateFinanceFactDraftFromShipment/u)
  assert.equal(
    delivery.nodes.some((node) =>
      ['payment', 'allocation', 'credit_note'].some((key) =>
        node.key.includes(key)
      )
    ),
    false
  )
  assert.ok(
    DEV_FLOW_STATE_CATALOG.businessChainOverview.relations.some(
      (relation) =>
        relation.fromChainKey === 'delivery_to_settlement' &&
        relation.toChainKey === 'finance_payment_and_reversal' &&
        relation.kind === 'continues'
    )
  )
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

  assert.equal(DEV_FLOW_STATE_CATALOG.businessChainCoverage.stepCount, 72)
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
