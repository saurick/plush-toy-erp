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
    env: {
      ...process.env,
      ...env,
    },
  });
}

test("backup restore rehearsal script help is runnable", () => {
  const result = runScript(["--help"]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /SOURCE_POSTGRES_DSN/);
  assert.match(result.stdout, /backup-restore-report\.json/);
  assert.match(result.stdout, /--evidence-dir/);
  assert.match(result.stdout, /不把 dump、secret、完整 DSN 或客户 raw rows 写入 git/);
});

test("backup restore rehearsal requires source DSN before external tools", () => {
  const result = runScript(["--release-version", "test-release"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /请通过 SOURCE_POSTGRES_DSN 提供源库 DSN/);
  assert.doesNotMatch(result.stderr, /缺少命令: docker/);
});

test("backup restore rehearsal blocks target DB source unless explicitly allowed", () => {
  const result = runScript(["--release-version", "test-release"], {
    SOURCE_POSTGRES_DSN: "postgres://plush:secret@192.168.0.133:5435/plush_erp?sslmode=disable",
    ALLOW_TARGET_DB_BACKUP_REHEARSAL: "",
    ERP_ALLOW_TEST_DB_AS_DEV: "",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /拒绝默认使用 192\.168\.0\.133 测试 \/ 目标库作为 source/);
  assert.match(result.stderr, /ALLOW_TARGET_DB_BACKUP_REHEARSAL=1/);
});

test("backup restore rehearsal rejects non release backup purpose before external tools", () => {
  const result = runScript(["--release-version", "test-release", "--backup-purpose", "backup-restore-rehearsal"], {
    SOURCE_POSTGRES_DSN: "postgres://plush:secret@127.0.0.1:5432/plush_erp?sslmode=disable",
  });

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
  assert.match(result.stderr, /--evidence-dir 必须是已存在的 release evidence 目录/);
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
    '"migrationVersion": "${pre_migration_version:-unknown}"',
    '"migrationBeforeApply": "${pre_migration_version:-unknown}"',
    '"pendingFiles": "${pending_files:-unknown}"',
    '"smokeQueryStatus": "$smoke_query_status"',
    '"publicTableCount": "$public_table_count"',
    '"containsSecrets": false',
    '"containsRawCustomerRows": false',
    '"containsDumpContent": false',
    '"containsFullDsn": false',
    '"backupCreated": true',
    '"restoreCompleted": true',
    "restoreTarget=$restore_target",
    "steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke query",
    'cp "$backup_evidence" "$evidence_dir/backup-evidence.md"',
    'cp "$pre_migration_status_file" "$evidence_dir/migration-status-before-apply.txt"',
    'cp "$migration_status_file" "$evidence_dir/migration-status.txt"',
    'cp "$command_summary_file" "$evidence_dir/command-summary.txt"',
    'cp "$report_file" "$evidence_dir/backup-restore-report.json"',
  ]) {
    assert(source.includes(requiredTerm), `missing report field: ${requiredTerm}`);
  }

  assert.doesNotMatch(source, /cp "\$backup_file"/);
  assert.match(source, /sha256sum "\$backup_file"/);
  assert.match(source, /atlas migrate status/);
  assert.match(source, /atlas migrate apply/);
  assert.match(source, /information_schema\.tables/);
  assert.match(source, /docker rm -f "\$container_name"/);
});
