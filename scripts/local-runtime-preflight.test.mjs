import assert from "node:assert/strict";
import test from "node:test";

import {
  checkBackendReadiness,
  checkLocalDatabaseMigrations,
  evaluateMigrationStatus,
  isLoopbackAPIOrigin,
  normalizeAPIOrigin,
  runWebRuntimePreflight,
} from "./local-runtime-preflight.mjs";

function currentMigrationStatus() {
  return {
    Status: "OK",
    Current: "20260714081153",
    Next: "Already at latest version",
    Available: [{ Version: "20260714080000" }, { Version: "20260714081153" }],
    Applied: [{ Version: "20260714080000" }, { Version: "20260714081153" }],
  };
}

test("local runtime preflight: migration 必须精确落到最新 version", () => {
  assert.deepEqual(evaluateMigrationStatus(currentMigrationStatus()), {
    ok: true,
    currentVersion: "20260714081153",
    latestVersion: "20260714081153",
    appliedFiles: 2,
    availableFiles: 2,
    pendingFiles: 0,
  });

  const pending = currentMigrationStatus();
  pending.Applied = pending.Applied.slice(0, 1);
  pending.Current = "20260714080000";
  pending.Next = "20260714081153";
  assert.equal(evaluateMigrationStatus(pending).ok, false);

  const mismatched = currentMigrationStatus();
  mismatched.Current = "20260714080000";
  assert.equal(evaluateMigrationStatus(mismatched).ok, false);
});

test("local runtime preflight: API origin 拒绝凭据与非 HTTP 协议", () => {
  assert.equal(
    normalizeAPIOrigin("http://127.0.0.1:8300/"),
    "http://127.0.0.1:8300",
  );
  assert.throws(
    () => normalizeAPIOrigin("http://admin:secret@127.0.0.1:8300"),
    /不得包含账号或密码/u,
  );
  assert.throws(
    () => normalizeAPIOrigin("file:///tmp/socket"),
    /http 或 https/u,
  );
  assert.throws(
    () => normalizeAPIOrigin("http://127.0.0.1:8300/api?token=value"),
    /不得包含路径、查询或片段/u,
  );
});

test("local runtime preflight: 本机 API 别名不能绕过数据库检查", () => {
  for (const origin of [
    "http://127.0.0.2:8300",
    "http://0.0.0.0:8300",
    "http://localhost.:8300",
    "http://dev.localhost:8300",
    "http://[::]:8300",
    "http://[::1]:8300",
    "http://[::ffff:127.0.0.1]:8300",
  ]) {
    assert.equal(isLoopbackAPIOrigin(origin), true, origin);
  }
  assert.equal(isLoopbackAPIOrigin("https://erp.example.com"), false);
  assert.equal(isLoopbackAPIOrigin("http://192.168.1.20:8300"), false);
});

test("local runtime preflight: healthz 与 readyz 都通过才接受后端", async () => {
  const calls = [];
  const requestOptions = [];
  const output = [];
  const fetch = async (url, options) => {
    calls.push(url);
    requestOptions.push(options);
    const isReady = url.endsWith("/readyz");
    return {
      ok: true,
      status: 200,
      text: async () => (isReady ? "ready" : "ok"),
    };
  };

  await checkBackendReadiness("http://127.0.0.1:8300", {
    fetch,
    writeLine: (line) => output.push(line),
  });

  assert.deepEqual(calls, [
    "http://127.0.0.1:8300/healthz",
    "http://127.0.0.1:8300/readyz",
  ]);
  assert(requestOptions.every((options) => options.redirect === "manual"));
  assert.equal(output.length, 2);
});

test("local runtime preflight: readyz 失败时 fail closed", async () => {
  await assert.rejects(
    checkBackendReadiness("http://127.0.0.1:8300", {
      endpointTimeoutMs: 1,
      retryIntervalMs: 1,
      sleep: async () => {},
      writeLine: () => {},
      fetch: async (url) => ({
        ok: !url.endsWith("/readyz"),
        status: url.endsWith("/readyz") ? 503 : 200,
        text: async () =>
          url.endsWith("/readyz") ? "postgres not ready" : "ok",
      }),
    }),
    /readyz.*未就绪/u,
  );
});

test("local runtime preflight: 本地 web 启动复用 database 与 backend 两层检查", async () => {
  const calls = [];
  const result = await runWebRuntimePreflight(
    { apiOrigin: "http://localhost:8300" },
    {
      checkDatabase: async () => calls.push("database"),
      checkBackend: async (origin) => calls.push(`backend:${origin}`),
      writeLine: () => {},
    },
  );
  assert.deepEqual(calls, ["database", "backend:http://localhost:8300"]);
  assert.equal(result.complete, true);
});

test("local runtime preflight: frontend-only 是显式降级且不产生绿色证据", async () => {
  const calls = [];
  const output = [];
  const result = await runWebRuntimePreflight(
    { apiOrigin: "http://127.0.0.1:8300", frontendOnly: true },
    {
      checkDatabase: async () => calls.push("database"),
      checkBackend: async () => calls.push("backend"),
      writeLine: (line) => output.push(line),
    },
  );
  assert.deepEqual(calls, []);
  assert.equal(result.complete, false);
  assert.match(output.join("\n"), /降级模式.*不可作为有效验证证据/u);
});

test("local runtime preflight: db-guard 失败保留可操作诊断且不继续解析数据库", async () => {
  const calls = [];
  await assert.rejects(
    checkLocalDatabaseMigrations({
      writeLine: () => {},
      execFile: async (command) => {
        calls.push(command);
        const error = new Error("db guard failed");
        error.stderr = "[db-guard] product_skus 缺少 versioned DDL proof";
        throw error;
      },
    }),
    /schema.*migration.*product_skus 缺少 versioned DDL proof/su,
  );
  assert.deepEqual(calls, ["bash"]);
});

test("local runtime preflight: 数据库配置失败不回显 DSN 或密码", async () => {
  const calls = [];
  await assert.rejects(
    checkLocalDatabaseMigrations({
      writeLine: () => {},
      execFile: async (command) => {
        calls.push(command);
        if (command === "bash") return { stdout: "", stderr: "" };
        const error = new Error("dburl failed");
        error.stderr = "postgres://admin:top-secret@127.0.0.1:5432/plush_erp";
        throw error;
      },
    }),
    (error) => {
      assert.match(error.message, /无法解析本地开发数据库配置/u);
      assert.doesNotMatch(error.message, /top-secret|postgres:\/\//u);
      return true;
    },
  );
  assert.deepEqual(calls, ["bash", "go"]);
});
