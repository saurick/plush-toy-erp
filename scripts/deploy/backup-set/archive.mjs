import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  command,
  hashFile,
  plainPath,
  requireValue,
  SET_NAME,
} from "./common.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const MEMBER =
  /^(?:manifest\.json|database\.dump|objects\/?|objects\/[A-Za-z0-9._-]+)$/u;
export function validateSet(directory) {
  const m = JSON.parse(
    fs.readFileSync(plainPath(path.join(directory, "manifest.json")), "utf8"),
  );
  requireValue(
    m.schemaVersion === "plush.backup-set/v1" &&
      SET_NAME.test(`${m.backupId}.tar.age`) &&
      m.consistency === "app-stopped-no-other-database-clients" &&
      Number.isFinite(Date.parse(m.snapshotAt)) &&
      Date.parse(m.snapshotAt) <= Date.parse(m.createdAt),
    "invalid_set_manifest",
  );
  requireValue(
    /^[a-z][a-z0-9_-]{1,62}$/u.test(m.project) &&
      /^[a-z][a-z0-9_]{1,62}$/u.test(m.database),
    "invalid_set_identity",
  );
  requireValue(
    /^[a-f0-9]{40}$/u.test(m.releaseSha) &&
      HASH.test(m.appImageId) &&
      HASH.test(m.runtimeEnvSha256),
    "invalid_release_identity",
  );
  requireValue(
    /^\d{14}$/u.test(m.migrationVersion) && HASH.test(m.attachmentRowsSha256),
    "invalid_database_identity",
  );
  requireValue(
    Array.isArray(m.files) && m.files.length >= 2,
    "missing_set_files",
  );
  const seen = new Set(["manifest.json"]);
  requireValue(
    fs.readdirSync(directory).sort().join("|") ===
      "database.dump|manifest.json|objects",
    "unexpected_set_file",
  );
  for (const f of m.files) {
    requireValue(
      MEMBER.test(f.path) &&
        f.path !== "objects" &&
        f.path !== "objects/" &&
        !seen.has(f.path) &&
        !f.path.split("/").some((v) => v === "." || v === ".."),
      "invalid_set_member",
    );
    requireValue(
      Number.isSafeInteger(f.size) && f.size >= 0 && HASH.test(f.sha256),
      "invalid_set_file",
    );
    const file = plainPath(path.join(directory, f.path));
    requireValue(
      fs.statSync(file).size === f.size && hashFile(file) === f.sha256,
      "set_file_checksum_mismatch",
    );
    seen.add(f.path);
  }
  requireValue(
    seen.has("database.dump") && seen.has("objects/manifest.json"),
    "incomplete_set",
  );
  const objects = JSON.parse(
    fs.readFileSync(path.join(directory, "objects/manifest.json"), "utf8"),
  );
  requireValue(
    objects.format === "plush.attachment-objects/v1" &&
      objects.database === m.database &&
      !objects.hasDatabaseContent &&
      Array.isArray(objects.files),
    "invalid_object_manifest",
  );
  let bytes = 0;
  const keys = new Set();
  for (const f of objects.files) {
    requireValue(
      typeof f.key === "string" &&
        f.key.includes("/") &&
        !keys.has(path.basename(f.key)),
      "invalid_object_key",
    );
    const record = m.files.find(
      (v) => v.path === `objects/${path.basename(f.key)}`,
    );
    requireValue(
      record && record.size === f.size && record.sha256 === f.sha256,
      "unpaired_object_backup",
    );
    keys.add(path.basename(f.key));
    bytes += f.size;
  }
  requireValue(
    bytes === objects.bytes &&
      objects.files.length === m.attachmentCount &&
      bytes === m.attachmentBytes &&
      m.files.length === objects.files.length + 2,
    "object_totals_mismatch",
  );
  const actual = [
    "manifest.json",
    "database.dump",
    ...fs
      .readdirSync(path.join(directory, "objects"))
      .map((f) => `objects/${f}`),
  ];
  requireValue(
    actual.length === seen.size && actual.every((f) => seen.has(f)),
    "unexpected_set_file",
  );
  return m;
}

