import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  atomicJSON,
  command,
  hashFile,
  now,
  plainPath,
  privateDirectory,
  requireValue,
} from "./common.mjs";
import { checkOffsite, packSet, publishCipher, pruneSets } from "./archive.mjs";
import { CONFIG_SQL, MIGRATION_SQL, ROWS_SQL, openSource } from "./source.mjs";

export async function createSet(
  options,
  { run = command, sourceFactory = openSource, signal } = {},
) {
  privateDirectory(options.backupDir);
  const retention = Number(options.retentionCount ?? 7);
  const id = `plush-set-${now()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}/u, "")}-${randomUUID()}`;
  const work = path.join(options.backupDir, `.${id}`);
  const status = path.join(options.backupDir, "latest-set-status.json");
  let source;
  let completed = false;
  let resumed = true;
  const startedAt = now();
  try {
    atomicJSON(status, {
      schemaVersion: "plush.backup-set-status/v1",
      status: "running",
      backupId: id,
      startedAt,
    });
    if (options.offsiteDir) checkOffsite(options.offsiteDir, options.backupDir);
    else requireValue(options.allowLocalOnly === true, "offsite_required");
    plainPath(options.recipientFile);
    const recipient = fs.readFileSync(options.recipientFile, "utf8").trim();
    requireValue(
      /^age1[0-9a-z]{20,200}$/u.test(recipient),
      "invalid_age_recipient",
    );
    requireValue(retention === 7, "invalid_retention_count");
    fs.mkdirSync(work, { mode: 0o700 });
    const set = path.join(work, "set");
    fs.mkdirSync(set, { mode: 0o700 });
    source = await sourceFactory(options, work, { run, signal });
    let manifest;
    try {
      resumed = false;
      await source.stop();
      const snapshotAt = now();
      const before = await source.psql(ROWS_SQL);
      const config = await source.psql(CONFIG_SQL);
      const migrationVersion = await source.psql(MIGRATION_SQL);
      await source.dump(path.join(set, "database.dump"));
      await source.tool([
        "-mode",
        "backup",
        "-dir",
        "/backup/objects",
        "-execute",
        "-confirm",
        `ATTACHMENT_BACKUP:${options.database}`,
      ]);
      requireValue(
        before === (await source.psql(ROWS_SQL)) &&
          config === (await source.psql(CONFIG_SQL)) &&
          migrationVersion === (await source.psql(MIGRATION_SQL)),
        "database_changed_during_backup",
      );
      const objects = JSON.parse(
        fs.readFileSync(path.join(set, "objects/manifest.json"), "utf8"),
      );
      const names = [
        "database.dump",
        "objects/manifest.json",
        ...objects.files.map((f) => `objects/${path.basename(f.key)}`),
      ];
      manifest = {
        schemaVersion: "plush.backup-set/v1",
        backupId: id,
        ...source.identity,
        createdAt: now(),
        snapshotAt,
        migrationVersion,
        activeCustomerConfig: JSON.parse(config),
        attachmentRowsSha256: before,
        attachmentCount: objects.files.length,
        attachmentBytes: objects.bytes,
        consistency: "app-stopped-no-other-database-clients",
        files: names.map((name) => ({
          path: name,
          size: fs.statSync(path.join(set, name)).size,
          sha256: hashFile(path.join(set, name)),
        })),
      };
      atomicJSON(path.join(set, "manifest.json"), manifest);
    } finally {
      await source.resume();
      resumed = true;
    }
    // Encryption and offsite transfer occur after the original application is healthy.
    await packSet(set, path.join(work, "set.tar"), run);
    const cipher = path.join(work, `${id}.tar.age`);
    await run(
      [
        "age",
        "--recipient",
        recipient,
        "--output",
        cipher,
        path.join(work, "set.tar"),
      ],
      { signal, timeout: 900_000 },
    );
    const local = publishCipher(cipher, options.backupDir);
    if (options.offsiteDir) publishCipher(local, options.offsiteDir);
    pruneSets(options.backupDir, retention);
    if (options.offsiteDir) pruneSets(options.offsiteDir, retention);
    const report = {
      schemaVersion: "plush.backup-set-status/v1",
      status: "passed",
      backupId: id,
      startedAt,
      completedAt: now(),
      durationSeconds: Math.ceil((Date.now() - Date.parse(startedAt)) / 1000),
      project: manifest.project,
      releaseSha: manifest.releaseSha,
      migrationVersion: manifest.migrationVersion,
      attachmentCount: manifest.attachmentCount,
      attachmentBytes: manifest.attachmentBytes,
      encryptedSha256: hashFile(local),
      offsiteCopied: Boolean(options.offsiteDir),
      offsiteEncrypted: Boolean(options.offsiteDir),
      applicationResumed: true,
    };
    atomicJSON(status, report);
    privateDirectory(path.join(options.backupDir, "receipts"));
    atomicJSON(path.join(options.backupDir, "receipts", `${id}.json`), report);
    completed = true;
    return report;
  } finally {
    if (!completed)
      atomicJSON(status, {
        schemaVersion: "plush.backup-set-status/v1",
        status: "failed",
        backupId: id,
        startedAt,
        checkedAt: now(),
        applicationResumed: resumed,
      });
    // Preserve private evidence if application recovery or helper cleanup failed.
    if (resumed) fs.rmSync(work, { recursive: true, force: true });
  }
}
