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

const forbiddenBoundaryWords = /自动过账|直接过账|直接写库存|直接写出货|直接写财务/

test('yoyoosun release readiness keeps all closure assets on the same customer key', () => {
  assert.equal(yoyoosunRoleFlowMatrix.customerKey, 'yoyoosun')
  assert.equal(yoyoosunRawSourceFormMap.customerKey, 'yoyoosun')
  assert.equal(yoyoosunProjectionMatrix.customerKey, 'yoyoosun')
  assert.equal(yoyoosunTrialDataFixture.customerKey, 'yoyoosun')
  assert.equal(sourceManifest.customerKey, 'yoyoosun')
})

test('yoyoosun release readiness has complete role, source, projection and fixture assets', () => {
  assert.ok(yoyoosunRoleFlowMatrix.roles.length >= 9, 'role matrix must cover product core customer roles')
  assert.equal(yoyoosunRawSourceFormMap.entries.length, sourceManifest.sources.length)
  assert.ok(yoyoosunProjectionMatrix.fieldSurfaces.length >= 10, 'projection matrix must show runtime and planned fields')
  assert.ok(yoyoosunTrialDataFixture.purchaseOrders.length > 0)
  assert.ok(yoyoosunTrialDataFixture.outsourcingOrders.length > 0)
  assert.ok(yoyoosunTrialDataFixture.workflowTasks.length > 0)
})

test('yoyoosun release readiness blocks accidental fact-posting wording', () => {
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.doesNotMatch(role.guardrail, forbiddenBoundaryWords)
  }
  for (const source of yoyoosunRawSourceFormMap.entries) {
    assert.doesNotMatch(source.boundary, forbiddenBoundaryWords)
  }
})

test('yoyoosun release readiness requires explicit authenticated readback before customer signoff', () => {
  const releaseEvidence = readFileSync(
    'deployments/yoyoosun/evidence/releases/2026-07-03/release-evidence.md',
    'utf8'
  )
  assert.match(releaseEvidence, /未执行 authenticated customer_config\.get_effective_session active revision 读回/)
  assert.match(releaseEvidence, /internal-only/)
})

test('yoyoosun release readiness keeps planned field surfaces separate from runtime field surfaces', () => {
  const runtimeSurfaces = new Set(
    yoyoosunProjectionMatrix.fieldSurfaces
      .filter((surface) => surface.status === 'runtime_enabled')
      .map((surface) => surface.surfaceKey)
  )
  const plannedSurfaces = new Set(
    yoyoosunProjectionMatrix.fieldSurfaces
      .filter((surface) => surface.status === 'planned')
      .map((surface) => surface.surfaceKey)
  )

  for (const surface of ['customers.default', 'suppliers.default', 'sales_orders.default']) {
    assert.ok(runtimeSurfaces.has(surface), `${surface} must remain runtime-enabled`)
  }
  for (const surface of ['purchase_orders.default', 'outsourcing_orders.default', 'shipments.default', 'finance_facts.default']) {
    assert.ok(plannedSurfaces.has(surface), `${surface} must remain planned until backend runtime expansion lands`)
  }
})
