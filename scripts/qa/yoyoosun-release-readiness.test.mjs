import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { yoyoosunProjectionMatrix } from '../../config/customers/yoyoosun/projectionMatrix.mjs'
import { yoyoosunRawSourceFormMap } from '../../config/customers/yoyoosun/rawSourceFormMap.mjs'
import { yoyoosunRoleFlowMatrix } from '../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { yoyoosunTrialDataFixture } from '../../config/customers/yoyoosun/trialDataFixture.mjs'

const forbiddenRuntimeFactCommitClaims =
  /自动过账|直接过账|直接写库存|直接写出货|直接写财务/
const requiredSourceCategories = new Set([
  'purchase_material_summary',
  'outsourcing_summary',
  'bom_workbook',
  'contract_print_reference',
  'workflow_ui_reference',
])
const forbiddenFactTargets = new Set([
  'business_records',
  'purchase_receipts',
  'quality_inspections',
  'outsourcing_facts',
  'inventory_txns',
  'inventory_balances',
  'inventory_lots',
  'shipments.shipped_fact',
  'finance_facts.posted',
  'workflow_done_to_fact_posted',
])

function assertNoPositiveRuntimeFactCommitClaim(text, context) {
  const normalizedText = String(text || '').replace(
    /(?:不|不能|不得|禁止)直接写(?:库存|出货|财务)(?:事实|流水|数据)?/g,
    ''
  )
  assert.doesNotMatch(normalizedText, forbiddenRuntimeFactCommitClaims, context)
}

test('same customer key', () => {
  assert.equal(yoyoosunRoleFlowMatrix.customerKey, 'yoyoosun')
  assert.equal(yoyoosunRawSourceFormMap.customerKey, 'yoyoosun')
  assert.equal(yoyoosunProjectionMatrix.customerKey, 'yoyoosun')
  assert.equal(yoyoosunTrialDataFixture.customerKey, 'yoyoosun')
})

test('complete closure assets', () => {
  assert.ok(yoyoosunRoleFlowMatrix.roles.length >= 9)
  assert.equal(yoyoosunRawSourceFormMap.status, 'source_category_mapping_only')
  assert.equal(yoyoosunRawSourceFormMap.privateValidation.status, 'external_required')
  assert.deepEqual(
    new Set(yoyoosunRawSourceFormMap.entries.map((entry) => entry.categoryKey)),
    requiredSourceCategories
  )
  assert.ok(
    yoyoosunRawSourceFormMap.entries.every(
      (entry) => !Object.prototype.hasOwnProperty.call(entry, 'sourceId')
    ),
    'product category mappings must not retain private source IDs'
  )
  assert.ok(yoyoosunProjectionMatrix.fieldSurfaces.length >= 10)
  assert.ok(yoyoosunTrialDataFixture.purchaseOrders.length > 0)
  assert.ok(yoyoosunTrialDataFixture.outsourcingOrders.length > 0)
  assert.ok(yoyoosunTrialDataFixture.workflowTasks.length > 0)
})

test('positive runtime fact commit wording stays absent', () => {
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assertNoPositiveRuntimeFactCommitClaim(
      role.guardrail,
      `${role.roleKey} guardrail must not promise runtime fact commits`
    )
  }
  for (const source of yoyoosunRawSourceFormMap.entries) {
    for (const target of source.targetEntities) {
      assert.ok(
        !forbiddenFactTargets.has(target),
        `${source.categoryKey} must not target runtime Fact table ${target}`
      )
    }
    assertNoPositiveRuntimeFactCommitClaim(
      source.boundary,
      `${source.categoryKey} boundary must not promise runtime fact commits`
    )
  }
})

test('trial records stay synthetic and independent from private manifests', () => {
  for (const [collectionKey, records] of Object.entries(yoyoosunTrialDataFixture)) {
    if (!Array.isArray(records)) continue
    for (const [index, record] of records.entries()) {
      assert.deepEqual(
        record.sourceIds,
        ['__synthetic_yoyoosun_trial__'],
        `${collectionKey}[${index}] must stay synthetic`
      )
    }
  }
})

test('release evidence still marks readback boundary', () => {
  const releaseEvidence = readFileSync(
    'deployments/yoyoosun/evidence/releases/2026-07-03/release-evidence.md',
    'utf8'
  )
  assert.match(releaseEvidence, /active revision/)
  assert.match(releaseEvidence, /internal-only/)
})

test('formal field contracts stay separate from runtime visibility surfaces', () => {
  const consumedSurfaces = new Set(
    yoyoosunProjectionMatrix.fieldSurfaces
      .filter((surface) => surface.status === 'runtime_visibility_consumed')
      .map((surface) => surface.surfaceKey)
  )
  const formalFieldContracts = new Set(
    yoyoosunProjectionMatrix.fieldSurfaces
      .filter((surface) => surface.status === 'formal_field_contract')
      .map((surface) => surface.surfaceKey)
  )

  for (const surface of ['customers.default', 'suppliers.default', 'sales_orders.default']) {
    assert.ok(consumedSurfaces.has(surface), `${surface} must remain consumed`)
  }
  for (const surface of [
    'bom_versions.default',
    'bom_items.default',
    'purchase_orders.default',
    'outsourcing_orders.default',
    'shipments.default',
    'finance_facts.default',
  ]) {
    assert.ok(formalFieldContracts.has(surface), `${surface} must remain a formal field contract only`)
  }
  const outsourcingSurface = yoyoosunProjectionMatrix.fieldSurfaces.find(
    (surface) => surface.surfaceKey === 'outsourcing_orders.default'
  )
  assert.ok(outsourcingSurface.fields.includes('expected_return_date'))
  assert.ok(!outsourcingSurface.fields.includes('return_date'))
})
