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
      "ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false",
      "ERP_DEBUG_CLEANUP_SCOPE=none",
      "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0",
      "ERP_CUSTOMER_TRIAL_TARGET=",
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
      "    security_opt:",
      '      - "seccomp=./chromium-seccomp.json"',
      "    ports:",
      '      - "${APP_HTTP_BIND_ADDR:-127.0.0.1}:8300:8300"',
      '      - "${APP_GRPC_BIND_ADDR:-127.0.0.1}:9300:9300"',
      "  web-desktop:",
      "    image: ${WEB_IMAGE}",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.copyFileSync(
    path.join(
      repoRoot,
      "server/deploy/compose/prod/chromium-seccomp.json",
    ),
    path.join(composeDir, "chromium-seccomp.json"),
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
  if [[ "$*" == *'.Config.User'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_APP_USER:-app}"
  elif [[ "$*" == *'.HostConfig.SecurityOpt'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_SECURITY_OPT:-[\"seccomp=/fixture/chromium-seccomp.json\"]}"
  else
    printf 'ERP_PDF_WARMUP=%s\n' "\${FAKE_RUNTIME_PDF_WARMUP:-async}"
  fi
  exit 0
fi
if [[ "\${1:-}" == "exec" ]]; then
  if [[ "$*" == *' id -u' ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_APP_UID:-10001}"
    exit 0
  fi
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

test("production preflight rejects the known local admin password", () => {
  const fixture = writeFixture();
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .replace(
      "APP_ADMIN_USERNAME=admin",
      "APP_ADMIN_USERNAME=admin\nAPP_ADMIN_PASSWORD=adminadmin",
    )
    .replace("BOOTSTRAP_ADMIN_ONCE=false", "BOOTSTRAP_ADMIN_ONCE=true");
  fs.writeFileSync(fixture.envFile, env, "utf8");

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不得使用已知的本地开发默认密码/u);
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

test("production preflight rejects enabled business data clear", () => {
  const fixture = writeFixture();
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace(
        "ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false",
        "ERP_DEBUG_BUSINESS_CLEAR_ENABLED=true",
      ),
  );
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERP_DEBUG_BUSINESS_CLEAR_ENABLED 必须为 false/);
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
    /运行态 app-server 使用非 root 用户: app \(uid=10001\)/,
  );
  assert.match(
    result.stdout,
    /运行态 Chromium \/ chromium-common 版本与 Docker exact pin 一致: 150\.0\.7871\.100-1~deb12u1/,
  );
  assert.match(result.stdout, /healthz \/ readyz 通过/);
});

test("production preflight rejects a root app-server runtime", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, ["--runtime"], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_APP_USER: "0:0",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /app-server 运行态禁止使用 root/);
});

test("production preflight rejects a named runtime user mapped to uid 0", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, ["--runtime"], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_APP_USER: "app",
      FAKE_RUNTIME_APP_UID: "0",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /app-server 运行态 uid 必须是非 root 数字/);
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

test("production preflight allows the exact isolated customer-trial-133 database", () => {
  const fixture = writeFixture();
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .replace("ERP_CUSTOMER_KEY=demo", "ERP_CUSTOMER_KEY=yoyoosun")
    .replace(
      /^POSTGRES_DSN=.*$/m,
      "POSTGRES_DSN=postgres://postgres:test-production-password@postgres:5432/plush_erp_uat_20260715?sslmode=disable",
    )
    .replace("POSTGRES_DB=plush_erp", "POSTGRES_DB=plush_erp_uat_20260715")
    .replace(
      "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0",
      "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=1",
    )
    .replace(
      "ERP_CUSTOMER_TRIAL_TARGET=",
      "ERP_CUSTOMER_TRIAL_TARGET=customer-trial-133",
    );
  fs.writeFileSync(fixture.envFile, env, "utf8");

  const result = runPreflight(fixture);
  assert.equal(result.status, 0, result.stderr);
});

test("production preflight rejects customer-trial opt-in outside its exact database", () => {
  const fixture = writeFixture();
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .replace("ERP_CUSTOMER_KEY=demo", "ERP_CUSTOMER_KEY=yoyoosun")
    .replace(
      "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0",
      "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=1",
    )
    .replace(
      "ERP_CUSTOMER_TRIAL_TARGET=",
      "ERP_CUSTOMER_TRIAL_TARGET=customer-trial-133",
    );
  fs.writeFileSync(fixture.envFile, env, "utf8");

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DSN 必须精确指向单一/);
});

test("production preflight rejects extra customer-trial DSN query options", () => {
  const fixture = writeFixture();
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .replace("ERP_CUSTOMER_KEY=demo", "ERP_CUSTOMER_KEY=yoyoosun")
    .replace(
      /^POSTGRES_DSN=.*$/m,
      "POSTGRES_DSN=postgres://postgres:test-production-password@postgres:5432/plush_erp_uat_20260715?sslmode=disable&target_session_attrs=read-write",
    )
    .replace("POSTGRES_DB=plush_erp", "POSTGRES_DB=plush_erp_uat_20260715")
    .replace(
      "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0",
      "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=1",
    )
    .replace(
      "ERP_CUSTOMER_TRIAL_TARGET=",
      "ERP_CUSTOMER_TRIAL_TARGET=customer-trial-133",
    );
  fs.writeFileSync(fixture.envFile, env, "utf8");

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DSN 必须精确指向单一/);
});

