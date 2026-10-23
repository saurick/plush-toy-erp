import fs from "node:fs";
import path from "node:path";
import { atomicJSON } from "./storage.mjs";
import { requireValue } from "./config.mjs";

export const RETENTION_COUNT = 7;
export const RETENTION_SCHEMA = "plush.retention-ledger/v1";

// Protected recovery points are additional to the rolling window. A failed or
// incomplete replacement never consumes a slot in that window.
export function planRetention(items, { count = RETENTION_COUNT } = {}) {
  requireValue(
    Number.isInteger(count) && count >= 2 && count <= 31,
    "invalid_retention_count",
  );
  requireValue(
    Array.isArray(items) &&
      new Set(items.map((x) => x.id)).size === items.length,
    "invalid_retention_inventory",
  );
  for (const item of items) {
    requireValue(
      typeof item.id === "string" &&
        item.id.length > 0 &&
        Number.isFinite(Date.parse(item.createdAt)) &&
        Array.isArray(item.reasons) &&
        item.reasons.every(
          (reason) => typeof reason === "string" && reason.length > 0,
        ),
      "invalid_retention_item",
    );
  }
  const ordered = [...items].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  const newest = new Set(
    ordered
      .filter((x) => x.valid === true)
      .slice(0, count)
      .map((x) => x.id),
  );
  return ordered.map((item) => ({
    ...item,
    state: item.reasons.length
      ? "protected"
      : item.valid !== true
        ? "unverified"
        : newest.has(item.id)
          ? "retained"
          : "eligible",
  }));
}

export function readRetentionLedger(root, sourceId) {
  const file = path.join(root, "retention-ledger.json");
  if (!fs.existsSync(file))
    return { schemaVersion: RETENTION_SCHEMA, sourceId, records: {} };
  requireValue(
    fs.lstatSync(file).isFile() && fs.realpathSync(file) === file,
    "unsafe_retention_ledger",
  );
  const value = JSON.parse(fs.readFileSync(file));
  requireValue(
    value.schemaVersion === RETENTION_SCHEMA &&
      value.sourceId === sourceId &&
      value.records &&
      typeof value.records === "object" &&
      !Array.isArray(value.records),
    "invalid_retention_ledger",
  );
  return value;
}

export function saveRetentionLedger(root, ledger) {
  atomicJSON(path.join(root, "retention-ledger.json"), {
    ...ledger,
    updatedAt: new Date().toISOString(),
    retentionCount: RETENTION_COUNT,
  });
}

export function readProtection(root) {
  const file = path.join(root, "retention-protection.json");
  if (!fs.existsSync(file)) return {};
  requireValue(
    fs.lstatSync(file).isFile() && fs.realpathSync(file) === file,
    "unsafe_retention_protection",
  );
  const value = JSON.parse(fs.readFileSync(file));
  return validateProtection(value);
}

export function validateProtection(value) {
  requireValue(
    value.schemaVersion === "plush.retention-protection/v1" &&
      value.protected &&
      typeof value.protected === "object" &&
      !Array.isArray(value.protected),
    "invalid_retention_protection",
  );
  for (const [name, reasons] of Object.entries(value.protected))
    requireValue(
      /^[A-Za-z0-9][A-Za-z0-9._/-]{0,250}$/u.test(name) &&
        !name.split("/").includes("..") &&
        Array.isArray(reasons) &&
        reasons.length > 0 &&
        reasons.every((x) => typeof x === "string" && x.length > 0),
      "invalid_retention_protection",
    );
  return value.protected;
}

export function recordCleanup(
  root,
  ledger,
  item,
  remove,
  { clock = () => new Date().toISOString() } = {},
) {
  requireValue(item.state === "eligible", "retention_item_is_protected");
  // Persist the identity before removing bytes. An interrupted cleanup is
  // distinguishable from an unexplained missing file and is safe to resume.
  ledger.records[item.id] = {
    ...item,
    state: "cleaning",
    cleanupStartedAt: clock(),
  };
  saveRetentionLedger(root, ledger);
  remove();
  ledger.records[item.id] = {
    ...ledger.records[item.id],
    state: "cleaned",
    cleanedAt: clock(),
  };
  saveRetentionLedger(root, ledger);
}