export async function packSet(directory, output, run = command) {
  validateSet(directory);
  await run([
    "tar",
    "--format=ustar",
    "-cf",
    output,
    "-C",
    directory,
    "manifest.json",
    "database.dump",
    "objects",
  ]);
}

export async function unpackSet(archive, directory, run = command) {
  plainPath(archive);
  const names = (await run(["tar", "-tf", archive])).split("\n");
  const types = (await run(["tar", "-tvf", archive])).split("\n");
  requireValue(
    names.length === types.length &&
      names.length >= 4 &&
      new Set(names).size === names.length,
    "invalid_archive_members",
  );
  requireValue(
    names.every(
      (n) =>
        MEMBER.test(n) && !n.split("/").some((v) => v === "." || v === ".."),
    ),
    "unsafe_archive_path",
  );
  requireValue(
    types.every((line, i) =>
      names[i] === "objects/" || names[i] === "objects"
        ? line.startsWith("d")
        : line.startsWith("-"),
    ),
    "archive_links_or_special_files_rejected",
  );
  fs.mkdirSync(directory, { mode: 0o700 });
  await run([
    "tar",
    "-xf",
    archive,
    "-C",
    directory,
    "--no-same-owner",
    "--no-same-permissions",
  ]);
  fs.chmodSync(directory, 0o700);
  return validateSet(directory);
}

export function checkOffsite(directory, local) {
  plainPath(directory, { directory: true });
  const marker = plainPath(
    path.join(directory, ".plush-toy-erp-offsite-target"),
  );
  requireValue(
    fs.readFileSync(marker, "utf8").trim() === "plush-toy-erp-offsite-v1",
    "offsite_marker_mismatch",
  );
  if (local)
    requireValue(
      fs.statSync(directory).dev !== fs.statSync(local).dev,
      "offsite_same_filesystem",
    );
}

export function verifyCipher(file) {
  plainPath(file);
  requireValue(SET_NAME.test(path.basename(file)), "invalid_backup_name");
  const expected = `${hashFile(file)}  ${path.basename(file)}\n`;
  requireValue(
    fs.readFileSync(plainPath(`${file}.sha256`), "utf8") === expected,
    "cipher_checksum_mismatch",
  );
  return expected.slice(0, 64);
}

export function latestSet(directory, maxAgeHours) {
  checkOffsite(directory);
  const names = fs
    .readdirSync(directory)
    .filter((n) => SET_NAME.test(n))
    .sort();
  requireValue(names.length > 0, "no_complete_backup_set");
  const file = path.join(directory, names.at(-1));
  const age =
    Math.floor(Date.now() / 1000) -
    Math.floor(fs.statSync(plainPath(file)).mtimeMs / 1000);
  requireValue(age >= 0 && age <= maxAgeHours * 3600, "backup_set_stale");
  verifyCipher(file);
  return file;
}

export function publishCipher(source, directory) {
  const name = path.basename(source);
  requireValue(SET_NAME.test(name), "invalid_backup_name");
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  const final = path.join(directory, name);
  requireValue(
    !fs.existsSync(final) && !fs.existsSync(`${final}.sha256`),
    "backup_already_exists",
  );
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(temporary, 0o600);
    requireValue(
      hashFile(temporary) === hashFile(source),
      "cipher_copy_mismatch",
    );
    fs.renameSync(temporary, final);
    fs.writeFileSync(`${final}.sha256`, `${hashFile(final)}  ${name}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return final;
}

export function pruneSets(directory, retentionDays) {
  const names = fs
    .readdirSync(directory)
    .filter((n) => SET_NAME.test(n))
    .sort()
    .reverse();
  for (const name of names.slice(2)) {
    const file = path.join(directory, name);
    if (Date.now() - fs.lstatSync(file).mtimeMs <= retentionDays * 86400_000)
      continue;
    verifyCipher(file);
    fs.unlinkSync(file);
    fs.unlinkSync(`${file}.sha256`);
  }
}