test("production preflight rejects a target marker while customer-trial is disabled", () => {
  const fixture = writeFixture();
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .replace(
      "ERP_CUSTOMER_TRIAL_TARGET=",
      "ERP_CUSTOMER_TRIAL_TARGET=customer-trial-133",
    );
  fs.writeFileSync(fixture.envFile, env, "utf8");

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERP_CUSTOMER_TRIAL_TARGET 必须为空/);
});

test("production preflight rejects an unconfined Chromium runtime", () => {
  const fixture = writeFixture();
  const composePath = path.join(fixture.composeDir, "compose.yml");
  fs.writeFileSync(
    composePath,
    fs
      .readFileSync(composePath, "utf8")
      .replace(
        'seccomp=./chromium-seccomp.json',
        "seccomp=unconfined",
      ),
  );
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /必须使用固定 Chromium seccomp profile/);
});

test("production preflight rejects Chromium seccomp profile drift", () => {
  const fixture = writeFixture();
  fs.appendFileSync(
    path.join(fixture.composeDir, "chromium-seccomp.json"),
    "\n",
  );
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Chromium seccomp profile 已漂移/);
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
  const productionCompose = fs.readFileSync(
    path.join(repoRoot, "server/deploy/compose/prod/compose.yml"),
    "utf8",
  );
  const chromiumSeccomp = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        "server/deploy/compose/prod/chromium-seccomp.json",
      ),
      "utf8",
    ),
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
  assert.match(dockerfile, /^USER app$/m);
  assert.match(
    dockerfile,
    /useradd --system --uid 10001 --gid app --create-home --home-dir \/home\/app/u,
  );
  assert.match(dockerfile, /^ENV HOME=\/home\/app$/mu);
  assert.match(dockerfile, /useradd --system --uid 10001 --gid app/);
  assert.match(productionCompose, /seccomp=\.\/chromium-seccomp\.json/);
  assert.doesNotMatch(
    productionCompose,
    /seccomp[=:]\s*unconfined|apparmor[=:]\s*unconfined|SYS_ADMIN|privileged:\s*true/,
  );
  assert.deepEqual(chromiumSeccomp.syscalls[0], {
    names: ["clone", "clone3", "unshare"],
    action: "SCMP_ACT_ALLOW",
    comment:
      "Chromium user-namespace sandbox; all other rules are Moby seccomp v0.2.3 defaults",
  });
  for (const envExample of [prodEnv, customerEnv]) {
    assert.match(envExample, /^ERP_PDF_WARMUP=async$/m);
    assert.doesNotMatch(envExample, /ERP_PDF_WARMUP_ENABLED/);
  }
  assert.match(
    customerCompose,
    /ERP_PDF_WARMUP: "\$\{ERP_PDF_WARMUP:-async\}"/,
  );
});
