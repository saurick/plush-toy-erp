import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "scripts/deploy/bootstrap-production-admin.sh",
);
const expectedDatabase = "plush_erp_bootstrap_test";
const trialDatabase = "plush_erp_uat_20260716_v5";
const trialProject = "plush-toy-erp-v5";
const productionTrialDataDir = "/home/simon/plush-toy-erp-v5/data/postgres";
const productionTrialLockFile =
  "/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock";
const expectedMigration = "20260715161753";
const expectedRelease = "a".repeat(40);
const adminPassword = "FreshAdmin9!";
const postgresDSN =
  "postgres://postgres:test-production-password@postgres:5432/plush_erp_bootstrap_test?sslmode=disable";

function writeFixture(t) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "bootstrap-production-admin-"),
  );
  t.after(() => {
    const advisoryPidPath = path.join(root, "state", "advisory-pid");
    if (fs.existsSync(advisoryPidPath)) {
      const advisoryPid = Number.parseInt(
        fs.readFileSync(advisoryPidPath, "utf8"),
        10,
      );
      if (Number.isSafeInteger(advisoryPid) && advisoryPid > 1) {
        try {
          process.kill(advisoryPid, "SIGTERM");
        } catch {
          // 已正常释放或退出。
        }
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  const composeDir = path.join(root, "compose");
  const binDir = path.join(root, "bin");
  const stateDir = path.join(root, "state");
  const lockDir = path.join(root, "locks");
  const trialRoot = path.join(root, trialProject);
  const trialDataDir = path.join(trialRoot, "data/postgres");
  const trialLockDir = path.join(trialRoot, "run");
  const trialLockFile = path.join(trialLockDir, "atlas-migrate.lock");
  const fixturePreflight = path.join(root, "production-preflight.sh");
  const fixtureBootstrap = path.join(root, "bootstrap-production-admin.sh");
  fs.mkdirSync(composeDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(lockDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(trialDataDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(trialLockDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(lockDir, 0o700);
  fs.chmodSync(trialLockDir, 0o700);

  const productionPreflightPath = path.join(
    repoRoot,
    "scripts/deploy/production-preflight.sh",
  );
  let fixturePreflightSource = fs.readFileSync(productionPreflightPath, "utf8");
  assert.match(fixturePreflightSource, new RegExp(productionTrialDataDir, "u"));
  assert.match(
    fixturePreflightSource,
    new RegExp(productionTrialLockFile, "u"),
  );
  fixturePreflightSource = fixturePreflightSource
    .replaceAll(productionTrialDataDir, trialDataDir)
    .replaceAll(productionTrialLockFile, trialLockFile);
  fs.writeFileSync(fixturePreflight, fixturePreflightSource, "utf8");
  fs.chmodSync(fixturePreflight, 0o755);

  const preflightAssignment =
    'preflight_script="$root_dir/scripts/deploy/production-preflight.sh"';
  let fixtureBootstrapSource = fs.readFileSync(scriptPath, "utf8");
  assert.equal(fixtureBootstrapSource.includes(preflightAssignment), true);
  fixtureBootstrapSource = fixtureBootstrapSource.replace(
    preflightAssignment,
    `preflight_script=${JSON.stringify(fixturePreflight)}`,
  );
  fs.writeFileSync(fixtureBootstrap, fixtureBootstrapSource, "utf8");
  fs.chmodSync(fixtureBootstrap, 0o755);

  for (const filename of [
    "compose.yml",
    "chromium-seccomp.json",
    "migrate_online.sh",
  ]) {
    fs.copyFileSync(
      path.join(repoRoot, "server/deploy/compose/prod", filename),
      path.join(composeDir, filename),
    );
  }
  fs.chmodSync(path.join(composeDir, "migrate_online.sh"), 0o755);
  const composeOverride = path.join(
    composeDir,
    "compose.customer-trial-133.yml",
  );
  fs.writeFileSync(composeOverride, `name: ${trialProject}\n`, "utf8");

  const mktempPath = path.join(binDir, "mktemp");
  fs.writeFileSync(
    mktempPath,
    `#!/usr/bin/env sh
set -eu
template="\${TMPDIR%/}/bootstrap-tmp.XXXXXXXXXX"
if [ "\${1:-}" = "-d" ]; then
  exec /usr/bin/mktemp -d "$template"
fi
exec /usr/bin/mktemp "$template"
`,
    "utf8",
  );
  fs.chmodSync(mktempPath, 0o755);

  const envFile = path.join(root, ".env");
  fs.writeFileSync(
    envFile,
    [
      "PROJECT_SLUG=plush-toy-erp",
      "ERP_CUSTOMER_KEY=demo",
      "APP_IMAGE=plush-toy-erp-server:bootstrap-test",
      "WEB_IMAGE=plush-toy-erp-web:bootstrap-test",
      "POSTGRES_IMAGE=postgres:18.1",
      "JAEGER_IMAGE=jaegertracing/all-in-one:1.76.0",
      "TZ=Asia/Shanghai",
      `POSTGRES_DSN=${postgresDSN}`,
      "POSTGRES_PASSWORD=test-production-password",
      `POSTGRES_DB=${expectedDatabase}`,
      "POSTGRES_USER=postgres",
      "POSTGRES_DATA_DIR=/data/plush-toy-erp/postgres",
      `MIGRATION_LOCK_FILE=${path.join(lockDir, "atlas-migrate.lock")}`,
      "POSTGRES_BIND_ADDR=127.0.0.1",
      "TRACE_ENDPOINT=jaeger:4318",
      "TRACE_RATIO=0.1",
      "WEB_API_ORIGIN=http://app-server:8300",
      "APP_HTTP_BIND_ADDR=127.0.0.1",
      "APP_GRPC_BIND_ADDR=127.0.0.1",
      `APP_JWT_SECRET=${"j".repeat(40)}`,
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
    { mode: 0o600 },
  );
  fs.chmodSync(envFile, 0o600);

  const dockerPath = path.join(binDir, "docker");
  fs.writeFileSync(
    dockerPath,
    `#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ -n "\${APP_ADMIN_PASSWORD:-}" ]]; then
  printf '%s\n' "$*" >>"$FAKE_SECRET_ENV_LOG"
fi

if [[ "\${1:-}" == "compose" && ("\${2:-}" == "version" || ("\${2:-}" == "-p" && "\${4:-}" == "version")) ]]; then
  if [[ "\${FAKE_BLOCK_COMPOSE_VERSION:-0}" == "1" ]]; then
    touch "$FAKE_STATE_DIR/compose-version-entered"
    while [[ ! -f "$FAKE_STATE_DIR/release-compose-version" ]]; do
      sleep 0.05
    done
  fi
  exit 0
fi

if [[ "\${1:-}" == "image" && "\${2:-}" == "inspect" ]]; then
  if [[ "$*" == *'{{.Id}}'* ]]; then
    printf '%s\n' "\${FAKE_IMAGE_ID:-sha256:${"b".repeat(64)}}"
  else
    printf 'GIT_SHA=%s\n' "\${FAKE_IMAGE_RELEASE:-${expectedRelease}}"
  fi
  exit 0
fi

if [[ "\${1:-}" == "ps" && "\${2:-}" == "-aq" ]]; then
  if [[ "\${FAKE_DISCOVERY_FAIL:-0}" == "1" ]]; then
    exit 44
  fi
  if [[ -f "$FAKE_STATE_DIR/started" && ! -f "$FAKE_STATE_DIR/removed" ]]; then
    printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'
    if [[ "\${FAKE_DISCOVERY_MULTIPLE:-0}" == "1" ]]; then
      printf 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\n'
    fi
  fi
  exit 0
fi

if [[ "\${1:-}" == "inspect" ]]; then
  if [[ "$*" == *'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'* ]]; then
    if [[ -f "$FAKE_STATE_DIR/removed" ]]; then
      exit 1
    fi
    if [[ "$*" == *'.State.Running'* ]]; then
      if [[ "\${FAKE_ONE_SHOT_EARLY_EXIT:-0}" == "1" ]]; then
        printf 'false\n'
      else
        printf 'true\n'
      fi
    elif [[ "$*" == *'{{.Id}}'* ]]; then
      printf '%s\n' "\${FAKE_ONE_SHOT_ID:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
    elif [[ "$*" == *'{{.Name}}'* ]]; then
      if [[ -n "\${FAKE_ONE_SHOT_NAME:-}" ]]; then
        printf '/%s\n' "$FAKE_ONE_SHOT_NAME"
      else
        printf '/%s\n' "$(cat "$FAKE_STATE_DIR/one-shot-name")"
      fi
    elif [[ "$*" == *'com.docker.compose.project'* ]]; then
      printf '%s\n' "\${FAKE_ONE_SHOT_PROJECT:-$(cat "$FAKE_STATE_DIR/compose-project")}"
    elif [[ "$*" == *'com.docker.compose.service'* ]]; then
      printf '%s\n' "\${FAKE_ONE_SHOT_SERVICE:-app-server}"
    elif [[ "$*" == *'erp.plush.admin-bootstrap.operation'* ]]; then
      printf '%s\n' "\${FAKE_ONE_SHOT_OPERATION:-$(cat "$FAKE_STATE_DIR/operation-id")}"
    elif [[ "$*" == *'{{.Config.Image}}'* ]]; then
      printf '%s\n' "\${FAKE_ONE_SHOT_IMAGE_REF:-plush-toy-erp-server:bootstrap-test}"
    elif [[ "$*" == *'{{.Image}}'* ]]; then
      printf '%s\n' "\${FAKE_ONE_SHOT_IMAGE_ID:-sha256:${"b".repeat(64)}}"
    fi
    exit 0
  fi
  if [[ "$*" == *'com.docker.compose.project'* ]]; then
    printf '%s\n' "\${FAKE_POSTGRES_COMPOSE_PROJECT:-plush-toy-erp-prod}"
    exit 0
  fi
  if [[ "$*" == *'{{.Name}}'* ]]; then
    printf '%s\n' "\${FAKE_POSTGRES_CONTAINER_NAME:-/plush-toy-erp-postgres}"
    exit 0
  fi
  if [[ "$*" == *'.State.Status'* ]]; then
    printf '%s\n' "\${FAKE_POSTGRES_STATE:-running}"
    exit 0
  fi
  if [[ "$*" == *'.State.Health'* ]]; then
    printf '%s\n' "\${FAKE_POSTGRES_HEALTH:-healthy}"
    exit 0
  fi
  if [[ "$*" == *'.State.Running'* ]]; then
    if [[ "\${FAKE_ONE_SHOT_EARLY_EXIT:-0}" == "1" ]]; then
      printf 'false\n'
    else
      printf 'true\n'
    fi
    exit 0
  fi
  exit 1
fi

if [[ "\${1:-}" == "stop" ]]; then
  touch "$FAKE_STATE_DIR/stopped"
  if [[ "\${FAKE_CLEANUP_FAIL:-0}" == "1" ]]; then
    exit 1
  fi
  touch "$FAKE_STATE_DIR/removed"
  exit 0
fi

if [[ "\${1:-}" == "rm" ]]; then
  if [[ "\${FAKE_CLEANUP_FAIL:-0}" == "1" ]]; then
    exit 1
  fi
  touch "$FAKE_STATE_DIR/removed"
  exit 0
fi

if [[ "\${1:-}" != "compose" ]]; then
  exit 1
fi

args=" $* "
if [[ "$args" == *' config -q '* ]]; then
  exit 0
fi
if [[ "$args" == *' config '* ]]; then
  printf 'name: %s\nservices: {}\n' "\${FAKE_RESOLVED_COMPOSE_PROJECT:-${trialProject}}"
  exit 0
fi
if [[ "$args" == *' ps -q postgres '* ]]; then
  printf 'postgres-cid\n'
  exit 0
fi
if [[ "$args" == *' ps -q app-server '* ]]; then
  if [[ "\${FAKE_APP_RUNNING:-0}" == "1" ]]; then
    printf 'app-server-cid\n'
  fi
  exit 0
fi
if [[ "$args" == *' exec -T postgres sh -ceu '* ]]; then
  printf '%s' "\${FAKE_RUNTIME_POSTGRES_DB:-${expectedDatabase}}"
  exit 0
fi
if [[ "$args" == *' exec -T postgres env PGAPPNAME=erp-admin-bootstrap-lock-'* && "$args" == *'lock_identity='* ]]; then
  if [[ "\${FAKE_ADVISORY_ERROR:-0}" == "1" ]]; then
    exit 43
  fi
  if [[ "\${FAKE_ADVISORY_BUSY:-0}" == "1" ]] || ! mkdir "$FAKE_STATE_DIR/advisory-lock" 2>/dev/null; then
    printf '4242:busy\n'
    exit 0
  fi
  trap 'rm -f "$FAKE_STATE_DIR/advisory-pid"; rmdir "$FAKE_STATE_DIR/advisory-lock" 2>/dev/null || true; exit 0' TERM INT HUP EXIT
  printf '%s' "$$" >"$FAKE_STATE_DIR/advisory-pid"
  touch "$FAKE_STATE_DIR/advisory-ready"
  printf '4242:ready\n'
  while true; do
    sleep 1
  done
fi
if [[ "$args" == *' run -d -T --no-deps --rm --pull never '* ]]; then
  [[ -n "\${APP_ADMIN_PASSWORD:-}" ]] || exit 41
  if [[ "\${FAKE_RUN_FAIL:-0}" == "1" ]]; then
    exit 42
  fi
  touch "$FAKE_STATE_DIR/started"
  if [[ -n "\${FAKE_MUTATE_ENV_FILE:-}" ]]; then
    printf '# changed during bootstrap\n' >>"$FAKE_MUTATE_ENV_FILE"
  fi
  previous=""
  for argument in "$@"; do
    if [[ "$previous" == "--name" ]]; then
      printf '%s' "$argument" >"$FAKE_STATE_DIR/one-shot-name"
    elif [[ "$previous" == "--label" && "$argument" == erp.plush.admin-bootstrap.operation=* ]]; then
      printf '%s' "\${argument#*=}" >"$FAKE_STATE_DIR/operation-id"
    fi
    previous="$argument"
  done
  compose_project=""
  previous=""
  for argument in "$@"; do
    if [[ "$previous" == "-p" ]]; then
      compose_project="$argument"
      break
    fi
    previous="$argument"
  done
  printf '%s' "$compose_project" >"$FAKE_STATE_DIR/compose-project"
  if [[ "\${FAKE_INVALID_CID:-0}" == "1" ]]; then
    printf 'invalid-container-id\n'
  else
    printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'
  fi
  exit 0
fi
if [[ "$args" != *' exec -T postgres psql '* ]]; then
  exit 1
fi

if [[ "$args" == *'pg_terminate_backend('* ]]; then
  if [[ "\${FAKE_ADVISORY_TERMINATE_FAIL:-0}" == "1" ]]; then
    printf 'failed\n'
  elif [[ -f "$FAKE_STATE_DIR/advisory-pid" ]]; then
    kill "$(cat "$FAKE_STATE_DIR/advisory-pid")" 2>/dev/null || true
    printf 'terminated\n'
  else
    printf 'absent\n'
  fi
elif [[ "$args" == *'to_regclass('* ]]; then
  printf '%s\n' "\${FAKE_SCHEMA_STATUS:-ready}"
elif [[ "$args" == *'SELECT current_database();'* ]]; then
  if [[ "\${FAKE_BLOCK_CURRENT_DATABASE:-0}" == "1" ]]; then
    touch "$FAKE_STATE_DIR/current-database-entered"
    while [[ ! -f "$FAKE_STATE_DIR/release-current-database" ]]; do
      sleep 0.05
    done
  fi
  printf '%s\n' "\${FAKE_CURRENT_DATABASE:-${expectedDatabase}}"
elif [[ "$args" == *'FROM atlas_schema_revisions.atlas_schema_revisions'* ]]; then
  printf '%s\n' "\${FAKE_CURRENT_MIGRATION:-${expectedMigration}}"
elif [[ "$args" == *'COALESCE(max(id), 0)'* ]]; then
  printf '%s\n' "\${FAKE_AUDIT_BEFORE:-10}"
elif [[ "$args" == *"marker_value::jsonb->>'username'"* ]]; then
  printf '%s\n' "\${FAKE_EXACT_MARKER_COUNT:-1}"
elif [[ "$args" == *"FROM runtime_markers WHERE marker_key = 'admin_bootstrap.completed'"* ]]; then
  if [[ "\${FAKE_PREEXISTING_MARKER:-0}" == "1" ]]; then
    printf '1\n'
  elif [[ -f "$FAKE_STATE_DIR/started" && "\${FAKE_MARKER_AFTER_RUN:-1}" == "1" ]]; then
    printf '1\n'
  else
    printf '0\n'
  fi
elif [[ "$args" == *'is_super_admin IS TRUE'* ]]; then
  printf '%s\n' "\${FAKE_ELIGIBLE_ADMIN_COUNT:-1}"
elif [[ "$args" == *"FROM admin_users WHERE username = :'admin_username'"* ]]; then
  if [[ "\${FAKE_PREEXISTING_ADMIN:-0}" == "1" ]]; then
    printf '1\n'
  elif [[ -f "$FAKE_STATE_DIR/started" ]]; then
    printf '1\n'
  else
    printf '0\n'
  fi
elif [[ "$args" == *"SELECT id FROM runtime_audit_events"* ]]; then
  printf '%s\n' "\${FAKE_COMPLETED_AUDIT_ID:-11}"
elif [[ "$args" == *"event_type = 'admin_bootstrap.completed'"* ]]; then
  printf '%s\n' "\${FAKE_COMPLETED_AUDIT_COUNT:-1}"
elif [[ "$args" == *"event_type = 'admin_bootstrap.blocked'"* ]]; then
  printf '%s\n' "\${FAKE_BLOCKED_AUDIT_COUNT:-0}"
elif [[ "$args" == *'FROM permissions WHERE builtin IS TRUE'* ]]; then
  printf '%s\n' "\${FAKE_BUILTIN_PERMISSION_COUNT:-20}"
elif [[ "$args" == *'FROM roles WHERE builtin IS TRUE'* ]]; then
  printf '%s\n' "\${FAKE_BUILTIN_ROLE_COUNT:-10}"
elif [[ "$args" == *'FROM role_permissions;'* ]]; then
  printf '%s\n' "\${FAKE_ROLE_PERMISSION_COUNT:-30}"
else
  exit 1
fi
`,
    "utf8",
  );
  fs.chmodSync(dockerPath, 0o755);

  return {
    root,
    composeDir,
    envFile,
    binDir,
    stateDir,
    lockDir,
    composeOverride,
    dockerLog: path.join(root, "docker-args.log"),
    secretEnvLog: path.join(root, "docker-secret-env.log"),
    scriptPath: fixtureBootstrap,
    trialDataDir,
    trialLockDir,
    trialLockFile,
  };
}

function replaceEnvValues(envFile, replacements) {
  const pending = new Map(Object.entries(replacements));
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/u);
  const updated = lines.map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) return line;
    const key = line.slice(0, separator).trim();
    if (!pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of pending) updated.push(`${key}=${value}`);
  fs.writeFileSync(envFile, `${updated.join("\n").replace(/\n+$/u, "")}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(envFile, 0o600);
}

function configureTrialFixture(fixture) {
  fixture.lockDir = fixture.trialLockDir;
  replaceEnvValues(fixture.envFile, {
    PROJECT_SLUG: trialProject,
    ERP_CUSTOMER_KEY: "yoyoosun",
    POSTGRES_DSN: `postgres://postgres:test-production-password@postgres:5432/${trialDatabase}?sslmode=disable`,
    POSTGRES_DB: trialDatabase,
    POSTGRES_DATA_DIR: fixture.trialDataDir,
    MIGRATION_LOCK_FILE: fixture.trialLockFile,
    ERP_ALLOW_CUSTOMER_TRIAL_CONFIG: "1",
    ERP_CUSTOMER_TRIAL_TARGET: "customer-trial-133",
    POSTGRES_PORT: "55435",
    APP_HTTP_PORT: "8315",
    APP_GRPC_PORT: "9315",
    WEB_DESKTOP_PORT: "5185",
    JAEGER_5775_PORT: "45775",
    JAEGER_6831_PORT: "46831",
    JAEGER_6832_PORT: "46832",
    JAEGER_5778_PORT: "45778",
    JAEGER_UI_PORT: "46687",
    JAEGER_14268_PORT: "54268",
    JAEGER_14250_PORT: "54250",
    JAEGER_9411_PORT: "49411",
    JAEGER_OTLP_GRPC_PORT: "44317",
    JAEGER_OTLP_HTTP_PORT: "44318",
  });
}

function envKeysFromFile(envFile) {
  return fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")).trim());
}

function helperRunSpec(
  fixture,
  {
    password = adminPassword,
    expectedDatabaseArg = expectedDatabase,
    expectedMigrationArg = expectedMigration,
    expectedReleaseArg = expectedRelease,
    composeOverride = "",
    projectSlug = "plush-toy-erp",
    confirmation,
    timeoutSeconds = "2",
    env = {},
  } = {},
) {
  const childEnv = { ...process.env };
  for (const key of [
    ...envKeysFromFile(fixture.envFile),
    "APP_ADMIN_PASSWORD",
    "COMPOSE_FILE",
    "COMPOSE_PROJECT_NAME",
    "COMPOSE_PROFILES",
    "COMPOSE_ENV_FILES",
    "COMPOSE_PATH_SEPARATOR",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG",
    "ERP_ALLOW_TEST_DB_AS_DEV",
    "ERP_ROLE_DEMO_PASSWORD",
  ]) {
    delete childEnv[key];
  }
  Object.assign(childEnv, {
    PATH: `${fixture.binDir}:${process.env.PATH ?? ""}`,
    TMPDIR: fixture.root,
    FAKE_DOCKER_LOG: fixture.dockerLog,
    FAKE_SECRET_ENV_LOG: fixture.secretEnvLog,
    FAKE_STATE_DIR: fixture.stateDir,
    ...env,
  });
  if (password !== undefined) {
    childEnv.APP_ADMIN_PASSWORD = password;
  }

  const confirmValue =
    confirmation ??
    `BOOTSTRAP_PRODUCTION_ADMIN:${projectSlug}:${expectedDatabaseArg}:admin:${expectedMigrationArg}:${expectedReleaseArg}`;
  const args = [
    fixture.scriptPath,
    "--env-file",
    fixture.envFile,
    "--compose-dir",
    fixture.composeDir,
  ];
  if (composeOverride) {
    args.push("--compose-override", composeOverride);
  }
  args.push(
    "--expected-database",
    expectedDatabaseArg,
    "--expected-migration",
    expectedMigrationArg,
    "--expected-release",
    expectedReleaseArg,
    "--confirm",
    confirmValue,
    "--timeout-seconds",
    timeoutSeconds,
  );
  return {
    args,
    env: childEnv,
  };
}

function runHelper(fixture, options = {}) {
  const spec = helperRunSpec(fixture, options);
  return spawnSync("bash", spec.args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: spec.env,
    timeout: 15_000,
  });
}

function installGnuStatShim(fixture) {
  const statPath = path.join(fixture.binDir, "stat");
  fs.writeFileSync(
    statPath,
    `#!/usr/bin/env sh
set -eu
if [ "$#" -eq 3 ] && [ "$1" = "-c" ]; then
  if /usr/bin/stat -c "$2" "$3" 2>/dev/null; then
    exit 0
  fi
  case "$2" in
  %a) exec /usr/bin/stat -f '%Lp' "$3" ;;
  %u) exec /usr/bin/stat -f '%u' "$3" ;;
  esac
fi
if [ "$#" -eq 3 ] && [ "$1" = "-f" ]; then
  case "$2" in
  %Lp|%u)
    printf '  File: "%s"\nBlock size: 4096\n' "$3"
    exit 1
    ;;
  esac
fi
exec /usr/bin/stat "$@"
`,
    "utf8",
  );
  fs.chmodSync(statPath, 0o755);
}

function installBsdStatShim(fixture) {
  const statPath = path.join(fixture.binDir, "stat");
  fs.writeFileSync(
    statPath,
    `#!/usr/bin/env sh
set -eu
if [ "$#" -eq 3 ] && [ "$1" = "-c" ]; then
  exit 1
fi
if [ "$#" -eq 3 ] && [ "$1" = "-f" ]; then
  case "$2" in
  %Lp)
    if /usr/bin/stat -c '%a' "$3" 2>/dev/null; then exit 0; fi
    exec /usr/bin/stat -f '%Lp' "$3"
    ;;
  %u)
    if /usr/bin/stat -c '%u' "$3" 2>/dev/null; then exit 0; fi
    exec /usr/bin/stat -f '%u' "$3"
    ;;
  esac
fi
exec /usr/bin/stat "$@"
`,
    "utf8",
  );
  fs.chmodSync(statPath, 0o755);
}

function startHelper(fixture, options = {}) {
  const spec = helperRunSpec(fixture, options);
  const child = spawn("bash", spec.args, {
    cwd: repoRoot,
    env: spec.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
  return { child, result };
}

function bootstrapLockPath(
  fixture,
  { project = "plush-toy-erp-prod", database = expectedDatabase } = {},
) {
  return path.join(
    fixture.lockDir,
    `admin-bootstrap-${project}-${database}.lock`,
  );
}

async function waitForPath(targetPath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(targetPath)) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${targetPath}`);
    }
    await delay(20);
  }
}

function assertSecretSafe(result, fixture, secret = adminPassword) {
  const dockerLog = fs.existsSync(fixture.dockerLog)
    ? fs.readFileSync(fixture.dockerLog, "utf8")
    : "";
  for (const output of [result.stdout, result.stderr, dockerLog]) {
    assert.doesNotMatch(output, new RegExp(secret.replaceAll("!", "\\!")));
    assert.doesNotMatch(output, /test-production-password/u);
    assert.doesNotMatch(output, /postgres:\/\//u);
  }
}

test("bootstrap production admin uses one secret-safe one-shot and reads back all evidence", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /\[bootstrap-production-admin\] status=complete/u,
  );
  assert.match(result.stdout, /marker=admin_bootstrap\.completed/u);
  assert.match(result.stdout, /builtin_permissions=20 builtin_roles=10/u);
  const dockerLog = fs.readFileSync(fixture.dockerLog, "utf8");
  assert.match(
    dockerLog,
    /run -d -T --no-deps --rm --pull never .* --label erp\.plush\.admin-bootstrap\.operation=[0-9a-f]{32} -e APP_ADMIN_PASSWORD -e BOOTSTRAP_ADMIN_ONCE=true app-server/u,
  );
  assert.match(dockerLog, /compose -p plush-toy-erp-prod --env-file/u);
  assert.doesNotMatch(dockerLog, / service-ports | -P | up /u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), true);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "removed")), true);
  const secretCalls = fs
    .readFileSync(fixture.secretEnvLog, "utf8")
    .trim()
    .split(/\r?\n/u);
  assert.equal(secretCalls.length, 1);
  assert.match(secretCalls[0], / run -d -T --no-deps --rm --pull never /u);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin reads scalar mode and owner with GNU stat semantics", (t) => {
  const fixture = writeFixture(t);
  installGnuStatShim(fixture);

  const result = runHelper(fixture);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /\[bootstrap-production-admin\] status=complete/u,
  );
  assert.doesNotMatch(result.stderr, /无法读取 env 文件权限/u);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin falls back to scalar BSD stat semantics", (t) => {
  const fixture = writeFixture(t);
  installBsdStatShim(fixture);

  const result = runHelper(fixture);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /\[bootstrap-production-admin\] status=complete/u,
  );
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin binds the customer-trial-133 override, lock and all Compose calls", async (t) => {
  const fixture = writeFixture(t);
  configureTrialFixture(fixture);
  const releasePath = path.join(fixture.stateDir, "release-compose-version");
  const first = startHelper(fixture, {
    composeOverride: fixture.composeOverride,
    projectSlug: trialProject,
    expectedDatabaseArg: trialDatabase,
    env: {
      FAKE_BLOCK_COMPOSE_VERSION: "1",
      FAKE_RUNTIME_POSTGRES_DB: trialDatabase,
      FAKE_CURRENT_DATABASE: trialDatabase,
      FAKE_POSTGRES_COMPOSE_PROJECT: trialProject,
      FAKE_POSTGRES_CONTAINER_NAME: `/${trialProject}-postgres`,
    },
  });
  t.after(() => {
    if (fs.existsSync(fixture.stateDir)) {
      fs.writeFileSync(releasePath, "release\n");
    }
    if (first.child.exitCode === null) first.child.kill("SIGTERM");
  });

  await waitForPath(path.join(fixture.stateDir, "compose-version-entered"));
  const lockPath = bootstrapLockPath(fixture, {
    project: trialProject,
    database: trialDatabase,
  });
  const owner = fs.readFileSync(path.join(lockPath, "owner"), "utf8");
  assert.match(owner, new RegExp(trialProject, "u"));
  assert.match(owner, new RegExp(trialDatabase, "u"));

  fs.writeFileSync(releasePath, "release\n");
  const result = await first.result;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(lockPath), false);
  const dockerLog = fs.readFileSync(fixture.dockerLog, "utf8");
  assert.match(dockerLog, new RegExp(`compose -p ${trialProject}`, "u"));
  const composeFiles = `-f ${path.join(fixture.composeDir, "compose.yml")} -f ${fixture.composeOverride}`;
  assert.match(dockerLog, new RegExp(composeFiles.replaceAll("/", "\\/"), "u"));
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin rejects every drift from the exact customer-trial-133 data, lock and Jaeger contract", (t) => {
  const cases = [
    ["POSTGRES_DATA_DIR", "/home/simon/plush-toy-erp-v5/data/other"],
    ["MIGRATION_LOCK_FILE", path.join("__alternate__", "atlas-migrate.lock")],
    ["JAEGER_5775_PORT", "25775"],
    ["JAEGER_6831_PORT", "26831"],
    ["JAEGER_6832_PORT", "26832"],
    ["JAEGER_5778_PORT", "25778"],
    ["JAEGER_UI_PORT", "26687"],
    ["JAEGER_14268_PORT", "34268"],
    ["JAEGER_14250_PORT", "34250"],
    ["JAEGER_9411_PORT", "29411"],
    ["JAEGER_OTLP_GRPC_PORT", "24317"],
    ["JAEGER_OTLP_HTTP_PORT", "24318"],
  ];
  for (const [key, rawValue] of cases) {
    const fixture = writeFixture(t);
    configureTrialFixture(fixture);
    let value = rawValue;
    if (key === "MIGRATION_LOCK_FILE") {
      const alternateLockDir = path.join(fixture.root, "alternate-trial-lock");
      fs.mkdirSync(alternateLockDir, { mode: 0o700 });
      fs.chmodSync(alternateLockDir, 0o700);
      value = path.join(alternateLockDir, "atlas-migrate.lock");
    }
    replaceEnvValues(fixture.envFile, { [key]: value });

    const result = runHelper(fixture, {
      composeOverride: fixture.composeOverride,
      projectSlug: trialProject,
      expectedDatabaseArg: trialDatabase,
      env: {
        FAKE_RUNTIME_POSTGRES_DB: trialDatabase,
        FAKE_CURRENT_DATABASE: trialDatabase,
        FAKE_POSTGRES_COMPOSE_PROJECT: trialProject,
        FAKE_POSTGRES_CONTAINER_NAME: `/${trialProject}-postgres`,
      },
    });
    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, new RegExp(key, "u"), key);
    assert.equal(
      fs.existsSync(path.join(fixture.stateDir, "started")),
      false,
      key,
    );
    assert.equal(fs.existsSync(fixture.secretEnvLog), false, key);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin rejects missing or out-of-scope Compose overrides before docker", (t) => {
  {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, {
      composeOverride: fixture.composeOverride,
    });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /非 customer-trial-133 运行禁止传入 Compose override/u,
    );
    assert.equal(fs.existsSync(fixture.dockerLog), false);
    assertSecretSafe(result, fixture);
  }
  {
    const fixture = writeFixture(t);
    configureTrialFixture(fixture);
    const result = runHelper(fixture, {
      projectSlug: trialProject,
      expectedDatabaseArg: trialDatabase,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /必须显式传入 --compose-override/u);
    assert.equal(fs.existsSync(fixture.dockerLog), false);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin serializes the same Compose project and database before docker", async (t) => {
  const fixture = writeFixture(t);
  const releasePath = path.join(fixture.stateDir, "release-compose-version");
  const first = startHelper(fixture, {
    env: { FAKE_BLOCK_COMPOSE_VERSION: "1" },
  });
  t.after(() => {
    if (fs.existsSync(fixture.stateDir)) {
      fs.writeFileSync(releasePath, "release\n");
    }
    if (first.child.exitCode === null) first.child.kill("SIGTERM");
  });

  await waitForPath(path.join(fixture.stateDir, "compose-version-entered"));
  const lockPath = bootstrapLockPath(fixture);
  const ownerPath = path.join(lockPath, "owner");
  assert.equal(fs.statSync(lockPath).mode & 0o777, 0o700);
  assert.equal(fs.statSync(ownerPath).mode & 0o777, 0o600);
  const owner = fs.readFileSync(ownerPath, "utf8");
  assert.match(owner, /plush-toy-erp-prod/u);
  assert.match(owner, new RegExp(expectedDatabase, "u"));
  assert.doesNotMatch(
    owner,
    /FreshAdmin9|test-production-password|postgres:\/\//u,
  );

  const dockerLogBefore = fs.readFileSync(fixture.dockerLog, "utf8");
  const second = runHelper(fixture);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /admin bootstrap lock 已存在/u);
  assert.match(second.stderr, /不自动删除陈旧锁/u);
  assert.equal(fs.readFileSync(fixture.dockerLog, "utf8"), dockerLogBefore);

  fs.writeFileSync(releasePath, "release\n");
  const firstResult = await first.result;
  assert.equal(
    firstResult.status,
    0,
    `${firstResult.stdout}\n${firstResult.stderr}`,
  );
  assert.equal(fs.existsSync(lockPath), false);
  assertSecretSafe(firstResult, fixture);
});

test("bootstrap production admin serializes the same database across different private file lock roots", async (t) => {
  const fixture = writeFixture(t);
  const releasePath = path.join(fixture.stateDir, "release-current-database");
  const first = startHelper(fixture, {
    env: { FAKE_BLOCK_CURRENT_DATABASE: "1" },
  });
  t.after(() => {
    if (fs.existsSync(fixture.stateDir)) {
      fs.writeFileSync(releasePath, "release\n");
    }
    if (first.child.exitCode === null) first.child.kill("SIGTERM");
  });

  await waitForPath(path.join(fixture.stateDir, "advisory-ready"));
  await waitForPath(path.join(fixture.stateDir, "current-database-entered"));

  const secondLockDir = path.join(fixture.root, "alternate-lock-root");
  fs.mkdirSync(secondLockDir, { mode: 0o700 });
  fs.chmodSync(secondLockDir, 0o700);
  const secondEnvFile = path.join(fixture.root, ".env.second-lock-root");
  fs.copyFileSync(fixture.envFile, secondEnvFile);
  fs.chmodSync(secondEnvFile, 0o600);
  replaceEnvValues(secondEnvFile, {
    MIGRATION_LOCK_FILE: path.join(secondLockDir, "atlas-migrate.lock"),
  });
  const secondFixture = {
    ...fixture,
    envFile: secondEnvFile,
    lockDir: secondLockDir,
  };

  const second = runHelper(secondFixture);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /advisory lock 已被占用/u);
  assert.match(second.stderr, /跨文件锁目录并发/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
  assert.equal(fs.existsSync(bootstrapLockPath(secondFixture)), false);
  assert.equal(fs.existsSync(fixture.secretEnvLog), false);

  fs.writeFileSync(releasePath, "release\n");
  const firstResult = await first.result;
  assert.equal(
    firstResult.status,
    0,
    `${firstResult.stdout}\n${firstResult.stderr}`,
  );
  assert.equal(
    fs.existsSync(path.join(fixture.stateDir, "advisory-lock")),
    false,
  );
  assertSecretSafe(firstResult, fixture);
});

test("bootstrap production admin rejects busy or abnormal PostgreSQL advisory locks before one-shot", (t) => {
  const cases = [
    [{ FAKE_ADVISORY_BUSY: "1" }, /advisory lock 已被占用/u],
    [{ FAKE_ADVISORY_ERROR: "1" }, /advisory lock session 异常退出/u],
  ];
  for (const [env, expected] of cases) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
    assert.equal(fs.existsSync(bootstrapLockPath(fixture)), false);
    assert.equal(fs.existsSync(fixture.secretEnvLog), false);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin preserves an existing lock as stale evidence", (t) => {
  const fixture = writeFixture(t);
  const lockPath = bootstrapLockPath(fixture);
  fs.mkdirSync(lockPath, { mode: 0o700 });
  fs.writeFileSync(path.join(lockPath, "owner"), "stale-owner", {
    mode: 0o600,
  });

  const result = runHelper(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /admin bootstrap lock 已存在/u);
  assert.match(result.stderr, /人工重命名该锁目录再重试/u);
  assert.equal(
    fs.readFileSync(path.join(lockPath, "owner"), "utf8"),
    "stale-owner",
  );
  assert.equal(fs.existsSync(fixture.dockerLog), false);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin releases its lock after a post-lock failure", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, {
    env: { FAKE_POSTGRES_HEALTH: "unhealthy" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /running\/healthy/u);
  assert.equal(fs.existsSync(bootstrapLockPath(fixture)), false);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin only releases the lock token it acquired", async (t) => {
  const fixture = writeFixture(t);
  const releasePath = path.join(fixture.stateDir, "release-compose-version");
  const first = startHelper(fixture, {
    env: { FAKE_BLOCK_COMPOSE_VERSION: "1" },
  });
  t.after(() => {
    if (fs.existsSync(fixture.stateDir)) {
      fs.writeFileSync(releasePath, "release\n");
    }
    if (first.child.exitCode === null) first.child.kill("SIGTERM");
  });

  await waitForPath(path.join(fixture.stateDir, "compose-version-entered"));
  const lockPath = bootstrapLockPath(fixture);
  const ownerPath = path.join(lockPath, "owner");
  fs.writeFileSync(ownerPath, "different-owner", { mode: 0o600 });
  fs.writeFileSync(releasePath, "release\n");

  const result = await first.result;
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /lock owner 已变化或无法安全释放/u,
    JSON.stringify(result),
  );
  assert.equal(fs.existsSync(lockPath), true);
  assert.equal(fs.readFileSync(ownerPath, "utf8"), "different-owner");
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin rejects a non-private lock parent before docker", (t) => {
  const fixture = writeFixture(t);
  fs.chmodSync(fixture.lockDir, 0o755);

  const result = runHelper(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lock 目录权限必须为 0700/u);
  assert.equal(fs.existsSync(fixture.dockerLog), false);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin rejects missing, local-default and weak secrets before docker", (t) => {
  for (const [password, expected] of [
    ["", /必须通过环境变量 APP_ADMIN_PASSWORD/u],
    ["adminadmin", /不得使用本地开发默认密码/u],
    ["short", /必须为 8 到 20 字符/u],
  ]) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { password });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(fixture.dockerLog), false);
  }
});

test("bootstrap production admin accepts only one exact internal PostgreSQL DSN before docker", (t) => {
  const invalidCases = [
    `${postgresDSN}&application_name=bootstrap`,
    `postgres://postgres:test-production-password@postgres,postgres-backup:5432/${expectedDatabase}?sslmode=disable`,
    `postgres://postgres:test-production-password@postgres:5432,postgres-backup:5432/${expectedDatabase}?sslmode=disable`,
    `postgres://postgres:test-production-password@127.0.0.1:5432/${expectedDatabase}?sslmode=disable`,
    `postgres://postgres:test-production-password@postgres:5433/${expectedDatabase}?sslmode=disable`,
    `postgres://postgres:test-production-password@postgres:5432/${expectedDatabase}?sslmode=require`,
    `postgres://postgres:test-production-password@postgres:5432/${expectedDatabase}?sslmode=disable#fallback`,
  ];
  for (const invalidDSN of invalidCases) {
    const fixture = writeFixture(t);
    replaceEnvValues(fixture.envFile, { POSTGRES_DSN: invalidDSN });
    const result = runHelper(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /POSTGRES_DSN 必须精确为单一/u);
    assert.match(result.stderr, /multi-host 或 fallback/u);
    assert.equal(fs.existsSync(fixture.dockerLog), false);
    assertSecretSafe(result, fixture);
  }

  const userFixture = writeFixture(t);
  replaceEnvValues(userFixture.envFile, {
    POSTGRES_DSN: `postgresql://other-user:test-production-password@postgres:5432/${expectedDatabase}?sslmode=disable`,
  });
  const userResult = runHelper(userFixture);
  assert.notEqual(userResult.status, 0);
  assert.match(userResult.stderr, /POSTGRES_DSN user 与 POSTGRES_USER 不一致/u);
  assert.equal(fs.existsSync(userFixture.dockerLog), false);
  assertSecretSafe(userResult, userFixture);
});

test("bootstrap production admin rejects password persistence and an open once window in steady env", (t) => {
  for (const mutate of [
    (value) => `${value}APP_ADMIN_PASSWORD=\n`,
    (value) =>
      value.replace("BOOTSTRAP_ADMIN_ONCE=false", "BOOTSTRAP_ADMIN_ONCE=true"),
  ]) {
    const fixture = writeFixture(t);
    fs.writeFileSync(
      fixture.envFile,
      mutate(fs.readFileSync(fixture.envFile, "utf8")),
      {
        mode: 0o600,
      },
    );
    fs.chmodSync(fixture.envFile, 0o600);
    const result = runHelper(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /steady env/u);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin binds confirmation, database, migration and image release", (t) => {
  const cases = [
    {
      options: { confirmation: "wrong-confirmation" },
      expected: /确认串不匹配/u,
    },
    {
      options: { env: { FAKE_CURRENT_DATABASE: "wrong_db" } },
      expected: /current_database 与目标不一致/u,
    },
    {
      options: { env: { FAKE_CURRENT_MIGRATION: "20260715161752" } },
      expected: /Atlas current version/u,
    },
    {
      options: { env: { FAKE_IMAGE_RELEASE: "b".repeat(40) } },
      expected: /APP_IMAGE 的 GIT_SHA/u,
    },
  ];
  for (const { options, expected } of cases) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, options);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin rejects the wrong PostgreSQL Compose label or container name before DB writes", (t) => {
  const cases = [
    [
      { FAKE_POSTGRES_COMPOSE_PROJECT: "wrong-project" },
      /Compose project label 与目标不一致/u,
    ],
    [
      { FAKE_POSTGRES_CONTAINER_NAME: "/wrong-postgres" },
      /容器名必须精确为 plush-toy-erp-postgres/u,
    ],
  ];
  for (const [env, expected] of cases) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
    const dockerLog = fs.readFileSync(fixture.dockerLog, "utf8");
    assert.doesNotMatch(dockerLog, / run -d /u);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin never accepts or cleans a one-shot with mismatched CID, name, labels, image or operation", (t) => {
  const cases = [
    { FAKE_ONE_SHOT_ID: "c".repeat(64) },
    { FAKE_ONE_SHOT_NAME: "foreign-admin-bootstrap" },
    { FAKE_ONE_SHOT_PROJECT: "foreign-project" },
    { FAKE_ONE_SHOT_SERVICE: "foreign-service" },
    { FAKE_ONE_SHOT_IMAGE_REF: "foreign/server:image" },
    { FAKE_ONE_SHOT_IMAGE_ID: `sha256:${"c".repeat(64)}` },
    { FAKE_ONE_SHOT_OPERATION: "foreign-operation" },
  ];
  for (const env of cases) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { env });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /CID\/name\/project\/service\/image\/operation 合同不一致/u,
    );
    assert.match(result.stderr, /保留 PostgreSQL advisory\/file lock 现场/u);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), true);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), false);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "removed")), false);
    assert.equal(fs.existsSync(bootstrapLockPath(fixture)), true);
    assert.equal(
      fs.existsSync(path.join(fixture.stateDir, "advisory-lock")),
      true,
    );
    const secretCalls = fs
      .readFileSync(fixture.secretEnvLog, "utf8")
      .trim()
      .split(/\r?\n/u);
    assert.equal(secretCalls.length, 1);
    assert.match(secretCalls[0], / run -d -T --no-deps --rm --pull never /u);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin fails before writes on infrastructure and schema blockers", (t) => {
  const cases = [
    [{ FAKE_POSTGRES_HEALTH: "unhealthy" }, /running\/healthy/u],
    [{ FAKE_APP_RUNNING: "1" }, /必须停止常驻 app-server/u],
    [{ FAKE_RUNTIME_POSTGRES_DB: "wrong_db" }, /运行态 POSTGRES_DB/u],
    [{ FAKE_SCHEMA_STATUS: "missing" }, /缺少已迁移/u],
  ];
  for (const [env, expected] of cases) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin refuses a preexisting marker or username without starting a container", (t) => {
  for (const [env, expected] of [
    [{ FAKE_PREEXISTING_MARKER: "1" }, /marker 已存在/u],
    [{ FAKE_PREEXISTING_ADMIN: "1" }, /用户名已存在/u],
  ]) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin treats committed evidence mismatches as non-retryable", (t) => {
  const cases = [
    [{ FAKE_EXACT_MARKER_COUNT: "0" }, /marker payload 读回失败/u],
    [{ FAKE_ELIGIBLE_ADMIN_COUNT: "0" }, /管理员状态读回失败/u],
    [{ FAKE_COMPLETED_AUDIT_COUNT: "0" }, /completed audit 读回失败/u],
    [{ FAKE_BLOCKED_AUDIT_COUNT: "1" }, /产生 blocked audit/u],
    [{ FAKE_BUILTIN_ROLE_COUNT: "0" }, /内置 role 未完成初始化/u],
    [{ FAKE_ROLE_PERMISSION_COUNT: "0" }, /role permission 未完成初始化/u],
  ];
  for (const [env, expected] of cases) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bootstrap_committed_runtime_not_ready/u);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), true);
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin cleans an early-exit container and never reports committed", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, {
    env: {
      FAKE_MARKER_AFTER_RUN: "0",
      FAKE_ONE_SHOT_EARLY_EXIT: "1",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /在 marker 提交前退出/u);
  assert.doesNotMatch(result.stderr, /bootstrap_committed_runtime_not_ready/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), true);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin times out fail-closed and removes the one-shot", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, {
    timeoutSeconds: "1",
    env: { FAKE_MARKER_AFTER_RUN: "0" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /等待 admin bootstrap marker 超时/u);
  assert.doesNotMatch(result.stderr, /bootstrap_committed_runtime_not_ready/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), true);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin recovers an invalid cid only through the unique random operation label", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, { env: { FAKE_INVALID_CID: "1" } });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未返回有效 container id/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), true);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "removed")), true);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin retains locks when random-operation discovery fails or is non-unique", (t) => {
  for (const env of [
    { FAKE_INVALID_CID: "1", FAKE_DISCOVERY_FAIL: "1" },
    { FAKE_INVALID_CID: "1", FAKE_DISCOVERY_MULTIPLE: "1" },
  ]) {
    const fixture = writeFixture(t);
    const result = runHelper(fixture, { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未返回有效 container id/u);
    assert.match(
      result.stderr,
      /容器发现、身份复核或清理不确定；保留 PostgreSQL advisory\/file lock/u,
    );
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), false);
    assert.equal(fs.existsSync(path.join(fixture.stateDir, "removed")), false);
    assert.equal(fs.existsSync(bootstrapLockPath(fixture)), true);
    assert.equal(
      fs.existsSync(path.join(fixture.stateDir, "advisory-lock")),
      true,
    );
    assertSecretSafe(result, fixture);
  }
});

