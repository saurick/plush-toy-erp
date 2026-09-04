import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { productionPreflightTest as test } from "./production-preflight-test-lane.mjs";

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
  const postgresAppPassword = "test-app-password-12345";
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
      `POSTGRES_DSN=postgres://erp_app:${postgresAppPassword}@postgres:5432/plush_erp?sslmode=disable`,
      `POSTGRES_PASSWORD=${postgresPassword}`,
      `POSTGRES_APP_PASSWORD=${postgresAppPassword}`,
      "POSTGRES_MIGRATOR_PASSWORD=test-migrator-password-123",
      "POSTGRES_BACKUP_PASSWORD=test-backup-password-123",
      "POSTGRES_DB=plush_erp",
      "POSTGRES_USER=plush",
      "POSTGRES_DATA_DIR=/data/plush/postgres",
      "MIGRATION_LOCK_FILE=/run/lock/plush-toy-erp/atlas-migrate.lock",
      "POSTGRES_BIND_ADDR=127.0.0.1",
      "POSTGRES_PORT=5435",
      "TRACE_ENDPOINT=http://jaeger:4318/v1/traces",
      "TRACE_RATIO=0.1",
      "WEB_API_ORIGIN=https://erp.yoyoosun.local",
      "WEB_PROXY_PREFIXES=/rpc,/templates,/readyz/runtime-identity",
      "APP_HTTP_BIND_ADDR=127.0.0.1",
      "APP_HTTP_PORT=8300",
      "WEB_DESKTOP_BIND_ADDR=0.0.0.0",
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
      "    environment:",
      "      POSTGRES_APP_PASSWORD: ${POSTGRES_APP_PASSWORD}",
      "      POSTGRES_MIGRATOR_PASSWORD: ${POSTGRES_MIGRATOR_PASSWORD}",
      "      POSTGRES_BACKUP_PASSWORD: ${POSTGRES_BACKUP_PASSWORD}",
      "    ports:",
      '      - "${POSTGRES_BIND_ADDR:-127.0.0.1}:5435:5432"',
      "    volumes:",
      "      - ./database_roles.sh:/docker-entrypoint-initdb.d/20-database-roles.sh:ro",
      "      - ./database_roles.sh:/usr/local/bin/plush-database-roles:ro",
      "  jaeger:",
      "    image: ${JAEGER_IMAGE}",
      "    ports:",
      '      - "${JAEGER_BIND_ADDR:-127.0.0.1}:16686:16686"',
      "  app-server:",
      composeBuild ? "    build: ." : "    image: ${APP_IMAGE}",
      "    environment:",
      '      POSTGRES_DSN: "postgres://erp_app:${POSTGRES_APP_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable"',
      "    security_opt:",
      '      - "seccomp=./chromium-seccomp.json"',
      "    ports:",
      '      - "${APP_HTTP_BIND_ADDR:-127.0.0.1}:8300:8300"',
      "  web-desktop:",
      "    image: ${WEB_IMAGE}",
      "    ports:",
      '      - "${WEB_DESKTOP_BIND_ADDR:-0.0.0.0}:${WEB_DESKTOP_PORT:-5175}:5175"',
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(composeDir, "compose.demo-133.yml"),
    "name: plush-toy-erp-demo-v1\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(composeDir, "compose.customer-test-133.yml"),
    "name: plush-toy-erp-test-v1\n",
    "utf8",
  );
  fs.copyFileSync(
    path.join(repoRoot, "server/deploy/compose/prod/chromium-seccomp.json"),
    path.join(composeDir, "chromium-seccomp.json"),
  );
  fs.copyFileSync(
    path.join(repoRoot, "server/deploy/compose/prod/database_roles.sh"),
    path.join(composeDir, "database_roles.sh"),
  );
  fs.chmodSync(path.join(composeDir, "database_roles.sh"), 0o755);

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
  {
    env = {},
    skipComposeConfig = true,
    includeExpectedRelease = true,
    preflightScript = scriptPath,
    cwd = repoRoot,
  } = {},
) {
  const args = [
    preflightScript,
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
    cwd,
    encoding: "utf8",
    env: sanitizedChildEnv(fixture, env),
  });
}

