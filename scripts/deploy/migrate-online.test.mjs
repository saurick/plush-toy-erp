import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const migrateScript = path.join(
  repoRoot,
  "server/deploy/compose/prod/migrate_online.sh",
);
const populatedUpgradePreflight = path.join(
  repoRoot,
  "scripts/qa/populated-upgrade-preflight.sh",
);
const systemFlock = findCommand("flock");
const perl = findCommand("perl");

function findCommand(command) {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function createFixture({ useSystemFlock = false } = {}) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "migrate-online-")),
  );
  const binDir = path.join(root, "bin");
  const migrateDir = path.join(root, "migrations");
  const fixtureMigrateScript = path.join(root, "migrate_online.sh");
  const composeFile = path.join(root, "compose.yml");
  const composeOverrideFile = path.join(root, "compose.customer-trial-133.yml");
  const composeEnvFile = path.join(root, "runtime", ".env.customer-trial-133");
  const trialRoot = path.join(root, "plush-toy-erp-v5");
  const trialPostgresDataDir = path.join(trialRoot, "data/postgres");
  const trialMigrationLockFile = path.join(trialRoot, "run/atlas-migrate.lock");
  const atlasLog = path.join(root, "atlas.log");
  const psqlLog = path.join(root, "psql.log");
  const eventLog = path.join(root, "events.log");
  const flockLog = path.join(root, "flock.log");
  const composeLog = path.join(root, "compose.log");
  const lockDir = path.join(root, "private-lock");
  const lockFile = path.join(lockDir, "migration.lock");
  const atlasBin = path.join(binDir, "atlas");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(migrateDir, { recursive: true });
  fs.mkdirSync(path.dirname(composeEnvFile), { recursive: true });
  const productionDataContract =
    "TRIAL_POSTGRES_DATA_DIR=/home/simon/plush-toy-erp-v5/data/postgres";
  const productionLockContract =
    "TRIAL_MIGRATION_LOCK_FILE=/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock";
  const productionEnvContract =
    "TRIAL_COMPOSE_ENV_FILE=/home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133";
  const productionMigrateDirContract =
    "TRIAL_MIG_DIR=$SERVER_ROOT/internal/data/model/migrate";
  const productionAtlasContract = "TRIAL_ATLAS_BIN=/usr/local/bin/atlas";
  const productionPreflightContract =
    "TRIAL_POPULATED_UPGRADE_PREFLIGHT=$SERVER_ROOT/../scripts/qa/populated-upgrade-preflight.sh";
  let fixtureMigrateSource = fs.readFileSync(migrateScript, "utf8");
  assert.match(fixtureMigrateSource, new RegExp(productionDataContract, "u"));
  assert.match(fixtureMigrateSource, new RegExp(productionLockContract, "u"));
  fixtureMigrateSource = fixtureMigrateSource
    .replace(
      productionDataContract,
      `TRIAL_POSTGRES_DATA_DIR=${trialPostgresDataDir}`,
    )
    .replace(
      productionLockContract,
      `TRIAL_MIGRATION_LOCK_FILE=${trialMigrationLockFile}`,
    )
    .replace(productionEnvContract, `TRIAL_COMPOSE_ENV_FILE=${composeEnvFile}`)
    .replace(productionMigrateDirContract, `TRIAL_MIG_DIR=${migrateDir}`)
    .replace(productionAtlasContract, `TRIAL_ATLAS_BIN=${atlasBin}`)
    .replace(
      productionPreflightContract,
      `TRIAL_POPULATED_UPGRADE_PREFLIGHT=${populatedUpgradePreflight}`,
    );
  fs.writeFileSync(fixtureMigrateScript, fixtureMigrateSource, "utf8");
  fs.chmodSync(fixtureMigrateScript, 0o755);
  fs.writeFileSync(
    composeFile,
    "services:\n  postgres:\n    image: postgres:18.1\n",
    "utf8",
  );

  writeExecutable(
    path.join(binDir, "docker"),
    `#!/bin/sh
if [ "$1" = "compose" ] && [ "$2" = "version" ]; then
  exit 0
fi
if [ "$1" = "compose" ]; then
  printf '%s\n' "$*" >> "$COMPOSE_LOG"
fi
case " $* " in
  *" ps -q app-server "*)
    if [ -n "\${APP_SERVER_CID:-}" ]; then
      printf '%s\n' "$APP_SERVER_CID"
    fi
    exit 0
    ;;
  *" ps -q "*)
    printf '%s\n' "\${POSTGRES_CID_OUTPUT-postgres-test-cid}"
    exit 0
    ;;
esac
if [ "$1" = "inspect" ] && [ "$2" = "--format" ]; then
  template=$3
  container_id=$4
  case "$template" in
    *com.docker.compose.project*)
      if [ "$container_id" = "\${APP_SERVER_CID:-}" ]; then
        printf '%s\n' "\${FAKE_APP_PROJECT:-plush-toy-erp-v5}"
      else
        printf '%s\n' "\${FAKE_POSTGRES_PROJECT:-plush-toy-erp-v5}"
      fi
      ;;
    '{{.Name}}')
      if [ "$container_id" = "\${APP_SERVER_CID:-}" ]; then
        printf '/%s\n' "\${FAKE_APP_NAME:-plush-toy-erp-v5-server}"
      else
        printf '/%s\n' "\${FAKE_POSTGRES_NAME:-plush-toy-erp-v5-postgres}"
      fi
      ;;
    *NetworkSettings.Ports*)
      printf '%s\n' "\${FAKE_POSTGRES_BINDING:-127.0.0.1|55435}"
      ;;
    *Mounts*)
      printf 'bind|%s\n' "$FAKE_POSTGRES_DATA_DIR"
      ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "exec" ]; then
  case "$*" in
    *POSTGRES_DB*) printf '%s' "\${FAKE_POSTGRES_DB:-plush_erp_uat_20260716_v5}" ;;
    *POSTGRES_PASSWORD*) printf '%s' "\${FAKE_POSTGRES_PASSWORD:-test-postgres-password}" ;;
    *POSTGRES_USER*) printf '%s' "\${FAKE_POSTGRES_USER:-postgres}" ;;
    *) exit 1 ;;
  esac
  exit 0
fi
exit 1
`,
  );

  writeExecutable(
    atlasBin,
    `#!/bin/sh
case "$*" in
  "migrate status "*) phase='status' ;;
  "migrate apply --dry-run "*) phase='dry-run' ;;
  "migrate apply "*) phase='apply' ;;
  *) phase='unknown' ;;
esac
printf '%s\n' "$*" >> "$ATLAS_LOG"
printf '%s start %s\n' "\${RUN_LABEL:-run}" "$phase" >> "$EVENT_LOG"
if [ "\${ATLAS_SLEEP_PHASE:-}" = "$phase" ]; then
  sleep "\${ATLAS_SLEEP_SECONDS:-1}"
fi
if [ "\${ATLAS_FAIL_PHASE:-}" = "$phase" ]; then
  exit "\${ATLAS_FAIL_CODE:-42}"
fi
printf '%s end %s\n' "\${RUN_LABEL:-run}" "$phase" >> "$EVENT_LOG"
`,
  );

  const psqlBin = path.join(binDir, "psql");
  writeExecutable(
    psqlBin,
    `#!/bin/sh
printf '%s\n' "$*" >> "$PSQL_LOG"
payload=$(cat)
case "$payload" in
  *plush_populated_upgrade*) audit='populated-upgrade' ;;
  *plush_customer_config_cutover*) audit='customer-config-cutover' ;;
  *) audit='unknown-audit' ;;
esac
printf '%s start %s\n' "\${RUN_LABEL:-run}" "$audit" >> "$EVENT_LOG"
if [ -n "\${PREFLIGHT_FAIL_CODE:-}" ] && { [ -z "\${PREFLIGHT_FAIL_AUDIT:-}" ] || [ "$PREFLIGHT_FAIL_AUDIT" = "$audit" ]; }; then
  printf '%s fail %s\n' "\${RUN_LABEL:-run}" "$audit" >> "$EVENT_LOG"
  exit "$PREFLIGHT_FAIL_CODE"
fi
printf '%s end %s\n' "\${RUN_LABEL:-run}" "$audit" >> "$EVENT_LOG"
`,
  );

  if (!useSystemFlock) {
    writeExecutable(
      path.join(binDir, "flock"),
      `#!/bin/sh
printf '%s\n' "$*" >> "$FLOCK_LOG"
exit 0
`,
    );
  } else if (!systemFlock) {
    assert(
      perl,
      "the portable flock fixture requires Perl when flock is unavailable",
    );
    writeExecutable(
      path.join(binDir, "flock"),
      `#!${perl}
use strict;
use warnings;
use Fcntl qw(LOCK_EX);
my $fd = shift @ARGV;
die "missing file descriptor\\n" unless defined $fd && $fd =~ /^\\d+$/;
open(my $lock_handle, ">&=$fd") or die "dup fd $fd failed: $!\\n";
flock($lock_handle, LOCK_EX) or die "flock fd $fd failed: $!\\n";
`,
    );
  }

  return {
    root,
    migrateScript: fixtureMigrateScript,
    composeFile,
    composeOverrideFile,
    composeEnvFile,
    trialPostgresDataDir,
    trialMigrationLockFile,
    lockDir,
    lockFile,
    atlasLog,
    psqlLog,
    eventLog,
    flockLog,
    composeLog,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      COMPOSE_OVERRIDE_FILE: "",
      COMPOSE_ENV_FILE: "",
      MIG_DIR: migrateDir,
      ATLAS_BIN: atlasBin,
      PSQL_BIN: psqlBin,
      POPULATED_UPGRADE_PREFLIGHT: populatedUpgradePreflight,
      DB_URL: "postgres://test:test@127.0.0.1:5435/test?sslmode=disable",
      MIGRATION_LOCK_FILE: lockFile,
      ATLAS_LOG: atlasLog,
      PSQL_LOG: psqlLog,
      EVENT_LOG: eventLog,
      FLOCK_LOG: flockLog,
      COMPOSE_LOG: composeLog,
    },
  };
}

