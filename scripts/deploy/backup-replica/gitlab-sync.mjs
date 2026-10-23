import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireValue } from "./config.mjs";
import { atomicJSON, digest, now, privateDirectory } from "./storage.mjs";
import { command } from "./process.mjs";
import { SSHSource, prelude } from "./transport.mjs";

export const bundlePattern = /^backup-([0-9]{8}T[0-9]{6}Z)$/u;
export const bundleFiles = [
  "checksums.sha256.age",
  "config.tar.gz.age",
  "manifest.env.age",
  "repository.tar.age",
];
export function bundleTime(name) {
  const match = bundlePattern.exec(name);
  requireValue(match, "invalid_gitlab_bundle_name");
  const s = match[1],
    t = Date.parse(
      `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
    );
  requireValue(
    Number.isFinite(t) &&
      new Date(t).toISOString().replace(/[-:]/gu, "").replace(".000Z", "Z") ===
        s,
    "invalid_gitlab_bundle_date",
  );
  return t;
}
export function validateGitlabInventory(items) {
  requireValue(
    Array.isArray(items) && items.length > 0 && items.length <= 400,
    "invalid_gitlab_inventory",
  );
  const bundles = new Map(),
    names = new Set();
  for (const item of items) {
    requireValue(
      typeof item.name === "string",
      "invalid_gitlab_inventory_name",
    );
    const [bundle, name, extra] = item.name.split("/");
    bundleTime(bundle);
    requireValue(
      !extra && bundleFiles.includes(name) && !names.has(item.name),
      "invalid_gitlab_inventory_name",
    );
    requireValue(
      Number.isSafeInteger(item.sizeBytes) &&
        item.sizeBytes > 0 &&
        item.sizeBytes <= 1024 ** 4 &&
        /^[a-f0-9]{64}$/u.test(item.sha256),
      "invalid_gitlab_inventory_digest",
    );
    requireValue(
      typeof item.fingerprint === "string" &&
        /^[-0-9:. +]{1,160}$/u.test(item.fingerprint),
      "invalid_gitlab_inventory_stat",
    );
    names.add(item.name);
    bundles.set(bundle, [...(bundles.get(bundle) ?? []), item]);
  }
  for (const files of bundles.values())
    requireValue(files.length === 4, "incomplete_gitlab_bundle");
  return bundles;
}
export function gitlabInventoryScript(c) {
  return (
    prelude(c) +
    `printf 'plush.gitlab-replica-inventory/v1\\t%s\\n' "$source_id"
for dir in "$root"/backup-*; do
  [ -e "$dir" ] || continue
  [ -d "$dir" ] && [ ! -L "$dir" ]
  bundle="$(basename "$dir")"
  case "$bundle" in *[!A-Za-z0-9-]*) exit 2;; esac
  checksum="$dir/encrypted.sha256"
  [ -f "$checksum" ] && [ ! -L "$checksum" ]
  [ "$(wc -l < "$checksum")" -eq 4 ]
  while read -r hash name extra; do
    [ -z "$extra" ] && [ "\${#hash}" -eq 64 ]
    case "$hash" in *[!0-9a-f]*) exit 2;; esac
    case "$name" in repository.tar.age|config.tar.gz.age|checksums.sha256.age|manifest.env.age) ;; *) exit 2;; esac
    file="$dir/$name"
    [ -f "$file" ] && [ ! -L "$file" ]
    printf 'file\\t%s/%s\\t%s\\t%s\\t%s\\n' "$bundle" "$name" "$(stat -c %s "$file")" "$hash" "$(stat -c '%s:%i:%y' "$file")"
  done < "$checksum"