test("bootstrap production admin releases locks after a compose run failure with no discovered container", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, { env: { FAKE_RUN_FAIL: "1" } });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /一次性 app-server bootstrap 容器启动失败/u);
  assert.doesNotMatch(result.stderr, /容器发现、身份复核或清理不确定/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
  assert.equal(fs.existsSync(bootstrapLockPath(fixture)), false);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin reports committed but not ready when container cleanup fails", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, { env: { FAKE_CLEANUP_FAIL: "1" } });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /bootstrap_committed_runtime_not_ready/u,
    JSON.stringify(result),
  );
  assert.match(result.stderr, /容器无法清理/u);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin retains the file lock when PostgreSQL cannot prove advisory release", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, {
    env: { FAKE_ADVISORY_TERMINATE_FAIL: "1" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bootstrap_committed_runtime_not_ready/u);
  assert.match(result.stderr, /advisory lock 无法证明已释放/u);
  assert.match(result.stderr, /保留 file lock 现场/u);
  assert.equal(fs.existsSync(bootstrapLockPath(fixture)), true);
  assert.equal(
    fs.existsSync(path.join(fixture.stateDir, "advisory-lock")),
    true,
  );
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin pins a private env snapshot and detects steady env drift", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, {
    env: { FAKE_MUTATE_ENV_FILE: fixture.envFile },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bootstrap_committed_runtime_not_ready/u);
  assert.match(result.stderr, /steady env 文件在 bootstrap 窗口发生变化/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "stopped")), true);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin rejects a steady Compose password mapping", (t) => {
  const fixture = writeFixture(t);
  const composePath = path.join(fixture.composeDir, "compose.yml");
  fs.writeFileSync(
    composePath,
    fs
      .readFileSync(composePath, "utf8")
      .replace(
        '      BOOTSTRAP_ADMIN_ONCE: "${BOOTSTRAP_ADMIN_ONCE:-false}"',
        [
          '      BOOTSTRAP_ADMIN_ONCE: "${BOOTSTRAP_ADMIN_ONCE:-false}"',
          '      APP_ADMIN_PASSWORD: "${APP_ADMIN_PASSWORD:-}"',
        ].join("\n"),
      ),
  );

  const result = runHelper(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不得映射 APP_ADMIN_PASSWORD/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin rejects permissive or symlinked env files", (t) => {
  {
    const fixture = writeFixture(t);
    fs.chmodSync(fixture.envFile, 0o644);
    const result = runHelper(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /不得向 group\/other 开放权限/u);
  }
  {
    const fixture = writeFixture(t);
    const linkPath = `${fixture.envFile}.link`;
    fs.symlinkSync(fixture.envFile, linkPath);
    const original = fixture.envFile;
    fixture.envFile = linkPath;
    const result = runHelper(fixture);
    fixture.envFile = original;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /不得是符号链接/u);
  }
});

