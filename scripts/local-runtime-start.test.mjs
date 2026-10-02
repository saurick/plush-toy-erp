import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import {
  startWorkspaceRuntime,
  runWorkspaceRuntimeCLI,
} from "./local-runtime-start.mjs";
import { acquireWorkspaceRuntimeLock } from "./local-runtime-control.mjs";
import {
  runtimeBundleDirectory,
  WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE,
} from "./local-runtime-bundle.mjs";
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
      "当前有数据库迁移或迁移页后端恢复正在执行；本次工作区后端操作未开始，请等待该操作完成后重试",
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

test("cold startup preserves an existing listener under the shared runtime lock", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-cold-start-reuse-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = await startWorkspaceRuntime(root, {
    ensure: true,
    ports: () => ({ http: 8300 }),
    isPortAvailable: async () => false,
    preflight: async () => {},
    inspect: async () => ({
      owned: true,
      state: "running",
      pid: 42,
      sourceCurrent: true,
      buildCurrent: true,
      bundleId: "existing",
    }),
    createRuntime: () => assert.fail("existing listeners must not be stopped"),
    progress: () => {},
  });
  assert.deepEqual(result, {
    reused: true,
    bundleId: "existing",
    sourceCurrent: true,
    buildCurrent: true,
  });
  assert.equal(
    readDatabaseMigrationExecutionLock(
      resolveDatabaseMigrationOperationStore(root),
    ),
    null,
  );
});

test("cold startup builds current source when stopped and preserves a listener appearing during build", async (t) => {
  for (const appeared of [false, true]) {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "plush-cold-start-build-"),
    );
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    let probes = 0;
    let restarts = 0;
    let candidate;
    const result = await startWorkspaceRuntime(root, {
      ensure: true,
      ports: () => ({ http: 8300 }),
      isPortAvailable: async () => ++probes === 1 || !appeared,
      inspect: async () => ({
        owned: true,
        state: "running",
        sourceCurrent: true,
        buildCurrent: true,
      }),
      preflight: async () => {},
      build: async (_root, id) => {
        candidate = runtimeBundleDirectory(root, id);
        fs.mkdirSync(candidate, { recursive: true });
        return { id, sourceFingerprint: "current-source" };
      },
      source: async () => ({ fingerprint: "current-source" }),
      createRuntime: () => ({
        restart: async () => {
          restarts++;
          return { available: true };
        },
      }),
      progress: () => {},
    });
    assert.equal(restarts, appeared ? 0 : 1);
    assert.equal(probes, 2);
    assert.equal(result.reused, appeared ? true : undefined);
    assert.equal(fs.existsSync(candidate), !appeared);
  }
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
  const result = await acquireWorkspaceRuntimeLock(store, contender, {
    progress: (message) => progress.push(message),
    releaseWait: async () => {
      releaseDatabaseMigrationExecutionLock(store, owner);
    },
  });
  assert.equal(result.waited, true);
  assert.match(progress[0], /另一条后端启停命令正在执行/u);
  assert.match(progress[0], new RegExp(`PID=${process.pid}`, "u"));
  releaseDatabaseMigrationExecutionLock(store, contender);
});

test("workspace restart retries when the previous lock disappears before purpose read", async () => {
  let attempts = 0;
  const result = await acquireWorkspaceRuntimeLock({}, randomUUID(), {
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
    acquireWorkspaceRuntimeLock(store, randomUUID(), {
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
        "另一条工作区后端操作超过 1 秒仍未完成；本次未停止当前后端，请检查正在运行的重启终端",
    },
  );
  assert.equal(readDatabaseMigrationExecutionLock(store).operationId, owner);
  releaseDatabaseMigrationExecutionLock(store, owner);
});

test("an interrupted restart is reported immediately without reclaiming its lock or touching the backend", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-restart-interrupted-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root);
  const owner = randomUUID();
  acquireDatabaseMigrationExecutionLock(store, owner, {
    purpose: "workspace-runtime-restart",
  });
  await assert.rejects(
    acquireWorkspaceRuntimeLock(store, randomUUID(), {
      processAlive: () => false,
      releaseWait: () => assert.fail("a dead owner must not be waited on"),
    }),
    { code: "WORKSPACE_RUNTIME_RESTART_INTERRUPTED" },
  );
  assert.equal(readDatabaseMigrationExecutionLock(store).operationId, owner);
  releaseDatabaseMigrationExecutionLock(store, owner);
});