const deploymentTargetFixtures = Object.freeze({
  "demo-133": Object.freeze({
    key: "demo-133",
    project: "plush-toy-erp-demo-v1",
    database: "plush_erp_demo_v1",
    root: "/home/simon/plush-toy-erp-demo-v1",
    override: "compose.demo-133.yml",
    trialEnabled: "1",
    trialTarget: "customer-trial-133",
    ports: Object.freeze({
      POSTGRES_PORT: "55436",
      APP_HTTP_PORT: "8325",
      WEB_DESKTOP_PORT: "5195",
      JAEGER_5775_PORT: "61001",
      JAEGER_6831_PORT: "61002",
      JAEGER_6832_PORT: "61003",
      JAEGER_5778_PORT: "61004",
      JAEGER_UI_PORT: "61005",
      JAEGER_14268_PORT: "61006",
      JAEGER_14250_PORT: "61007",
      JAEGER_9411_PORT: "61008",
      JAEGER_OTLP_GRPC_PORT: "61009",
      JAEGER_OTLP_HTTP_PORT: "61010",
    }),
  }),
  "customer-test-133": Object.freeze({
    key: "customer-test-133",
    project: "plush-toy-erp-test-v1",
    database: "plush_erp_customer_test_v1",
    root: "/home/simon/plush-toy-erp-test-v1",
    override: "compose.customer-test-133.yml",
    trialEnabled: "0",
    trialTarget: "",
    ports: Object.freeze({
      POSTGRES_PORT: "55437",
      APP_HTTP_PORT: "8335",
      WEB_DESKTOP_PORT: "5205",
      JAEGER_5775_PORT: "62001",
      JAEGER_6831_PORT: "62002",
      JAEGER_6832_PORT: "62003",
      JAEGER_5778_PORT: "62004",
      JAEGER_UI_PORT: "62005",
      JAEGER_14268_PORT: "62006",
      JAEGER_14250_PORT: "62007",
      JAEGER_9411_PORT: "62008",
      JAEGER_OTLP_GRPC_PORT: "62009",
      JAEGER_OTLP_HTTP_PORT: "62010",
    }),
  }),
});

