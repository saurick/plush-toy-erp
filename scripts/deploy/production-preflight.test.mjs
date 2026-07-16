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
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "production-preflight-")),
  );
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
      "POSTGRES_PORT=5435",
      "TRACE_ENDPOINT=http://jaeger:4318/v1/traces",
      "TRACE_RATIO=0.1",
      "WEB_API_ORIGIN=https://erp.yoyoosun.local",
      "APP_HTTP_BIND_ADDR=127.0.0.1",
      "APP_HTTP_PORT=8300",
      "APP_GRPC_BIND_ADDR=127.0.0.1",
      "APP_GRPC_PORT=9300",
      "WEB_DESKTOP_PORT=5175",
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
      "JAEGER_5775_PORT=15775",
      "JAEGER_6831_PORT=16831",
      "JAEGER_6832_PORT=16832",
      "JAEGER_5778_PORT=15778",
      "JAEGER_UI_PORT=16687",
      "JAEGER_14268_PORT=24268",
      "JAEGER_14250_PORT=24250",
      "JAEGER_9411_PORT=19411",
      "JAEGER_OTLP_GRPC_PORT=14317",
      "JAEGER_OTLP_HTTP_PORT=14318",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.chmodSync(envFile, 0o600);

  fs.writeFileSync(
    path.join(composeDir, "compose.yml"),
    [
      "name: plush-toy-erp-prod",
      "",
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
  fs.writeFileSync(
    path.join(composeDir, "compose.customer-trial-133.yml"),
    "name: plush-toy-erp-v5\n",
    "utf8",
  );
  fs.copyFileSync(
    path.join(repoRoot, "server/deploy/compose/prod/chromium-seccomp.json"),
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

  return {
    root,
    envFile,
    composeDir,
    expectedRelease: "0123456789abcdef0123456789abcdef01234567",
  };
}

const composeDockerControlKeys = [
  "COMPOSE_PROJECT_NAME",
  "COMPOSE_FILE",
  "COMPOSE_PROFILES",
  "COMPOSE_ENV_FILES",
  "COMPOSE_PATH_SEPARATOR",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
];

function sanitizedChildEnv(fixture, overrides = {}) {
  const childEnv = { ...process.env };
  for (const line of fs.readFileSync(fixture.envFile, "utf8").split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) delete childEnv[line.slice(0, separator)];
  }
  for (const key of composeDockerControlKeys) delete childEnv[key];
  return { ...childEnv, ...overrides };
}

function runPreflight(
  fixture,
  extraArgs = [],
  { env = {}, skipComposeConfig = true, includeExpectedRelease = true } = {},
) {
  const args = [
    scriptPath,
    "--env-file",
    fixture.envFile,
    "--compose-dir",
    fixture.composeDir,
  ];
  if (skipComposeConfig && !extraArgs.includes("--runtime")) {
    args.push("--skip-compose-config");
  }
  if (
    includeExpectedRelease &&
    extraArgs.includes("--runtime") &&
    !extraArgs.includes("--expected-release")
  ) {
    args.push("--expected-release", fixture.expectedRelease);
  }
  args.push(...extraArgs);
  return spawnSync("bash", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(fixture, env),
  });
}

function configureExactCustomerTrialFixture(
  fixture,
  {
    dsn = "postgres://postgres:test-production-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable",
  } = {},
) {
  const replacements = new Map([
    ["PROJECT_SLUG", "plush-toy-erp-v5"],
    ["ERP_CUSTOMER_KEY", "yoyoosun"],
    ["POSTGRES_DSN", dsn],
    ["POSTGRES_DB", "plush_erp_uat_20260716_v5"],
    ["POSTGRES_DATA_DIR", "/home/simon/plush-toy-erp-v5/data/postgres"],
    [
      "MIGRATION_LOCK_FILE",
      "/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock",
    ],
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
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .split("\n")
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 0) return line;
      const key = line.slice(0, separator);
      return replacements.has(key) ? `${key}=${replacements.get(key)}` : line;
    })
    .join("\n");
  fs.writeFileSync(fixture.envFile, env, "utf8");
}

