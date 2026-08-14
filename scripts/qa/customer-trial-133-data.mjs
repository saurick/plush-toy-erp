import { spawn } from "node:child_process";
import process from "node:process";

import { getDeploymentTarget } from "../deploy/deployment-targets.mjs";

export const CUSTOMER_TRIAL_133_BACKUP_SCHEMA =
  "plush.customer-trial-133-data-backup/v1";

const BACKUP_ALIAS_PATTERN = /^pre-data-[0-9a-f]{12}-d[0-9]{12}_[0-9a-f]{8}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MIGRATION_PATTERN = /^20[0-9]{12}$/u;
const DATABASE_NAME = "plush_erp_uat_20260716_v5";
const REPORT_KEYS = Object.freeze([
  "BACKUP_ALIAS",
  "CREATED_AT",
  "DATABASE_NAME",
  "MIGRATION_VERSION",
  "RELEASE_SHA",
  "SCHEMA_VERSION",
  "SHA256",
  "SIZE_BYTES",
  "STATUS",
]);

function validateIdentity({ backupAlias, releaseSha, migrationVersion } = {}) {
  if (
    !BACKUP_ALIAS_PATTERN.test(String(backupAlias || "")) ||
    !SHA_PATTERN.test(String(releaseSha || "")) ||
    !MIGRATION_PATTERN.test(String(migrationVersion || ""))
  ) {
    throw new Error("customer-trial-133 backup identity is invalid");
  }
  return Object.freeze({ backupAlias, releaseSha, migrationVersion });
}