function configureExactDeploymentTargetFixture(
  fixture,
  { targetKey = "demo-133", dsn } = {},
) {
  const target = deploymentTargetFixtures[targetKey];
  assert.ok(target, `unknown fixture deployment target: ${targetKey}`);
  const exactDsn =
    dsn ??
    `postgres://erp_app:test-app-password-12345@postgres:5432/${target.database}?sslmode=disable`;
  const replacements = new Map([
    ["PROJECT_SLUG", target.project],
    ["ERP_CUSTOMER_KEY", "yoyoosun"],
    ["POSTGRES_DSN", exactDsn],
    ["POSTGRES_DB", target.database],
    ["POSTGRES_DATA_DIR", `${target.root}/data/postgres`],
    ["MIGRATION_LOCK_FILE", `${target.root}/run/atlas-migrate.lock`],
    ["WEB_DESKTOP_BIND_ADDR", "127.0.0.1"],
    ...Object.entries(target.ports),
    ["ERP_ALLOW_CUSTOMER_TRIAL_CONFIG", target.trialEnabled],
    ["ERP_CUSTOMER_TRIAL_TARGET", target.trialTarget],
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
  fs.writeFileSync(
    fixture.envFile,
    env
      .replace("APP_AUTH_SMS_MODE=disabled", "APP_AUTH_SMS_MODE=provider")
      .replace(
        "APP_ADMIN_USERNAME=admin",
        [
          "APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID=fixture-access-key-id",
          "APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET=fixture-access-key-secret",
          "APP_AUTH_SMS_ALIYUN_SIGN_NAME=fixture-sign-name",
          "APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE=fixture-template-code",
          "APP_ADMIN_USERNAME=admin",
        ].join("\n"),
      ),
    "utf8",
  );
  fixture.deploymentTarget = target;
}

function deploymentTargetArgs(fixture) {
  const target =
    fixture.deploymentTarget ?? deploymentTargetFixtures["demo-133"];
  return [
    "--deployment-target",
    target.key,
    "--compose-override",
    path.join(fixture.composeDir, target.override),
  ];
}

function runDeploymentTargetPreflight(
  fixture,
  extraArgs = [],
  { env = {}, includeExpectedRelease = true } = {},
) {
  const target =
    fixture.deploymentTarget ?? deploymentTargetFixtures["demo-133"];
  const fakeBin = createFakeRuntimeBin(fixture.root);
  return runPreflight(fixture, extraArgs, {
    skipComposeConfig: false,
    includeExpectedRelease,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_TARGET_PROJECT: target.project,
      FAKE_RUNTIME_COMPOSE_PROJECT: target.project,
      FAKE_RUNTIME_POSTGRES_MOUNT: `${target.root}/data/postgres`,
      FAKE_RUNTIME_POSTGRES_DSN: `postgres://erp_app:test-app-password-12345@postgres:5432/${target.database}?sslmode=disable`,
      FAKE_RUNTIME_TRIAL_ALLOW: target.trialEnabled,
      FAKE_RUNTIME_TRIAL_TARGET: target.trialTarget,
      ...Object.fromEntries(
        Object.entries(target.ports).map(([key, value]) => [
          `FAKE_RUNTIME_${key}`,
          value,
        ]),
      ),
      FAKE_RUNTIME_EXPECTED_RELEASE: fixture.expectedRelease,
      FAKE_RUNTIME_AUTH_SMS_MODE: "provider",
      ...env,
    },
  });
}

const configureExactCustomerTrialFixture =
  configureExactDeploymentTargetFixture;
const trialOverrideArgs = deploymentTargetArgs;
const runTrialPreflight = runDeploymentTargetPreflight;

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
  postgres-cid:5432/tcp) host_port="\${FAKE_RUNTIME_POSTGRES_PORT:-5435}" ;;
  app-server-cid:8300/tcp) host_port="\${FAKE_RUNTIME_APP_HTTP_PORT:-8300}" ;;
  web-desktop-cid:5175/tcp) host_port="\${FAKE_RUNTIME_WEB_DESKTOP_PORT:-5175}" ;;
  jaeger-cid:5775/udp) host_port="\${FAKE_RUNTIME_JAEGER_5775_PORT:-15775}" ;;
  jaeger-cid:6831/udp) host_port="\${FAKE_RUNTIME_JAEGER_6831_PORT:-16831}" ;;
  jaeger-cid:6832/udp) host_port="\${FAKE_RUNTIME_JAEGER_6832_PORT:-16832}" ;;
  jaeger-cid:5778/tcp) host_port="\${FAKE_RUNTIME_JAEGER_5778_PORT:-15778}" ;;
  jaeger-cid:16686/tcp) host_port="\${FAKE_RUNTIME_JAEGER_UI_PORT:-16687}" ;;
  jaeger-cid:14268/tcp) host_port="\${FAKE_RUNTIME_JAEGER_14268_PORT:-24268}" ;;
  jaeger-cid:14250/tcp) host_port="\${FAKE_RUNTIME_JAEGER_14250_PORT:-24250}" ;;
  jaeger-cid:9411/tcp) host_port="\${FAKE_RUNTIME_JAEGER_9411_PORT:-19411}" ;;
  jaeger-cid:4317/tcp) host_port="\${FAKE_RUNTIME_JAEGER_OTLP_GRPC_PORT:-14317}" ;;
  jaeger-cid:4318/tcp) host_port="\${FAKE_RUNTIME_JAEGER_OTLP_HTTP_PORT:-14318}" ;;
  *) exit 1 ;;
  esac
  if [[ "\${FAKE_RUNTIME_PORT_DRIFT_TARGET:-}" == "$cid:$container_port" ]]; then
    host_port="\${FAKE_RUNTIME_PORT_DRIFT_VALUE:-65534}"
  fi
  host_ip=127.0.0.1
  if [[ "$cid" == "web-desktop-cid" ]]; then
    host_ip="\${FAKE_RUNTIME_WEB_HOST_IP:-127.0.0.1}"
  fi
  printf '%s:%s\n' "$host_ip" "$host_port"
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
    postgres-cid) container_name="\${FAKE_RUNTIME_TARGET_PROJECT:-plush-toy-erp-prod}-postgres" ;;
    jaeger-cid) container_name="\${FAKE_RUNTIME_TARGET_PROJECT:-plush-toy-erp-prod}-jaeger" ;;
    app-server-cid) container_name="\${FAKE_RUNTIME_TARGET_PROJECT:-plush-toy-erp-prod}-server" ;;
    web-desktop-cid) container_name="\${FAKE_RUNTIME_TARGET_PROJECT:-plush-toy-erp-prod}-web-desktop" ;;
    *) container_name=unknown ;;
    esac
    if [[ "\${FAKE_RUNTIME_NAME_DRIFT_SERVICE:-}" == "$cid" ]]; then
      container_name="\${FAKE_RUNTIME_NAME_DRIFT_VALUE:-wrong-container}"
    fi
    printf '/%s\n' "$container_name"
  elif [[ "$*" == *'com.docker.compose.project'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_COMPOSE_PROJECT:-plush-toy-erp-prod}"
  elif [[ "$*" == *'.Mounts'* ]]; then
    printf '%s\n' "\${FAKE_RUNTIME_POSTGRES_MOUNT:-/data/plush/postgres}"
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
      printf 'APP_AUTH_SMS_MODE=%s\n' "\${FAKE_RUNTIME_AUTH_SMS_MODE:-disabled}"
      printf 'BOOTSTRAP_ADMIN_ONCE=%s\n' "\${FAKE_RUNTIME_BOOTSTRAP_ADMIN_ONCE:-false}"
      printf 'ERP_CUSTOMER_KEY=%s\n' "\${FAKE_RUNTIME_CUSTOMER_KEY:-yoyoosun}"
      printf 'ERP_DEBUG_ENV=%s\n' "\${FAKE_RUNTIME_DEBUG_ENV:-prod}"
      printf 'ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=%s\n' "\${FAKE_RUNTIME_TRIAL_ALLOW:-0}"
      printf 'ERP_CUSTOMER_TRIAL_TARGET=%s\n' "\${FAKE_RUNTIME_TRIAL_TARGET:-}"
      printf 'POSTGRES_DSN=%s\n' "\${FAKE_RUNTIME_POSTGRES_DSN:-postgres://erp_app:test-app-password-12345@postgres:5432/plush_erp?sslmode=disable}"
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
    `#!/usr/bin/env bash
set -euo pipefail
url="\${@: -1}"
if [[ "$url" == */rpc/auth ]]; then
  printf '%s\n' '{"result":{"code":0,"data":{"sms_login":{"enabled":true,"mode":"provider","mock_delivery":false,"disabled_reason":""}}}}'
fi
exit 0
`,
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

test("production preflight requires the exact runtime identity proxy contract", () => {
  const fixture = writeFixture();
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace(
        "WEB_PROXY_PREFIXES=/rpc,/templates,/readyz/runtime-identity",
        "WEB_PROXY_PREFIXES=/rpc,/templates",
      ),
  );

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WEB_PROXY_PREFIXES 必须保留/u);
});