test("an interrupted migration is never reclaimed by an ordinary restart", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-restart-migration-owner-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root);
  const owner = randomUUID();
  acquireDatabaseMigrationExecutionLock(store, owner);
  await assert.rejects(
    acquireWorkspaceRuntimeLock(store, randomUUID(), {
      processAlive: () => false,
      releaseWait: () =>
        assert.fail("migration recovery must not be retried here"),
    }),
    { code: "DATABASE_MIGRATION_LOCKED" },
  );
  assert.equal(readDatabaseMigrationExecutionLock(store).operationId, owner);
  releaseDatabaseMigrationExecutionLock(store, owner);
});

test("cancelling a queued restart leaves the running owner's lock intact", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-restart-cancel-wait-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root);
  const owner = randomUUID();
  acquireDatabaseMigrationExecutionLock(store, owner, {
    purpose: "workspace-runtime-restart",
  });
  const controller = new AbortController();
  await assert.rejects(
    acquireWorkspaceRuntimeLock(store, randomUUID(), {
      signal: controller.signal,
      progress: () => controller.abort(),
    }),
    { name: "AbortError" },
  );
  assert.equal(readDatabaseMigrationExecutionLock(store).operationId, owner);
  releaseDatabaseMigrationExecutionLock(store, owner);
});

