import { realpathSync } from "node:fs";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getDeploymentTarget } from "./deployment-targets.mjs";

export const TARGET_PREFLIGHT_CONTRACT = "plush.target-preflight/v1";
export const REMOTE_TARGET_PREFLIGHT_CONTRACT =
  "plush.remote-target-preflight/v1";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_TEXT_PATTERN = /^[A-Za-z0-9._-]+$/u;
const BLOCKER_PATTERN = /^[a-z][a-z0-9_]{2,63}$/u;
const REPORT_KEYS = Object.freeze([
  "SCHEMA_VERSION",
  "STATUS",
  "TARGET",
  "HOSTNAME",
  "USER",
  "ROOT_AVAILABLE_BYTES",
  "MINIMUM_AVAILABLE_BYTES",
  "CAPACITY_STATUS",
  "ENV_STATUS",
  "COMPOSE_STATUS",
  "DATABASE_STATUS",
  "DATABASE_NAME",
  "SERVER_SHA",
  "WEB_SHA",
  "SERVER_HEALTH",
  "SERVER_READY",
  "WEB_HEALTH",
  "MIGRATION_LOCK_STATUS",
  "BACKUP_TOOLING_STATUS",
  "LATEST_BACKUP_SHA256",
  "LATEST_BACKUP_SIZE_BYTES",
  "BLOCKERS",
]);

