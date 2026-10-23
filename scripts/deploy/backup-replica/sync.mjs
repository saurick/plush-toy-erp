import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireValue } from "./config.mjs";
import { atomicBytes, atomicJSON, digest, now } from "./storage.mjs";
import {
  planRetention,
  readProtection,
  readRetentionLedger,
  recordCleanup,
  saveRetentionLedger,
} from "./retention.mjs";
import {
  databaseFile,
  encryptedFile,
  validateInventory,
} from "./transport.mjs";

export function backupTime(name) {
  const match = databaseFile.exec(name);
  requireValue(match, "invalid_backup_name");
  const t = match[1];
  const value = Date.parse(
    `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`,
  );
  requireValue(Number.isFinite(value), "invalid_backup_date");
  return value;
}
export function readIndex(root, sourceId) {
  const file = path.join(root, "replica-index.json");
  if (!fs.existsSync(file)) return {};
  requireValue(fs.lstatSync(file).isFile(), "unsafe_replica_index");
  const value = JSON.parse(fs.readFileSync(file));
  requireValue(
    value.schemaVersion === "plush.backup-replica-index/v1" &&
      value.sourceId === sourceId &&
      value.files &&
      typeof value.files === "object" &&
      !Array.isArray(value.files),
    "invalid_replica_index",
  );
  for (const [name, item] of Object.entries(value.files))
    requireValue(
      encryptedFile.test(name) && item?.name === name,
      "invalid_replica_index",
    );
  return value.files;
}
export async function verifiedFile(root, item, signal) {
  const file = path.join(root, item.name);
  const stat = fs.lstatSync(file);
  requireValue(stat.isFile(), "unsafe_replica_file");
  requireValue(
    stat.size === item.sizeBytes &&
      (await digest(file, signal)) === item.sha256,
    "replica_checksum_mismatch",
  );
  return file;
}
export async function synchronize(
  c,
  root,
  source,
  { clock = Date.now(), signal, ensureTarget = () => {} } = {},
) {
  const files = await source.inventory();
  validateInventory(files);
  const databases = files.filter((item) => databaseFile.test(item.name));
  requireValue(databases.length, "source_has_no_database_backup");
  const latest = databases.reduce((a, b) =>
    backupTime(a.name) > backupTime(b.name) ? a : b,
  );
  const age = (clock - backupTime(latest.name)) / 1000;
  requireValue(
    age >= 0 && age <= c.maxSourceAgeHours * 3600,
    "source_backup_stale",
  );
  const records = readIndex(root, c.source.id);
  const ledger = readRetentionLedger(root, c.source.id);
  const protection = {
    ...readProtection(root),
    ...((await source.protection?.()) ?? {}),
  };
  for (const name of Object.keys(records)) {
    if (
      ["cleaned", "cleaning"].includes(ledger.records[name]?.state) &&
      !fs.existsSync(path.join(root, name))
    ) {
      requireValue(
        !protection[name]?.length,
        "pending_cleanup_protection_changed",
      );
      const checksum = path.join(root, name.replace(".dump.age", ".sha256"));
      if (fs.existsSync(checksum)) {
        requireValue(
          fs.lstatSync(checksum).isFile() &&
            fs.realpathSync(checksum) === checksum,
          "unsafe_replica_file",
        );
        fs.unlinkSync(checksum);
      }
      ledger.records[name].state = "cleaned";
      ledger.records[name].cleanedAt ??= now();
      delete records[name];
    }
  }
  const databaseItems = new Map(
    [...Object.values(records), ...databases]
      .filter((x) => databaseFile.test(x.name))
      .map((x) => [x.name, x]),
  );
  const plan = planRetention(
    [...databaseItems.values()].map((x) => ({
      id: x.name,
      createdAt: new Date(backupTime(x.name)).toISOString(),
      valid: true,
      reasons: protection[x.name] ?? [],
    })),
    { count: c.retentionCount },
  );
  const selected = new Set(
    plan.filter((x) => x.state !== "eligible").map((x) => x.id),
  );
  const selectedFiles = files.filter(
    (x) => !databaseFile.test(x.name) || selected.has(x.name),
  );
  const required = selectedFiles
    .filter((item) => !fs.existsSync(path.join(root, item.name)))
    .reduce((n, x) => n + x.sizeBytes, 0);
  const space = fs.statfsSync(root);
  requireValue(
    space.bavail * space.bsize >= required + c.minimumFreeBytes,
    "destination_space_insufficient",
  );
  let copied = 0;
  for (const item of selectedFiles) {
    signal?.throwIfAborted();
    ensureTarget();
    const file = path.join(root, item.name);
    try {
      requireValue(!fs.lstatSync(file).isSymbolicLink(), "unsafe_replica_file");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!fs.existsSync(file)) {
      const temporary = path.join(root, `.incoming-${randomUUID()}`);
      try {
        await source.download(item, temporary);
        requireValue(
          fs.statSync(temporary).size === item.sizeBytes &&
            (await digest(temporary, signal)) === item.sha256,
          "transfer_checksum_mismatch",
        );
        fs.chmodSync(temporary, 0o600);
        fs.linkSync(temporary, file);
        copied++;
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
    await verifiedFile(root, item, signal);
    const checksum = databaseFile.test(item.name)
      ? item.name.replace(".dump.age", ".sha256")
      : item.name + ".sha256";
    atomicBytes(path.join(root, checksum), `${item.sha256}  ${item.name}\n`);
    records[item.name] = {
      name: item.name,
      sizeBytes: item.sizeBytes,
      sha256: item.sha256,
      copiedAt: records[item.name]?.copiedAt ?? now(),
    };
  }
  // Verify every retained local-only copy before allowing any old copy to go.
  for (const name of selected)
    if (records[name]) await verifiedFile(root, records[name], signal);
  for (const item of plan)
    if (records[item.id])
      ledger.records[item.id] = { ...records[item.id], ...item };
  for (const item of Object.values(records).filter(
    (x) => !databaseFile.test(x.name),
  ))
    ledger.records[item.name] = {
      ...item,
      id: item.name,
      createdAt: item.copiedAt,
      state: "protected",
      reasons: ["初始配置或附件清单"],
    };
  saveRetentionLedger(root, ledger);
  const expired = plan.filter((x) => x.state === "eligible" && records[x.id]);
  for (const item of expired) {
    ensureTarget();
    const name = item.id;
    const file = path.join(root, name),
      checksum = path.join(root, name.replace(".dump.age", ".sha256"));
    for (const target of [file, checksum]) {
      try {
        requireValue(
          !fs.lstatSync(target).isSymbolicLink(),
          "unsafe_replica_file",
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await verifiedFile(root, records[name], signal);
    recordCleanup(root, ledger, ledger.records[name], () => {
      fs.unlinkSync(file);
      fs.rmSync(checksum, { force: true });
    });
    delete records[name];
  }
  atomicJSON(path.join(root, "replica-index.json"), {
    schemaVersion: "plush.backup-replica-index/v1",
    sourceId: c.source.id,
    updatedAt: now(),
    files: records,
  });
  return {
    status: "passed",
    checkedAt: now(),
    sourceId: c.source.id,
    destinationId: c.destination.id,
    volumeUUID: c.destination.volumeUUID,
    copiedFiles: copied,
    verifiedSourceFiles: selectedFiles.length,
    retainedFiles: Object.keys(records).length,
    expiredFiles: expired.length,
    retentionCount: c.retentionCount,
    protectedBackups: plan.filter((x) => x.state === "protected").length,
    latestBackup: latest.name,
    sourceBackupAgeSeconds: Math.floor(age),
    encryption: "age",
    sourceDeletionPropagated: false,
  };
}
