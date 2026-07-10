import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { yoyoosunProjectionMatrix } from '../../config/customers/yoyoosun/projectionMatrix.mjs'
import { yoyoosunRawSourceFormMap } from '../../config/customers/yoyoosun/rawSourceFormMap.mjs'
import { yoyoosunRoleFlowMatrix } from '../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { yoyoosunTrialDataFixture } from '../../config/customers/yoyoosun/trialDataFixture.mjs'

const sourceManifest = JSON.parse(
  readFileSync('docs/customers/yoyoosun/source-manifest.json', 'utf8')
)

const forbiddenRuntimeFactCommitClaims =
  /自动过账|直接过账|直接写库存|直接写出货|直接写财务/

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
  assert.equal(sourceManifest.customerKey, 'yoyoosun')
})

test('complete closure assets', () => {
  assert.ok(yoyoosunRoleFlowMatrix.roles.length >= 9)
  assert.equal(yoyoosunRawSourceFormMap.entries.length, sourceManifest.sources.length)
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
    assertNoPositiveRuntimeFactCommitClaim(
      source.boundary,
      `${source.sourceId} boundary must not promise runtime fact commits`
    )
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
