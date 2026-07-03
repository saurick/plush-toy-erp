import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { yoyoosunCustomerPackage } from '../../config/customers/yoyoosun/customerPackage.mjs'
import { yoyoosunFlowOrchestrationCoverage } from '../../config/customers/yoyoosun/flowOrchestrationCoverage.mjs'
import { yoyoosunProjectionMatrix } from '../../config/customers/yoyoosun/projectionMatrix.mjs'
import { yoyoosunRawSourceFormMap } from '../../config/customers/yoyoosun/rawSourceFormMap.mjs'
import { yoyoosunRoleFlowMatrix } from '../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { yoyoosunTrialDataFixture } from '../../config/customers/yoyoosun/trialDataFixture.mjs'

const sourceManifest = JSON.parse(
  readFileSync('docs/customers/yoyoosun/source-manifest.json', 'utf8')
)

const manifestSourceIds = new Set(sourceManifest.sources.map((source) => source.sourceId))
const syntheticSourceIds = new Set(['__synthetic_yoyoosun_trial__'])

function assertKnownSourceIds(sourceIds, context) {
  assert.ok(Array.isArray(sourceIds) && sourceIds.length > 0, `${context} sourceIds required`)
  for (const sourceId of sourceIds) {
    assert.ok(
      manifestSourceIds.has(sourceId) || syntheticSourceIds.has(sourceId),
      `${context} references unknown sourceId ${sourceId}`
    )
  }
}

test('yoyoosun raw source form map covers every source manifest entry', () => {
  assert.equal(yoyoosunRawSourceFormMap.customerKey, sourceManifest.customerKey)
  const mapped = new Map(
    yoyoosunRawSourceFormMap.entries.map((entry) => [entry.sourceId, entry])
  )

  for (const source of sourceManifest.sources) {
    const mapping = mapped.get(source.sourceId)
    assert.ok(mapping, `${source.sourceId} must have form mapping`)
    assert.ok(mapping.targetForms.length > 0, `${source.sourceId} targetForms required`)
    assert.ok(mapping.targetEntities.length > 0, `${source.sourceId} targetEntities required`)
    assert.ok(mapping.fieldCoverage.length > 0, `${source.sourceId} fieldCoverage required`)
    assert.match(mapping.boundary, /不|不能|只|dry-run|人工|候选/)
  }
})

test('yoyoosun raw source form map does not target runtime fact tables directly', () => {
  const forbiddenTargets = new Set([
    'inventory_txns',
    'inventory_balances',
    'shipments.shipped_fact',
    'finance_facts.posted',
    'workflow_done_to_fact_posted',
    'business_records',
  ])

  for (const entry of yoyoosunRawSourceFormMap.entries) {
    assert.notEqual(entry.status, 'runtime_enabled')
    for (const target of entry.targetEntities) {
      assert.ok(!forbiddenTargets.has(target), `${entry.sourceId} targets forbidden runtime table ${target}`)
    }
    assert.doesNotMatch(entry.boundary, /自动写库存|自动写财务|自动写出货|直接过账/)
  }
})

test('yoyoosun role flow matrix covers every workflow owner pool', () => {
  const configuredOwnerPools = new Set(
    yoyoosunRoleFlowMatrix.roles.flatMap((role) => [...role.ownerPools])
  )
  const workflowOwnerPools = new Set(
    yoyoosunCustomerPackage.workflows.flatMap((workflow) => [
      ...workflow.ownerPools,
      ...workflow.nodes.map((node) => node.ownerPool).filter(Boolean),
    ])
  )

  for (const ownerPool of workflowOwnerPools) {
    assert.ok(configuredOwnerPools.has(ownerPool), `owner pool ${ownerPool} missing role matrix entry`)
  }
})

test('yoyoosun role flow matrix keeps workflow handling separate from facts', () => {
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.ok(role.roleKey)
    assert.ok(role.displayName)
    assert.ok(role.ownerPools.length > 0)
    assert.ok(role.capabilityKeys.includes('workflow.task.read'), `${role.roleKey} needs workflow.task.read`)
    assert.match(role.guardrail, /不|不能|只有|必须/)
    assert.doesNotMatch(role.guardrail, /直接写库存|直接写财务|直接写出货|自动过账/)
  }
})

test('yoyoosun flow orchestration coverage records runtime and preview layers', () => {
  const layers = new Map(
    yoyoosunFlowOrchestrationCoverage.layers.map((layer) => [layer.key, layer])
  )
  assert.equal(layers.get('workflow_task')?.status, 'runtime_enabled')
  assert.equal(layers.get('process_runtime')?.status, 'runtime_enabled_partial')
  assert.equal(layers.get('business_flows')?.status, 'preview_only')
  assert.equal(layers.get('state_machines')?.status, 'preview_only')
  assert.equal(layers.get('process_policies')?.status, 'preview_only')
})