test("production preflight resolves a packaged source root without Git metadata", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const packageRoot = path.join(fixture.root, "immutable-release");
  const packagedScript = path.join(
    packageRoot,
    "scripts/deploy/production-preflight.sh",
  );
  const packagedContract = path.join(
    packageRoot,
    "deployments/yoyoosun/env/runtime.contract.json",
  );
  fs.mkdirSync(path.dirname(packagedScript), { recursive: true });
  fs.mkdirSync(path.dirname(packagedContract), { recursive: true });
  fs.copyFileSync(scriptPath, packagedScript);
  fs.copyFileSync(
    path.join(repoRoot, "deployments/yoyoosun/env/runtime.contract.json"),
    packagedContract,
  );
  fs.chmodSync(packagedScript, 0o755);

  const fakeBin = createFakeRuntimeBin(fixture.root);
  const result = runPreflight(fixture, trialOverrideArgs(fixture), {
    skipComposeConfig: false,
    preflightScript: packagedScript,
    cwd: fixture.root,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_RUNTIME_TARGET_PROJECT: "plush-toy-erp-demo-v1",
      FAKE_RUNTIME_COMPOSE_PROJECT: "plush-toy-erp-demo-v1",
      FAKE_RUNTIME_POSTGRES_MOUNT:
        "/home/simon/plush-toy-erp-demo-v1/data/postgres",
      FAKE_RUNTIME_POSTGRES_DSN:
        "postgres://erp_app:test-app-password-12345@postgres:5432/plush_erp_demo_v1?sslmode=disable",
      FAKE_RUNTIME_POSTGRES_PORT: "55436",
      FAKE_RUNTIME_APP_HTTP_PORT: "8325",
      FAKE_RUNTIME_WEB_DESKTOP_PORT: "5195",
      FAKE_RUNTIME_JAEGER_5775_PORT: "61001",
      FAKE_RUNTIME_JAEGER_6831_PORT: "61002",
      FAKE_RUNTIME_JAEGER_6832_PORT: "61003",
      FAKE_RUNTIME_JAEGER_5778_PORT: "61004",
      FAKE_RUNTIME_JAEGER_UI_PORT: "61005",
      FAKE_RUNTIME_JAEGER_14268_PORT: "61006",
      FAKE_RUNTIME_JAEGER_14250_PORT: "61007",
      FAKE_RUNTIME_JAEGER_9411_PORT: "61008",
      FAKE_RUNTIME_JAEGER_OTLP_GRPC_PORT: "61009",
      FAKE_RUNTIME_JAEGER_OTLP_HTTP_PORT: "61010",
      FAKE_RUNTIME_TRIAL_ALLOW: "1",
      FAKE_RUNTIME_TRIAL_TARGET: "customer-trial-133",
      FAKE_RUNTIME_EXPECTED_RELEASE: fixture.expectedRelease,
      FAKE_RUNTIME_AUTH_SMS_MODE: "provider",
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /yoyoosun SMS 运行合同已绑定/u);
  assert.doesNotMatch(result.stderr, /缺少 yoyoosun 运行合同/u);
});