// This script is streamed over an already-pinned SSH connection. It contains
// the complete target contract and accepts no remote path, project, database,
// endpoint or command input.
export const REMOTE_TARGET_PREFLIGHT_SCRIPT = String.raw`#!/usr/bin/env bash
set -euo pipefail
umask 077

target_key=test-133
expected_hostname=simon
expected_user=simon
root=/home/simon/plush-toy-erp-v5
current=/home/simon/plush-toy-erp-v5/current
releases=/home/simon/plush-toy-erp-v5/releases
runtime_env=/home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133
compose_dir=/home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod
compose_base="$compose_dir/compose.yml"
compose_override="$compose_dir/compose.customer-trial-133.yml"
project=plush-toy-erp-v5
database=plush_erp_uat_20260716_v5
migration_lock=/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock
minimum_available_bytes=32212254720

status=passed
blockers=()
capacity_status=passed
env_status=passed
compose_status=passed
database_status=passed
server_sha=unknown
web_sha=unknown
server_health=failed
server_ready=failed
web_health=failed
migration_lock_status=free
backup_tooling_status=passed
latest_backup_sha256=none
latest_backup_size_bytes=0
# Read-only preflight never creates or reuses a rollback point. Every promotion
# still requires a fresh pre-migration backup bound to that operation.

block() {
  status=blocked
  blockers+=("$1")
}

plain_directory() {
  [[ -d "$1" && ! -L "$1" ]]
}

plain_file() {
  [[ -f "$1" && ! -L "$1" ]]
}

env_value() {
  local wanted="$1"
  awk -v wanted="$wanted" '
    {
      line=$0
      sub(/\r$/, "", line)
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line == "" || line ~ /^#/) next
      sub(/^export[[:space:]]+/, "", line)
      separator=index(line, "=")
      if (separator <= 1) next
      key=substr(line, 1, separator - 1)
      sub(/^[[:space:]]+/, "", key)
      sub(/[[:space:]]+$/, "", key)
      if (key != wanted) next
      value=substr(line, separator + 1)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      print value
    }
  ' "$runtime_env"
}

actual_hostname="$(hostname)"
actual_user="$(id -un)"
[[ "$actual_hostname" == "$expected_hostname" ]] || block target_hostname_mismatch
[[ "$actual_user" == "$expected_user" ]] || block target_user_mismatch
if [[ ! -x /usr/bin/rsync ]] ||
  ! LC_ALL=C /usr/bin/rsync --version 2>/dev/null |
    sed -n '1p' | grep -Eq '^rsync[[:space:]]+version[[:space:]]+3\.'; then
  block target_rsync_unavailable
fi

for required_dir in "$root" "$current" "$releases" "$root/runtime" "$root/backups" "$root/run"; do
  plain_directory "$required_dir" || block target_directory_invalid
done
for required_file in "$runtime_env" "$compose_base" "$compose_override"; do
  plain_file "$required_file" || block target_file_invalid
done

root_available_bytes="$(df -B1 --output=avail / | awk 'NR==2 {print $1}')"
[[ "$root_available_bytes" =~ ^[0-9]+$ ]] || {
  root_available_bytes=0
  block target_capacity_unknown
}
if (( root_available_bytes < minimum_available_bytes )); then
  capacity_status=blocked
  block target_disk_capacity_low
fi

if plain_file "$runtime_env"; then
  env_uid="$(stat -c '%u' "$runtime_env")"
  env_mode="$(stat -c '%a' "$runtime_env")"
  if [[ "$env_uid" != "$(id -u)" || "$env_mode" != 600 ]]; then
    env_status=blocked
    block target_runtime_env_invalid
  fi
  [[ "$(env_value PROJECT_SLUG)" == "$project" ]] || {
    env_status=blocked
    block target_project_mismatch
  }
  [[ "$(env_value ERP_CUSTOMER_KEY)" == yoyoosun ]] || {
    env_status=blocked
    block target_customer_mismatch
  }
  [[ "$(env_value ERP_CUSTOMER_TRIAL_TARGET)" == customer-trial-133 ]] || {
    env_status=blocked
    block target_trial_identity_mismatch
  }
  [[ "$(env_value POSTGRES_DB)" == "$database" ]] || {
    env_status=blocked
    database_status=blocked
    block target_database_mismatch
  }
else
  env_status=blocked
fi

clean_env=(
  env -i
  "HOME=$HOME"
  "USER=$actual_user"
  "LOGNAME=$actual_user"
  "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)
compose=(
  docker compose
  -p "$project"
  --env-file "$runtime_env"
  -f "$compose_base"
  -f "$compose_override"
)

if [[ "$env_status" == passed ]] &&
  "\${clean_env[@]}" "\${compose[@]}" config --quiet >/dev/null 2>&1; then
  :
else
  compose_status=blocked
  block target_compose_config_invalid
fi

inspect_container() {
  local name="$1"
  local expected_service="$2"
  local identity
  identity="$(docker inspect "$name" --format '{{.State.Running}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null || true)"
  [[ "$identity" == "true|$project|$expected_service" ]]
}

read_git_sha() {
  local name="$1"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null |
    sed -n 's/^GIT_SHA=//p' |
    head -n1
}

if inspect_container plush-toy-erp-v5-server app-server; then
  server_sha="$(read_git_sha plush-toy-erp-v5-server)"
else
  compose_status=blocked
  block target_server_container_invalid
fi
if inspect_container plush-toy-erp-v5-web-desktop web-desktop; then
  web_sha="$(read_git_sha plush-toy-erp-v5-web-desktop)"
else
  compose_status=blocked
  block target_web_container_invalid
fi
if [[ ! "$server_sha" =~ ^[0-9a-f]{40}$ || ! "$web_sha" =~ ^[0-9a-f]{40}$ || "$server_sha" != "$web_sha" ]]; then
  compose_status=blocked
  block target_runtime_sha_mismatch
fi

curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8315/healthz >/dev/null 2>&1 &&
  server_health=passed ||
  block target_server_health_failed
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8315/readyz >/dev/null 2>&1 &&
  server_ready=passed ||
  block target_server_ready_failed
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:5185/healthz >/dev/null 2>&1 &&
  web_health=passed ||
  block target_web_health_failed

if [[ -e "$migration_lock" ]]; then
  if command -v lslocks >/dev/null 2>&1 &&
    lslocks --noheadings --output PATH 2>/dev/null | grep -Fxq "$migration_lock"; then
    migration_lock_status=held
    block target_migration_lock_held
  fi
fi

postgres_cid="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=postgres")"
if [[ -z "$postgres_cid" || "$(printf '%s\n' "$postgres_cid" | sed '/^$/d' | wc -l | tr -d ' ')" != 1 ]]; then
  database_status=blocked
  backup_tooling_status=blocked
  block target_postgres_container_invalid
elif ! docker exec "$postgres_cid" sh -c 'command -v pg_dump >/dev/null 2>&1'; then
  backup_tooling_status=blocked
  block target_backup_tooling_missing
fi

latest_backup="$(find "$root/backups" -maxdepth 1 -type f -name '*.dump' -size +0c -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
if [[ -n "$latest_backup" && -f "$latest_backup" && ! -L "$latest_backup" ]]; then
  latest_backup_sha256="$(sha256sum "$latest_backup" | awk '{print $1}')"
  latest_backup_size_bytes="$(stat -c '%s' "$latest_backup")"
fi

blockers_csv=none
if (( \${#blockers[@]} > 0 )); then
  blockers_csv="$(printf '%s\n' "\${blockers[@]}" | sort -u | paste -sd, -)"
fi

printf '%s\n' \
  "SCHEMA_VERSION=plush.remote-target-preflight/v1" \
  "STATUS=$status" \
  "TARGET=$target_key" \
  "HOSTNAME=$actual_hostname" \
  "USER=$actual_user" \
  "ROOT_AVAILABLE_BYTES=$root_available_bytes" \
  "MINIMUM_AVAILABLE_BYTES=$minimum_available_bytes" \
  "CAPACITY_STATUS=$capacity_status" \
  "ENV_STATUS=$env_status" \
  "COMPOSE_STATUS=$compose_status" \
  "DATABASE_STATUS=$database_status" \
  "DATABASE_NAME=$database" \
  "SERVER_SHA=$server_sha" \
  "WEB_SHA=$web_sha" \
  "SERVER_HEALTH=$server_health" \
  "SERVER_READY=$server_ready" \
  "WEB_HEALTH=$web_health" \
  "MIGRATION_LOCK_STATUS=$migration_lock_status" \
  "BACKUP_TOOLING_STATUS=$backup_tooling_status" \
  "LATEST_BACKUP_SHA256=$latest_backup_sha256" \
  "LATEST_BACKUP_SIZE_BYTES=$latest_backup_size_bytes" \
  "BLOCKERS=$blockers_csv"
`.replaceAll("\\${", "${");