test('yoyoosun flow orchestration coverage includes all configured preview flows', () => {
  const businessFlowKeys = new Set(yoyoosunCustomerPackage.businessFlows.map((flow) => flow.key))
  const stateMachineKeys = new Set(yoyoosunCustomerPackage.stateMachines.map((machine) => machine.key))
  const processPolicyKeys = new Set(yoyoosunCustomerPackage.processPolicies.map((policy) => policy.key))
  const coverage = new Map(
    yoyoosunFlowOrchestrationCoverage.layers.map((layer) => [layer.key, new Set(layer.evidence)])
  )

  for (const key of businessFlowKeys) assert.ok(coverage.get('business_flows').has(key), `${key} business flow must be covered`)
  for (const key of stateMachineKeys) assert.ok(coverage.get('state_machines').has(key), `${key} state machine must be covered`)
  for (const key of processPolicyKeys) assert.ok(coverage.get('process_policies').has(key), `${key} process policy must be covered`)
})

test('yoyoosun flow orchestration coverage includes required runtime processes and UI entries', () => {
  const runtimeProcesses = new Set(
    yoyoosunFlowOrchestrationCoverage.runtimeProcesses.map((process) => process.key)
  )
  for (const key of ['sales_order_acceptance', 'material_supply', 'finished_goods_delivery']) {
    assert.ok(runtimeProcesses.has(key), `${key} runtime process coverage required`)
  }
  for (const uiKey of ['desktop_task_board', 'mobile_role_tasks', 'customer_config_preview', 'purchase_contract_print', 'processing_contract_print']) {
    assert.ok(yoyoosunFlowOrchestrationCoverage.uiEntrypoints.includes(uiKey), `${uiKey} UI entry coverage required`)
  }
})

test('yoyoosun projection matrix separates consumed and backend-allowed field surfaces', () => {
  const consumedSurfaces = yoyoosunProjectionMatrix.fieldSurfaces.filter(
    (surface) => surface.status === 'runtime_enabled'
  )
  const backendAllowedSurfaces = yoyoosunProjectionMatrix.fieldSurfaces.filter(
    (surface) => surface.status === 'backend_runtime_allowed'
  )

  assert.ok(consumedSurfaces.length >= 3, 'runtime consumed surfaces must stay explicit')
  assert.ok(backendAllowedSurfaces.length >= 8, 'backend-allowed surfaces must stay visible')
  for (const surface of yoyoosunProjectionMatrix.fieldSurfaces) {
    assert.ok(surface.surfaceKey.endsWith('.default'))
    assert.ok(surface.fields.length > 0)
  }
})

test('yoyoosun print projection protects supplier and processor snapshots', () => {
  for (const template of yoyoosunProjectionMatrix.printTemplateDefaults) {
    assert.equal(template.status, 'runtime_enabled')
    assert.equal(template.defaultFieldPolicy, 'buyer_party_only')
    assert.ok(template.protectedBusinessSnapshots.includes('lines'))
    assert.ok(template.protectedBusinessSnapshots.includes('supplierName'))
  }
})

test('yoyoosun trial fixture covers core and customer flow domains', () => {
  const requiredCollections = [
    'units',
    'customers',
    'suppliers',
    'materials',
    'products',
    'warehouses',
    'bomVersions',
    'salesOrders',
    'purchaseOrders',
    'outsourcingOrders',
    'purchaseReceipts',
    'qualityInspections',
    'inventoryLots',
    'shipments',
    'financeDrafts',
    'workflowTasks',
  ]

  for (const collectionKey of requiredCollections) {
    const records = yoyoosunTrialDataFixture[collectionKey]
    assert.ok(Array.isArray(records) && records.length > 0, `${collectionKey} fixture required`)
    records.forEach((record, index) =>
      assertKnownSourceIds(record.sourceIds, `${collectionKey}[${index}]`)
    )
  }
})

test('yoyoosun trial print fixtures have no empty critical print fields', () => {
  const purchaseOrder = yoyoosunTrialDataFixture.purchaseOrders[0]
  const purchaseLine = purchaseOrder.lines[0]
  assert.ok(purchaseOrder.purchaseOrderNo)
  assert.ok(purchaseOrder.supplierCode)
  assert.ok(purchaseOrder.printTemplateKey === 'material-purchase-contract')
  for (const key of ['productOrderNo', 'productNo', 'productName', 'materialName', 'unitCode', 'quantity', 'unitPrice', 'amount']) {
    assert.ok(String(purchaseLine[key] || '').trim(), `purchase line ${key} must not be blank`)
  }

  const outsourcingOrder = yoyoosunTrialDataFixture.outsourcingOrders[0]
  const outsourcingLine = outsourcingOrder.lines[0]
  assert.ok(outsourcingOrder.outsourcingOrderNo)
  assert.ok(outsourcingOrder.processorCode)
  assert.ok(outsourcingOrder.printTemplateKey === 'processing-contract')
  for (const key of ['productOrderNo', 'productNo', 'productName', 'processName', 'unitCode', 'quantity', 'unitPrice', 'amount']) {
    assert.ok(String(outsourcingLine[key] || '').trim(), `outsourcing line ${key} must not be blank`)
  }
})
