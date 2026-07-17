import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BUSINESS_FLOW_TYPES,
  BUSINESS_PAGE_AVAILABILITY,
  BUSINESS_PAGE_ROLES,
  WORKFLOW_TASK_PRODUCER_STATUS,
  businessPageFlowDefinitions,
  businessPageLineageDefinitions,
  getBusinessPageLineage,
} from './businessPageLineage.mjs'
import { businessModuleDefinitions } from './businessModules.mjs'

const formalModuleKeys = businessModuleDefinitions
  .filter((moduleItem) => moduleItem.pageKind === 'formal-v1')
  .map((moduleItem) => moduleItem.key)

test('business page lineage: exactly covers every formal-v1 business module once', () => {
  const lineageKeys = businessPageLineageDefinitions.map(
    (definition) => definition.pageKey
  )

  assert.equal(formalModuleKeys.length, 23)
  assert.equal(new Set(lineageKeys).size, lineageKeys.length)
  assert.deepEqual([...lineageKeys].sort(), [...formalModuleKeys].sort())
  assert.equal(getBusinessPageLineage('inbound')?.pageRole, 'source_generated')
  assert.equal(getBusinessPageLineage('shipments')?.pageRole, 'fact_owner')
  assert.equal(getBusinessPageLineage('not-a-page'), null)
})

test('business page lineage: declares the complete typed flow vocabulary', () => {
  assert.deepEqual(Object.values(BUSINESS_FLOW_TYPES), [
    'catalog_fill',
    'source_link',
    'domain_generate',
    'external_import',
    'post_fact',
    'read_projection',
    'source_navigation',
    'print_snapshot',
  ])
})

test('business page lineage: flow contracts are immutable and well typed', () => {
  const knownPageKeys = new Set(formalModuleKeys)
  const knownFlowTypes = new Set(Object.values(BUSINESS_FLOW_TYPES))
  const knownAvailability = new Set(Object.values(BUSINESS_PAGE_AVAILABILITY))
  const actionFlowTypes = new Set([
    BUSINESS_FLOW_TYPES.DOMAIN_GENERATE,
    BUSINESS_FLOW_TYPES.EXTERNAL_IMPORT,
    BUSINESS_FLOW_TYPES.POST_FACT,
  ])
  const discriminatorFlowTypes = new Set([
    BUSINESS_FLOW_TYPES.READ_PROJECTION,
    BUSINESS_FLOW_TYPES.SOURCE_NAVIGATION,
  ])
  const flowKeys = new Set()

  assert.equal(Object.isFrozen(businessPageFlowDefinitions), true)
  for (const flowDefinition of businessPageFlowDefinitions) {
    assert.equal(Object.isFrozen(flowDefinition), true)
    assert.equal(knownFlowTypes.has(flowDefinition.flowType), true)
    assert.equal(knownAvailability.has(flowDefinition.availability), true)
    assert.equal(knownPageKeys.has(flowDefinition.toPageKey), true)

    for (const field of [
      'flowKey',
      'flowType',
      'fromPageKey',
      'toPageKey',
      'externalSourceKey',
      'action',
      'sourceType',
      'availabilityNote',
    ]) {
      assert.equal(typeof flowDefinition[field], 'string', field)
      assert.equal(
        flowDefinition[field].trim(),
        flowDefinition[field],
        `${flowDefinition.flowKey}.${field}`
      )
    }

    assert.equal(
      flowKeys.has(flowDefinition.flowKey),
      false,
      flowDefinition.flowKey
    )
    flowKeys.add(flowDefinition.flowKey)

    if (flowDefinition.flowType === BUSINESS_FLOW_TYPES.EXTERNAL_IMPORT) {
      assert.equal(flowDefinition.fromPageKey, '')
      assert.equal(flowDefinition.externalSourceKey.length > 0, true)
    } else {
      assert.equal(knownPageKeys.has(flowDefinition.fromPageKey), true)
      assert.equal(flowDefinition.externalSourceKey, '')
    }

    assert.equal(
      Boolean(flowDefinition.action),
      actionFlowTypes.has(flowDefinition.flowType),
      `${flowDefinition.flowKey} action contract`
    )
    assert.equal(
      Boolean(flowDefinition.sourceType),
      discriminatorFlowTypes.has(flowDefinition.flowType),
      `${flowDefinition.flowKey} source type contract`
    )
    if (
      flowDefinition.availability !== BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
    ) {
      assert.equal(flowDefinition.availabilityNote.length > 0, true)
    }
  }
})

