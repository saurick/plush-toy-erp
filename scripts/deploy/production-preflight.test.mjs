import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "scripts/deploy/production-preflight.sh",
);

function writeFixture({
  appImage = "plush-toy-erp-server:20260628",
  composeBuild = false,
  insecureMigrationLock = false,
} = {}) {
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
      "ERP_CUSTOMER_KEY=demo",
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
      "MIGRATION_LOCK_FILE=/run/lock/plush-toy-erp/atlas-migrate.lock",
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
      "ERP_PDF_WARMUP=async",
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
    insecureMigrationLock
      ? [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          "flock /tmp/atlas-migrate.lock /usr/local/bin/atlas migrate apply",
          "",
        ].join("\n")
      : [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          "umask 077",
          'MIGRATION_LOCK_FILE="${MIGRATION_LOCK_FILE:-/run/lock/plush-toy-erp/atlas-migrate.lock}"',
          'if [ -L "$MIGRATION_LOCK_FILE" ]; then exit 1; fi',
          'exec 9>>"$MIGRATION_LOCK_FILE"',
          "flock 9",
          "/usr/local/bin/atlas migrate apply",
          "",
        ].join("\n"),
    "utf8",
  );
  fs.chmodSync(migrateScript, 0o755);

  return { root, envFile, composeDir };
}

function runPreflight(fixture, extraArgs = [], { env = {} } = {}) {
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
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, ...env } },
  );
}

function createFakeRuntimeBin(root) {
  const binDir = path.join(root, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "compose" && "\${2:-}" == "version" ]]; then
  exit 0
fi
if [[ "\${1:-}" == "compose" ]]; then
  service="\${@: -1}"
  printf '%s-cid\n' "$service"
  exit 0
fi
if [[ "\${1:-}" == "inspect" ]]; then
  printf 'ERP_PDF_WARMUP=%s\n' "\${FAKE_RUNTIME_PDF_WARMUP:-async}"
  exit 0
fi
if [[ "\${1:-}" == "exec" ]]; then
  package="\${@: -1}"
  if [[ "$package" == "chromium-common" ]]; then
    printf '%s\n' "\${FAKE_CHROMIUM_COMMON_VERSION:-150.0.7871.100-1~deb12u1}"
  else
    printf '%s\n' "\${FAKE_CHROMIUM_VERSION:-150.0.7871.100-1~deb12u1}"
  fi
  exit 0
fi
exit 1
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(binDir, "curl"),
    "#!/usr/bin/env bash\nexit 0\n",
    "utf8",
  );
  fs.chmodSync(path.join(binDir, "docker"), 0o755);
  fs.chmodSync(path.join(binDir, "curl"), 0o755);
  return binDir;
}

test("production preflight accepts a prepared runtime env without docker config", () => {
  const fixture = writeFixture();
  const result = runPreflight(fixture);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /all checks passed/);
});

test("production preflight writes sanitized report to out file", () => {
  const fixture = writeFixture();
  const reportPath = path.join(
    fixture.root,
    "evidence",
    "production-preflight-report.txt",
  );
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
  const reportPath = path.join(
    fixture.root,
    "missing",
    "production-preflight-report.txt",
  );
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

test("production preflight rejects PDF warmup fault-isolation mode", () => {
  const fixture = writeFixture();
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace("ERP_PDF_WARMUP=async", "ERP_PDF_WARMUP=off"),
  );
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERP_PDF_WARMUP 生产发布必须显式为 async/);
});

test("production preflight verifies the runtime Chromium package exact pin", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, ["--runtime"], {
    env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Compose 运行服务存在/);
  assert.match(result.stdout, /运行态 ERP_PDF_WARMUP=async/);
  assert.match(
    result.stdout,
    /运行态 Chromium \/ chromium-common 版本与 Docker exact pin 一致: 150\.0\.7871\.100-1~deb12u1/,
  );
  assert.match(result.stdout, /healthz \/ readyz 通过/);
});

test("production preflight rejects runtime PDF warmup fault-isolation mode", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, ["--runtime"], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_PDF_WARMUP: "off",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /app-server 运行态 ERP_PDF_WARMUP 必须为 async/);
  assert.match(result.stderr, /runtime=off/);
});

test("production preflight rejects a stale runtime Chromium package", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, ["--runtime"], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_CHROMIUM_VERSION: "150.0.7871.46-1~deb12u1",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /app-server Chromium 版本不匹配/);
  assert.match(result.stderr, /runtime=150\.0\.7871\.46-1~deb12u1/);
});

test("production preflight rejects unstable runtime customer keys", () => {
  const fixture = writeFixture();
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace("ERP_CUSTOMER_KEY=demo", "ERP_CUSTOMER_KEY=current"),
  );
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERP_CUSTOMER_KEY 不能使用旧 current 别名/);
});

test("production preflight rejects migration locks in shared temporary directories", () => {
  const fixture = writeFixture();
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace(
        "MIGRATION_LOCK_FILE=/run/lock/plush-toy-erp/atlas-migrate.lock",
        "MIGRATION_LOCK_FILE=/tmp/atlas-migrate.lock",
      ),
  );
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MIGRATION_LOCK_FILE 不得位于共享临时目录/);
});

test("production preflight rejects migration scripts that truncate a shared lock file", () => {
  const fixture = writeFixture({ insecureMigrationLock: true });
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /migration 脚本必须使用 umask 077 创建私有锁/);
});

test("production preflight rejects build sections in production compose", () => {
  const fixture = writeFixture({ composeBuild: true });
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /生产 Compose 不允许包含 build:/);
});

test("production artifacts pin the verified Chromium build and async warmup", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "server/Dockerfile"),
    "utf8",
  );
  const prodEnv = fs.readFileSync(
    path.join(repoRoot, "server/deploy/compose/prod/.env.example"),
    "utf8",
  );
  const customerEnv = fs.readFileSync(
    path.join(repoRoot, "deployments/yoyoosun/env/.env.example"),
    "utf8",
  );
  const customerCompose = fs.readFileSync(
    path.join(
      repoRoot,
      "deployments/yoyoosun/compose/docker-compose.example.yml",
    ),
    "utf8",
  );

  assert.match(
    dockerfile,
    /^ARG CHROMIUM_VERSION=150\.0\.7871\.100-1~deb12u1$/m,
  );
  assert(dockerfile.includes('"chromium=${CHROMIUM_VERSION}"'));
  assert(dockerfile.includes('"chromium-common=${CHROMIUM_VERSION}"'));
  assert(dockerfile.includes("dpkg-query -W -f='${Version}' chromium"));
  assert(dockerfile.includes("dpkg-query -W -f='${Version}' chromium-common"));
  assert(
    dockerfile.includes(
      'test "$installed_chromium_version" = "$CHROMIUM_VERSION"',
    ),
  );
  assert(
    dockerfile.includes(
      'test "$installed_chromium_common_version" = "$CHROMIUM_VERSION"',
    ),
  );
  for (const envExample of [prodEnv, customerEnv]) {
    assert.match(envExample, /^ERP_PDF_WARMUP=async$/m);
    assert.doesNotMatch(envExample, /ERP_PDF_WARMUP_ENABLED/);
  }
  assert.match(
    customerCompose,
    /ERP_PDF_WARMUP: "\$\{ERP_PDF_WARMUP:-async\}"/,
  );
});
