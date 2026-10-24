import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDevVerificationEvidence, readDevVerificationEvidence, selectTargetVerificationOperation } from './devVerificationEvidence.mjs'
import { DEV_DELIVERY_TARGETS } from './devDelivery.mjs'

const SHA = 'a'.repeat(40)
function fixture() {
  const repository = { commit: SHA, dirty: false, fingerprint: 'b'.repeat(64) }
  const operations = Object.fromEntries(DEV_DELIVERY_TARGETS.map((target, i) => {
    const id = `operation-${i}`
    return [id, {
      id,
      target: target.key,
      gitSha: SHA,
      action: 'promote',
      status: 'passed',
      createdAt: '2026-10-24T00:00:00Z',
      gitlabRecord: { status: 'recorded' },
      stages: ['fresh_backup_and_restore_check', 'runtime_verified'].map((id) => ({ id, status: 'passed' })),
      evidence: {
        status: 'passed',
        receiptSha256: 'c'.repeat(64),
        checks: { releaseIdentity: true, health: true, ready: true, basicSmoke: true, publicEntry: true, backupRestore: true },
        migration: { required: '20261023044447', readback: '20261023044447', readbackStatus: 'passed' },
        backup: { restoreChecked: true, sha256: 'd'.repeat(64), sizeBytes: 42 } } }]
  }))
  return {
    quality: { repository, serverEvidence: { status: 'passed', current: true, coversWorkingTree: true, jobs: [{ status: 'completed', conclusion: 'success' }] } },
    delivery: { repository, targets: DEV_DELIVERY_TARGETS.map((target) => ({ key: target.key, preflight: { status: 'passed', remote: { runtime: { serverSha: SHA, webSha: SHA, migrationVersion: '20261023044447' } } } })), operations: Object.values(operations) },
    operations,
  }
}

test('current CI, target runtime and complete receipts prove independent dimensions', () => {
  const result = buildDevVerificationEvidence(fixture())
  assert.equal(result.passed, true)
  assert.equal(result.targets.length, 3)
  assert(result.targets.every((target) => Object.values(target.verification).every(Boolean)))
})

test('CI success and live health never substitute for absent target receipts', () => {
  const input = fixture()
  input.operations = {}
  const result = buildDevVerificationEvidence(input)
  assert.equal(result.ci.passed, true)
  assert.equal(result.passed, false)
  assert(result.targets.every((target) => !Object.values(target.verification).some(Boolean)))
})

test('each target dimension fails closed on missing, false, mismatched and historical proof', () => {
  for (const mutate of [
    (x) => { x.operations['operation-0'].evidence.checks.basicSmoke = false },
    (x) => { delete x.operations['operation-0'].evidence.checks.publicEntry },
    (x) => { x.operations['operation-0'].evidence.backup.restoreChecked = false },
    (x) => { x.operations['operation-0'].evidence.backup.sha256 = '' },
    (x) => { x.operations['operation-0'].evidence.migration.readback = '20260101000000' },
    (x) => { x.operations['operation-0'].evidence.migration.required = null },
    (x) => { x.operations['operation-0'].gitlabRecord.status = 'unavailable' },
    (x) => { x.operations['operation-0'].evidence.receiptSha256 = null },
    (x) => { x.operations['operation-0'].target = 'production-133' },
    (x) => { x.operations['operation-0'].gitSha = 'f'.repeat(40) },
    (x) => { x.delivery.targets[0].preflight.status = 'unavailable' },
    (x) => { x.delivery.targets[0].preflight.remote.runtime.webSha = 'f'.repeat(40) },
  ]) {
    const input = fixture(); mutate(input)
    assert.equal(buildDevVerificationEvidence(input).targets[0].passed, false)
  }
  const input = fixture(); input.quality.repository = { ...input.quality.repository, fingerprint: 'e'.repeat(64) }
  assert.equal(buildDevVerificationEvidence(input).ci.passed, false)
})

test('independent workbench updates preserve proof of the running ERP SHA without claiming the candidate is deployed', () => {
  const input = fixture()
  input.delivery.repository = { ...input.delivery.repository, commit: 'e'.repeat(40) }
  input.quality.repository = input.delivery.repository
  const result = buildDevVerificationEvidence(input)
  assert.equal(result.ci.passed, true)
  assert.equal(result.passed, false)
  assert(result.targets.every((target) => target.passed && !target.current && target.runtimeSha === SHA))
  input.delivery.repository.dirty = true
  assert(buildDevVerificationEvidence(input).targets.every((target) => target.passed))
})

test('a later failed or unknown attempt is never hidden by an older successful receipt', () => {
  const input = fixture()
  input.delivery.operations.push({ ...input.delivery.operations[0], id: 'newer', status: 'not_proven', createdAt: '2026-10-24T01:00:00Z' })
  assert.equal(selectTargetVerificationOperation(input.delivery, input.delivery.targets[0]).id, 'newer')
  assert.equal(buildDevVerificationEvidence(input).targets[0].passed, false)
})

test('partial read failures preserve independently available evidence and expose the gap', async () => {
  const input = fixture()
  const result = await readDevVerificationEvidence({
    deliveryClient: { summary: async () => input.delivery, history: async ({ target }) => ({ operations: input.delivery.operations.filter((item) => item.target === target) }), operation: async (id) => { if (id === 'operation-0') throw new Error('private error'); return input.operations[id] } },
    qualityClient: { summary: async () => { throw new Error('private token') } },
  })
  assert.equal(result.ci.passed, false)
  assert.equal(result.targets[0].passed, false)
  assert.equal(result.targets[1].passed, true)
  assert.equal(result.errors.length, 2)
  assert.doesNotMatch(JSON.stringify(result), /private error|private token/u)
})
