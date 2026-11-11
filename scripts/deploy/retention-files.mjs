import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digest, atomicJSON } from "./backup-replica/storage.mjs";
import { requireValue } from "./backup-replica/config.mjs";
import {
  planRetention,
  readProtection,
  readRetentionLedger,
  recordCleanup,
  saveRetentionLedger,
  RETENTION_COUNT,
} from "./backup-replica/retention.mjs";
import { bundleFiles, bundleTime } from "./backup-replica/gitlab-sync.mjs";

export function plainFile(file) {
  const stat = fs.lstatSync(file);
  requireValue(
    stat.isFile() && fs.realpathSync(file) === file,
    "unsafe_retention_file",
  );
  return stat;
}
function member(root, name) {
  requireValue(
    typeof name === "string" &&
      !path.isAbsolute(name) &&
      !name.split("/").some((x) => ["", ".", ".."].includes(x)),
    "unsafe_retention_path",
  );
  return path.join(root, name);
}
export async function describeFiles(root, paths) {
  const result = [];
  for (const name of paths) {
    requireValue(
      !path.isAbsolute(name) &&
        !name.split("/").some((x) => ["", ".", ".."].includes(x)),
      "unsafe_retention_path",
    );
    const file = path.join(root, name),
      stat = plainFile(file);
    result.push({ name, sizeBytes: stat.size, sha256: await digest(file) });
  }
  return result;
}
export async function verifyFiles(root, files, previous = []) {
  for (const item of files) {
    const file = member(root, item.name),
      stat = plainFile(file);
    const fingerprint = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    const verified = previous.find(
      (x) =>
        x.name === item.name &&
        x.sha256 === item.sha256 &&
        x.fingerprint === fingerprint &&
        x.verifiedAt,
    );
    requireValue(
      stat.size === item.sizeBytes &&
        (verified || (await digest(file)) === item.sha256),
      "retention_file_changed",
    );
    const after = plainFile(file);
    requireValue(
      `${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}` ===
        fingerprint,
      "retention_file_changed",
    );
    item.fingerprint = fingerprint;
    item.verifiedAt = verified?.verifiedAt ?? new Date().toISOString();
  }
}

export async function rotateFiles(
  root,
  sourceId,
  items,
  {
    execute = false,
    protection: extraProtection = {},
    count = RETENTION_COUNT,
  } = {},
) {
  requireValue(fs.realpathSync(root) === root, "unsafe_retention_root");
  const ledger = readRetentionLedger(root, sourceId),
    protection = readProtection(root);
  for (const [id, reasons] of Object.entries(extraProtection))
    protection[id] = [...new Set([...(protection[id] ?? []), ...reasons])];
  const pending = Object.values(ledger.records).filter(
    (x) => x.state === "cleaning",
  );
  const cacheFile = path.join(root, "retention-verification.json");
  const cache = fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(plainFile(cacheFile) && cacheFile))
    : { sourceId, files: {} };
  requireValue(
    cache.sourceId === sourceId &&
      cache.files &&
      typeof cache.files === "object",
    "invalid_retention_verification",
  );
  const plan = planRetention(
    items
      .filter((x) => !pending.some((p) => p.id === x.id))
      .map((x) => ({
        ...x,
        reasons: [...new Set([...x.reasons, ...(protection[x.id] ?? [])])],
      })),
    { count },
  );
  // Validate the entire set before the first deletion, including replacements.
  for (const item of plan)
    if (item.valid) {
      await verifyFiles(root, item.files, [
        ...(ledger.records[item.id]?.files ?? []),
        ...Object.values(cache.files),
      ]);
      for (const file of item.files) cache.files[file.name] = file;
      atomicJSON(cacheFile, cache);
    }
  for (const item of plan) ledger.records[item.id] = item;
  if (execute) {
    for (const item of pending) {
      requireValue(
        !protection[item.id]?.length &&
          plan.filter((x) => x.valid && x.state !== "eligible").length >= count,
        "pending_cleanup_protection_changed",
      );
      const remaining = item.files.filter((f) =>
        fs.existsSync(member(root, f.name)),
      );
      await verifyFiles(root, remaining);
      recordCleanup(
        root,
        ledger,
        { ...item, state: "eligible" },
        () => {
          for (const file of remaining) fs.unlinkSync(member(root, file.name));
          for (const directory of item.emptyDirectories ?? [])
            if (fs.existsSync(member(root, directory)))
              fs.rmdirSync(member(root, directory));
        },
        { count },
      );
    }
    saveRetentionLedger(root, ledger, count);
    for (const item of plan.filter((x) => x.state === "eligible")) {
      await verifyFiles(root, item.files, item.files);
      recordCleanup(
        root,
        ledger,
        item,
        () => {
          for (const file of item.files) fs.unlinkSync(member(root, file.name));
          for (const directory of item.emptyDirectories ?? []) {
            requireValue(
              !path.isAbsolute(directory) &&
                !directory.split("/").some((x) => ["", ".", ".."].includes(x)),
              "unsafe_retention_path",
            );
            fs.rmdirSync(path.join(root, directory));
          }
        },
        { count },
      );
    }
  }
  return {
    sourceId,
    retentionCount: count,
    records: Object.values(ledger.records),
  };
}

