import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const backupScript = path.join(
  root,
  "scripts/deploy/scheduled-postgres-backup.sh",
);
const restoreScript = path.join(
  root,
  "scripts/deploy/verify-scheduled-postgres-backup.sh",
);
const backupSource = readFileSync(backupScript, "utf8");
const restoreSource = readFileSync(restoreScript, "utf8");

test("scheduled backup is bounded, verified, offsite and failure-visible", () => {
  assert.doesNotThrow(() => execFileSync("bash", ["-n", backupScript]));
  assert.match(backupSource, /^umask 077$/mu);
  assert.match(backupSource, /--offsite-dir/u);
  assert.match(backupSource, /--age-recipient-file/u);
  assert.match(backupSource, /--allow-local-only/u);
  assert.match(backupSource, /\.plush-toy-erp-offsite-target/u);
  assert.match(backupSource, /位于同一文件系统/u);
  assert.match(backupSource, /--username erp_backup/u);
  assert.match(backupSource, /PGPASSWORD="\$POSTGRES_BACKUP_PASSWORD"/u);
  assert.match(backupSource, /default_transaction_read_only/u);
  assert.match(backupSource, /pg_dump 必须固定为 PostgreSQL 18\.1/u);
  assert.match(backupSource, /exec pg_dump .*--format=custom/u);
  assert.doesNotMatch(backupSource, /pg_dump --username "\$POSTGRES_USER"/u);
  assert.match(backupSource, /pg_restore --list/u);
  assert.match(backupSource, /sha256sum/u);
  assert.match(backupSource, /age --recipient/u);
  assert.match(backupSource, /\.dump\.age/u);
  assert.match(backupSource, /offsiteCopied/u);
  assert.match(backupSource, /offsiteEncrypted/u);
  assert.match(backupSource, /latest-status\.env/u);
  assert.match(backupSource, /migrationVersion/u);
  assert.match(backupSource, /durationSeconds/u);
  assert.match(backupSource, /write_status failed/u);
  assert.match(backupSource, /lock_acquired.*completed/u);
  assert.match(backupSource, /-mtime "\+\$retention_days" -delete/u);
  assert.doesNotMatch(
    backupSource,
    /docker\s+(?:volume|image|system)\s+prune/u,
  );
});

test("scheduled restore check uses the newest checksum-bound dump in an isolated container", () => {
  assert.doesNotThrow(() => execFileSync("bash", ["-n", restoreScript]));
  assert.match(restoreSource, /^umask 077$/mu);
  assert.match(restoreSource, /plush_erp-\*\.dump\.age/u);
  assert.match(restoreSource, /\.plush-toy-erp-offsite-target/u);
  assert.match(restoreSource, /actual_hash.*expected_hash/u);
  assert.match(restoreSource, /age --decrypt --identity/u);
  assert.match(restoreSource, /mktemp -d \/tmp\/plush-scheduled-restore/u);
  assert.match(restoreSource, /chmod 0700 "\$restore_tmp_dir"/u);
  assert.match(restoreSource, /postgres:18\.1/u);
  assert.match(restoreSource, /docker run --detach --rm/u);
  assert.match(restoreSource, /--network none/u);
  assert.match(restoreSource, /--memory 1g/u);
  assert.match(restoreSource, /--pids-limit 256/u);
  assert.match(restoreSource, /pg_restore/u);
  assert.match(restoreSource, /--exit-on-error/u);
  assert.match(restoreSource, /information_schema\.tables/u);
  assert.match(restoreSource, /atlas_schema_revisions/u);
  assert.match(restoreSource, /temporary-postgres-container-removed/u);
  assert.match(restoreSource, /backupAgeSeconds/u);
  assert.match(restoreSource, /restoreDurationSeconds/u);
  assert.match(restoreSource, /备份文件名不符合受管格式/u);
  assert.match(restoreSource, /trap cleanup EXIT/u);
});

test("systemd timers persist daily backup and weekly restore checks with failure hooks", () => {
  const systemdRoot = path.join(root, "deployments/yoyoosun/systemd");
  const backupService = readFileSync(
    path.join(systemdRoot, "plush-toy-erp-backup.service"),
    "utf8",
  );
  const backupTimer = readFileSync(
    path.join(systemdRoot, "plush-toy-erp-backup.timer"),
    "utf8",
  );
  const restoreService = readFileSync(
    path.join(systemdRoot, "plush-toy-erp-backup-restore-check.service"),
    "utf8",
  );
  const restoreTimer = readFileSync(
    path.join(systemdRoot, "plush-toy-erp-backup-restore-check.timer"),
    "utf8",
  );

  assert.match(
    backupService,
    /OnFailure=plush-toy-erp-backup-failure@%n\.service/u,
  );
  assert.match(backupService, /scheduled-postgres-backup\.sh/u);
  assert.match(backupService, /--age-recipient-file/u);
  assert.match(backupTimer, /OnCalendar=\*-\*-\* 02:15:00/u);
  assert.match(backupTimer, /Persistent=true/u);
  assert.match(restoreService, /verify-scheduled-postgres-backup\.sh/u);
  assert.match(restoreService, /--age-identity-file/u);
  assert.match(restoreTimer, /OnCalendar=Sun \*-\*-\* 04:15:00/u);
  assert.match(restoreTimer, /Persistent=true/u);
});