test("bootstrap production admin rejects host target overrides", (t) => {
  const fixture = writeFixture(t);
  const result = runHelper(fixture, {
    env: { COMPOSE_PROJECT_NAME: "wrong-project" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不得设置目标覆盖变量: COMPOSE_PROJECT_NAME/u);
  assert.equal(fs.existsSync(path.join(fixture.stateDir, "started")), false);
  assertSecretSafe(result, fixture);
});

test("bootstrap production admin script keeps the compose one-shot fail-closed", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const preflightSource = fs.readFileSync(
    path.join(repoRoot, "scripts/deploy/production-preflight.sh"),
    "utf8",
  );

  assert.match(source, /run -d -T --no-deps --rm --pull never/u);
  assert.match(source, /compose_cmd=\(docker compose -p "\$compose_project"/u);
  assert.match(source, /-e APP_ADMIN_PASSWORD/u);
  assert.doesNotMatch(source, /-e APP_ADMIN_PASSWORD=/u);
  assert.doesNotMatch(source, /docker compose[^\n]* up /u);
  assert.match(source, /bootstrap_committed_runtime_not_ready/u);
  assert.match(source, /marker_value::jsonb/u);
  assert.match(source, /runtime_audit_events/u);
  assert.match(source, /env_snapshot/u);
  assert.match(
    source,
    /pg_try_advisory_lock\(hashtextextended\(:'lock_identity', 0\)\)/u,
  );
  assert.match(source, /lock_identity="\$\{compose_project\}:\$\{database\}"/u);
  assert.match(source, /erp\.plush\.admin-bootstrap\.operation/u);
  assert.match(source, /docker ps -aq --no-trunc --filter/u);
  assert.match(source, /env "PGAPPNAME=\$advisory_application_name"/u);
  assert.match(source, /SELECT pg_sleep\(2147483647\);/u);
  assert.match(source, /pg_terminate_backend\(\$advisory_backend_pid\)/u);
  assert.match(source, /one_shot_identity_verified/u);
  assert.doesNotMatch(source, /container_ref=.*one_shot_name/u);
  assert.match(source, /APP_ADMIN_PASSWORD="\$admin_password"/u);
  assert.ok(
    source.indexOf("unset APP_ADMIN_PASSWORD") <
      source.indexOf("git rev-parse --show-toplevel"),
  );
  assert.ok(
    source.indexOf("unset APP_ADMIN_PASSWORD") <
      source.indexOf('compose_cmd=(docker compose -p "$compose_project"'),
  );
  assert.match(preflightSource, new RegExp(productionTrialDataDir, "u"));
  assert.match(preflightSource, new RegExp(productionTrialLockFile, "u"));
  for (const exactPort of [
    "JAEGER_5775_PORT=45775",
    "JAEGER_6831_PORT=46831",
    "JAEGER_6832_PORT=46832",
    "JAEGER_5778_PORT=45778",
    "JAEGER_UI_PORT=46687",
    "JAEGER_14268_PORT=54268",
    "JAEGER_14250_PORT=54250",
    "JAEGER_9411_PORT=49411",
    "JAEGER_OTLP_GRPC_PORT=44317",
    "JAEGER_OTLP_HTTP_PORT=44318",
  ]) {
    assert.match(preflightSource, new RegExp(exactPort, "u"));
  }
});