test('business page lineage: uses known page keys and immutable typed fields', () => {
  const knownPageKeys = new Set(formalModuleKeys)
  const knownRoles = new Set(Object.values(BUSINESS_PAGE_ROLES))
  const knownAvailability = new Set(Object.values(BUSINESS_PAGE_AVAILABILITY))
  const knownTaskProducerStatuses = new Set(
    Object.values(WORKFLOW_TASK_PRODUCER_STATUS)
  )

  for (const definition of businessPageLineageDefinitions) {
    assert.equal(Object.isFrozen(definition), true)
    assert.equal(knownRoles.has(definition.pageRole), true)
    assert.equal(knownAvailability.has(definition.availability), true)
    assert.equal(
      knownTaskProducerStatuses.has(definition.taskProducerStatus),
      true
    )
    assert.equal(typeof definition.allowsGenericPageCreate, 'boolean')
    assert.equal(typeof definition.availabilityNote, 'string')

    for (const field of [
      'upstreamPageKeys',
      'producerActions',
      'sourceTypes',
      'downstreamPageKeys',
      'taskGroups',
    ]) {
      assert.equal(Array.isArray(definition[field]), true, field)
      assert.equal(Object.isFrozen(definition[field]), true, field)
      assert.equal(
        definition[field].every(
          (value) =>
            typeof value === 'string' && value.trim() === value && value
        ),
        true,
        field
      )
      assert.equal(new Set(definition[field]).size, definition[field].length)
    }

    for (const relatedPageKey of [
      ...definition.upstreamPageKeys,
      ...definition.downstreamPageKeys,
    ]) {
      assert.equal(
        knownPageKeys.has(relatedPageKey),
        true,
        `${definition.pageKey} references unknown page ${relatedPageKey}`
      )
    }

    for (const field of ['incomingFlows', 'outgoingFlows']) {
      assert.equal(Array.isArray(definition[field]), true, field)
      assert.equal(Object.isFrozen(definition[field]), true, field)
    }
    assert.deepEqual(
      definition.incomingFlows,
      businessPageFlowDefinitions.filter(
        (flowDefinition) => flowDefinition.toPageKey === definition.pageKey
      )
    )
    assert.deepEqual(
      definition.outgoingFlows,
      businessPageFlowDefinitions.filter(
        (flowDefinition) => flowDefinition.fromPageKey === definition.pageKey
      )
    )
  }
})

test('business page lineage: every legacy page relation has an explicit typed flow', () => {
  const typedPairs = new Set(
    businessPageFlowDefinitions
      .filter(
        (flowDefinition) =>
          flowDefinition.flowType !== BUSINESS_FLOW_TYPES.SOURCE_NAVIGATION
      )
      .map(
        (flowDefinition) =>
          `${flowDefinition.fromPageKey}->${flowDefinition.toPageKey}`
      )
  )

  for (const definition of businessPageLineageDefinitions) {
    for (const upstreamPageKey of definition.upstreamPageKeys) {
      const pair = `${upstreamPageKey}->${definition.pageKey}`
      assert.equal(typedPairs.has(pair), true, `untyped upstream ${pair}`)
    }
    for (const downstreamPageKey of definition.downstreamPageKeys) {
      const pair = `${definition.pageKey}->${downstreamPageKey}`
      assert.equal(typedPairs.has(pair), true, `untyped downstream ${pair}`)
    }
  }
})

test('business page lineage: source-driven and read-only pages never advertise generic create', () => {
  const noGenericCreateRoles = new Set([
    BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    BUSINESS_PAGE_ROLES.READ_MODEL,
    BUSINESS_PAGE_ROLES.WORKFLOW_INBOX,
  ])

  for (const definition of businessPageLineageDefinitions) {
    if (noGenericCreateRoles.has(definition.pageRole)) {
      assert.equal(
        definition.allowsGenericPageCreate,
        false,
        definition.pageKey
      )
    }

    const ownsCreate =
      definition.pageRole === BUSINESS_PAGE_ROLES.OWNER ||
      definition.pageRole === BUSINESS_PAGE_ROLES.SOURCE_DOCUMENT_OWNER ||
      definition.pageRole === BUSINESS_PAGE_ROLES.FACT_OWNER
    if (!ownsCreate) {
      assert.equal(
        definition.upstreamPageKeys.length > 0 ||
          definition.availability === BUSINESS_PAGE_AVAILABILITY.DEFERRED ||
          definition.taskProducerStatus ===
            WORKFLOW_TASK_PRODUCER_STATUS.DEFERRED,
        true,
        `${definition.pageKey} needs an upstream page or an explicit deferred producer`
      )
    }
  }
})