function trialOverrideArgs(fixture) {
  return [
    "--compose-override",
    path.join(fixture.composeDir, "compose.customer-trial-133.yml"),
  ];
}

function runTrialPreflight(
  fixture,
  extraArgs = [],
  { env = {}, includeExpectedRelease = true } = {},
) {
  const fakeBin = createFakeRuntimeBin(fixture.root);
  return runPreflight(fixture, extraArgs, {
    skipComposeConfig: false,
    includeExpectedRelease,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_COMPOSE_PROJECT: "plush-toy-erp-v5",
      FAKE_RUNTIME_EXPECTED_RELEASE: fixture.expectedRelease,
      ...env,
    },
  });
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
  shift
  project=""
  action=""
  service=""
  args=("$@")
  for ((index = 0; index < \${#args[@]}; index++)); do
    case "\${args[$index]}" in
    -p | --project-name)
      index=$((index + 1))
      project="\${args[$index]:-}"
      ;;
    config | ps)
      action="\${args[$index]}"
      ;;
    esac
  done
  if [[ "$action" == "config" ]]; then
    if [[ -n "\${FAKE_COMPOSE_ARGS_LOG:-}" ]]; then
      printf '%s\n' "$*" >>"$FAKE_COMPOSE_ARGS_LOG"
    fi
    if [[ -n "\${FAKE_COMPOSE_REQUIRED_PROJECT:-}" && "$project" != "$FAKE_COMPOSE_REQUIRED_PROJECT" ]]; then
      exit 41
    fi
    if [[ -n "\${FAKE_MUTATE_ENV_FILE:-}" ]]; then
      printf '\nMUTATED_DURING_PREFLIGHT=1\n' >>"$FAKE_MUTATE_ENV_FILE"
    fi
    resolved="\${FAKE_COMPOSE_RESOLVED_NAME:-\${project:-plush-toy-erp-prod}}"
    printf 'name: %s\nservices: {}\n' "$resolved"
    exit 0
  fi
  if [[ "$action" == "ps" ]]; then
    service="\${args[\${#args[@]} - 1]}"
    printf '%s-cid\n' "$service"
    if [[ "\${FAKE_RUNTIME_DUPLICATE_SERVICE:-}" == "$service" ]]; then
      printf '%s-second-cid\n' "$service"
    fi
    exit 0
  fi
  exit 1
fi
if [[ "\${1:-}" == "image" && "\${2:-}" == "inspect" ]]; then
  image_ref="\${@: -1}"
  case "$image_ref" in
  postgres:18.1) image_id="sha256:1111111111111111111111111111111111111111111111111111111111111111" ;;
  jaegertracing/all-in-one:1.76.0) image_id="sha256:2222222222222222222222222222222222222222222222222222222222222222" ;;
  plush-toy-erp-server:20260628) image_id="sha256:3333333333333333333333333333333333333333333333333333333333333333" ;;
  plush-toy-erp-web:20260628) image_id="sha256:4444444444444444444444444444444444444444444444444444444444444444" ;;
  *) exit 1 ;;
  esac
  if [[ "\${FAKE_RUNTIME_IMAGE_ID_DRIFT_REF:-}" == "$image_ref" ]]; then
    image_id="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  fi
  printf '%s\n' "$image_id"
  exit 0
fi
if [[ "\${1:-}" == "port" ]]; then
  cid="\${2:-}"
  container_port="\${3:-}"
  case "$cid:$container_port" in
  postgres-cid:5432/tcp) host_port=55435 ;;
  app-server-cid:8300/tcp) host_port=8315 ;;
  app-server-cid:9300/tcp) host_port=9315 ;;
  web-desktop-cid:5175/tcp) host_port=5185 ;;
  jaeger-cid:5775/udp) host_port=45775 ;;
  jaeger-cid:6831/udp) host_port=46831 ;;
  jaeger-cid:6832/udp) host_port=46832 ;;
  jaeger-cid:5778/tcp) host_port=45778 ;;
  jaeger-cid:16686/tcp) host_port=46687 ;;
  jaeger-cid:14268/tcp) host_port=54268 ;;
  jaeger-cid:14250/tcp) host_port=54250 ;;
  jaeger-cid:9411/tcp) host_port=49411 ;;
  jaeger-cid:4317/tcp) host_port=44317 ;;
  jaeger-cid:4318/tcp) host_port=44318 ;;
  *) exit 1 ;;
  esac
  if [[ "\${FAKE_RUNTIME_PORT_DRIFT_TARGET:-}" == "$cid:$container_port" ]]; then
    host_port="\${FAKE_RUNTIME_PORT_DRIFT_VALUE:-65534}"
  fi
  printf '127.0.0.1:%s\n' "$host_port"
  exit 0