function assertEnum(value, values, field) {
  if (!values.includes(value)) throw new Error(`${field} is invalid`);
  return value;
}

function parseSafeInteger(value, field) {
  if (!/^[0-9]+$/u.test(String(value || ""))) {
    throw new Error(`${field} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} is invalid`);
  }
  return parsed;
}

export function parseRemoteTargetPreflight(raw) {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > 64 * 1024 ||
    raw.includes("\0")
  ) {
    throw new Error("remote target preflight output is invalid");
  }
  const values = {};
  for (const line of raw.trim().split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("remote target preflight line is invalid");
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!REPORT_KEYS.includes(key) || Object.hasOwn(values, key)) {
      throw new Error("remote target preflight key is invalid or duplicated");
    }
    values[key] = value;
  }
  if (Object.keys(values).length !== REPORT_KEYS.length) {
    throw new Error("remote target preflight output is incomplete");
  }
  if (
    values.SCHEMA_VERSION !== REMOTE_TARGET_PREFLIGHT_CONTRACT ||
    values.TARGET !== "test-133" ||
    values.HOSTNAME !== "simon" ||
    values.USER !== "simon" ||
    values.DATABASE_NAME !== "plush_erp_uat_20260716_v5"
  ) {
    throw new Error("remote target identity does not match the fixed contract");
  }
  const status = assertEnum(values.STATUS, ["passed", "blocked"], "status");
  const checkStatus = (field) =>
    assertEnum(values[field], ["passed", "blocked"], field);
  const healthStatus = (field) =>
    assertEnum(values[field], ["passed", "failed"], field);
  const sha = (value, field) => {
    if (value !== "unknown" && !SHA_PATTERN.test(value)) {
      throw new Error(`${field} is invalid`);
    }
    return value;
  };
  const blockers =
    values.BLOCKERS === "none"
      ? []
      : values.BLOCKERS.split(",").map((value) => {
          if (!BLOCKER_PATTERN.test(value)) {
            throw new Error("remote target blocker code is invalid");
          }
          return value;
        });
  if (
    (status === "passed" && blockers.length !== 0) ||
    (status === "blocked" && blockers.length === 0) ||
    new Set(blockers).size !== blockers.length
  ) {
    throw new Error("remote target blocker/status contract is inconsistent");
  }
  const latestBackupSha256 = values.LATEST_BACKUP_SHA256;
  if (
    latestBackupSha256 !== "none" &&
    !SHA256_PATTERN.test(latestBackupSha256)
  ) {
    throw new Error("latest backup SHA-256 is invalid");
  }
  const report = {
    schemaVersion: REMOTE_TARGET_PREFLIGHT_CONTRACT,
    status,
    target: values.TARGET,
    host: {
      hostname: values.HOSTNAME,
      user: values.USER,
    },
    capacity: {
      status: checkStatus("CAPACITY_STATUS"),
      availableBytes: parseSafeInteger(
        values.ROOT_AVAILABLE_BYTES,
        "root available bytes",
      ),
      minimumAvailableBytes: parseSafeInteger(
        values.MINIMUM_AVAILABLE_BYTES,
        "minimum available bytes",
      ),
    },
    runtime: {
      env: checkStatus("ENV_STATUS"),
      compose: checkStatus("COMPOSE_STATUS"),
      database: checkStatus("DATABASE_STATUS"),
      databaseName: values.DATABASE_NAME,
      serverSha: sha(values.SERVER_SHA, "server SHA"),
      webSha: sha(values.WEB_SHA, "web SHA"),
      serverHealth: healthStatus("SERVER_HEALTH"),
      serverReady: healthStatus("SERVER_READY"),
      webHealth: healthStatus("WEB_HEALTH"),
    },
    locks: {
      migration: assertEnum(
        values.MIGRATION_LOCK_STATUS,
        ["free", "held"],
        "migration lock",
      ),
    },
    backup: {
      tooling: checkStatus("BACKUP_TOOLING_STATUS"),
      latestSha256: latestBackupSha256,
      latestSizeBytes: parseSafeInteger(
        values.LATEST_BACKUP_SIZE_BYTES,
        "latest backup size",
      ),
      freshBackupRequiredForPromotion: true,
    },
    blockers,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsolutePaths: false,
      containsRawEnvironmentValues: false,
    },
  };
  if (
    report.capacity.minimumAvailableBytes !== 30 * 1024 ** 3 ||
    (report.runtime.serverSha !== "unknown" &&
      report.runtime.serverSha !== report.runtime.webSha)
  ) {
    throw new Error("remote target report contradicts the fixed contract");
  }
  return report;
}