test("production preflight accepts the supported normal web bind addresses", async (t) => {
  for (const bindAddress of ["0.0.0.0", "127.0.0.1"]) {
    await t.test(bindAddress, () => {
      const fixture = writeFixture();
      fs.writeFileSync(
        fixture.envFile,
        fs
          .readFileSync(fixture.envFile, "utf8")
          .replace(
            "WEB_DESKTOP_BIND_ADDR=0.0.0.0",
            `WEB_DESKTOP_BIND_ADDR=${bindAddress}`,
          ),
      );

      const result = runPreflight(fixture);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    });
  }
});

test("production preflight rejects a missing or unsupported web bind address", async (t) => {
  await t.test("missing", () => {
    const fixture = writeFixture();
    fs.writeFileSync(
      fixture.envFile,
      fs
        .readFileSync(fixture.envFile, "utf8")
        .replace("WEB_DESKTOP_BIND_ADDR=0.0.0.0\n", ""),
    );

    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /缺少必需变量: WEB_DESKTOP_BIND_ADDR/u);
  });

  await t.test("unsupported", () => {
    const fixture = writeFixture();
    fs.writeFileSync(
      fixture.envFile,
      fs
        .readFileSync(fixture.envFile, "utf8")
        .replace(
          "WEB_DESKTOP_BIND_ADDR=0.0.0.0",
          "WEB_DESKTOP_BIND_ADDR=192.168.0.133",
        ),
    );

    const result = runPreflight(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /WEB_DESKTOP_BIND_ADDR 只允许 0\.0\.0\.0 或 127\.0\.0\.1/u,
    );
  });
});

