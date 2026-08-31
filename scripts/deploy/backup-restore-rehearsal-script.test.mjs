import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(
  repoRoot,
  "deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh",
);

function runScript(args = [], env = {}) {
  return spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5_000,
    env: {
      ...process.env,
      ...env,
    },
  });
}

test("backup restore rehearsal script help is runnable", () => {
  const result = runScript(["--help"]);

  assert.equal(result.error?.code, undefined, "help must not time out");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /SOURCE_POSTGRES_DSN/);
  assert.match(result.stdout, /backup-restore-report\.json/);
  assert.match(result.stdout, /--evidence-dir/);
  assert.match(result.stdout, /--environment local-dev/);
  assert.match(result.stdout, /目标演练必须显式填写实际环境/);
  assert.match(result.stdout, /--source-policy dedicated-backup/);
  assert.match(
    result.stdout,
    /不把 dump、secret、完整 DSN 或客户 raw rows 写入 git/,
  );
});

test("backup restore rehearsal requires source DSN before external tools", () => {
  const result = runScript(["--release-version", "test-release"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /请通过 SOURCE_POSTGRES_DSN 提供源库 DSN/);
  assert.doesNotMatch(result.stderr, /缺少命令: docker/);
});

test("backup restore rehearsal blocks target DB source unless explicitly allowed", () => {
  const result = runScript(["--release-version", "test-release"], {
    SOURCE_POSTGRES_DSN:
      "postgres://plush:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
    ALLOW_TARGET_DB_BACKUP_REHEARSAL: "",
    ERP_ALLOW_TEST_DB_AS_DEV: "",
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /拒绝默认使用 192\.168\.0\.133 测试 \/ 目标库作为 source/,
  );
  assert.match(result.stderr, /ALLOW_TARGET_DB_BACKUP_REHEARSAL=1/);
});

test("backup restore rehearsal rejects non release backup purpose before external tools", () => {
  const result = runScript(
    [
      "--release-version",
      "test-release",
      "--backup-purpose",
      "backup-restore-rehearsal",
    ],
    {
      SOURCE_POSTGRES_DSN:
        "postgres://plush:secret@127.0.0.1:5432/plush_erp?sslmode=disable",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--backup-purpose 必须明确是 pre-migration/);
  assert.doesNotMatch(result.stderr, /缺少命令: docker/);
});

test("backup restore rehearsal requires existing release evidence dir before external tools", () => {
  const result = runScript([
    "--release-version",
    "test-release",
    "--evidence-dir",
    "deployments/yoyoosun/evidence/releases/not-created",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /--evidence-dir 必须是已存在的 release evidence 目录/,
  );
  assert.doesNotMatch(result.stderr, /请通过 SOURCE_POSTGRES_DSN/);
  assert.doesNotMatch(result.stderr, /缺少命令: docker/);
});

test("backup restore rehearsal report shape stays compatible with release evidence gate", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  for (const requiredTerm of [
    'backup_purpose="pre-migration"',
    "backup-restore-report.json",
    '"customerCode": "$customer"',
    '"releaseVersion": "$release_version"',
    '"backupId": "$backup_id"',
    '"verifiedAt": "$verified_at"',
    '"sourceAlias": "env:$source_env"',
    '"restoreTarget": "$restore_target"',
    '"backupEvidence": "backup-evidence.md"',
    '"migrationStatus": "migration-status.txt"',
    '"preMigrationStatus": "migration-status-before-apply.txt"',
    '"commandSummary": "command-summary.txt"',
    '"databaseBackupSize": $backup_size',
    '"databaseBackupHash": "$backup_hash"',
    '"sourcePolicy": "$source_policy"',
    '"migrationVersion": "${pre_migration_version:-unknown}"',
    '"migrationBeforeApply": "${pre_migration_version:-unknown}"',
    '"pendingFiles": "${pending_files:-unknown}"',
    '"populatedUpgradeAuditStatus": "$populated_upgrade_audit_status"',
    "populatedUpgradeAuditStatus=$populated_upgrade_audit_status",
    '"customerConfigCutoverAuditStatus": "$customer_config_cutover_audit_status"',
    "customerConfigCutoverAuditStatus=$customer_config_cutover_audit_status",
    '"smokeQueryStatus": "$smoke_query_status"',
    '"publicTableCount": "$public_table_count"',
    '"containsSecrets": false',
    '"containsRawCustomerRows": false',
    '"containsDumpContent": false',
    '"containsFullDsn": false',
    '"backupCreated": true',
    '"restoreCompleted": true',
    "restoreTarget=$restore_target",
    "sourcePolicy=$source_policy",
    "steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> populated upgrade read-only audit -> customer config cutover read-only audit -> database constraint read-only audit -> atlas migrate apply -> post-apply atlas status -> smoke query",
    "populated-upgrade-preflight.sh",
    "auditing populated upgrade boundaries",
    "auditing customer config cutover boundaries",
    "populated upgrade read-only audit",
    "customer config cutover read-only audit",
    'cp "$backup_evidence" "$evidence_dir/backup-evidence.md"',
    'cp "$pre_migration_status_file" "$evidence_dir/migration-status-before-apply.txt"',
    'cp "$migration_status_file" "$evidence_dir/migration-status.txt"',
    'cp "$command_summary_file" "$evidence_dir/command-summary.txt"',
    'cp "$report_file" "$evidence_dir/backup-restore-report.json"',
  ]) {
    assert(
      source.includes(requiredTerm),
      `missing report field: ${requiredTerm}`,
    );
  }

  assert.doesNotMatch(source, /cp "\$backup_file"/);
  assert.match(source, /sha256sum "\$backup_file"/);
  assert.match(source, /atlas_restore_migrate status/);
  assert.match(source, /atlas_restore_migrate apply/);
  const populatedAudit = source.indexOf("--audit populated-upgrade");
  const cutoverAudit = source.indexOf("--audit customer-config-cutover");
  const atlasApply = source.indexOf("atlas_restore_migrate apply");
  assert(populatedAudit >= 0, "populated upgrade audit must be explicit");
  assert(
    populatedAudit < cutoverAudit,
    "populated upgrade audit must run before customer config cutover audit",
  );
  assert(
    cutoverAudit < atlasApply,
    "customer config cutover audit must run before atlas apply",
  );
  assert.match(source, /information_schema\.tables/);
  assert.match(source, /docker rm -f "\$container_name"/);
});

test("backup restore rehearsal keeps credentials private and uses the full migration contract", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /^umask 077$/m);
  assert.match(source, /postgres:18\.1/);
  assert.doesNotMatch(source, /postgres:18(?:["'\s]|$)/);
  assert.doesNotMatch(source, /postgresql@(?:16|17)/);
  assert.match(source, /source_user" == "erp_backup"/);
  assert.match(source, /source_policy="dedicated-backup"/);
  assert.match(source, /restore_dsn="postgres:\/\/erp_migrator:/);
  assert.match(
    source,
    /PGHOST="\$source_pg_host" PGPORT="\$source_pg_port"[\s\S]*PGDATABASE="\$source_pg_database" PGUSER="\$source_pg_user"[\s\S]*PGPASSWORD="\$source_pg_password" PGSSLMODE="\$source_pg_sslmode"[\s\S]*"\$pg_dump_bin"[\s\S]*--format=custom/,
  );
  assert.match(source, /BACKUP_SOURCE_POSTGRES_DSN="\$source_dsn" python3/);
  assert.doesNotMatch(
    source,
    /source_pg_settings="\$\([\s\S]*?python3\s+-\s+<<['"]?PY/u,
  );
  assert.match(source, /mapfile -d '' -t source_pg_settings/u);
  assert.doesNotMatch(source, /eval "\$source_pg_settings"/u);
  assert.match(source, /source_dsn=""[\s\S]*unset "\$source_env"/);
  assert.doesNotMatch(source, /PGDATABASE="\$source_dsn"/);
  assert.doesNotMatch(source, /"\$pg_dump_bin"\s+"\$source_dsn"/);
  assert.match(source, /url = getenv\("ATLAS_DATABASE_URL"\)/);
  assert.doesNotMatch(source, /--url "\$restore_dsn"/);
  assert.match(source, /apply --dry-run --tx-mode all/);
  assert.match(source, /ROLLBACK;/);
  assert.match(source, /apply --lock-timeout 10s --tx-mode all/);
  assert.match(source, /schema-readback\.sql/);
  assert.match(source, /programmability_result/);
  assert.match(source, /permissionReadbackStatus/);
  assert.match(source, /mkdir -m 700 "\$run_dir"/);
  assert.match(source, /chmod 600 "\$private_file"/);
});

test("backup restore rehearsal scopes the shared development source exception", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const sharedPolicyStart = source.indexOf(
    'if [[ "$source_policy" == "shared-dev-session-read-only" ]]',
  );
  const sourceIdentityStart = source.indexOf(
    'source_identity="',
    sharedPolicyStart,
  );
  const dedicatedPolicyStart = source.indexOf(
    'if [[ "$source_policy" == "dedicated-backup" ]]',
    sourceIdentityStart,
  );
  const postgresMajorStart = source.indexOf(
    '[[ "$source_postgres_version"',
    dedicatedPolicyStart,
  );

  assert(sharedPolicyStart >= 0);
  assert(sourceIdentityStart > sharedPolicyStart);
  assert(dedicatedPolicyStart > sourceIdentityStart);
  assert(postgresMajorStart > dedicatedPolicyStart);
  const sharedPolicyBlock = source.slice(
    sharedPolicyStart,
    sourceIdentityStart,
  );
  const dedicatedPolicyBlock = source.slice(
    dedicatedPolicyStart,
    postgresMajorStart,
  );

  assert.match(
    sharedPolicyBlock,
    /source_policy" == "shared-dev-session-read-only"[\s\S]*environment" == "shared-dev"[\s\S]*source_pg_host" == "192\.168\.0\.106"[\s\S]*source_pg_port" == "5432"[\s\S]*source_pg_database" == "plush_erp"/,
  );
  assert.match(
    sharedPolicyBlock,
    /source_pg_options="-c default_transaction_read_only=on"/,
  );
  assert.doesNotMatch(
    sharedPolicyBlock,
    /source_(?:super|createdb|createrole|bypassrls)|CREATE ROLE|ALTER ROLE|source_pg_user=/,
  );
  assert.match(source, /PGOPTIONS="\$source_pg_options"[\s\S]*"\$psql_bin"/);
  assert.match(source, /PGOPTIONS="\$source_pg_options"[\s\S]*"\$pg_dump_bin"/);
  assert.match(
    dedicatedPolicyBlock,
    /source_policy" == "dedicated-backup"[\s\S]*source_user" == "erp_backup"[\s\S]*source_super" == "f"[\s\S]*source_createdb" == "f"[\s\S]*source_createrole" == "f"[\s\S]*source_bypassrls" == "f"[\s\S]*source_database_create" == "f"[\s\S]*source_schema_create" == "f"[\s\S]*source_invalid_table_count" == "0"/,
  );
  assert.match(source, /"sourcePolicy": "\$source_policy"/);
  assert.match(source, /"sourceRole": "\$source_role_alias"/);
});

test("backup restore rehearsal resolves output ownership without concatenating failed stat output", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const bsdAttempt =
    'if ! out_root_owner_uid="$(stat -f \'%u\' "$out_root" 2>/dev/null)"; then';
  const gnuFallback = 'out_root_owner_uid="$(stat -c \'%u\' "$out_root")"';
  const ownerGate =
    '[[ -d "$out_root" && ! -L "$out_root" && "$out_root_owner_uid" == "$(id -u)" ]]';
  const bsdAttemptIndex = source.indexOf(bsdAttempt);
  const gnuFallbackIndex = source.indexOf(gnuFallback, bsdAttemptIndex);
  const conditionalEndIndex = source.indexOf("\nfi", gnuFallbackIndex);
  const ownerGateIndex = source.indexOf(ownerGate, conditionalEndIndex);

  assert(bsdAttemptIndex >= 0, "BSD stat must be captured by the conditional");
  assert(
    gnuFallbackIndex > bsdAttemptIndex,
    "GNU stat must overwrite the failed BSD attempt output",
  );
  assert(
    conditionalEndIndex > gnuFallbackIndex,
    "GNU fallback must remain inside the conditional",
  );
  assert(
    ownerGateIndex > conditionalEndIndex,
    "the directory gate must compare only the resolved owner UID",
  );
  assert.doesNotMatch(
    source,
    /stat -f '%u' "\$out_root"[^\n]*\|\| stat -c '%u' "\$out_root"/,
  );
});

test("backup restore rehearsal waits for the final postgres process before restore", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(
    source,
    /docker inspect --format '\{\{\.State\.Running\}\}' "\$container_name"/,
  );
  assert.match(source, /docker exec "\$container_name" cat \/proc\/1\/comm/);
  const finalPostgresGate = source.indexOf(
    '[[ "$container_running" == "true" && "$pid1_comm" == "postgres" ]]',
  );
  const readyGate = source.indexOf(
    'docker exec "$container_name" pg_isready -U postgres -d "$restore_db"',
    finalPostgresGate,
  );
  const restore = source.indexOf(
    'docker exec "$container_name" pg_restore',
    readyGate,
  );
  assert(finalPostgresGate >= 0, "final postgres PID 1 gate must be explicit");
  assert(
    readyGate > finalPostgresGate,
    "pg_isready must follow the PID 1 gate",
  );
  assert(
    restore > readyGate,
    "restore must follow the complete readiness gate",
  );
  assert.match(source, /docker logs --tail 80 "\$container_name"/);
  assert.match(source, /gsub\(secret, "\[REDACTED\]"\)/);
});