fi
if [[ "\${1:-}" == "inspect" ]]; then
  cid="\${@: -1}"
  case "$cid" in
  postgres-cid)
    runtime_image_ref=postgres:18.1
    runtime_image_id="sha256:1111111111111111111111111111111111111111111111111111111111111111"
    ;;
  jaeger-cid)
    runtime_image_ref=jaegertracing/all-in-one:1.76.0
    runtime_image_id="sha256:2222222222222222222222222222222222222222222222222222222222222222"
    ;;
  app-server-cid)
    runtime_image_ref=plush-toy-erp-server:20260628
    runtime_image_id="sha256:3333333333333333333333333333333333333333333333333333333333333333"
    ;;
  web-desktop-cid)
    runtime_image_ref=plush-toy-erp-web:20260628
    runtime_image_id="sha256:4444444444444444444444444444444444444444444444444444444444444444"
    ;;
  *) exit 1 ;;
  esac
  if [[ "$*" == *'{{.Config.Image}}'* ]]; then
    if [[ "\${FAKE_RUNTIME_IMAGE_REF_DRIFT_SERVICE:-}" == "$cid" ]]; then
      runtime_image_ref="\${FAKE_RUNTIME_IMAGE_REF_DRIFT_VALUE:-wrong/image:tag}"
    fi
    printf '%s\n' "$runtime_image_ref"
  elif [[ "$*" == *'{{.Image}}'* ]]; then
    if [[ "\${FAKE_RUNTIME_CONTAINER_IMAGE_ID_DRIFT_SERVICE:-}" == "$cid" ]]; then
      runtime_image_id="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    fi
    printf '%s\n' "$runtime_image_id"
  elif [[ "$*" == *'{{.Name}}'* ]]; then
    case "$cid" in
    postgres-cid) container_name=plush-toy-erp-v5-postgres ;;
    jaeger-cid) container_name=plush-toy-erp-v5-jaeger ;;
    app-server-cid) container_name=plush-toy-erp-v5-server ;;
    web-desktop-cid) container_name=plush-toy-erp-v5-web-desktop ;;
    *) container_name=unknown ;;
    esac
    if [[ "\${FAKE_RUNTIME_NAME_DRIFT_SERVICE:-}" == "$cid" ]]; then
      container_name="\${FAKE_RUNTIME_NAME_DRIFT_VALUE:-wrong-container}"
    fi
    printf '/%s\n' "$container_name"
  elif [[ "$*" == *'com.docker.compose.project'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_COMPOSE_PROJECT:-plush-toy-erp-prod}"
  elif [[ "$*" == *'.Mounts'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_POSTGRES_MOUNT:-/home/simon/plush-toy-erp-v5/data/postgres}"
  elif [[ "$*" == *'.Config.User'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_APP_USER:-app}"
  elif [[ "$*" == *'.HostConfig.SecurityOpt'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_SECURITY_OPT:-[\"seccomp=/fixture/chromium-seccomp.json\"]}"
  else
    runtime_release="\${FAKE_RUNTIME_EXPECTED_RELEASE:-0123456789abcdef0123456789abcdef01234567}"
    if [[ "\${FAKE_RUNTIME_RELEASE_DRIFT_SERVICE:-}" == "$cid" ]]; then
      runtime_release="\${FAKE_RUNTIME_RELEASE_DRIFT_VALUE:-ffffffffffffffffffffffffffffffffffffffff}"
    fi
    if [[ "$cid" == "app-server-cid" || "$cid" == "web-desktop-cid" ]]; then
      printf 'GIT_SHA=%s\n' "$runtime_release"
    fi
    if [[ "$cid" == "app-server-cid" ]]; then
      printf 'ERP_PDF_WARMUP=%s\n' "\${FAKE_RUNTIME_PDF_WARMUP:-async}"
      printf 'BOOTSTRAP_ADMIN_ONCE=%s\n' "\${FAKE_RUNTIME_BOOTSTRAP_ADMIN_ONCE:-false}"
      printf 'ERP_CUSTOMER_KEY=%s\n' "\${FAKE_RUNTIME_CUSTOMER_KEY:-yoyoosun}"
      printf 'ERP_DEBUG_ENV=%s\n' "\${FAKE_RUNTIME_DEBUG_ENV:-prod}"
      printf 'ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=%s\n' "\${FAKE_RUNTIME_TRIAL_ALLOW:-1}"
      printf 'ERP_CUSTOMER_TRIAL_TARGET=%s\n' "\${FAKE_RUNTIME_TRIAL_TARGET:-customer-trial-133}"
      printf 'POSTGRES_DSN=%s\n' "\${FAKE_RUNTIME_POSTGRES_DSN:-postgres://postgres:test-production-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable}"
      if [[ "\${FAKE_RUNTIME_APP_PASSWORD_PRESENT:-0}" == "1" ]]; then
        printf 'APP_ADMIN_PASSWORD=%s\n' "\${FAKE_RUNTIME_APP_PASSWORD:-runtime-sensitive-secret}"
      fi
    fi
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

test("production preflight snapshots a private env and passes only the snapshot to Compose", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const argsLog = path.join(fixture.root, "snapshot-compose-args.log");
  const result = runPreflight(fixture, [], {
    skipComposeConfig: false,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_COMPOSE_ARGS_LOG: argsLog,
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const invocation = fs.readFileSync(argsLog, "utf8");
  assert.match(invocation, /--env-file \/[^ ]+/u);
  assert.doesNotMatch(invocation, new RegExp(fixture.envFile, "u"));
});

test("production preflight rejects a runtime env with group or world access", () => {
  const fixture = writeFixture();
  fs.chmodSync(fixture.envFile, 0o644);

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /权限必须为 0600/u);
});

test("production preflight rejects an env symlink and a symlinked parent", async (t) => {
  await t.test("env file symlink", () => {
    const fixture = writeFixture();
    const realEnv = `${fixture.envFile}.real`;
    fs.renameSync(fixture.envFile, realEnv);
    fs.symlinkSync(realEnv, fixture.envFile);

    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /符号链接/u);
  });

  await t.test("parent symlink", () => {
    const fixture = writeFixture();
    const alias = path.join(
      path.dirname(fixture.root),
      `${path.basename(fixture.root)}-alias`,
    );
    fs.symlinkSync(fixture.root, alias, "dir");
    const aliasedFixture = {
      ...fixture,
      envFile: path.join(alias, ".env"),
    };

    const result = runPreflight(aliasedFixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /env 文件 不得经过符号链接/u);
  });
});

test("production preflight detects source env mutation after taking the snapshot", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, [], {
    skipComposeConfig: false,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_MUTATE_ENV_FILE: fixture.envFile,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /env 文件内容在检查期间发生变化/u);
});

test("production preflight example mode permits the tracked 0644 example via a private snapshot", () => {
  const childEnv = { ...process.env };
  for (const key of composeDockerControlKeys) delete childEnv[key];
  const result = spawnSync(
    "bash",
    [scriptPath, "--example", "--skip-compose-config"],
    { cwd: repoRoot, encoding: "utf8", env: childEnv },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /example 模式仅检查结构/u);
});

test("production preflight leaves the canonical Compose project to compose.yml", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const argsLog = path.join(fixture.root, "canonical-compose-args.log");
  const result = runPreflight(fixture, [], {
    skipComposeConfig: false,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_COMPOSE_ARGS_LOG: argsLog,
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const invocation = fs.readFileSync(argsLog, "utf8");
  assert.doesNotMatch(invocation, /(^|\s)-p(\s|$)/u);
  assert.doesNotMatch(invocation, /compose\.customer-trial-133\.yml/u);
});

test("production preflight rejects ambient variables that override env-file values without leaking them", () => {
  const fixture = writeFixture();
  const ambientSecret = "ambient-must-not-be-printed";
  const result = runPreflight(fixture, [], {
    env: { POSTGRES_PASSWORD: ambientSecret },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /宿主环境变量会覆盖受控 env-file/u);
  assert.match(result.stderr, /POSTGRES_PASSWORD/u);
  assert.doesNotMatch(result.stdout, new RegExp(ambientSecret));
  assert.doesNotMatch(result.stderr, new RegExp(ambientSecret));
});

test("production preflight rejects ambient Compose and Docker client controls", () => {
  for (const key of composeDockerControlKeys) {
    const fixture = writeFixture();
    const result = runPreflight(fixture, [], {
      env: { [key]: "ambient-control-value" },
    });
    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, new RegExp(key), key);
    assert.doesNotMatch(result.stderr, /ambient-control-value/u, key);
  }
});

test("production preflight rejects Compose and Docker client controls inside the runtime env file", () => {
  const fixture = writeFixture();
  fs.appendFileSync(fixture.envFile, "COMPOSE_PROJECT_NAME=wrong-project\n");
  const result = runPreflight(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /运行 env 文件禁止定义 Compose \/ Docker/u);
  assert.match(result.stderr, /COMPOSE_PROJECT_NAME/u);
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

test("production preflight rejects admin passwords outside 8 to 20 characters", () => {
  for (const password of ["1234567", "123456789012345678901"]) {
    const fixture = writeFixture();
    const env = fs
      .readFileSync(fixture.envFile, "utf8")
      .replace(
        "APP_ADMIN_USERNAME=admin",
        `APP_ADMIN_USERNAME=admin\nAPP_ADMIN_PASSWORD=${password}`,
      )
      .replace("BOOTSTRAP_ADMIN_ONCE=false", "BOOTSTRAP_ADMIN_ONCE=true");
    fs.writeFileSync(fixture.envFile, env, "utf8");
    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /APP_ADMIN_PASSWORD 必须为 8 到 20 字符/u);
  }
});

test("production preflight enforces the bcrypt 72-byte boundary", () => {
  const fixture = writeFixture();
  const password = "😀".repeat(20);
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .replace(
      "APP_ADMIN_USERNAME=admin",
      `APP_ADMIN_USERNAME=admin\nAPP_ADMIN_PASSWORD=${password}`,
    )
    .replace("BOOTSTRAP_ADMIN_ONCE=false", "BOOTSTRAP_ADMIN_ONCE=true");
  fs.writeFileSync(fixture.envFile, env, "utf8");

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不得超过 72 字节/u);
});

test("production preflight counts UTF-8 characters independently of the process locale", () => {
  const fixture = writeFixture();
  const password = "测试密码安全有效";
  const env = fs
    .readFileSync(fixture.envFile, "utf8")
    .replace(
      "APP_ADMIN_USERNAME=admin",
      `APP_ADMIN_USERNAME=admin\nAPP_ADMIN_PASSWORD=${password}`,
    )
    .replace("BOOTSTRAP_ADMIN_ONCE=false", "BOOTSTRAP_ADMIN_ONCE=true");
  fs.writeFileSync(fixture.envFile, env, "utf8");

  const result = runPreflight(fixture, [], { env: { LC_ALL: "C" } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
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
  assert.match(
    result.stdout,
    new RegExp(
      `Compose 四服务容器唯一，镜像引用 / content id 与 release=${fixture.expectedRelease} 一致`,
      "u",
    ),
  );
  assert.match(
    result.stdout,
    /运行态 admin bootstrap secret 已清理且 once=false/,
  );
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

test("production preflight canonical runtime may derive the current Git release", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const currentRelease = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).stdout.trim();
  const result = runPreflight(fixture, ["--runtime"], {
    includeExpectedRelease: false,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_EXPECTED_RELEASE: currentRelease,
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`release=${currentRelease}`, "u"));
});

test("production preflight customer-trial runtime requires an explicit exact release", async (t) => {
  await t.test("missing", () => {
    const fixture = writeFixture();
    configureExactCustomerTrialFixture(fixture);
    const result = runTrialPreflight(
      fixture,
      [...trialOverrideArgs(fixture), "--runtime"],
      { includeExpectedRelease: false },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /必须显式传入 --expected-release/u);
  });

  await t.test("invalid", () => {
    const fixture = writeFixture();
    configureExactCustomerTrialFixture(fixture);
    const result = runTrialPreflight(fixture, [
      ...trialOverrideArgs(fixture),
      "--runtime",
      "--expected-release",
      "not-a-release",
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /40 位小写 Git SHA/u);
  });
});

test("production preflight runtime image and release identity fail closed", async (t) => {
  const cases = [
    {
      name: "duplicate service",
      env: { FAKE_RUNTIME_DUPLICATE_SERVICE: "jaeger" },
      expected: /服务必须精确存在一个容器: jaeger/u,
    },
    {
      name: "image reference drift",
      env: { FAKE_RUNTIME_IMAGE_REF_DRIFT_SERVICE: "app-server-cid" },
      expected: /app-server 的镜像引用与受控 env 不一致/u,
    },
    {
      name: "container content id drift",
      env: {
        FAKE_RUNTIME_CONTAINER_IMAGE_ID_DRIFT_SERVICE: "web-desktop-cid",
      },
      expected: /web-desktop 容器 content id 与受控镜像不一致/u,
    },
    {
      name: "app release drift",
      env: { FAKE_RUNTIME_RELEASE_DRIFT_SERVICE: "app-server-cid" },
      expected: /app-server 的 GIT_SHA 与期望 release 不一致/u,
    },
    {
      name: "web release drift",
      env: { FAKE_RUNTIME_RELEASE_DRIFT_SERVICE: "web-desktop-cid" },
      expected: /web-desktop 的 GIT_SHA 与期望 release 不一致/u,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, () => {
      const fixture = writeFixture();
      const fakeBin = createFakeRuntimeBin(fixture.root);
      const result = runPreflight(fixture, ["--runtime"], {
        env: {
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          ...item.env,
        },
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, item.expected);
    });
  }
});

test("production preflight verifies every customer-trial runtime service uses the V5 Compose project", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(fixture, [
    ...trialOverrideArgs(fixture),
    "--runtime",
  ]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /运行态容器名、project、端口、PostgreSQL 挂载和 app 试用身份一致/u,
  );
});

test("production preflight rejects a customer-trial service from the canonical production project", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(
    fixture,
    [...trialOverrideArgs(fixture), "--runtime"],
    {
      env: {
        FAKE_RUNTIME_COMPOSE_PROJECT: "plush-toy-erp-prod",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不属于独立 Compose project plush-toy-erp-v5/u);
});

test("production preflight rejects V5 runtime container name drift", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(
    fixture,
    [...trialOverrideArgs(fixture), "--runtime"],
    {
      env: {
        FAKE_RUNTIME_NAME_DRIFT_SERVICE: "app-server-cid",
        FAKE_RUNTIME_NAME_DRIFT_VALUE: "plush-toy-erp-prod-server",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /容器名不符合 V5 独立身份/u);
});

test("production preflight rejects V5 runtime host port drift", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(
    fixture,
    [...trialOverrideArgs(fixture), "--runtime"],
    {
      env: {
        FAKE_RUNTIME_PORT_DRIFT_TARGET: "app-server-cid:8300/tcp",
        FAKE_RUNTIME_PORT_DRIFT_VALUE: "8300",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /端口 8300\/tcp 未精确绑定 V5 独立宿主端口/u);
});

test("production preflight rejects V5 runtime PostgreSQL mount drift", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(
    fixture,
    [...trialOverrideArgs(fixture), "--runtime"],
    {
      env: {
        FAKE_RUNTIME_POSTGRES_MOUNT:
          "/home/simon/plush-toy-erp-prod/data/postgres",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PostgreSQL 挂载源不符合 V5 独立数据目录/u);
});

test("production preflight rejects V5 runtime app trial identity drift", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(
    fixture,
    [...trialOverrideArgs(fixture), "--runtime"],
    { env: { FAKE_RUNTIME_TRIAL_TARGET: "customer-trial-other" } },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /试用身份变量不符合合同: ERP_CUSTOMER_TRIAL_TARGET/u,
  );
});

test("production preflight rejects V5 runtime app DSN drift without leaking it", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const runtimeSecret = "runtime-dsn-password-must-not-leak";
  const result = runTrialPreflight(
    fixture,
    [...trialOverrideArgs(fixture), "--runtime"],
    {
      env: {
        FAKE_RUNTIME_POSTGRES_DSN: `postgres://postgres:${runtimeSecret}@postgres:5432/plush_erp?sslmode=disable`,
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DSN 必须精确指向 V5 独立数据库/u);
  assert.doesNotMatch(result.stdout, new RegExp(runtimeSecret));
  assert.doesNotMatch(result.stderr, new RegExp(runtimeSecret));
});

test("production preflight rejects runtime admin bootstrap once mode", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, ["--runtime"], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_BOOTSTRAP_ADMIN_ONCE: "true",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /app-server 稳态运行时 BOOTSTRAP_ADMIN_ONCE 必须为 false/,
  );
});

test("production preflight rejects a retained runtime admin password", () => {
  const fixture = writeFixture();
  const fakeBin = createFakeRuntimeBin(fixture.root);
  const secret = "runtime-sensitive-secret";
  const result = runPreflight(fixture, ["--runtime"], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_APP_PASSWORD_PRESENT: "1",
      FAKE_RUNTIME_APP_PASSWORD: secret,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /稳态运行时不得保留 APP_ADMIN_PASSWORD/);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  assert.doesNotMatch(result.stderr, new RegExp(secret));
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

test("production preflight rejects relative and dot-segment runtime paths", () => {
  for (const [key, value, expected] of [
    ["POSTGRES_DATA_DIR", "relative/postgres", /必须是绝对路径/u],
    [
      "MIGRATION_LOCK_FILE",
      "/run/lock/plush-toy-erp/../other/atlas.lock",
      /不得包含重复分隔符或 \. \/ \.\./u,
    ],
  ]) {
    const fixture = writeFixture();
    const currentLine = fs
      .readFileSync(fixture.envFile, "utf8")
      .split("\n")
      .find((line) => line.startsWith(`${key}=`));
    fs.writeFileSync(
      fixture.envFile,
      fs
        .readFileSync(fixture.envFile, "utf8")
        .replace(currentLine, `${key}=${value}`),
    );
    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, expected, key);
  }
});

test("production preflight rejects an existing symlink in a runtime data path", () => {
  const fixture = writeFixture();
  const realTempRoot = fs.realpathSync(os.tmpdir());
  const target = fs.mkdtempSync(
    path.join(realTempRoot, "production-preflight-data-target-"),
  );
  const symlink = path.join(fixture.root, "postgres-data-link");
  fs.symlinkSync(target, symlink, "dir");
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace(
        "POSTGRES_DATA_DIR=/data/plush/postgres",
        `POSTGRES_DATA_DIR=${symlink}`,
      ),
  );

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DATA_DIR 不得经过符号链接/u);
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

test("production preflight rejects a steady Compose admin password mapping", () => {
  const fixture = writeFixture();
  const composePath = path.join(fixture.composeDir, "compose.yml");
  fs.writeFileSync(
    composePath,
    fs
      .readFileSync(composePath, "utf8")
      .replace(
        "  app-server:",
        [
          "  app-server:",
          '    APP_ADMIN_PASSWORD: "${APP_ADMIN_PASSWORD:-}"',
        ].join("\n"),
      ),
  );

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不得映射 APP_ADMIN_PASSWORD/);
});

test("production preflight allows the exact isolated customer-trial-133 database", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.equal(result.status, 0, result.stderr);
});

test("production preflight invokes V5 Compose with an explicit project and both files", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const argsLog = path.join(fixture.root, "compose-args.log");
  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture), {
    env: {
      FAKE_COMPOSE_ARGS_LOG: argsLog,
      FAKE_COMPOSE_REQUIRED_PROJECT: "plush-toy-erp-v5",
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /docker compose config 解析的 project=plush-toy-erp-v5/u,
  );
  const invocation = fs.readFileSync(argsLog, "utf8");
  assert.match(invocation, /-p plush-toy-erp-v5/u);
  assert.match(invocation, /-f .*\/compose\.yml/u);
  assert.match(invocation, /-f .*\/compose\.customer-trial-133\.yml/u);
  assert.match(invocation, /config/u);
});

test("production preflight rejects a resolved V5 Compose project drift", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture), {
    env: { FAKE_COMPOSE_RESOLVED_NAME: "plush-toy-erp-prod" },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /解析后的 Compose project 必须是 plush-toy-erp-v5/u,
  );
});

test("production preflight forbids skipping resolved Compose config for V5", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runPreflight(fixture, trialOverrideArgs(fixture));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /customer-trial-133 禁止 --skip-compose-config/u);
});

test("production preflight enforces exact V5 data and migration lock paths", () => {
  for (const [key, replacement, expected] of [
    [
      "POSTGRES_DATA_DIR",
      "/Users/simon/plush-toy-erp-v5/data/postgres",
      /POSTGRES_DATA_DIR=\/home\/simon\/plush-toy-erp-v5\/data\/postgres/u,
    ],
    [
      "MIGRATION_LOCK_FILE",
      "/home/simon/plush-toy-erp-v5/run/../atlas-migrate.lock",
      /不得包含重复分隔符或 \. \/ \.\./u,
    ],
  ]) {
    const fixture = writeFixture();
    configureExactCustomerTrialFixture(fixture);
    const currentLine = fs
      .readFileSync(fixture.envFile, "utf8")
      .split("\n")
      .find((line) => line.startsWith(`${key}=`));
    fs.writeFileSync(
      fixture.envFile,
      fs
        .readFileSync(fixture.envFile, "utf8")
        .replace(currentLine, `${key}=${replacement}`),
    );
    const result = runPreflight(fixture, trialOverrideArgs(fixture));
    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, expected, key);
  }
});

test("production preflight rejects customer-trial opt-in outside its exact database", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture, {
    dsn: "postgres://postgres:test-production-password@postgres:5432/plush_erp?sslmode=disable",
  });

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DSN 必须精确指向单一/);
});