export async function scheduledItems(root) {
  const items = [];
  for (const name of fs.readdirSync(root).sort()) {
    const match = /^plush_erp-(\d{8}T\d{6}Z)-\d+\.dump(\.age)?$/u.exec(name);
    if (!match) continue;
    const checksum = name.replace(/\.dump(?:\.age)?$/u, ".sha256"),
      file = path.join(root, name);
    const stat = plainFile(file),
      sha256 = await digest(file);
    if (fs.existsSync(path.join(root, checksum)))
      plainFile(path.join(root, checksum));
    const valid =
      fs.existsSync(path.join(root, checksum)) &&
      fs.readFileSync(path.join(root, checksum), "utf8").trim() ===
        `${sha256}  ${name}`;
    const files = [{ name, sizeBytes: stat.size, sha256 }];
    if (valid) files.push(...(await describeFiles(root, [checksum])));
    items.push({
      id: name,
      createdAt: stat.mtime.toISOString(),
      valid,
      reasons: [],
      files,
    });
  }
  return items;
}

export async function rotateScheduled(root, { execute = false } = {}) {
  return rotateFiles(root, "scheduled-database", await scheduledItems(root), {
    execute,
  });
}

// A native archive and its configuration form one recovery set. The checksum
// manifest is evidence and stays after its two payload files are removed.
export async function gitlabItems(root) {
  const items = [],
    owned = new Set();
  for (const name of fs.readdirSync(root).sort()) {
    if (!/^backup-\d{8}T\d{6}Z\.sha256$/u.test(name)) continue;
    const manifest = path.join(root, name);
    plainFile(manifest);
    const rows = fs
      .readFileSync(manifest, "utf8")
      .trim()
      .split("\n")
      .map((line) => /^([a-f0-9]{64})  (.+)$/u.exec(line));
    requireValue(
      rows.length === 2 && rows.every(Boolean),
      "invalid_gitlab_backup_set",
    );
    const files = rows.map((r) => {
      requireValue(r[2].startsWith(root + "/"), "unsafe_gitlab_backup_set");
      const name = path.relative(root, r[2]);
      requireValue(
        /^(?:repository\/[A-Za-z0-9_.-]+_gitlab_backup\.tar|config\/gitlab-config-\d{8}T\d{6}Z\.tar\.gz)$/u.test(
          name,
        ),
        "unsafe_gitlab_backup_set",
      );
      owned.add(name);
      return { name, sha256: r[1] };
    });
    const id = name.replace(".sha256", "");
    if (
      readRetentionLedger(root, "gitlab-native").records[id]?.state ===
      "cleaning"
    )
      continue;
    const present = files.filter((f) => fs.existsSync(path.join(root, f.name)));
    if (
      present.length === 0 &&
      ["cleaning", "cleaned"].includes(
        readRetentionLedger(root, "gitlab-native").records[id]?.state,
      )
    )
      continue;
    for (const f of present)
      f.sizeBytes = plainFile(path.join(root, f.name)).size;
    items.push({
      id,
      createdAt: plainFile(manifest).mtime.toISOString(),
      valid: present.length === files.length,
      reasons:
        present.length === files.length ? [] : ["历史备份不完整，保留核对"],
      files: present,
    });
  }
  for (const name of fs.readdirSync(path.join(root, "repository"))) {
    const relative = `repository/${name}`;
    if (!name.endsWith("_gitlab_backup.tar") || owned.has(relative)) continue;
    const stat = plainFile(path.join(root, relative));
    items.push({
      id: name,
      createdAt: stat.mtime.toISOString(),
      valid: false,
      reasons: [
        /^(?:pre-upgrade-|security-)/u.test(name)
          ? "升级前恢复点"
          : "历史备份待核对",
      ],
      files: [{ name: relative, sizeBytes: stat.size }],
    });
  }
  return items;
}

export async function gitlabExportItems(root) {
  const items = [];
  const ledger = readRetentionLedger(root, "gitlab-export");
  for (const name of fs.readdirSync(root)) {
    if (!/^backup-\d{8}T\d{6}Z$/u.test(name)) continue;
    if (ledger.records[name]?.state === "cleaning") continue;
    const directory = path.join(root, name);
    requireValue(
      fs.realpathSync(directory) === directory &&
        fs.statSync(directory).isDirectory(),
      "unsafe_gitlab_export",
    );
    requireValue(
      JSON.stringify(fs.readdirSync(directory).sort()) ===
        JSON.stringify([...bundleFiles, "encrypted.sha256"].sort()),
      "invalid_gitlab_export_inventory",
    );
    const checksum = path.join(directory, "encrypted.sha256");
    const rows = fs
      .readFileSync(plainFile(checksum) && checksum, "utf8")
      .trim()
      .split("\n")
      .map((x) => /^([a-f0-9]{64})  ([a-z0-9.]+)$/u.exec(x));
    requireValue(
      rows.length === 4 &&
        rows.every(Boolean) &&
        rows
          .map((x) => x[2])
          .sort()
          .join() === bundleFiles.join(),
      "invalid_gitlab_export",
    );
    const files = rows.map((x) => ({
      name: `${name}/${x[2]}`,
      sha256: x[1],
      sizeBytes: plainFile(path.join(directory, x[2])).size,
    }));
    files.push(...(await describeFiles(root, [`${name}/encrypted.sha256`])));
    items.push({
      id: name,
      createdAt: new Date(bundleTime(name)).toISOString(),
      valid: true,
      reasons: [],
      files,
      emptyDirectories: [name],
    });
  }
  return items;
}