test('business page lineage: source-generated and fact pages name real producers and explicit availability', () => {
  const sourceDrivenRoles = new Set([
    BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    BUSINESS_PAGE_ROLES.FACT_OWNER,
    BUSINESS_PAGE_ROLES.FACT_PROCESSING,
  ])

  for (const definition of businessPageLineageDefinitions) {
    if (!sourceDrivenRoles.has(definition.pageRole)) continue

    assert.notEqual(
      definition.availability,
      BUSINESS_PAGE_AVAILABILITY.DEFERRED
    )
    assert.equal(
      definition.producerActions.length > 0,
      true,
      definition.pageKey
    )
    assert.equal(
      definition.upstreamPageKeys.length > 0,
      true,
      definition.pageKey
    )
    if (definition.availability === BUSINESS_PAGE_AVAILABILITY.PARTIAL) {
      assert.equal(definition.availabilityNote.length > 0, true)
    }
  }
})

test('business page lineage: source-driven producers match domain-generate flows', () => {
  const sourceDrivenRoles = new Set([
    BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    BUSINESS_PAGE_ROLES.FACT_OWNER,
    BUSINESS_PAGE_ROLES.FACT_PROCESSING,
  ])

  for (const definition of businessPageLineageDefinitions) {
    if (!sourceDrivenRoles.has(definition.pageRole)) continue

    const flowActions = [
      ...new Set(
        definition.incomingFlows
          .filter(
            (flowDefinition) =>
              flowDefinition.flowType === BUSINESS_FLOW_TYPES.DOMAIN_GENERATE
          )
          .map((flowDefinition) => flowDefinition.action)
      ),
    ].sort()
    assert.deepEqual(
      flowActions,
      [...definition.producerActions].sort(),
      definition.pageKey
    )
  }
})

test('business page lineage: producer and typed flow actions are backed by current RPC contracts', () => {
  const contractSource = [
    '../api/bomApi.mjs',
    '../api/masterDataOrderApi.mjs',
    '../api/operationalFactApi.mjs',
    '../api/productionOrderApi.mjs',
    '../api/purchaseApi.mjs',
    '../api/qualityApi.mjs',
    '../../../../server/internal/service/jsonrpc_quality.go',
  ]
    .map((relativePath) =>
      readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    )
    .join('\n')

  for (const definition of businessPageLineageDefinitions) {
    for (const action of definition.producerActions) {
      assert.equal(
        contractSource.includes(`'${action}'`) ||
          contractSource.includes(`"${action}"`),
        true,
        `${definition.pageKey} producer action is not backed by a current RPC contract: ${action}`
      )
    }
  }

  for (const flowDefinition of businessPageFlowDefinitions) {
    if (!flowDefinition.action) continue
    assert.equal(
      contractSource.includes(`'${flowDefinition.action}'`) ||
        contractSource.includes(`"${flowDefinition.action}"`),
      true,
      `${flowDefinition.flowKey} is not backed by a current RPC contract`
    )
  }
})

test('business page lineage: current Product Core has no external import flow', () => {
  assert.deepEqual(
    businessPageFlowDefinitions.filter(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.EXTERNAL_IMPORT
    ),
    []
  )
})

test('business page lineage: outsourcing material fill and finished-goods quality entry stay explicit', () => {
  const materialFill = businessPageFlowDefinitions.find(
    (flowDefinition) =>
      flowDefinition.flowType === BUSINESS_FLOW_TYPES.CATALOG_FILL &&
      flowDefinition.fromPageKey === 'materials' &&
      flowDefinition.toPageKey === 'processing-contracts'
  )
  assert.ok(materialFill)
  assert.equal(
    getBusinessPageLineage('processing-contracts')?.upstreamPageKeys.includes(
      'materials'
    ),
    true
  )

  const finishedGoodsQualityLink = businessPageFlowDefinitions.find(
    (flowDefinition) =>
      flowDefinition.flowType === BUSINESS_FLOW_TYPES.SOURCE_LINK &&
      flowDefinition.fromPageKey === 'shipments' &&
      flowDefinition.toPageKey === 'quality-inspections'
  )
  assert.equal(
    finishedGoodsQualityLink?.availability,
    BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
  )
  assert.match(
    finishedGoodsQualityLink?.availabilityNote || '',
    /不启动 Workflow/u
  )
})

