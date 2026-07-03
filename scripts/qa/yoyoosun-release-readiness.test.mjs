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

const blockedWords = /自动过账|直接过账|直接写库存|直接写出货|直接写财务/

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

test('blocked wording stays absent', () => {
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    assert.doesNotMatch(role.guardrail, blockedWords)
  }
  for (const source of yoyoosunRawSourceFormMap.entries) {
    assert.doesNotMatch(source.boundary, blockedWords)
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

test('backend-allowed field surfaces stay separate from consumed field surfaces', () => {
  const consumedSurfaces = new Set(
    yoyoosunProjectionMatrix.fieldSurfaces
      .filter((surface) => surface.status === 'runtime_enabled')
      .map((surface) => surface.surfaceKey)
  )
  const backendAllowedSurfaces = new Set(
    yoyoosunProjectionMatrix.fieldSurfaces
      .filter((surface) => surface.status === 'backend_runtime_allowed')
      .map((surface) => surface.surfaceKey)
  )

  for (const surface of ['customers.default', 'suppliers.default', 'sales_orders.default']) {
    assert.ok(consumedSurfaces.has(surface), `${surface} must remain consumed`)
  }
  for (const surface of ['purchase_orders.default', 'outsourcing_orders.default', 'shipments.default', 'finance_facts.default']) {
    assert.ok(backendAllowedSurfaces.has(surface), `${surface} must be backend allowed`)
  }
})