export function runTargetPreflight(
  targetKey,
  {
    runCommand = spawnSync,
    timeoutMs = 30_000,
    now = new Date().toISOString(),
  } = {},
) {
  const target = getDeploymentTarget(targetKey);
  const sshDestination = `${target.ssh.user}@${target.ssh.host}`;
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=yes",
    "-p",
    String(target.ssh.port),
    sshDestination,
    "bash",
    "-s",
  ];
  const result = runCommand("ssh", args, {
    input: REMOTE_TARGET_PREFLIGHT_SCRIPT,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  if (result.error) {
    throw new Error(`target preflight SSH could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `target preflight SSH failed with exit ${String(result.status)}`,
    );
  }
  const remote = parseRemoteTargetPreflight(String(result.stdout || ""));
  return {
    schemaVersion: TARGET_PREFLIGHT_CONTRACT,
    generatedAt: now,
    status: remote.status,
    target: target.key,
    purpose: target.purpose,
    customer: target.customer,
    trialTarget: target.trialTarget,
    remote,
    blockers: remote.blockers,
    nextAction:
      remote.status === "passed"
        ? "prepare a fresh pre-migration backup and immutable promotion"
        : "resolve blockers and rerun this read-only preflight",
    notProven: [
      "fresh pre-migration backup for a new release",
      "new release migration plan/apply/readback",
      "new release promotion and smoke",
      "rollback rehearsal",
      "customer UAT and sign-off",
    ],
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsSshTarget: false,
      containsAbsolutePaths: false,
    },
  };
}

function parseArgs(argv) {
  const options = { target: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--target") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--target requires a value");
      }
      options.target = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  if (!options.help && !options.target) throw new Error("--target is required");
  return options;
}

function isMainModule() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage:
  node scripts/deploy/target-preflight.mjs --target test-133 [--json]

Runs read-only checks through the fixed target registry. The CLI accepts no SSH
host, path, project, database, endpoint or command parameter.`);
      process.exit(0);
    }
    const report = runTargetPreflight(options.target);
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `target preflight ${report.status}: ${report.target} blockers=${report.blockers.join(",") || "none"}`,
    );
    process.exit(report.status === "passed" ? 0 : 2);
  } catch (error) {
    console.error(`[target-preflight] ${error.message}`);
    process.exit(1);
  }
}
