import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  stopWorkspaceRuntime,
  stopRuntimeListeners,
  readWorkspaceRuntimeStatus,
} from "./local-runtime-control.mjs";
import { startWorkspaceRuntime } from "./local-runtime-start.mjs";
import {
  acquireDatabaseMigrationExecutionLock,
  readDatabaseMigrationExecutionLock,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
} from "./qa/dev-database-migration-operation-store.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-runtime-control-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("internal stop requires the exact operation and owner; a held migration lock never reacquires", async (t) => {
  const root = fixture(t);
  const store = resolveDatabaseMigrationOperationStore(root),
    id = randomUUID();
  let stops = 0;
  const dependencies = {
    ports: () => ({ http: 8300 }),
    execute: async (command, args) => {
      assert.equal(command, "bash");
      assert.equal(args.at(-1), "8300");
      stops++;
    },
  };
  await assert.rejects(
    stopRuntimeListeners(root, id, dependencies),
    /持有对应操作锁/u,
  );
  acquireDatabaseMigrationExecutionLock(store, id);
  await assert.rejects(
    stopRuntimeListeners(root, randomUUID(), dependencies),
    /持有对应操作锁/u,
  );
  await assert.rejects(
    stopRuntimeListeners(root, id, {
      ...dependencies,
      readLock: () => ({ operationId: id, pid: process.pid + 100 }),
    }),
    /持有对应操作锁/u,
  );
  await stopRuntimeListeners(root, id, dependencies);
  assert.equal(stops, 1);
  assert.equal(readDatabaseMigrationExecutionLock(store).operationId, id);
  releaseDatabaseMigrationExecutionLock(store, id);
});

test("public stop serializes behind restart and always releases its own lock", async (t) => {
  const root = fixture(t),
    calls = [];
  let unblock, entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    unblock = resolve;
  });
  const restart = startWorkspaceRuntime(root, {
    ports: () => ({ http: 8300 }),
    preflight: async () => {
      calls.push("restart-check");
      entered();
      await gate;
    },
    build: async (_root, id) => ({ id, sourceFingerprint: "current" }),
    source: async () => ({ fingerprint: "current" }),
    progress: () => {},
    createRuntime: () => ({
      restart: async () => {
        calls.push("restart-done");
        return {};
      },
    }),
  });
  await ready;
  const stopping = stopWorkspaceRuntime(root, {
    progress: () => {},
    stop: async (_root, id) => {
      assert.equal(
        readDatabaseMigrationExecutionLock(
          resolveDatabaseMigrationOperationStore(root),
        ).operationId,
        id,
      );
      calls.push("stop");
    },
  });
  unblock();
  await Promise.all([restart, stopping]);
  assert.deepEqual(calls, ["restart-check", "restart-done", "stop"]);
  assert.equal(
    readDatabaseMigrationExecutionLock(
      resolveDatabaseMigrationOperationStore(root),
    ),
    null,
  );
  await assert.rejects(
    stopWorkspaceRuntime(root, {
      progress: () => {},
      stop: async () => {
        throw new Error("inspection failed");
      },
    }),
    /inspection failed/u,
  );
  assert.equal(
    readDatabaseMigrationExecutionLock(
      resolveDatabaseMigrationOperationStore(root),
    ),
    null,
  );
});

test("stop cannot enter an active migration or cancel someone else's operation", async (t) => {
  const root = fixture(t),
    store = resolveDatabaseMigrationOperationStore(root),
    id = randomUUID();
  acquireDatabaseMigrationExecutionLock(store, id);
  await assert.rejects(
    stopWorkspaceRuntime(root, {
      stop: () => assert.fail("migration owns the runtime"),
    }),
    { code: "DATABASE_MIGRATION_LOCKED" },
  );
  assert.equal(readDatabaseMigrationExecutionLock(store).operationId, id);
  releaseDatabaseMigrationExecutionLock(store, id);
});

test("read-only status does not create an operation store and rejects an unrelated listener", async (t) => {
  const root = fixture(t);
  const status = await readWorkspaceRuntimeStatus(root, {
    ports: () => ({ http: 8300 }),
    active: () => null,
    listeners: async () => [42],
    checkDatabase: false,
  });
  assert.equal(status.state, "unavailable");
  assert.equal(status.owned, false);
  assert.match(status.issue, /未停止任何服务/u);
  assert.equal(fs.existsSync(path.join(root, "output")), false);
});

test("healthy status proves PID, directory, identity and build inputs; source changes stay visible", async (t) => {
  const root = fixture(t);
  const bundle = {
    id: randomUUID(),
    directory: path.join(root, "bundle"),
    backendSourceFingerprint: "current",
    runtime: { pid: 42 },
    components: { backend: { fingerprint: "compiled" } },
  };
  const dependencies = {
    ports: () => ({ http: 8300 }),
    active: () => bundle,
    listeners: async () => [42],
    cwd: async () => path.join(bundle.directory, "source/server"),
    source: async () => ({ backendFingerprint: "current" }),
    buildInputs: async () => ({ backend: "compiled" }),
    fetchImpl: async (url) =>
      new Response(url.endsWith("healthz") ? "ok" : "ready", {
        headers: { "X-ERP-Runtime-Identity-Proof": "matched-v1" },
      }),
    preflight: async () => {},
  };
  const healthy = await readWorkspaceRuntimeStatus(root, dependencies);
  assert.equal(healthy.state, "running");
  assert.equal(healthy.sourceCurrent, true);
  assert.equal(healthy.buildCurrent, true);
  assert.equal(healthy.database, "passed");
  const changed = await readWorkspaceRuntimeStatus(root, {
    ...dependencies,
    source: async () => ({ backendFingerprint: "changed" }),
    preflight: async () => {
      throw new Error("pending");
    },
  });
  assert.equal(changed.state, "running");
  assert.equal(changed.sourceCurrent, false);
  assert.equal(changed.database, "blocked");
  const wrong = await readWorkspaceRuntimeStatus(root, {
    ...dependencies,
    fetchImpl: async () => new Response("ok"),
  });
  assert.equal(wrong.state, "unavailable");
});