test(
  "Ctrl+C ends an owned build tree before releasing the restart lock and leaves the service alive",
  { timeout: 10_000 },
  async (t) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "plush-restart-cancel-build-"),
    );
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const pidFile = path.join(root, "build-pids.json");
    const service = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );
    t.after(() => service.kill("SIGKILL"));
    const childScript = `
    import fs from 'node:fs';
    import {spawn} from 'node:child_process';
    process.on('SIGTERM', () => {});
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'inherit'});
    fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({parent:process.pid, child:child.pid}));
    setInterval(() => {}, 1000);
  `;
    const module = pathToFileURL(
      path.join(import.meta.dirname, "local-runtime-start.mjs"),
    ).href;
    const script = `
    import {runWorkspaceRuntimeCLI,startWorkspaceRuntime} from ${JSON.stringify(module)};
    await runWorkspaceRuntimeCLI([], {
      root: ${JSON.stringify(root)},
      start: (root, options) => startWorkspaceRuntime(root, {
        ...options,
        ports: () => ({http:8300}),
        preflight: async () => {},
        build: async (_root,_id,execute) => {
          await execute(process.execPath, ['--input-type=module','-e',${JSON.stringify(childScript)}], {killGraceMs:100});
          throw new Error('cancelled build must not finish');
        },
        createRuntime: () => ({restart: () => {throw new Error('cancelled build must not switch the service');}}),
      }),
      present: () => {throw new Error('cancelled build must not present logs');},
    }).catch(error => { console.error(error.code); process.exitCode=error.code==='WORKSPACE_RUNTIME_RESTART_CANCELLED'?130:1; });
  `;
    const cli = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    t.after(() => {
      if (cli.exitCode === null && cli.signalCode === null) cli.kill("SIGKILL");
    });
    let output = "";
    cli.stdout.on("data", (chunk) => {
      output += chunk;
    });
    cli.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const closed = new Promise((resolve) =>
      cli.once("close", (code, signal) => resolve({ code, signal })),
    );
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(pidFile) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(fs.existsSync(pidFile), true, output);
    const pids = JSON.parse(fs.readFileSync(pidFile, "utf8"));
    let buildTreeExited = false;
    t.after(() => {
      if (buildTreeExited) return;
      for (const pid of [pids.parent, pids.child]) {
        try {
          process.kill(pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
    });
    assert.equal(
      readDatabaseMigrationExecutionLock(
        resolveDatabaseMigrationOperationStore(root),
      ).pid,
      cli.pid,
    );
    cli.kill("SIGINT");
    assert.deepEqual(await closed, { code: 130, signal: null }, output);
    assert.match(output, /WORKSPACE_RUNTIME_RESTART_CANCELLED/u);
    assert.equal(
      readDatabaseMigrationExecutionLock(
        resolveDatabaseMigrationOperationStore(root),
      ),
      null,
    );
    for (const pid of [pids.parent, pids.child]) {
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    }
    buildTreeExited = true;
    assert.doesNotThrow(() => process.kill(service.pid, 0));
  },
);

test("cancellation during cutover keeps the lock until runtime verification completes", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-restart-cancel-cutover-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root);
  const signals = new EventEmitter();
  let verified = false;
  await assert.rejects(
    runWorkspaceRuntimeCLI([], {
      root,
      signals,
      write: () => {},
      present: () =>
        assert.fail("cancelled CLI must return instead of following logs"),
      start: (directory, options) =>
        startWorkspaceRuntime(directory, {
          ...options,
          ports: () => ({ http: 8300 }),
          preflight: async () => {},
          build: async (_root, id) => ({ id, sourceFingerprint: "current" }),
          source: async () => ({ fingerprint: "current" }),
          progress: () => {},
          createRuntime: () => ({
            restart: async (operationId, id) => {
              signals.emit("SIGINT");
              assert.equal(
                readDatabaseMigrationExecutionLock(store).operationId,
                operationId,
              );
              await Promise.resolve();
              verified = true;
              assert.equal(
                readDatabaseMigrationExecutionLock(store).operationId,
                operationId,
              );
              return { bundleId: id };
            },
          }),
        }),
    }),
    { code: "WORKSPACE_RUNTIME_RESTART_CANCELLED" },
  );
  assert.equal(verified, true);
  assert.equal(readDatabaseMigrationExecutionLock(store), null);
  assert.equal(signals.listenerCount("SIGINT"), 0);
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
  assert.deepEqual(buildOptions, {
    workspaceVerification: "backend",
    scope: "backend",
    forceBackendBuild: false,
  });
  assert.equal(builds, 1);
  assert.equal(restarts, 1);
  assert.equal(result.sourceFingerprint, "fixed-full-source");
  assert.equal(result.backendSourceFingerprint, "fixed-backend-source");
});

