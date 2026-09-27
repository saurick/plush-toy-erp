import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { startWorkspaceRuntime } from "./local-runtime-start.mjs";
import {
  acquireDatabaseMigrationExecutionLock,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
} from "./qa/dev-database-migration-operation-store.mjs";

test("a normal restart cannot interrupt a preparation or maintenance operation", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-serialized-start-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root),
    existing = randomUUID();
  acquireDatabaseMigrationExecutionLock(store, existing);
  let restarts = 0;
  const runtime = {
    preflight: async () => {},
    build: async () => ({
      id: "current-source",
      sourceFingerprint: "new-source",
    }),
    ports: () => ({ http: 8300 }),
    createRuntime: () => ({
      restart: async (_operation, id) => {
        assert.equal(id, "current-source");
        restarts++;
        throw new Error("startup fixture failure");
      },
    }),
  };
  await assert.rejects(startWorkspaceRuntime(root, runtime), {
    code: "DATABASE_MIGRATION_LOCKED",
  });
  assert.equal(restarts, 0);
  releaseDatabaseMigrationExecutionLock(store, existing);
  await assert.rejects(
    startWorkspaceRuntime(root, runtime),
    /startup fixture failure/u,
  );
  assert.equal(restarts, 1);
  assert.equal(fs.existsSync(path.join(store, "execution.lock")), false);
});

test("restart compiles current source and never substitutes an existing bundle", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-current-start-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  let candidate;
  const dependencies = {
    ports: () => ({ http: 8300 }),
    preflight: async () => calls.push("preflight"),
    build: async (_root, id) => {
      calls.push("build");
      candidate = { id, sourceFingerprint: "current-content" };
      return candidate;
    },
    createRuntime: () => ({
      restart: async (operation, id) => {
        calls.push("restart");
        assert.equal(id, candidate.id);
        assert.equal(operation, id);
        return { available: true, bundleId: id };
      },
    }),
  };
  const first = await startWorkspaceRuntime(root, dependencies);
  const second = await startWorkspaceRuntime(root, dependencies);
  assert.notEqual(first.bundleId, second.bundleId);
  assert.equal(second.sourceFingerprint, "current-content");
  assert.deepEqual(calls, [
    "preflight",
    "build",
    "restart",
    "preflight",
    "build",
    "restart",
  ]);
  for (const failure of ["preflight", "build"]) {
    calls.length = 0;
    await assert.rejects(
      startWorkspaceRuntime(root, {
        ...dependencies,
        [failure]: async () => {
          throw new Error(`${failure} failed`);
        },
      }),
      new RegExp(`${failure} failed`, "u"),
    );
    assert(
      !calls.includes("restart"),
      "failed preparation must preserve the running process",
    );
  }
});
