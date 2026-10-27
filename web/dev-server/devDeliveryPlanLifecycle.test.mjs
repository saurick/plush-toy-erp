import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createDevDeliveryService, validateDevDeliveryAction } from './devDeliveryBridgePlugin.mjs'
import { createOrReuseDeliveryOperation, readDeliveryOperation, resolveDeliveryOperationStore, transitionDeliveryOperation } from '../../scripts/deploy/delivery-operation-store.mjs'

const AT = '2026-10-27T00:00:00.000Z'
const SHA = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
function fixture(t, action = 'promote') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-delivery-plan-api-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const store = resolveDeliveryOperationStore(root)
  const { operation } = createOrReuseDeliveryOperation(store, { action, target: 'demo-133', gitSha: SHA, version: '2026.10.27-1', idempotencyKey: 'version-plan:api-test:0001', metadata: { currentGitSha: BASE }, now: AT })
  transitionDeliveryOperation(store, operation.id, { status: 'running', message: 'preparing', now: AT })
  transitionDeliveryOperation(store, operation.id, { status: 'ready', message: 'prepared', now: AT })
  let at = AT
  let runtimeSha = BASE
  let unavailable = false
  let spawns = 0
  const service = createDevDeliveryService({
    projectRoot: root, operationStore: store, env: {},
    now: () => at, onDiagnostic: () => {},
    provider: { provider: 'gitlab', listVersions: () => [] },
    readRepositoryState: () => ({ commit: SHA, dirty: false }),
    runPreflight: target => {
      if (unavailable) throw new Error('probe unavailable')
      return { target, status: 'passed', remote: { runtime: { serverSha: runtimeSha, webSha: runtimeSha } } }
    },
    spawnProcess: () => { spawns += 1; throw new Error('must not spawn') },
  })
  return { service, store, id: operation.id, expire: () => { at = '2026-10-28T00:00:00.000Z' }, drift: () => { runtimeSha = SHA }, failProbe: () => { unavailable = true }, spawns: () => spawns }
}

test('abandon API strictly validates scope, records the terminal event and retains history', async t => {
  const { service, store, id, spawns } = fixture(t)
  const request = { action: 'abandon-plan', payload: { operationId: id, target: 'demo-133' } }
  assert.equal(validateDevDeliveryAction(request).action, 'abandon-plan')
  assert.throws(() => validateDevDeliveryAction({ ...request, payload: { ...request.payload, shell: 'anything' } }), /unsupported fields/u)
  await assert.rejects(service.act({ ...request, payload: { operationId: id, target: 'customer-test-133' } }), /does not match/u)
  const result = await service.act(request)
  assert.equal(result.operation.status, 'abandoned')
  assert.equal(result.operation.terminal, true)
  assert.equal(result.operation.confirmationRequired, '')
  await service.act(request)
  assert.equal(readDeliveryOperation(store, id).revision, 4)
  const history = service.history({ target: 'demo-133' })
  assert.equal(history.total, 1)
  assert.equal(history.statistics.counts.abandoned, 1)
  assert.equal(spawns(), 0)
  await assert.rejects(service.act({ action: 'execute-promotion', payload: { operationId: id, confirmation: `PROMOTE:demo-133:${SHA}:${id}` } }), /not ready/u)
})

for (const [action, execute, prefix] of [['promote', 'execute-promotion', 'PROMOTE'], ['rollback', 'execute-rollback', 'ROLLBACK'], ['rebuild-database', 'execute-database-rebuild', 'REBUILD_DATABASE']]) {
  test(`${action} refuses an expired plan before launching an executor`, async t => {
    const fixtureValue = fixture(t, action)
    const { service, store, id, expire, spawns } = fixtureValue
    expire()
    const confirmation = `${prefix}:demo-133:${action === 'rollback' ? `${BASE}:` : ''}${SHA}:${id}`
    await assert.rejects(service.act({ action: execute, payload: { operationId: id, confirmation } }), /expired/u)
    assert.equal(readDeliveryOperation(store, id).status, 'invalidated')
    assert.equal(spawns(), 0)
  })
}

test('summary closes expired or proven drifted plans and keeps unreadable targets pending', async t => {
  const expired = fixture(t)
  expired.expire()
  const summary = await expired.service.summary()
  assert.equal(summary.operations[0].status, 'invalidated')
  assert.equal(expired.service.history({ target: 'demo-133' }).statistics.counts.invalidated, 1)
  const drifted = fixture(t)
  drifted.drift()
  assert.equal((await drifted.service.summary()).operations[0].status, 'invalidated')
  const unreadable = fixture(t)
  unreadable.failProbe()
  assert.equal((await unreadable.service.summary()).operations[0].status, 'ready')
  assert.equal(unreadable.spawns(), 0)
})

test('an in-flight execution and an unknown result cannot be abandoned or expired', async t => {
  const { service, store, id, expire } = fixture(t)
  transitionDeliveryOperation(store, id, { status: 'launching', message: 'launching', now: AT })
  expire()
  await assert.rejects(service.act({ action: 'abandon-plan', payload: { operationId: id, target: 'demo-133' } }), /only a ready/u)
  assert.equal(readDeliveryOperation(store, id).status, 'launching')
  transitionDeliveryOperation(store, id, { status: 'not_proven', message: 'unknown result', now: AT })
  await assert.rejects(service.act({ action: 'abandon-plan', payload: { operationId: id, target: 'demo-133' } }), /only a ready/u)
  assert.equal((await service.summary()).operations[0].status, 'not_proven')
})