function configureCustomerTrialFixture(fixture, replacements = {}) {
  const postgresDataDir = fixture.trialPostgresDataDir;
  const migrationLockFile = fixture.trialMigrationLockFile;
  const values = new Map([
    ["PROJECT_SLUG", "plush-toy-erp-v5"],
    ["ERP_CUSTOMER_KEY", "yoyoosun"],
    ["POSTGRES_DB", "plush_erp_uat_20260716_v5"],
    ["POSTGRES_USER", "postgres"],
    ["POSTGRES_PASSWORD", "test-postgres-password"],
    ["POSTGRES_DATA_DIR", postgresDataDir],
    ["MIGRATION_LOCK_FILE", migrationLockFile],
    ["POSTGRES_BIND_ADDR", "127.0.0.1"],
    ["APP_HTTP_BIND_ADDR", "127.0.0.1"],
    ["APP_GRPC_BIND_ADDR", "127.0.0.1"],
    ["WEB_DESKTOP_BIND_ADDR", "127.0.0.1"],
    ["POSTGRES_PORT", "55435"],
    ["APP_HTTP_PORT", "8315"],
    ["APP_GRPC_PORT", "9315"],
    ["WEB_DESKTOP_PORT", "5185"],
    ["JAEGER_5775_PORT", "45775"],
    ["JAEGER_6831_PORT", "46831"],
    ["JAEGER_6832_PORT", "46832"],
    ["JAEGER_5778_PORT", "45778"],
    ["JAEGER_UI_PORT", "46687"],
    ["JAEGER_14268_PORT", "54268"],
    ["JAEGER_14250_PORT", "54250"],
    ["JAEGER_9411_PORT", "49411"],
    ["JAEGER_OTLP_GRPC_PORT", "44317"],
    ["JAEGER_OTLP_HTTP_PORT", "44318"],
    ["ERP_ALLOW_CUSTOMER_TRIAL_CONFIG", "1"],
    ["ERP_CUSTOMER_TRIAL_TARGET", "customer-trial-133"],
  ]);
  for (const [key, value] of Object.entries(replacements)) {
    values.set(key, value);
  }

  fs.writeFileSync(
    fixture.composeOverrideFile,
    "# V5 isolated compose project\nname: plush-toy-erp-v5\n",
    "utf8",
  );
  fs.writeFileSync(
    fixture.composeEnvFile,
    `${[...values].map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
    "utf8",
  );
  fs.chmodSync(fixture.composeEnvFile, 0o600);

  delete fixture.env.DB_URL;
  delete fixture.env.MIGRATION_LOCK_FILE;
  delete fixture.env.POSTGRES_HOST;
  delete fixture.env.POSTGRES_HOST_PORT;
  delete fixture.env.POSTGRES_SERVICE;
  delete fixture.env.APP_SERVICE;
  delete fixture.env.COMPOSE_FILE;
  delete fixture.env.MIG_DIR;
  delete fixture.env.ATLAS_BIN;
  delete fixture.env.PSQL_BIN;
  delete fixture.env.POPULATED_UPGRADE_PREFLIGHT;
  for (const key of values.keys()) delete fixture.env[key];
  for (const key of [
    "COMPOSE_PROJECT_NAME",
    "COMPOSE_PROFILES",
    "COMPOSE_ENV_FILES",
    "COMPOSE_PATH_SEPARATOR",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ]) {
    delete fixture.env[key];
  }

  fixture.env.COMPOSE_OVERRIDE_FILE = fixture.composeOverrideFile;
  fixture.env.COMPOSE_ENV_FILE = fixture.composeEnvFile;
  fixture.env.FAKE_POSTGRES_DATA_DIR = values.get("POSTGRES_DATA_DIR");
  return { values, postgresDataDir, migrationLockFile };
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function atlasPhases(filePath) {
  return readLines(filePath).map((line) => {
    if (line.startsWith("migrate status ")) return "status";
    if (line.startsWith("migrate apply --dry-run ")) return "dry-run";
    if (line.startsWith("migrate apply ")) return "apply";
    return "unknown";
  });
}

function expectedEvents(phases, label = "run") {
  return phases.flatMap((phase) => [
    `${label} start ${phase}`,
    `${label} end ${phase}`,
  ]);
}

function runMigration(fixture, args = [], extraEnv = {}) {
  return spawnSync("sh", [fixture.migrateScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...fixture.env,
      ...(args.includes("--apply")
        ? { MIGRATION_MAINTENANCE_CONFIRMED: "1" }
        : {}),
      ...extraEnv,
    },
  });
}

function spawnMigration(fixture, args = [], extraEnv = {}) {
  const child = spawn("sh", [fixture.migrateScript, ...args], {
    cwd: repoRoot,
    env: {
      ...fixture.env,
      ...(args.includes("--apply")
        ? { MIGRATION_MAINTENANCE_CONFIRMED: "1" }
        : {}),
      ...extraEnv,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function waitForLine(filePath, expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readLines(filePath).includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${expected}`);
}