test("production preflight rejects extra customer-trial DSN query options", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture, {
    dsn: "postgres://postgres:test-production-password@postgres:5432/plush_erp_uat_20260716_v5?sslmode=disable&target_session_attrs=read-write",
  });

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DSN 必须精确指向单一/);
});

test("production preflight rejects customer-trial without its Compose project override", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /必须显式传入 --compose-override/u);
});

test("production preflight rejects a customer-trial Compose override with extra mutations", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  fs.appendFileSync(
    path.join(fixture.composeDir, "compose.customer-trial-133.yml"),
    "services:\n  postgres:\n    ports: []\n",
  );

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /只能声明 name: plush-toy-erp-v5/u);
});

test("production preflight rejects customer-trial host port collisions", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace("APP_HTTP_PORT=8315", "APP_HTTP_PORT=8300"),
  );

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /必须使用独立 APP_HTTP_PORT=8315/u);
});

test("production preflight rejects a Compose override outside customer-trial", () => {
  const fixture = writeFixture();

  const result = runPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /非 customer-trial-133 运行禁止传入/u);
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
      .replace("seccomp=./chromium-seccomp.json", "seccomp=unconfined"),
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
  const webDockerfile = fs.readFileSync(
    path.join(repoRoot, "web/Dockerfile"),
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
      path.join(repoRoot, "server/deploy/compose/prod/chromium-seccomp.json"),
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
  assert.match(dockerfile, /^ARG GIT_SHA$/mu);
  assert.match(dockerfile, /^ENV GIT_SHA=\$\{GIT_SHA\}$/mu);
  assert.match(webDockerfile, /^ARG GIT_SHA$/mu);
  assert.match(webDockerfile, /^ENV GIT_SHA=\$\{GIT_SHA\}$/mu);
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