test('business page lineage: inventory projections preserve every fact discriminator', () => {
  const projectionSourceTypes = businessPageFlowDefinitions
    .filter(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.READ_PROJECTION &&
        flowDefinition.toPageKey === 'inventory'
    )
    .map((flowDefinition) => flowDefinition.sourceType)

  assert.deepEqual(
    projectionSourceTypes,
    getBusinessPageLineage('inventory')?.sourceTypes
  )
})

test('business page lineage: product images enter print drafts only as snapshots', () => {
  const printSnapshotPairs = businessPageFlowDefinitions
    .filter(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.PRINT_SNAPSHOT
    )
    .map(
      (flowDefinition) =>
        `${flowDefinition.fromPageKey}->${flowDefinition.toPageKey}`
    )

  assert.deepEqual(printSnapshotPairs, [
    'products->material-bom',
    'products->processing-contracts',
  ])
})

test('business page lineage: sourceTypes only names stored discriminators, not direct foreign keys', () => {
  assert.deepEqual(getBusinessPageLineage('inventory')?.sourceTypes, [
    'PURCHASE_RECEIPT',
    'PURCHASE_RETURN',
    'PURCHASE_RECEIPT_ADJUSTMENT',
    'PRODUCTION_FACT',
    'OUTSOURCING_FACT',
    'SHIPMENT',
  ])
  assert.deepEqual(getBusinessPageLineage('outbound')?.sourceTypes, [])
  assert.deepEqual(getBusinessPageLineage('shipments')?.sourceTypes, [])
  assert.deepEqual(getBusinessPageLineage('quality-inspections')?.sourceTypes, [
    'PURCHASE_RECEIPT',
    'OUTSOURCING_FACT',
    'SHIPMENT',
  ])
  assert.equal(
    getBusinessPageLineage('quality-inspections')?.availability,
    BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
  )
})

test('business page lineage: shipment finished-goods quality producer is wired from the source page', () => {
  const shipmentPageSource = readFileSync(
    new URL('../pages/ShipmentsPage.jsx', import.meta.url),
    'utf8'
  )
  const qualityApiSource = readFileSync(
    new URL('../api/qualityApi.mjs', import.meta.url),
    'utf8'
  )

  assert.match(shipmentPageSource, /createFinishedGoodsQualityInspectionDraft/u)
  assert.match(shipmentPageSource, /listFinishedGoodsQualityInspections/u)
  assert.match(
    qualityApiSource,
    /create_finished_goods_quality_inspection_draft/u
  )
})

test('business page lineage: workflow inboxes declare exact source task producers', () => {
  const workflowDefinitions = businessPageLineageDefinitions.filter(
    (definition) => definition.pageRole === BUSINESS_PAGE_ROLES.WORKFLOW_INBOX
  )

  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.pageKey),
    ['production-scheduling', 'production-exceptions', 'shipping-release']
  )
  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.taskGroups[0]),
    ['production_scheduling', 'production_exception', 'shipment_release']
  )

  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.upstreamPageKeys),
    [['production-orders'], ['production-progress'], ['shipments']]
  )
  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.producerActions),
    [
      ['release_production_order'],
      ['post_production_fact'],
      ['submit_shipment_release'],
    ]
  )
  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.sourceTypes),
    [['production-orders'], ['production-progress'], ['shipments']]
  )
  for (const definition of workflowDefinitions) {
    assert.equal(definition.taskGroups.length, 1)
    assert.equal(
      definition.availability,
      BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
    )
    assert.equal(
      definition.taskProducerStatus,
      WORKFLOW_TASK_PRODUCER_STATUS.IMPLEMENTED
    )
    assert.equal(definition.availabilityNote.length > 0, true)
  }
})

test('business page registry describes the same source-generated workflow truth', () => {
  const byKey = new Map(
    businessModuleDefinitions.map((definition) => [definition.key, definition])
  )
  const sourceRefs = [
    ['production-scheduling', 'production_orders'],
    ['production-exceptions', 'production_facts'],
    ['shipping-release', 'shipments'],
  ]
  for (const [pageKey, sourceRef] of sourceRefs) {
    const definition = byKey.get(pageKey)
    assert.equal(definition.sourceRefs.includes(sourceRef), true, pageKey)
    assert.doesNotMatch(definition.description, /尚未接入/u)
    assert.equal(
      definition.currentScope.some((scope) => /生成/u.test(scope)),
      true,
      pageKey
    )
  }
})