test("production preflight rejects Compose that bypasses the web bind variable", () => {
  const fixture = writeFixture();
  const composePath = path.join(fixture.composeDir, "compose.yml");
  fs.writeFileSync(
    composePath,
    fs
      .readFileSync(composePath, "utf8")
      .replace("WEB_DESKTOP_BIND_ADDR:-0.0.0.0", "WEB_DESKTOP_PORT:+0.0.0.0"),
  );

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Compose web desktop 端口必须显式消费 WEB_DESKTOP_BIND_ADDR/u,
  );
});

test("production preflight rejects a database role script unreadable by PostgreSQL", () => {
  const fixture = writeFixture();
  fs.chmodSync(path.join(fixture.composeDir, "database_roles.sh"), 0o700);

  const result = runPreflight(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /数据库角色初始化脚本权限必须为 0755/u);
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
  assert.match(result.stdout, /Compose 运行服务存在/u);
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

test("production preflight registered runtime requires an explicit exact release", async (t) => {
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

test("production preflight verifies every registered demo runtime service uses its isolated Compose project", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(fixture, [
    ...trialOverrideArgs(fixture),
    "--runtime",
  ]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /demo-133 运行态容器名、project、端口、PostgreSQL 挂载和数据环境身份一致/u,
  );
});

test("production preflight rejects a registered target service from the canonical production project", () => {
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
  assert.match(
    result.stderr,
    /demo-133 运行态服务 postgres 不属于登记 Compose project/u,
  );
});

test("production preflight rejects registered runtime container name drift", () => {
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
  assert.match(result.stderr, /容器名不符合登记身份/u);
});

test("production preflight rejects registered runtime host port drift", () => {
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
  assert.match(result.stderr, /端口 8300\/tcp 未精确绑定登记宿主端口/u);
});

test("production preflight rejects a publicly bound registered runtime web port", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(
    fixture,
    [...trialOverrideArgs(fixture), "--runtime"],
    { env: { FAKE_RUNTIME_WEB_HOST_IP: "0.0.0.0" } },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /web-desktop 端口 5175\/tcp 未精确绑定登记宿主端口/u,
  );
});

test("production preflight rejects registered runtime PostgreSQL mount drift", () => {
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
  assert.match(result.stderr, /PostgreSQL 挂载源不符合登记数据目录/u);
});

test("production preflight rejects registered runtime data-environment identity drift", () => {
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
    /数据环境身份变量不符合合同: ERP_CUSTOMER_TRIAL_TARGET/u,
  );
});

test("production preflight rejects registered runtime app DSN drift without leaking it", () => {
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
  assert.match(result.stderr, /POSTGRES_DSN 不符合登记数据库合同/u);
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
  for (const migrationLockFile of [
    "/tmp/plush-preflight/atlas-migrate.lock",
    "/var/tmp/plush-preflight/atlas-migrate.lock",
    "/dev/shm/plush-preflight/atlas-migrate.lock",
  ]) {
    const fixture = writeFixture();
    fs.writeFileSync(
      fixture.envFile,
      fs
        .readFileSync(fixture.envFile, "utf8")
        .replace(
          "MIGRATION_LOCK_FILE=/run/lock/plush-toy-erp/atlas-migrate.lock",
          `MIGRATION_LOCK_FILE=${migrationLockFile}`,
        ),
    );
    const result = runPreflight(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MIGRATION_LOCK_FILE 不得位于共享临时目录/u);
  }
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

test("production preflight allows both exact isolated registered databases", async (t) => {
  for (const targetKey of ["demo-133", "customer-test-133"]) {
    await t.test(targetKey, () => {
      const fixture = writeFixture();
      configureExactDeploymentTargetFixture(fixture, { targetKey });

      const result = runDeploymentTargetPreflight(
        fixture,
        deploymentTargetArgs(fixture),
      );
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    });
  }
});

test("production preflight requires a loopback web bind for registered targets", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace(
        "WEB_DESKTOP_BIND_ADDR=127.0.0.1",
        "WEB_DESKTOP_BIND_ADDR=0.0.0.0",
      ),
  );

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /demo-133 前端宿主机端口必须绑定 127\.0\.0\.1/u);
});