const GITLAB_EXPORT_COUNT = 3;
const GITLAB_REPLICA_MAX_AGE_MS = 36 * 60 * 60 * 1000;

function exportIdentities(id, files) {
  if (!Array.isArray(files)) return null;
  const entries = files
    .filter((file) => file?.name !== id + "/encrypted.sha256")
    .map((file) => [file?.name, file?.sizeBytes, file?.sha256])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const names = bundleFiles.map((file) => id + "/" + file);
  return entries.length === names.length &&
    entries.every(
      ([name, bytes, sha], i) =>
        name === names[i] &&
        Number.isSafeInteger(bytes) &&
        bytes > 0 &&
        /^[a-f0-9]{64}$/u.test(sha),
    )
    ? JSON.stringify(entries)
    : null;
}

export function gitlabExportProtection(items, report, clock = Date.now()) {
  const generatedAt = Date.parse(report?.generatedAt);
  const fresh =
    report?.schemaVersion === "plush.replica-retention-report/v1" &&
    report?.sourceId === "gitlab-r740xd" &&
    report?.retentionCount === RETENTION_COUNT &&
    Number.isFinite(generatedAt) &&
    generatedAt <= clock &&
    clock - generatedAt <= GITLAB_REPLICA_MAX_AGE_MS &&
    Array.isArray(report.records) &&
    report.records.every((row) => typeof row?.id === "string") &&
    new Set(report.records.map((row) => row.id)).size === report.records.length;
  const receipts = new Map(
    fresh
      ? report.records
          .filter((row) => ["retained", "protected"].includes(row.state))
          .map((row) => [row.id, exportIdentities(row.id, row.replicatedFiles)])
      : [],
  );
  const protection = {};
  const acknowledged = [];
  for (const item of items) {
    const identity = exportIdentities(item.id, item.files);
    if (identity && receipts.get(item.id) === identity) {
      if (item.state !== "cleaning") acknowledged.push(item);
    } else protection[item.id] = ["未核实 PD-SSD 同步"];
  }
  // Unsynced exports must not consume the last three confirmed slots.
  for (const item of acknowledged
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, GITLAB_EXPORT_COUNT))
    protection[item.id] = ["最近三套已同步交接包"];
  return protection;
}

export async function rotateGitlabExport(root, { execute = false } = {}) {
  const items = await gitlabExportItems(root);
  const pending = Object.values(
    readRetentionLedger(root, "gitlab-export").records,
  ).filter((item) => item.state === "cleaning");
  const file = path.join(root, "retention-replica-report.json");
  let report;
  if (fs.existsSync(file)) {
    const stat = plainFile(file);
    requireValue(
      stat.uid === process.getuid() && (stat.mode & 0o022) === 0,
      "unsafe_gitlab_replica_report",
    );
    report = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return rotateFiles(root, "gitlab-export", items, {
    execute,
    count: GITLAB_EXPORT_COUNT,
    protection: gitlabExportProtection([...items, ...pending], report),
  });
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [kind, root, mode] = process.argv.slice(2);
  try {
    requireValue(
      ["scheduled", "gitlab", "gitlab-export"].includes(kind) &&
        (kind !== "gitlab-export" ||
          root === "/srv/raid5/gitlab/backups/export") &&
        path.isAbsolute(root) &&
        ["--execute", "--preview"].includes(mode),
      "invalid_retention_arguments",
    );
    const result =
      kind === "scheduled"
        ? await rotateScheduled(root, { execute: mode === "--execute" })
        : kind === "gitlab-export"
          ? await rotateGitlabExport(root, { execute: mode === "--execute" })
          : await rotateFiles(root, "gitlab-native", await gitlabItems(root), {
              execute: mode === "--execute",
            });
    atomicJSON(path.join(root, "retention-last-run.json"), {
      generatedAt: new Date().toISOString(),
      ...result,
    });
    console.log(
      JSON.stringify({
        status: "passed",
        sourceId: result.sourceId,
        counts: Object.fromEntries(
          ["retained", "protected", "cleaned", "eligible", "unverified"].map(
            (s) => [s, result.records.filter((x) => x.state === s).length],
          ),
        ),
      }),
    );
  } catch (error) {
    console.error(`[retention] ${error.code ?? "retention_failed"}`);
    process.exitCode = 1;
  }
}