export function buildCustomerTrial133BackupScript(identity) {
  const { backupAlias, releaseSha, migrationVersion } =
    validateIdentity(identity);
  return String.raw`#!/usr/bin/env bash
set -euo pipefail
umask 077

expected_hostname=simon
expected_user=simon
root=/home/simon/plush-toy-erp-v5
runtime_env="$root/runtime/.env.customer-trial-133"
backup_dir="$root/backups"
operation_dir="$root/operations/data-preparation-backups"
lock_file="$root/run/data-preparation-backup.lock"
project=plush-toy-erp-v5
database=${DATABASE_NAME}
backup_alias=${backupAlias}
expected_release=${releaseSha}
expected_migration=${migrationVersion}
backup_tmp="$backup_dir/.$backup_alias.dump.tmp.$$"
checksum_tmp="$backup_dir/.$backup_alias.sha256.tmp.$$"
receipt_tmp="$operation_dir/.$backup_alias.env.tmp.$$"
backup_file="$backup_dir/$backup_alias.dump"
checksum_file="$backup_dir/$backup_alias.sha256"
receipt_file="$operation_dir/$backup_alias.env"

cleanup() {
  local exit_code=$?
  rm -f -- "$backup_tmp" "$checksum_tmp" "$receipt_tmp"
  exit "$exit_code"
}
trap cleanup EXIT

plain_file() {
  [[ -f "$1" && ! -L "$1" ]]
}

plain_directory() {
  [[ -d "$1" && ! -L "$1" ]]
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

[[ "$(hostname)" == "$expected_hostname" ]]
[[ "$(id -un)" == "$expected_user" ]]
plain_directory "$root"
plain_directory "$backup_dir"
plain_directory "$root/run"
plain_directory "$root/operations"
plain_file "$runtime_env"
[[ "$(stat -c '%u' "$runtime_env")" == "$(id -u)" ]]
[[ "$(stat -c '%a' "$runtime_env")" == 600 ]]
[[ "$(env_value ERP_CUSTOMER_TRIAL_TARGET)" == customer-trial-133 ]]
[[ "$(env_value POSTGRES_DB)" == "$database" ]]

mkdir -p "$operation_dir"
plain_directory "$operation_dir"
chmod 0700 "$operation_dir"
exec 9>"$lock_file"
flock -n 9

[[ ! -e "$backup_file" && ! -e "$checksum_file" && ! -e "$receipt_file" ]]

server_identity="$(docker inspect plush-toy-erp-v5-server --format '{{.State.Running}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null)"
[[ "$server_identity" == "true|$project|app-server" ]]
server_sha="$(docker inspect plush-toy-erp-v5-server --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$server_sha" == "$expected_release" ]]

postgres_cid="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=postgres")"
[[ -n "$postgres_cid" ]]
[[ "$(printf '%s\n' "$postgres_cid" | sed '/^$/d' | wc -l | tr -d ' ')" == 1 ]]
[[ "$(docker exec "$postgres_cid" sh -eu -c 'printf %s "$POSTGRES_DB"')" == "$database" ]]
docker exec "$postgres_cid" sh -eu -c 'command -v pg_dump >/dev/null && command -v pg_restore >/dev/null'

backup_identity_sql="$(cat <<'SQL'
SELECT
  current_user,
  current_setting('default_transaction_read_only'),
  role.rolsuper,
  role.rolcreatedb,
  role.rolcreaterole,
  role.rolbypassrls,
  has_database_privilege(current_user, current_database(), 'CREATE'),
  has_schema_privilege(current_user, 'public', 'CREATE')
FROM pg_roles AS role
WHERE role.rolname = current_user;
SQL
)"
backup_identity="$({
  printf '%s\n' "$backup_identity_sql"
} | docker exec -i "$postgres_cid" sh -eu -c '
  export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"
  exec psql --host 127.0.0.1 --username erp_backup --dbname "$POSTGRES_DB" \
    -X --no-psqlrc -A -t -F "|" --set ON_ERROR_STOP=1 --file -
')"
backup_identity="$(printf '%s' "$backup_identity" | tr -d '\r\n')"
IFS='|' read -r backup_user backup_read_only backup_super backup_createdb \
  backup_createrole backup_bypassrls backup_database_create backup_schema_create \
  <<<"$backup_identity"
[[ "$backup_user" == erp_backup ]]
[[ "$backup_read_only" == on ]]
[[ "$backup_super" == f && "$backup_createdb" == f && "$backup_createrole" == f ]]
[[ "$backup_bypassrls" == f && "$backup_database_create" == f && "$backup_schema_create" == f ]]

migration="$(docker exec "$postgres_cid" sh -eu -c '
  export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"
  exec psql --host 127.0.0.1 --username erp_backup --dbname "$POSTGRES_DB" \
    -X --no-psqlrc -A -t -q --set ON_ERROR_STOP=1 \
    -c "SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1"
')"
migration="$(printf '%s' "$migration" | tr -d '\r\n')"
[[ "$migration" == "$expected_migration" ]]

docker exec "$postgres_cid" sh -eu -c \
  'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec pg_dump --host 127.0.0.1 --username erp_backup --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  >"$backup_tmp"
[[ -s "$backup_tmp" ]]
docker exec -i "$postgres_cid" pg_restore --list <"$backup_tmp" >/dev/null

backup_hash="$(sha256sum "$backup_tmp" | awk '{print $1}')"
backup_size="$(stat -c '%s' "$backup_tmp")"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ "$backup_hash" =~ ^[0-9a-f]{64}$ ]]
[[ "$backup_size" =~ ^[0-9]+$ && "$backup_size" -gt 0 ]]
printf '%s  %s.dump\n' "$backup_hash" "$backup_alias" >"$checksum_tmp"
{
  printf 'schemaVersion=%s\n' '${CUSTOMER_TRIAL_133_BACKUP_SCHEMA}'
  printf 'status=passed\n'
  printf 'backupAlias=%s\n' "$backup_alias"
  printf 'releaseSha=%s\n' "$expected_release"
  printf 'databaseName=%s\n' "$database"
  printf 'migrationVersion=%s\n' "$migration"
  printf 'sha256=%s\n' "$backup_hash"
  printf 'sizeBytes=%s\n' "$backup_size"
  printf 'createdAt=%s\n' "$created_at"
} >"$receipt_tmp"
mv "$backup_tmp" "$backup_file"
mv "$checksum_tmp" "$checksum_file"
mv "$receipt_tmp" "$receipt_file"
chmod 0600 "$backup_file" "$checksum_file" "$receipt_file"

printf '%s\n' \
  'SCHEMA_VERSION=${CUSTOMER_TRIAL_133_BACKUP_SCHEMA}' \
  'STATUS=passed' \
  "BACKUP_ALIAS=$backup_alias" \
  "RELEASE_SHA=$expected_release" \
  "DATABASE_NAME=$database" \
  "MIGRATION_VERSION=$migration" \
  "SHA256=$backup_hash" \
  "SIZE_BYTES=$backup_size" \
  "CREATED_AT=$created_at"
`;
}