test("production preflight invokes registered Compose with an explicit project and both files", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const argsLog = path.join(fixture.root, "compose-args.log");
  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture), {
    env: {
      FAKE_COMPOSE_ARGS_LOG: argsLog,
      FAKE_COMPOSE_REQUIRED_PROJECT: "plush-toy-erp-demo-v1",
    },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /docker compose config 解析的 project=plush-toy-erp-demo-v1/u,
  );
  const invocation = fs.readFileSync(argsLog, "utf8");
  assert.match(invocation, /-p plush-toy-erp-demo-v1/u);
  assert.match(invocation, /-f .*\/compose\.yml/u);
  assert.match(invocation, /-f .*\/compose\.demo-133\.yml/u);
  assert.match(invocation, /config/u);
});

test("production preflight rejects a resolved registered Compose project drift", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture), {
    env: { FAKE_COMPOSE_RESOLVED_NAME: "plush-toy-erp-prod" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /解析后的 Compose project 不符合登记合同/u);
});

test("production preflight forbids skipping resolved Compose config for registered targets", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  const result = runPreflight(fixture, trialOverrideArgs(fixture));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /demo-133 禁止 --skip-compose-config/u);
});

test("production preflight enforces exact registered data and migration lock paths", () => {
  for (const [key, replacement, expected] of [
    [
      "POSTGRES_DATA_DIR",
      "/Users/simon/plush-toy-erp-demo-v1/data/postgres",
      /demo-133 的 POSTGRES_DATA_DIR 不符合登记合同/u,
    ],
    [
      "MIGRATION_LOCK_FILE",
      "/home/simon/plush-toy-erp-demo-v1/run/../atlas-migrate.lock",
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

test("production preflight rejects demo opt-in outside its exact database", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture, {
    dsn: "postgres://postgres:test-production-password@postgres:5432/plush_erp?sslmode=disable",
  });

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DSN 必须精确使用 erp_app/);
});

test("production preflight rejects extra registered-target DSN query options", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture, {
    dsn: "postgres://postgres:test-production-password@postgres:5432/plush_erp_demo_v1?sslmode=disable&target_session_attrs=read-write",
  });

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_DSN 必须精确使用 erp_app/);
});

test("production preflight rejects a registered target without its Compose project override", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);

  const result = runPreflight(fixture, ["--deployment-target", "demo-133"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /必须显式传入受控 Compose override/u);
});

test("production preflight excludes admin and undeclared environment names", async (t) => {
  for (const targetKey of ["admin", "admin-133", "erp", "test-133"]) {
    await t.test(targetKey, () => {
      const fixture = writeFixture();
      const result = runPreflight(fixture, ["--deployment-target", targetKey]);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /只允许 demo-133 或 customer-test-133/u);
    });
  }
});

test("production preflight rejects a registered Compose override with extra mutations", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  fs.appendFileSync(
    path.join(fixture.composeDir, "compose.demo-133.yml"),
    "services:\n  postgres:\n    ports: []\n",
  );

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Compose override 只能声明登记 project/u);
});

test("production preflight rejects registered target host port collisions", () => {
  const fixture = writeFixture();
  configureExactCustomerTrialFixture(fixture);
  fs.writeFileSync(
    fixture.envFile,
    fs
      .readFileSync(fixture.envFile, "utf8")
      .replace("APP_HTTP_PORT=8325", "APP_HTTP_PORT=8300"),
  );

  const result = runTrialPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /demo-133 的 APP_HTTP_PORT 不符合登记合同/u);
});