done
`
  );
}
export class GitlabSource extends SSHSource {
  async inventory() {
    const bytes = await command(this.args(), {
      input: gitlabInventoryScript(this.config),
      signal: this.signal,
      timeout: 120_000,
    });
    const [header, ...rows] = bytes.toString().trimEnd().split("\n");
    requireValue(
      header === `plush.gitlab-replica-inventory/v1\t${this.config.source.id}`,
      "inventory_identity_mismatch",
    );
    const items = rows.filter(Boolean).map((line) => {
      const p = line.split("\t");
      requireValue(
        p.length === 5 && p[0] === "file",
        "invalid_gitlab_inventory",
      );
      return {
        name: p[1],
        sizeBytes: Number(p[2]),
        sha256: p[3],
        fingerprint: p[4],
      };
    });
    validateGitlabInventory(items);
    return items;
  }
}
export function gitlabIndex(root, sourceId) {
  const file = path.join(root, "gitlab-replica-index.json");
  if (!fs.existsSync(file)) return {};
  requireValue(fs.lstatSync(file).isFile(), "unsafe_replica_index");
  const index = JSON.parse(fs.readFileSync(file));
  requireValue(
    index.schemaVersion === "plush.gitlab-replica-index/v1" &&
      index.sourceId === sourceId &&
      index.bundles &&
      !Array.isArray(index.bundles),
    "invalid_replica_index",
  );
  for (const [name, record] of Object.entries(index.bundles)) {
    bundleTime(name);
    requireValue(
      Array.isArray(record.files) &&
        record.files.every((f) => f.name.startsWith(name + "/")),
      "invalid_replica_index",
    );
    const groups = validateGitlabInventory(record.files);
    requireValue(
      groups.size === 1 && groups.has(name),
      "invalid_replica_index",
    );
  }
  return index.bundles;
}
export async function checkBundle(root, name, files, signal) {
  const directory = path.join(root, name);
  requireValue(
    fs.lstatSync(directory).isDirectory() &&
      fs.realpathSync(directory) === directory,
    "unsafe_gitlab_bundle",
  );
  requireValue(
    JSON.stringify(fs.readdirSync(directory).sort()) ===
      JSON.stringify(bundleFiles),
    "gitlab_bundle_inventory_mismatch",
  );
  for (const file of files) {
    const p = path.join(root, file.name),
      stat = fs.lstatSync(p);
    requireValue(
      stat.isFile() &&
        stat.size === file.sizeBytes &&
        (await digest(p, signal)) === file.sha256,
      "replica_checksum_mismatch",
    );
  }
}
export function spaceRequired(items, reserve) {
  return items.reduce((total, item) => total + item.sizeBytes, 0) + reserve;
}
export async function synchronizeGitlab(
  c,
  root,
  source,
  {
    clock = Date.now(),
    signal,
    ensureTarget = () => {},
    available = () => {
      const s = fs.statfsSync(root);
      return s.bavail * s.bsize;
    },
  } = {},
) {
  const inventory = validateGitlabInventory(await source.inventory());
  const records = gitlabIndex(root, c.source.id);
  const names = [
    ...new Set([...inventory.keys(), ...Object.keys(records)]),
  ].sort((a, b) => bundleTime(b) - bundleTime(a));
  requireValue(
    names.every((n) => bundleTime(n) <= clock),
    "source_backup_in_future",
  );
  const newest = [...inventory.keys()].sort(
    (a, b) => bundleTime(b) - bundleTime(a),
  )[0];
  const age = (clock - bundleTime(newest)) / 1000;
  requireValue(
    age >= 0 && age <= c.maxSourceAgeHours * 3600,
    "source_backup_stale",
  );
  const selected = names.slice(0, c.retentionCount),
    incoming = selected.filter((n) => !records[n]);
  const required = incoming.flatMap((n) => inventory.get(n) ?? []);
  requireValue(
    available() >= spaceRequired(required, c.minimumFreeBytes),
    "destination_space_insufficient",
  );
  let copied = 0;
  for (const name of selected) {
    signal?.throwIfAborted();
    ensureTarget();
    const remote = inventory.get(name),
      prior = records[name];
    if (prior && remote)
      requireValue(
        JSON.stringify(
          prior.files.map((f) => [f.name, f.sizeBytes, f.sha256]).sort(),
        ) ===
          JSON.stringify(
            remote.map((f) => [f.name, f.sizeBytes, f.sha256]).sort(),
          ),
        "source_bundle_changed",
      );
    const files = remote ?? prior?.files;
    requireValue(files, "gitlab_bundle_unavailable");
    const final = path.join(root, name);
    if (fs.existsSync(final)) {
      await checkBundle(root, name, files, signal);
    } else {
      requireValue(remote, "gitlab_bundle_unavailable");
      const temporary = privateDirectory(
        path.join(root, `.incoming-${randomUUID()}`),
      );
      try {
        for (const item of files) {
          ensureTarget();
          requireValue(
            available() >= item.sizeBytes + c.minimumFreeBytes,
            "destination_space_insufficient",
          );
          const output = path.join(temporary, path.basename(item.name));
          await source.download(item, output);
          requireValue(
            fs.lstatSync(output).isFile() &&
              fs.statSync(output).size === item.sizeBytes &&
              (await digest(output, signal)) === item.sha256,
            "transfer_checksum_mismatch",
          );
        }
        requireValue(!fs.existsSync(final), "gitlab_bundle_already_exists");
        fs.renameSync(temporary, final);
        copied++;
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    }
    records[name] = { files, copiedAt: prior?.copiedAt ?? now() };
  }
  const indexFile = path.join(root, "gitlab-replica-index.json");
  const save = () =>
    atomicJSON(indexFile, {
      schemaVersion: "plush.gitlab-replica-index/v1",
      sourceId: c.source.id,
      updatedAt: now(),
      bundles: records,
    });
  save();
  const expired = Object.keys(records).filter((n) => !selected.includes(n));
  for (const name of expired) {
    ensureTarget();
    if (fs.existsSync(path.join(root, name))) {
      await checkBundle(root, name, records[name].files, signal);
      fs.rmSync(path.join(root, name), { recursive: true });
    }
    delete records[name];
    save();
  }
  return {
    status: "passed",
    checkedAt: now(),
    sourceId: c.source.id,
    destinationId: c.destination.id,
    volumeUUID: c.destination.volumeUUID,
    latestBackup: newest,
    copiedBundles: copied,
    retainedBundles: Object.keys(records).length,
    expiredBundles: expired.length,
    sourceBackupAgeSeconds: Math.floor(age),
    minimumFreeBytes: c.minimumFreeBytes,
    availableBytes: available(),
    encryption: "age",
    sourceDeletionPropagated: false,
  };
}