export function parseCustomerTrial133BackupReport(output, expected) {
  const identity = validateIdentity(expected);
  const values = {};
  for (const line of String(output || "")
    .trim()
    .split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator < 1)
      throw new Error("customer-trial-133 backup report is invalid");
    const key = line.slice(0, separator);
    if (!REPORT_KEYS.includes(key) || Object.hasOwn(values, key)) {
      throw new Error("customer-trial-133 backup report is invalid");
    }
    values[key] = line.slice(separator + 1);
  }
  if (
    Object.keys(values).length !== REPORT_KEYS.length ||
    values.SCHEMA_VERSION !== CUSTOMER_TRIAL_133_BACKUP_SCHEMA ||
    values.STATUS !== "passed" ||
    values.BACKUP_ALIAS !== identity.backupAlias ||
    values.RELEASE_SHA !== identity.releaseSha ||
    values.DATABASE_NAME !== DATABASE_NAME ||
    values.MIGRATION_VERSION !== identity.migrationVersion ||
    !SHA256_PATTERN.test(values.SHA256) ||
    !/^[1-9][0-9]*$/u.test(values.SIZE_BYTES) ||
    !Number.isFinite(Date.parse(values.CREATED_AT))
  ) {
    throw new Error(
      "customer-trial-133 backup report contradicts the fixed target",
    );
  }
  return Object.freeze({
    schemaVersion: values.SCHEMA_VERSION,
    status: values.STATUS,
    backupAlias: values.BACKUP_ALIAS,
    releaseSha: values.RELEASE_SHA,
    databaseName: values.DATABASE_NAME,
    migrationVersion: values.MIGRATION_VERSION,
    sha256: values.SHA256,
    sizeBytes: Number(values.SIZE_BYTES),
    createdAt: values.CREATED_AT,
    containsSecrets: false,
    containsCredentials: false,
    containsPaths: false,
  });
}

function sshArgs(target) {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=yes",
    "-p",
    String(target.ssh.port),
    `${target.ssh.user}@${target.ssh.host}`,
    "bash",
    "-s",
  ];
}

export async function createCustomerTrial133DataBackup(
  identity,
  { spawnCommand = spawn, timeoutMs = 15 * 60 * 1000 } = {},
) {
  const expected = validateIdentity(identity);
  const target = getDeploymentTarget("test-133");
  const child = spawnCommand("ssh", sshArgs(target), {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let outputBytes = 0;
    let settled = false;
    let timer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback();
    };
    const collect = (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) {
        child.kill("SIGTERM");
        finish(() =>
          reject(new Error("customer-trial-133 backup output is too large")),
        );
        return;
      }
      stdout += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) child.kill("SIGTERM");
    });
    child.on("error", () => {
      finish(() =>
        reject(new Error("customer-trial-133 backup SSH could not start")),
      );
    });
    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error("customer-trial-133 backup did not complete"));
          return;
        }
        try {
          resolve(parseCustomerTrial133BackupReport(stdout, expected));
        } catch (error) {
          reject(error);
        }
      });
    });
    child.stdin.on("error", () => {
      finish(() => reject(new Error("customer-trial-133 backup input failed")));
    });
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("customer-trial-133 backup timed out")));
    }, timeoutMs);
    child.stdin.end(buildCustomerTrial133BackupScript(expected));
  });
}
