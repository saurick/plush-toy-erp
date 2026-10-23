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
} from "./backup-replica/retention.mjs";

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
  { execute = false, protection: extraProtection = {} } = {},
) {
  requireValue(fs.realpathSync(root) === root, "unsafe_retention_root");
  const ledger = readRetentionLedger(root, sourceId),
    protection = { ...readProtection(root), ...extraProtection };
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
          plan.filter((x) => x.valid && x.state !== "eligible").length >= 7,
        "pending_cleanup_protection_changed",
      );
      const remaining = item.files.filter((f) =>
        fs.existsSync(member(root, f.name)),
      );
      await verifyFiles(root, remaining);
      recordCleanup(root, ledger, { ...item, state: "eligible" }, () => {
        for (const file of remaining) fs.unlinkSync(member(root, file.name));
        for (const directory of item.emptyDirectories ?? [])
          if (fs.existsSync(member(root, directory)))
            fs.rmdirSync(member(root, directory));
      });
    }
    saveRetentionLedger(root, ledger);
    for (const item of plan.filter((x) => x.state === "eligible")) {
      await verifyFiles(root, item.files, item.files);
      recordCleanup(root, ledger, item, () => {
        for (const file of item.files) fs.unlinkSync(member(root, file.name));
        for (const directory of item.emptyDirectories ?? []) {
          requireValue(
            !path.isAbsolute(directory) &&
              !directory.split("/").some((x) => ["", ".", ".."].includes(x)),
            "unsafe_retention_path",
          );
          fs.rmdirSync(path.join(root, directory));
        }
      });
    }
  }
  return {
    sourceId,
    retentionCount: 7,
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

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [kind, root, mode] = process.argv.slice(2);
  try {
    requireValue(
      ["scheduled", "gitlab"].includes(kind) &&
        path.isAbsolute(root) &&
        ["--execute", "--preview"].includes(mode),
      "invalid_retention_arguments",
    );
    const result =
      kind === "scheduled"
        ? await rotateScheduled(root, { execute: mode === "--execute" })
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