test("migrate_online canonical 模式保持单 compose 文件且不注入 V5 project", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--status-only"]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(readLines(fixture.composeLog), [
      `compose -f ${fixture.composeFile} ps -q postgres`,
    ]);
    assert.doesNotMatch(result.stdout, /plush-toy-erp-v5/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online canonical 模式继续允许既有 COMPOSE_FILE 覆盖", () => {
  const fixture = createFixture();
  try {
    const alternateComposeFile = path.join(
      fixture.root,
      "compose.canonical.yml",
    );
    fs.copyFileSync(fixture.composeFile, alternateComposeFile);
    const result = runMigration(fixture, ["--status-only"], {
      COMPOSE_FILE: alternateComposeFile,
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(readLines(fixture.composeLog), [
      `compose -f ${alternateComposeFile} ps -q postgres`,
    ]);
    assert.doesNotMatch(result.stdout, /plush-toy-erp-v5/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online V5 使用精确 env、project 与双 compose 文件并读回容器身份", () => {
  const fixture = createFixture();
  try {
    configureCustomerTrialFixture(fixture);
    const result = runMigration(fixture, ["--status-only"], {
      APP_SERVER_CID: "app-test-cid",
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const composePrefix = `compose --env-file ${fixture.composeEnvFile} -p plush-toy-erp-v5 -f ${fixture.composeFile} -f ${fixture.composeOverrideFile}`;
    assert.deepEqual(readLines(fixture.composeLog), [
      `${composePrefix} ps -q app-server`,
      `${composePrefix} ps -q postgres`,
    ]);
    assert.deepEqual(atlasPhases(fixture.atlasLog), ["status"]);
    assert.match(result.stdout, /compose project: plush-toy-erp-v5/u);
    assert.doesNotMatch(result.stdout, /test-postgres-password/u);
    assert.doesNotMatch(result.stderr, /test-postgres-password/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online V5 override 合同对缺失、漂移和额外服务 fail closed", async (t) => {
  const cases = [
    {
      name: "override 缺失",
      mutate(fixture) {
        fs.rmSync(fixture.composeOverrideFile);
      },
      expected: /Compose override 不存在/u,
    },
    {
      name: "project name 漂移",
      mutate(fixture) {
        fs.writeFileSync(
          fixture.composeOverrideFile,
          "name: plush-toy-erp-prod\n",
          "utf8",
        );
      },
      expected: /只能声明 name: plush-toy-erp-v5/u,
    },
    {
      name: "额外服务",
      mutate(fixture) {
        fs.writeFileSync(
          fixture.composeOverrideFile,
          "name: plush-toy-erp-v5\nservices:\n  postgres: {}\n",
          "utf8",
        );
      },
      expected: /只能声明 name: plush-toy-erp-v5/u,
    },
    {
      name: "override 不在 base 同目录",
      mutate(fixture) {
        const otherDir = path.join(fixture.root, "other");
        fs.mkdirSync(otherDir);
        const otherOverride = path.join(
          otherDir,
          "compose.customer-trial-133.yml",
        );
        fs.renameSync(fixture.composeOverrideFile, otherOverride);
        fixture.env.COMPOSE_OVERRIDE_FILE = otherOverride;
      },
      expected: /override 必须与 base Compose 同目录/u,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const fixture = createFixture();
      try {
        configureCustomerTrialFixture(fixture);
        item.mutate(fixture);
        const result = runMigration(fixture, ["--status-only"]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, item.expected);
        assert.deepEqual(atlasPhases(fixture.atlasLog), []);
        assert.deepEqual(readLines(fixture.composeLog), []);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online V5 拒绝 override 或 env 符号链接", async (t) => {
  for (const kind of ["override", "env"]) {
    await t.test(kind, () => {
      const fixture = createFixture();
      try {
        configureCustomerTrialFixture(fixture);
        const linkedPath =
          kind === "override"
            ? fixture.composeOverrideFile
            : fixture.composeEnvFile;
        const realPath = `${linkedPath}.real`;
        fs.renameSync(linkedPath, realPath);
        fs.symlinkSync(realPath, linkedPath);

        const result = runMigration(fixture, ["--status-only"]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /符号链接/u);
        assert.deepEqual(atlasPhases(fixture.atlasLog), []);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online V5 强制精确 runtime env 文件与端口合同", async (t) => {
  await t.test("env 文件缺失", () => {
    const fixture = createFixture();
    try {
      configureCustomerTrialFixture(fixture);
      fixture.env.COMPOSE_ENV_FILE = "";
      const result = runMigration(fixture, ["--status-only"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /必须显式设置 COMPOSE_ENV_FILE/u);
      assert.deepEqual(atlasPhases(fixture.atlasLog), []);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test("env 文件名漂移", () => {
    const fixture = createFixture();
    try {
      configureCustomerTrialFixture(fixture);
      const wrongEnvFile = path.join(fixture.root, ".env.customer-trial-copy");
      fs.renameSync(fixture.composeEnvFile, wrongEnvFile);
      fixture.env.COMPOSE_ENV_FILE = wrongEnvFile;
      const result = runMigration(fixture, ["--status-only"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /只能使用受控 .env.customer-trial-133/u);
      assert.deepEqual(atlasPhases(fixture.atlasLog), []);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test("env 文件权限过宽", () => {
    const fixture = createFixture();
    try {
      configureCustomerTrialFixture(fixture);
      fs.chmodSync(fixture.composeEnvFile, 0o644);
      const result = runMigration(fixture, ["--status-only"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /权限必须为 0600/u);
      assert.deepEqual(atlasPhases(fixture.atlasLog), []);
      assert.deepEqual(readLines(fixture.composeLog), []);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test("V5 端口漂移", () => {
    const fixture = createFixture();
    try {
      configureCustomerTrialFixture(fixture, { JAEGER_UI_PORT: "26687" });
      const result = runMigration(fixture, ["--status-only"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /JAEGER_UI_PORT=46687/u);
      assert.deepEqual(atlasPhases(fixture.atlasLog), []);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test("V5 前端宿主绑定漂移", () => {
    const fixture = createFixture();
    try {
      configureCustomerTrialFixture(fixture, {
        WEB_DESKTOP_BIND_ADDR: "0.0.0.0",
      });
      const result = runMigration(fixture, ["--status-only"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /WEB_DESKTOP_BIND_ADDR=127\.0\.0\.1/u);
      assert.deepEqual(atlasPhases(fixture.atlasLog), []);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test("Postgres 数据目录漂移", () => {
    const fixture = createFixture();
    try {
      configureCustomerTrialFixture(fixture, {
        POSTGRES_DATA_DIR: path.join(
          fixture.root,
          "other/plush-toy-erp-v5/data/postgres",
        ),
      });
      const result = runMigration(fixture, ["--status-only"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /POSTGRES_DATA_DIR=/u);
      assert.deepEqual(atlasPhases(fixture.atlasLog), []);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  await t.test("migration 锁路径漂移", () => {
    const fixture = createFixture();
    try {
      configureCustomerTrialFixture(fixture, {
        MIGRATION_LOCK_FILE: path.join(
          fixture.root,
          "other/plush-toy-erp-v5/run/atlas-migrate.lock",
        ),
      });
      const result = runMigration(fixture, ["--status-only"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /MIGRATION_LOCK_FILE=/u);
      assert.deepEqual(atlasPhases(fixture.atlasLog), []);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

test("migrate_online V5 拒绝 ambient Compose、Docker 与 env-file 同名覆盖", async (t) => {
  const cases = [
    ["COMPOSE_FILE", null, /覆盖 COMPOSE_FILE/u],
    ["COMPOSE_PROJECT_NAME", "plush-toy-erp-prod", /COMPOSE_PROJECT_NAME/u],
    ["DOCKER_CONTEXT", "wrong-context", /DOCKER_CONTEXT/u],
    ["DB_URL", "postgres://wrong", /DB_URL/u],
    ["MIG_DIR", "/tmp/wrong-migrations", /MIG_DIR/u],
    ["ATLAS_BIN", "/tmp/wrong-atlas", /ATLAS_BIN/u],
    ["PSQL_BIN", "/tmp/wrong-psql", /PSQL_BIN/u],
    [
      "POPULATED_UPGRADE_PREFLIGHT",
      "/tmp/wrong-preflight.sh",
      /POPULATED_UPGRADE_PREFLIGHT/u,
    ],
    ["PROJECT_SLUG", "plush-toy-erp-prod", /宿主环境不得覆盖/u],
  ];

  for (const [key, value, expected] of cases) {
    await t.test(key, () => {
      const fixture = createFixture();
      try {
        configureCustomerTrialFixture(fixture);
        const result = runMigration(fixture, ["--status-only"], {
          [key]: value ?? fixture.composeFile,
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, expected);
        assert.deepEqual(atlasPhases(fixture.atlasLog), []);
        assert.deepEqual(readLines(fixture.composeLog), []);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online V5 拒绝 env 文件覆盖受信任迁移工具链", async (t) => {
  for (const key of [
    "MIG_DIR",
    "ATLAS_BIN",
    "PSQL_BIN",
    "POPULATED_UPGRADE_PREFLIGHT",
  ]) {
    await t.test(key, () => {
      const fixture = createFixture();
      try {
        configureCustomerTrialFixture(fixture);
        fs.appendFileSync(fixture.composeEnvFile, `${key}=/tmp/untrusted\n`);
        const result = runMigration(fixture, ["--status-only"]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /env 不得声明目标覆盖变量/u);
        assert.match(result.stderr, new RegExp(key, "u"));
        assert.deepEqual(atlasPhases(fixture.atlasLog), []);
        assert.deepEqual(readLines(fixture.composeLog), []);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online V5 对错误 CID、project、name、port、mount 与 DB fail closed", async (t) => {
  const cases = [
    {
      name: "Postgres CID 缺失",
      env: { POSTGRES_CID_OUTPUT: "" },
      expected: /必须精确存在一个容器/u,
    },
    {
      name: "Postgres CID 不唯一",
      env: { POSTGRES_CID_OUTPUT: "postgres-a\npostgres-b" },
      expected: /必须精确存在一个容器/u,
    },
    {
      name: "Postgres project 错误",
      env: { FAKE_POSTGRES_PROJECT: "plush-toy-erp-prod" },
      expected: /不属于 Compose project plush-toy-erp-v5/u,
    },
    {
      name: "Postgres container name 错误",
      env: { FAKE_POSTGRES_NAME: "plush-toy-erp-postgres" },
      expected: /容器名必须是 plush-toy-erp-v5-postgres/u,
    },
    {
      name: "Postgres host port 错误",
      env: { FAKE_POSTGRES_BINDING: "127.0.0.1|5435" },
      expected: /127\.0\.0\.1:55435/u,
    },
    {
      name: "Postgres mount 错误",
      env: { FAKE_POSTGRES_DATA_DIR: "/data/plush-toy-erp/postgres" },
      expected: /数据挂载与受控 env 不一致/u,
    },
    {
      name: "Postgres DB 错误",
      env: { FAKE_POSTGRES_DB: "plush_erp" },
      expected: /POSTGRES_DB 必须是 plush_erp_uat_20260716_v5/u,
    },
    {
      name: "app-server project 错误",
      env: {
        APP_SERVER_CID: "app-test-cid",
        FAKE_APP_PROJECT: "plush-toy-erp-prod",
      },
      expected: /app-server 容器不属于 Compose project plush-toy-erp-v5/u,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const fixture = createFixture();
      try {
        configureCustomerTrialFixture(fixture);
        const result = runMigration(fixture, ["--status-only"], item.env);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, item.expected);
        assert.deepEqual(atlasPhases(fixture.atlasLog), []);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online 在一次锁内按 status、两项只读审计、dry-run、apply 顺序执行", async (t) => {
  const cases = [
    {
      name: "status-only 不运行审计",
      args: ["--status-only"],
      atlas: ["status"],
      sequence: ["status"],
      preflightRuns: 0,
    },
    {
      name: "dry-run",
      args: [],
      atlas: ["status", "dry-run"],
      sequence: [
        "status",
        "populated-upgrade",
        "customer-config-cutover",
        "dry-run",
      ],
      preflightRuns: 2,
    },
    {
      name: "apply",
      args: ["--apply"],
      atlas: ["status", "dry-run", "apply"],
      sequence: [
        "status",
        "populated-upgrade",
        "customer-config-cutover",
        "dry-run",
        "apply",
      ],
      preflightRuns: 2,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const fixture = createFixture();
      try {
        const result = runMigration(fixture, item.args);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.deepEqual(atlasPhases(fixture.atlasLog), item.atlas);
        assert.deepEqual(
          readLines(fixture.eventLog),
          expectedEvents(item.sequence),
        );
        assert.equal(readLines(fixture.psqlLog).length, item.preflightRuns);
        assert.deepEqual(readLines(fixture.flockLog), ["9"]);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("migrate_online populated upgrade 审计失败时不执行后续审计、dry-run 或 apply", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      PREFLIGHT_FAIL_CODE: "43",
      PREFLIGHT_FAIL_AUDIT: "populated-upgrade",
    });
    assert.equal(result.status, 43, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(atlasPhases(fixture.atlasLog), ["status"]);
    assert.equal(readLines(fixture.psqlLog).length, 1);
    assert.deepEqual(readLines(fixture.eventLog), [
      ...expectedEvents(["status"]),
      "run start populated-upgrade",
      "run fail populated-upgrade",
    ]);
    assert.doesNotMatch(result.stdout, /\[3\/5\]|\[4\/5\]|\[5\/5\]/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online customer config cutover 审计失败时不执行 dry-run 或 apply", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      PREFLIGHT_FAIL_CODE: "44",
      PREFLIGHT_FAIL_AUDIT: "customer-config-cutover",
    });
    assert.equal(result.status, 44, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(atlasPhases(fixture.atlasLog), ["status"]);
    assert.equal(readLines(fixture.psqlLog).length, 2);
    assert.deepEqual(readLines(fixture.eventLog), [
      ...expectedEvents(["status", "populated-upgrade"]),
      "run start customer-config-cutover",
      "run fail customer-config-cutover",
    ]);
    assert.doesNotMatch(result.stdout, /\[4\/5\]|\[5\/5\]/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online dry-run 失败时不执行 apply", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      ATLAS_FAIL_PHASE: "dry-run",
      ATLAS_FAIL_CODE: "42",
    });
    assert.equal(result.status, 42, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(atlasPhases(fixture.atlasLog), ["status", "dry-run"]);
    assert.deepEqual(readLines(fixture.flockLog), ["9"]);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 正式 apply 必须显式确认停写维护窗口", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      MIGRATION_MAINTENANCE_CONFIRMED: "",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MIGRATION_MAINTENANCE_CONFIRMED=1/);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 正式 apply 在 app-server 运行时 fail closed", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--apply"], {
      APP_SERVER_CID: "running-app-server",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /后端服务仍在运行/);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 不截断已有锁文件并收紧文件权限", () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(fixture.lockDir, { mode: 0o700 });
    fs.writeFileSync(fixture.lockFile, "lock-evidence\n", { mode: 0o644 });

    const result = runMigration(fixture, ["--status-only"]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(fs.readFileSync(fixture.lockFile, "utf8"), "lock-evidence\n");
    assert.equal(fs.statSync(fixture.lockDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(fixture.lockFile).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 创建 0700 私有锁目录和 0600 锁文件", () => {
  const fixture = createFixture();
  try {
    assert.equal(fs.existsSync(fixture.lockDir), false);

    const result = runMigration(fixture, ["--status-only"]);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(fs.statSync(fixture.lockDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(fixture.lockFile).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝使用非私有的已有锁目录", () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(fixture.lockDir, { mode: 0o755 });

    const result = runMigration(fixture, ["--status-only"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migration lock 目录权限必须是 0700/);
    assert.equal(fs.statSync(fixture.lockDir).mode & 0o777, 0o755);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝相对锁路径", () => {
  const fixture = createFixture();
  try {
    const result = runMigration(fixture, ["--status-only"], {
      MIGRATION_LOCK_FILE: "relative/migration.lock",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MIGRATION_LOCK_FILE 必须是绝对路径/);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝符号链接锁文件", () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(fixture.lockDir, { mode: 0o700 });
    const symlinkTarget = path.join(fixture.root, "outside.lock");
    fs.writeFileSync(symlinkTarget, "outside\n", "utf8");
    fs.symlinkSync(symlinkTarget, fixture.lockFile);

    const result = runMigration(fixture, ["--status-only"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MIGRATION_LOCK_FILE 不得是符号链接/);
    assert.equal(fs.readFileSync(symlinkTarget, "utf8"), "outside\n");
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 拒绝符号链接锁目录", () => {
  const fixture = createFixture();
  try {
    const outsideDir = path.join(fixture.root, "outside-lock-dir");
    const symlinkDir = path.join(fixture.root, "linked-lock-dir");
    fs.mkdirSync(outsideDir, { mode: 0o700 });
    fs.symlinkSync(outsideDir, symlinkDir);

    const result = runMigration(fixture, ["--status-only"], {
      MIGRATION_LOCK_FILE: path.join(symlinkDir, "migration.lock"),
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migration lock 路径不得包含符号链接/);
    assert.equal(fs.existsSync(path.join(outsideDir, "migration.lock")), false);
    assert.deepEqual(atlasPhases(fixture.atlasLog), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("migrate_online 并发运行时串行化整段 migration", async () => {
  const fixture = createFixture({ useSystemFlock: true });
  try {
    const first = spawnMigration(fixture, ["--apply"], {
      RUN_LABEL: "first",
      ATLAS_SLEEP_PHASE: "status",
      ATLAS_SLEEP_SECONDS: "1",
    });
    await waitForLine(fixture.eventLog, "first start status");
    const second = spawnMigration(fixture, ["--status-only"], {
      RUN_LABEL: "second",
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(
      firstResult.status,
      0,
      `${firstResult.stdout}\n${firstResult.stderr}`,
    );
    assert.equal(
      secondResult.status,
      0,
      `${secondResult.stdout}\n${secondResult.stderr}`,
    );

    const events = readLines(fixture.eventLog);
    const firstApplyEnd = events.indexOf("first end apply");
    const secondStatusStart = events.indexOf("second start status");
    assert.notEqual(firstApplyEnd, -1, events.join("\n"));
    assert.notEqual(secondStatusStart, -1, events.join("\n"));
    assert.ok(
      secondStatusStart > firstApplyEnd,
      `second run entered Atlas before first sequence completed:\n${events.join("\n")}`,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
