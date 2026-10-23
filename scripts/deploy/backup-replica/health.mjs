import fs from "node:fs";
import path from "node:path";
import { requireValue } from "./config.mjs";
import { backupTime, readIndex } from "./sync.mjs";
import { bundleTime, gitlabIndex } from "./gitlab-sync.mjs";
import { readRetentionLedger } from "./retention.mjs";
import { databaseFile } from "./transport.mjs";

export function checkHealth(c, root, { clock = Date.now() } = {}) {
  const receipt = (name) => {
    const file = path.join(c.stateDirectory, name);
    requireValue(
      fs.existsSync(file) && fs.lstatSync(file).isFile(),
      "backup_receipt_missing",
    );
    const value = JSON.parse(fs.readFileSync(file));
    requireValue(value.status === "passed", "backup_last_operation_not_passed");
    requireValue(
      value.sourceId === c.source.id &&
        value.destinationId === c.destination.id &&
        value.volumeUUID === c.destination.volumeUUID,
      "backup_receipt_identity_mismatch",
    );
    return value;
  };
  const operation = receipt("latest-operation.json"),
    sync = receipt("latest-sync.json"),
    restore = receipt("latest-restore.json");
  if (fs.existsSync(path.join(c.stateDirectory, "latest-restore-attempt.json")))
    receipt("latest-restore-attempt.json");
  const age = (value, maximum, reason) => {
    const result = clock - Date.parse(value);
    requireValue(
      Number.isFinite(result) && result >= 0 && result <= maximum,
      reason,
    );
    return Math.floor(result / 1000);
  };
  const maxAge = c.maxSourceAgeHours * 3600_000;
  age(operation.checkedAt, maxAge, "backup_operation_stale");
  const syncAgeSeconds = age(sync.checkedAt, maxAge, "backup_sync_stale");
  const restoreAgeSeconds = age(
    restore.checkedAt,
    c.restore.everyDays * 86400_000,
    "backup_restore_due",
  );
  const gitlab = c.source.kind === "gitlab";
  const sourceAgeSeconds = age(
    new Date(
      (gitlab ? bundleTime : backupTime)(sync.latestBackup),
    ).toISOString(),
    maxAge,
    "source_backup_stale",
  );
  const index = gitlab
    ? gitlabIndex(root, c.source.id)
    : readIndex(root, c.source.id);
  const latest = index[sync.latestBackup];
  requireValue(latest, "backup_index_entry_missing");
  for (const file of gitlab ? latest.files : [latest]) {
    const target = path.join(root, file.name),
      stat = fs.lstatSync(target);
    requireValue(
      stat.isFile() &&
        fs.realpathSync(target) === target &&
        stat.size === file.sizeBytes,
      "backup_file_missing_or_changed",
    );
  }
  const space = fs.statfsSync(root),
    availableBytes = space.bavail * space.bsize;
  {
    const ledger = readRetentionLedger(root, c.source.id);
    const rolling = Object.values(ledger.records).filter(
      (x) => x.state === "retained",
    );
    const indexed = Object.keys(index).filter(
      (name) => gitlab || databaseFile.test(name),
    );
    requireValue(
      rolling.length <= c.retentionCount &&
        indexed.every((name) =>
          ["retained", "protected"].includes(ledger.records[name]?.state),
        ),
      "backup_retention_incomplete",
    );
    requireValue(
      availableBytes >= c.minimumFreeBytes,
      "destination_space_insufficient",
    );
  }
  return {
    status: "passed",
    checkedAt: new Date(clock).toISOString(),
    sourceId: c.source.id,
    destinationId: c.destination.id,
    volumeUUID: c.destination.volumeUUID,
    latestBackup: sync.latestBackup,
    syncAgeSeconds,
    sourceAgeSeconds,
    restoreAgeSeconds,
    availableBytes,
    scope:
      "current volume, file sizes and recent verified receipts; sync and verify perform cryptographic validation",
  };
}
