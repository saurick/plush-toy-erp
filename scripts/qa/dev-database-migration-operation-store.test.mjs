import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acquireDatabaseMigrationExecutionLock,
  createOrReuseDatabaseMigrationOperation,
  listDatabaseMigrationOperations,
  publicDatabaseMigrationOperation,
  readDatabaseMigrationOperation,
  recoverInterruptedDatabaseMigrationOperations,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
  transitionDatabaseMigrationOperation,
} from "./dev-database-migration-operation-store.mjs";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY =
  "database-migration:prepare:11111111-1111-4111-8111-111111111111";

function createStore(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-migration-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return resolveDatabaseMigrationOperationStore(root);
}

test("database migration operation store keeps confirmations private", (t) => {
  const store = createStore(t);
  const created = createOrReuseDatabaseMigrationOperation(store, {
    operationId: OPERATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    kind: "migration",
    status: "preparing",
    message: "正在准备数据库升级",
  });
  const ready = transitionDatabaseMigrationOperation(
    store,
    created.operation.id,
    {
      status: "ready",
      message: "升级计划与备份恢复验证已完成",
      target: {
        key: "shared-dev",
        safeTarget: "host=192.168.0.106 port=5432 database=plush_erp",
        currentVersion: "20260728100514",
        latestVersion: "20260729043852",
        appliedFiles: 104,
        availableFiles: 105,
        pendingFiles: 1,
      },
      source: { commit: "a".repeat(40), fingerprint: "b".repeat(64) },
      plan: {
        hash: "c".repeat(64),
        preparedAt: "2026-07-29T08:00:00.000Z",
      },
      backup: {
        id: "br-yoyoosun-20260729T080000+0800",
        sizeBytes: 1234,
        sha256: "d".repeat(64),
        restoreVerified: true,
        migrationBefore: "20260728100514",
        migrationAfter: "20260729043852",
        verifiedAt: "2026-07-29T08:01:00.000Z",
      },
      confirmationPrompt: `升级共享开发库:20260729043852:${OPERATION_ID}`,
      internal: {
        targetConfirmation: "TRUST_SHARED_DEV_DATABASE:hidden",
        applyConfirmation: "APPLY_DEV_MIGRATIONS:hidden",
        maintenanceConfirmation: "SHARED_DEV_MAINTENANCE_READY:hidden",
      },
    },
  );

  assert.equal(ready.status, "ready");
  const publicOperation = publicDatabaseMigrationOperation(ready);
  assert.equal(Object.hasOwn(publicOperation, "internal"), false);
  assert.doesNotMatch(JSON.stringify(publicOperation), /hidden/u);
  assert.match(
    readFileSync(
      path.join(store, "operations", `${OPERATION_ID}.json`),
      "utf8",
    ),
    /TRUST_SHARED_DEV_DATABASE:hidden/u,
  );
  assert.equal(
    listDatabaseMigrationOperations(store, { publicOnly: true })[0].id,
    OPERATION_ID,
  );
});

test("database migration operation store is idempotent and serializes execution", (t) => {
  const store = createStore(t);
  const first = createOrReuseDatabaseMigrationOperation(store, {
    operationId: OPERATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    kind: "migration",
    status: "preparing",
    message: "正在准备数据库升级",
  });
  const second = createOrReuseDatabaseMigrationOperation(store, {
    idempotencyKey: IDEMPOTENCY_KEY,
    kind: "migration",
    status: "preparing",
    message: "正在准备数据库升级",
  });
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, OPERATION_ID);

  acquireDatabaseMigrationExecutionLock(store, OPERATION_ID);
  assert.throws(
    () =>
      acquireDatabaseMigrationExecutionLock(
        store,
        "22222222-2222-4222-8222-222222222222",
      ),
    /another database migration operation/u,
  );
  assert.equal(
    releaseDatabaseMigrationExecutionLock(store, OPERATION_ID),
    true,
  );
});

test("database migration operation store recovers interrupted work without retry", (t) => {
  const store = createStore(t);
  createOrReuseDatabaseMigrationOperation(store, {
    operationId: OPERATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    kind: "migration",
    status: "preparing",
    message: "正在准备数据库升级",
  });
  acquireDatabaseMigrationExecutionLock(store, OPERATION_ID);

  const recovered = recoverInterruptedDatabaseMigrationOperations(
    store,
    "2026-07-29T08:02:00.000Z",
    { processAlive: () => false },
  );
  assert.equal(recovered.length, 1);
  const operation = readDatabaseMigrationOperation(store, OPERATION_ID);
  assert.equal(operation.status, "not_proven");
  assert.equal(operation.issues[0].code, "interrupted_outcome_unknown");
  assert.equal(
    releaseDatabaseMigrationExecutionLock(store, OPERATION_ID),
    false,
  );
});

test("database migration operation store does not recover a live owner", (t) => {
  const store = createStore(t);
  createOrReuseDatabaseMigrationOperation(store, {
    operationId: OPERATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    kind: "migration",
    status: "preparing",
    message: "正在准备数据库升级",
  });
  acquireDatabaseMigrationExecutionLock(store, OPERATION_ID);

  assert.deepEqual(
    recoverInterruptedDatabaseMigrationOperations(
      store,
      "2026-07-29T08:02:00.000Z",
      { processAlive: () => true },
    ),
    [],
  );
  assert.equal(
    readDatabaseMigrationOperation(store, OPERATION_ID).status,
    "preparing",
  );
  assert.equal(
    releaseDatabaseMigrationExecutionLock(store, OPERATION_ID),
    true,
  );
});
