import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { closeReadyDeliveryPlan, deliveryPlanInvalidation, DELIVERY_PLAN_VALIDITY_MS } from './delivery-plan-lifecycle.mjs';
import { createOrReuseDeliveryOperation, readDeliveryOperation, resolveDeliveryOperationStore, transitionDeliveryOperation } from './delivery-operation-store.mjs';

const AT = '2026-10-27T00:00:00.000Z';
const SHA = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
function fixture(t, action = 'promote') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'delivery-plan-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = resolveDeliveryOperationStore(root);
  const request = { action, target: 'demo-133', gitSha: SHA, version: '2026.10.27-1', idempotencyKey: 'plan-lifecycle:first:0001', metadata: { currentGitSha: BASE }, now: AT };
  const { operation } = createOrReuseDeliveryOperation(store, request);
  transitionDeliveryOperation(store, operation.id, { status: 'running', message: 'preparing', now: AT });
  const ready = transitionDeliveryOperation(store, operation.id, { status: 'ready', message: 'prepared', now: AT });
  return { store, operation: ready, request };
}

for (const action of ['promote', 'rollback', 'rebuild-database']) {
  test(`abandonment preserves ${action} identity, is idempotent and permits a fresh plan`, t => {
    const { store, operation, request } = fixture(t, action);
    const closed = closeReadyDeliveryPlan(store, operation.id, { target: operation.target, now: AT });
    assert.equal(closed.status, 'abandoned');
    assert.equal(closed.gitSha, operation.gitSha);
    assert.equal(closed.events.at(-1).message, '已放弃待确认计划，未执行目标写入');
    assert.equal(closeReadyDeliveryPlan(store, operation.id, { target: operation.target, now: AT }).revision, closed.revision);
    const nextRequest = { ...request, idempotencyKey: 'plan-lifecycle:second:0002' };
    const next = createOrReuseDeliveryOperation(store, nextRequest);
    assert.notEqual(next.operation.id, operation.id);
    assert.equal(next.operation.retryOfOperationId, operation.id);
    assert.equal(next.operation.attempt, 2);
    assert.equal(createOrReuseDeliveryOperation(store, nextRequest).operation.id, next.operation.id);
    assert.equal(createOrReuseDeliveryOperation(store, request).operation.id, operation.id);
    assert.equal(readDeliveryOperation(store, operation.id).status, 'abandoned');
  });
}

test('closure rejects another target, running, unknown and completed outcomes', t => {
  const { store, operation } = fixture(t);
  assert.throws(() => closeReadyDeliveryPlan(store, operation.id, { target: 'customer-test-133' }), /does not match/u);
  transitionDeliveryOperation(store, operation.id, { status: 'launching', message: 'launching', now: AT });
  assert.throws(() => closeReadyDeliveryPlan(store, operation.id, { target: operation.target }), /only a ready/u);
  transitionDeliveryOperation(store, operation.id, { status: 'not_proven', message: 'unknown', now: AT });
  assert.throws(() => closeReadyDeliveryPlan(store, operation.id, { target: operation.target }), /only a ready/u);
  assert.equal(deliveryPlanInvalidation(readDeliveryOperation(store, operation.id), { now: '2026-10-30T00:00:00Z' }), null);
});

test('validity ends exactly 24 hours after readiness and retains an invalidation event', t => {
  const { store, operation, request } = fixture(t);
  assert.equal(deliveryPlanInvalidation(operation, { now: new Date(Date.parse(AT) + DELIVERY_PLAN_VALIDITY_MS - 1).toISOString() }), null);
  const invalidation = deliveryPlanInvalidation(operation, { now: '2026-10-28T00:00:00.000Z' });
  assert.equal(invalidation.code, 'delivery_plan_expired');
  const closed = closeReadyDeliveryPlan(store, operation.id, { target: operation.target, invalidation, now: '2026-10-28T00:00:00.000Z' });
  assert.equal(closed.status, 'invalidated');
  assert.equal(closed.metadata.planClosureReason, 'delivery_plan_expired');
  assert.throws(() => transitionDeliveryOperation(store, operation.id, { status: 'running', message: 'must not execute' }), /transition is invalid/u);
  assert.notEqual(createOrReuseDeliveryOperation(store, { ...request, idempotencyKey: 'plan-lifecycle:after-expiry:0003' }).operation.id, operation.id);
});

test('only proven same-target drift or explicit unusable assets invalidate a young plan', t => {
  const { operation } = fixture(t);
  const preflight = { target: operation.target, remote: { runtime: { serverSha: SHA, webSha: SHA } } };
  assert.equal(deliveryPlanInvalidation(operation, { now: AT, preflight }).code, 'delivery_plan_target_changed');
  assert.equal(deliveryPlanInvalidation(operation, { now: AT, preflight: { ...preflight, target: 'customer-test-133' } }), null);
  assert.equal(deliveryPlanInvalidation(operation, { now: AT, preflight: { target: operation.target, remote: { runtime: { serverSha: SHA } } } }), null);
  assert.equal(deliveryPlanInvalidation(operation, { now: AT, versions: [] }), null);
  assert.equal(deliveryPlanInvalidation(operation, { now: AT, versions: [{ gitSha: SHA, status: 'published', completeAssets: false }] }).code, 'delivery_plan_artifact_changed');
  assert.equal(deliveryPlanInvalidation({ ...operation, metadata: { promotionMode: 'initialize' } }, { now: AT, preflight }).code, 'delivery_plan_target_changed');
});
