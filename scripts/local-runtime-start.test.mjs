import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  acquireWorkspaceRuntimeRestartLock,
  startWorkspaceRuntime,
} from "./local-runtime-start.mjs";
import { WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE } from "./local-runtime-bundle.mjs";
import {
  acquireDatabaseMigrationExecutionLock,
  readDatabaseMigrationExecutionLock,
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
    message:
      "当前有数据库迁移或迁移页后端恢复正在执行；本次工作区后端重启未开始，请等待该操作完成后重试",
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

test("concurrent workspace restarts wait for the active restart instead of reporting a migration conflict", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-serialized-restart-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root),
    owner = randomUUID(),
    contender = randomUUID(),
    progress = [];
  acquireDatabaseMigrationExecutionLock(store, owner, {
    purpose: "workspace-runtime-restart",
  });
  const result = await acquireWorkspaceRuntimeRestartLock(store, contender, {
    progress: (message) => progress.push(message),
    releaseWait: async () => {
      releaseDatabaseMigrationExecutionLock(store, owner);
    },
  });
  assert.equal(result.waited, true);
  assert.match(progress[0], /另一条工作区后端重启/u);
  releaseDatabaseMigrationExecutionLock(store, contender);
});

test("workspace restart retries when the previous lock disappears before purpose read", async () => {
  let attempts = 0;
  const result = await acquireWorkspaceRuntimeRestartLock({}, randomUUID(), {
    acquire: () => {
      attempts += 1;
      if (attempts === 1) {
        const conflict = new Error("lock was released after contention");
        conflict.code = "DATABASE_MIGRATION_LOCKED";
        throw conflict;
      }
    },
    read: () => null,
    releaseWait: async () => {
      assert.fail("a released lock must be retried without waiting");
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.waited, false);
});

test("workspace restart wait is bounded and preserves the active owner", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-restart-timeout-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root),
    owner = randomUUID();
  let elapsed = 0;
  acquireDatabaseMigrationExecutionLock(store, owner, {
    purpose: "workspace-runtime-restart",
  });
  await assert.rejects(
    acquireWorkspaceRuntimeRestartLock(store, randomUUID(), {
      clock: () => elapsed,
      timeoutMs: 10,
      intervalMs: 5,
      releaseWait: async (milliseconds) => {
        elapsed += milliseconds;
      },
    }),
    {
      code: "WORKSPACE_RUNTIME_RESTART_WAIT_TIMEOUT",
      message:
        "另一条工作区后端重启超过 1 秒仍未完成；本次未停止当前后端，请检查正在运行的重启终端",
    },
  );
  assert.equal(readDatabaseMigrationExecutionLock(store).operationId, owner);
  releaseDatabaseMigrationExecutionLock(store, owner);
});

test("workspace restart rebuilds the latest source after bounded build-time changes", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-source-rebuild-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  let builds = 0;
  const result = await startWorkspaceRuntime(root, {
    preflight: async () => calls.push("preflight"),
    build: async (_root, id) => {
      calls.push(`build:${id}`);
      builds += 1;
      if (builds < 3) {
        fs.mkdirSync(
          path.join(root, "output/dev-workbench/runtime-bundles", id),
          {
            recursive: true,
          },
        );
        const changed = new Error("source changed");
        changed.code = WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE;
        throw changed;
      }
      return { id, sourceFingerprint: "latest-source" };
    },
    ports: () => ({ http: 8300 }),
    progress: (message) => calls.push(message),
    source: async () => ({ fingerprint: "latest-source" }),
    createRuntime: () => ({
      restart: async (_operationId, bundleId) => ({
        bundleId,
        available: true,
      }),
    }),
  });
  assert.equal(builds, 3);
  assert.equal(result.sourceFingerprint, "latest-source");
  assert.equal(calls.filter((call) => call === "preflight").length, 3);
  assert.equal(
    calls.filter((call) => call.includes("重新读取最新代码")).length,
    2,
  );
  assert.equal(
    fs.readdirSync(path.join(root, "output/dev-workbench/runtime-bundles"))
      .length,
    0,
    "discarded source snapshots must not accumulate",
  );
});

test("workspace restart stops after persistent writes and preserves the running backend", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-source-unstable-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let builds = 0;
  let restarts = 0;
  await assert.rejects(
    startWorkspaceRuntime(root, {
      preflight: async () => {},
      build: async (_root, id) => {
        builds += 1;
        fs.mkdirSync(
          path.join(root, "output/dev-workbench/runtime-bundles", id),
          { recursive: true },
        );
        const changed = new Error("source changed");
        changed.code = WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE;
        throw changed;
      },
      ports: () => ({ http: 8300 }),
      sourceChangeRetryLimit: 1,
      createRuntime: () => ({
        restart: async () => {
          restarts += 1;
        },
      }),
    }),
    {
      code: "WORKSPACE_RUNTIME_SOURCE_UNSTABLE",
      message:
        "工作区在连续 2 次构建与切换验证期间仍有后端代码或运行配置写入；当前已验证后端保持运行，但无法证明最新后端代码已启动，请等待相关修改完成后重试",
    },
  );
  assert.equal(builds, 2);
  assert.equal(restarts, 0);
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "output/dev-workbench/database-migration-operations/execution.lock",
      ),
    ),
    false,
  );
});

test("workspace restart rebuilds when source changes during runtime cutover", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-cutover-rebuild-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const progress = [];
  let builds = 0;
  let restarts = 0;
  const result = await startWorkspaceRuntime(root, {
    preflight: async () => {},
    build: async (_root, id) => {
      builds += 1;
      return { id, sourceFingerprint: `source-${builds}` };
    },
    ports: () => ({ http: 8300 }),
    progress: (message) => progress.push(message),
    source: async () => ({
      fingerprint:
        restarts === 1 ? "changed-during-cutover" : `source-${builds}`,
    }),
    createRuntime: () => ({
      restart: async (_operationId, bundleId) => {
        restarts += 1;
        return { bundleId, available: true };
      },
    }),
  });
  assert.equal(builds, 2);
  assert.equal(restarts, 2);
  assert.equal(result.sourceFingerprint, "source-2");
  assert.equal(
    progress.filter((message) => message.includes("切换验证期间")).length,
    1,
  );
});

test("workspace restart ignores frontend-only drift after building a consistent snapshot", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-frontend-drift-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let builds = 0;
  let restarts = 0;
  let buildOptions;
  const result = await startWorkspaceRuntime(root, {
    preflight: async () => {},
    build: async (_root, id, _execute, _progress, options) => {
      builds += 1;
      buildOptions = options;
      return {
        id,
        sourceFingerprint: "fixed-full-source",
        backendSourceFingerprint: "fixed-backend-source",
      };
    },
    ports: () => ({ http: 8300 }),
    source: async () => ({
      fingerprint: "newer-vite-source",
      backendFingerprint: "fixed-backend-source",
    }),
    createRuntime: () => ({
      restart: async (_operationId, bundleId) => {
        restarts += 1;
        return { bundleId, available: true };
      },
    }),
  });
  assert.deepEqual(buildOptions, { workspaceVerification: "backend" });
  assert.equal(builds, 1);
  assert.equal(restarts, 1);
  assert.equal(result.sourceFingerprint, "fixed-full-source");
  assert.equal(result.backendSourceFingerprint, "fixed-backend-source");
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
    source: async () => ({ fingerprint: candidate.sourceFingerprint }),
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
