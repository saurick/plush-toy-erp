import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { yoyoosunCustomerPackage } from '../../config/customers/yoyoosun/customerPackage.mjs'
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