test("production preflight rejects a registered Compose override without matching env identity", () => {
  const fixture = writeFixture();

  const result = runPreflight(fixture, trialOverrideArgs(fixture));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /登记目标只允许 ERP_CUSTOMER_KEY=yoyoosun/u);
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
  assert.match(
    dockerfile,
    /RUN --mount=type=cache,id=plush-npm,target=\/root\/.npm,sharing=locked \\\n\s+--mount=type=cache,id=plush-pnpm,target=\/web\/.pnpm-store,sharing=locked/u,
  );
  for (const builderDockerfile of [dockerfile, webDockerfile]) {
    const registryIndex = builderDockerfile.indexOf(
      "npm config set registry https://registry.npmmirror.com",
    );
    const pnpmInstallIndex = builderDockerfile.indexOf(
      "npm install -g pnpm@10.13.1",
    );
    assert.ok(registryIndex >= 0);
    assert.ok(pnpmInstallIndex > registryIndex);
  }
  assert.match(
    dockerfile,
    /RUN --mount=type=cache,id=plush-apt-lists,target=\/var\/lib\/apt\/lists,sharing=locked \\\n\s+--mount=type=cache,id=plush-apt-cache,target=\/var\/cache\/apt,sharing=locked/u,
  );
  assert(
    dockerfile.indexOf('"chromium=${CHROMIUM_VERSION}"') <
      dockerfile.lastIndexOf("ARG GIT_SHA"),
    "Chromium/PDF runtime dependencies must remain above volatile release identity layers",
  );
  assert.match(dockerfile, /^USER app$/m);
  assert.match(
    dockerfile,
    /^RUN install -d -o app -g app -m 0555 \/app\/configs$/mu,
  );
  assert.match(
    dockerfile,
    /^COPY --chown=app:app --chmod=0444 --from=go-builder \/src\/configs\/prod\/config[.]yaml \/app\/configs\/config[.]yaml$/mu,
  );
  assert.match(
    dockerfile,
    /^RUN install -d -o node -g node -m 0555 \/app\/build \/app\/scripts$/mu,
  );
  assert.match(
    dockerfile,
    /^COPY --chown=node:node --from=web-builder \/web\/build [.][\/]build$/mu,
  );
  assert.match(
    dockerfile,
    /^COPY --chown=node:node --chmod=0444 web\/scripts\/serveStaticApp[.]mjs [.][\/]scripts\/serveStaticApp[.]mjs$/mu,
  );
  assert.match(dockerfile, /^RUN chmod -R u=rX,go=rX \/app\/build$/mu);
  assert.match(
    dockerfile,
    /useradd --system --uid 10001 --gid app --create-home --home-dir \/home\/app/u,
  );
  assert.match(dockerfile, /^ENV HOME=\/home\/app$/mu);
  assert.match(dockerfile, /^ARG GIT_SHA$/mu);
  assert.match(dockerfile, /^ENV GIT_SHA=\$\{GIT_SHA\}$/mu);
  assert.match(dockerfile, /^ARG RELEASE_VERSION$/mu);
  assert.match(dockerfile, /^ENV RELEASE_VERSION=\$\{RELEASE_VERSION\}$/mu);
  assert.match(dockerfile, /^ENV VITE_GIT_SHA=\$\{GIT_SHA\}$/mu);
  assert.match(
    dockerfile,
    /^ENV VITE_RELEASE_VERSION=\$\{RELEASE_VERSION\}$/mu,
  );
  assert.match(webDockerfile, /^ARG GIT_SHA$/mu);
  assert.match(webDockerfile, /^ENV GIT_SHA=\$\{GIT_SHA\}$/mu);
  assert.match(webDockerfile, /^ARG RELEASE_VERSION$/mu);
  assert.match(webDockerfile, /^ENV RELEASE_VERSION=\$\{RELEASE_VERSION\}$/mu);
  assert.match(webDockerfile, /^ENV VITE_GIT_SHA=\$\{GIT_SHA\}$/mu);
  assert.match(
    webDockerfile,
    /^ENV VITE_RELEASE_VERSION=\$\{RELEASE_VERSION\}$/mu,
  );
  for (const runtimeDockerfile of [dockerfile, webDockerfile]) {
    assert.match(
      runtimeDockerfile,
      /^ENV PROXY_PREFIXES=\/rpc,\/templates,\/readyz\/runtime-identity$/mu,
    );
  }
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
    assert.match(
      envExample,
      /^WEB_PROXY_PREFIXES=\/rpc,\/templates,\/readyz\/runtime-identity$/mu,
    );
    assert.doesNotMatch(envExample, /ERP_PDF_WARMUP_ENABLED/);
  }
  assert.match(
    customerCompose,
    /ERP_PDF_WARMUP: "\$\{ERP_PDF_WARMUP:-async\}"/,
  );
});