test("changed-source restarts build before switching and preparation failures preserve the backend", async (t) => {
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

test("the resident log view starts only after the runtime lock is released and startup failures do not open it", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-resident-lock-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const store = resolveDatabaseMigrationOperationStore(root);
  const start = (directory) =>
    startWorkspaceRuntime(directory, {
      ports: () => ({ http: 8300 }),
      preflight: async () => {},
      build: async (_root, id) => ({ id, sourceFingerprint: "current" }),
      source: async () => ({ fingerprint: "current" }),
      progress: () => {},
      createRuntime: (_root, _origin, options) => {
        assert.equal(options.openConsole, false);
        return {
          restart: async (_operation, id) => ({
            bundleId: id,
            activeVersion: "migration",
          }),
        };
      },
    });
  const present = async (_root, options) => {
    assert.equal(readDatabaseMigrationExecutionLock(store), null);
    calls.push(options);
  };
  await runWorkspaceRuntimeCLI([], {
    root,
    start,
    present,
    interactive: true,
    write: () => {},
  });
  await runWorkspaceRuntimeCLI(["--background"], {
    root,
    start,
    present,
    interactive: true,
    write: () => {},
  });
  assert.deepEqual(calls, [
    {
      interactive: true,
      background: false,
      logOptions: { level: "INFO", match: "", full: false },
    },
    {
      interactive: true,
      background: true,
      logOptions: { level: "INFO", match: "", full: false },
    },
  ]);
  calls.length = 0;
  await assert.rejects(
    runWorkspaceRuntimeCLI([], {
      root,
      present,
      write: () => {},
      start: async () => {
        throw new Error("migration pending");
      },
    }),
    /migration pending/u,
  );
  assert.equal(calls.length, 0);
});

test("Codex and reused startup present the same service without keeping their caller waiting", async () => {
  const result = { reused: true };
  const calls = [];
  assert.equal(
    await runWorkspaceRuntimeCLI(["--ensure"], {
      start: async (_root, options) => {
        assert.equal(options.ensure, true);
        return result;
      },
      present: async (_root, options) => calls.push(options),
      interactive: false,
      write: () => assert.fail("reuse must not claim a new build"),
    }),
    result,
  );
  assert.deepEqual(calls, [
    {
      interactive: false,
      background: false,
      logOptions: { level: "INFO", match: "", full: false },
    },
  ]);
});

test("dev restart passes log filters to the resident view and rejects invalid filters before runtime changes", async () => {
  let starts = 0;
  let viewed;
  const dependencies = {
    interactive: true,
    write: () => {},
    start: async () => {
      starts++;
      return {};
    },
    present: async (_root, options) => {
      viewed = options;
    },
  };
  await runWorkspaceRuntimeCLI(
    [
      "--restart",
      "--log-level=WARN",
      "--log-match=process_runtime",
      "--log-full",
    ],
    dependencies,
  );
  assert.deepEqual(viewed, {
    interactive: true,
    background: false,
    logOptions: { level: "WARN", match: "process_runtime", full: true },
  });
  for (const args of [
    ["--log-level=bad"],
    ["--log-match="],
    ["--log-level"],
    ["--unknown"],
  ])
    await assert.rejects(
      runWorkspaceRuntimeCLI(args, dependencies),
      /日志|不支持/u,
    );
  assert.equal(starts, 1);
});

test("a failed cutover restores the verified version under the same lock without claiming new source success", async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-cutover-recovery-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = resolveDatabaseMigrationOperationStore(root),
    calls = [];
  await assert.rejects(
    startWorkspaceRuntime(root, {
      ports: () => ({ http: 8300 }),
      preflight: async () => {},
      build: async (_root, id) => ({ id, sourceFingerprint: "new" }),
      progress: () => {},
      createRuntime: () => ({
        restart: async () => {
          const error = new Error("business failed");
          error.runtimeCutoverStarted = true;
          throw error;
        },
        restorePrevious: async (id) => {
          assert.equal(
            readDatabaseMigrationExecutionLock(store).operationId,
            id,
          );
          calls.push("restored");
          return { available: true };
        },
      }),
    }),
    /business failed/u,
  );
  assert.deepEqual(calls, ["restored"]);
  assert.equal(readDatabaseMigrationExecutionLock(store), null);
});

test("CLI startup failures show the candidate log and redacted diagnostics without entering the verified log viewer", async () => {
  const lines = [];
  const error = new Error("candidate startup exited");
  error.runtimeLogFile =
    "output/dev-workbench/database-migration-runtime/failed.log";
  error.diagnostic = JSON.stringify({
    level: "ERROR",
    msg: "database unavailable",
    error: "postgres://app:private-password@localhost/db",
  });
  await assert.rejects(
    runWorkspaceRuntimeCLI(["--log-level=FATAL", "--log-match=unrelated"], {
      root: "/test/project",
      write: (line) => lines.push(line),
      start: async () => {
        throw error;
      },
      present: () =>
        assert.fail("a failed candidate cannot be shown as verified"),
    }),
    /candidate startup exited/u,
  );
  assert(
    lines.some((line) =>
      line.includes(
        "/test/project/output/dev-workbench/database-migration-runtime/failed.log",
      ),
    ),
  );
  assert(lines.some((line) => line.includes("ERROR database unavailable")));
  assert(!lines.join("\n").includes("private-password"));
});
