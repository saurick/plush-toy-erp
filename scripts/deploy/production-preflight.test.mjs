import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "scripts/deploy/production-preflight.sh");

function writeFixture({ appImage = "plush-toy-erp-server:20260628", composeBuild = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "production-preflight-"));
  const composeDir = path.join(root, "compose");
  fs.mkdirSync(composeDir, { recursive: true });

  const jwtSecret = "a".repeat(40);
  const postgresPassword = "test-production-password";
  const envFile = path.join(root, ".env");
  fs.writeFileSync(
    envFile,
    [
      "PROJECT_SLUG=plush-toy-erp",
      `APP_IMAGE=${appImage}`,
      "WEB_IMAGE=plush-toy-erp-web:20260628",
      "POSTGRES_IMAGE=postgres:18.1",
      "JAEGER_IMAGE=jaegertracing/all-in-one:1.76.0",
      "TZ=Asia/Shanghai",
      `POSTGRES_DSN=postgres://plush:${postgresPassword}@127.0.0.1:5435/plush_erp`,
      `POSTGRES_PASSWORD=${postgresPassword}`,
      "POSTGRES_DB=plush_erp",
      "POSTGRES_USER=plush",
      "POSTGRES_DATA_DIR=/data/plush/postgres",
      "POSTGRES_BIND_ADDR=127.0.0.1",
      "TRACE_ENDPOINT=http://jaeger:4318/v1/traces",
      "TRACE_RATIO=0.1",
      "WEB_API_ORIGIN=https://erp.yoyoosun.local",
      "APP_HTTP_BIND_ADDR=127.0.0.1",
      "APP_GRPC_BIND_ADDR=127.0.0.1",
      `APP_JWT_SECRET=${jwtSecret}`,
      "APP_AUTH_SMS_MODE=disabled",
      "APP_ADMIN_USERNAME=admin",
      "BOOTSTRAP_ADMIN_ONCE=false",
      "ERP_DEBUG_ENV=prod",
      "ERP_DEBUG_SEED_ENABLED=false",
      "ERP_DEBUG_CLEANUP_ENABLED=false",
      "ERP_DEBUG_CLEANUP_SCOPE=none",
      "JAEGER_BIND_ADDR=127.0.0.1",
      "",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(composeDir, "compose.yml"),
    [
      "services:",
      "  postgres:",
      "    image: ${POSTGRES_IMAGE}",
      "    ports:",
      '      - "${POSTGRES_BIND_ADDR:-127.0.0.1}:5435:5432"',
      "  jaeger:",
      "    image: ${JAEGER_IMAGE}",
      "    ports:",
      '      - "${JAEGER_BIND_ADDR:-127.0.0.1}:16686:16686"',
      "  app-server:",
      composeBuild ? "    build: ." : "    image: ${APP_IMAGE}",
      "    ports:",
      '      - "${APP_HTTP_BIND_ADDR:-127.0.0.1}:8300:8300"',
      '      - "${APP_GRPC_BIND_ADDR:-127.0.0.1}:9300:9300"',
      "  web-desktop:",
      "    image: ${WEB_IMAGE}",
      "",
    ].join("\n"),
    "utf8",
  );

  const migrateScript = path.join(composeDir, "migrate_online.sh");
  fs.writeFileSync(
    migrateScript,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "flock /tmp/atlas-migrate.lock /usr/local/bin/atlas migrate apply",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.chmodSync(migrateScript, 0o755);

  return { root, envFile, composeDir };
}

function runPreflight(fixture, extraArgs = []) {
  return spawnSync(
    "bash",
    [
      scriptPath,
      "--env-file",
      fixture.envFile,
      "--compose-dir",
      fixture.composeDir,
      "--skip-compose-config",
      ...extraArgs,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

test("production preflight accepts a prepared runtime env without docker config", () => {
  const fixture = writeFixture();
  const result = runPreflight(fixture);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /all checks passed/);
});

test("production preflight writes sanitized report to out file", () => {
  const fixture = writeFixture();
  const reportPath = path.join(fixture.root, "evidence", "production-preflight-report.txt");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const result = runPreflight(fixture, ["--out", reportPath]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = fs.readFileSync(reportPath, "utf8");
  assert.match(report, /env 必需变量齐全/);
  assert.match(report, /all checks passed/);
  assert.doesNotMatch(report, /test-production-password/);
});

test("production preflight rejects missing out directory before writing report", () => {
  const fixture = writeFixture();
  const reportPath = path.join(fixture.root, "missing", "production-preflight-report.txt");
  const result = runPreflight(fixture, ["--out", reportPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /输出目录不存在/);
  assert.equal(fs.existsSync(reportPath), false);
});

test("production preflight rejects floating app image tags", () => {
  const fixture = writeFixture({ appImage: "plush-toy-erp-server:latest" });
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /APP_IMAGE 不能使用 :dev 或 :latest/);
});

test("production preflight rejects build sections in production compose", () => {
  const fixture = writeFixture({ composeBuild: true });
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /生产 Compose 不允许包含 build:/);
});
