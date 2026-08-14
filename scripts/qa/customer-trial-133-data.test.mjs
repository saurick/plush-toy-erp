import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_TRIAL_133_BACKUP_SCHEMA,
  buildCustomerTrial133BackupScript,
  parseCustomerTrial133BackupReport,
} from "./customer-trial-133-data.mjs";

const IDENTITY = Object.freeze({
  backupAlias: "pre-data-aaaaaaaaaaaa-d260815020304_01020304",
  releaseSha: "a".repeat(40),
  migrationVersion: "20260728100514",
});

test("fixed backup script binds 133 identity and uses the read-only backup role", () => {
  const script = buildCustomerTrial133BackupScript(IDENTITY);

  assert.match(script, /plush_erp_uat_20260716_v5/u);
  assert.match(script, /plush-toy-erp-v5-server/u);
  assert.match(script, /username erp_backup/u);
  assert.match(script, /default_transaction_read_only/u);
  assert.match(script, /pg_dump/u);
  assert.match(script, /pg_restore --list/u);
  assert.match(script, /flock -n/u);
  assert.match(script, /mv "\$backup_tmp" "\$backup_file"/u);
  assert.match(script, /chmod 0600/u);
  assert.doesNotMatch(script, /postgres(?:ql)?:\/\//u);
  assert.doesNotMatch(script, /PGPASSWORD=['"][^$]/u);
  assert.doesNotMatch(script, /rm -rf|DROP DATABASE|TRUNCATE/u);
});

test("backup identity rejects arbitrary aliases, releases, and migrations", () => {
  for (const identity of [
    { ...IDENTITY, backupAlias: "../../escape" },
    { ...IDENTITY, releaseSha: "main" },
    { ...IDENTITY, migrationVersion: "latest" },
  ]) {
    assert.throws(
      () => buildCustomerTrial133BackupScript(identity),
      /backup identity is invalid/u,
    );
  }
});

test("backup report is exact, target-bound, positive-sized, and path-free", () => {
  const output = [
    `SCHEMA_VERSION=${CUSTOMER_TRIAL_133_BACKUP_SCHEMA}`,
    "STATUS=passed",
    `BACKUP_ALIAS=${IDENTITY.backupAlias}`,
    `RELEASE_SHA=${IDENTITY.releaseSha}`,
    "DATABASE_NAME=plush_erp_uat_20260716_v5",
    `MIGRATION_VERSION=${IDENTITY.migrationVersion}`,
    `SHA256=${"b".repeat(64)}`,
    "SIZE_BYTES=4096",
    "CREATED_AT=2026-08-15T03:04:05Z",
  ].join("\n");
  const report = parseCustomerTrial133BackupReport(output, IDENTITY);

  assert.equal(report.status, "passed");
  assert.equal(report.backupAlias, IDENTITY.backupAlias);
  assert.equal(report.sizeBytes, 4096);
  assert.equal(report.containsSecrets, false);
  assert.equal(JSON.stringify(report).includes("/home/"), false);

  assert.throws(
    () =>
      parseCustomerTrial133BackupReport(
        `${output}\nBACKUP_PATH=/home/simon/private.dump`,
        IDENTITY,
      ),
    /report is invalid/u,
  );
  assert.throws(
    () =>
      parseCustomerTrial133BackupReport(
        output.replace("SIZE_BYTES=4096", "SIZE_BYTES=0"),
        IDENTITY,
      ),
    /contradicts/u,
  );
});
