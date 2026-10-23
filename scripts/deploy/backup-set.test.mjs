import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { command, hashFile, privateDirectory } from "./backup-set/common.mjs";
import {
  checkOffsite,
  latestSet,
  packSet,
  pruneSets,
  publishCipher,
  unpackSet,
  validateSet,
  verifyCipher,
} from "./backup-set/archive.mjs";
import { createSet } from "./backup-set/create.mjs";
import {
  assertBackupRole,
  CONFIG_SQL,
  MIGRATION_SQL,
  ROWS_SQL,
} from "./backup-set/source.mjs";

const hash = (data) => createHash("sha256").update(data).digest("hex");
const fixture = (t) => {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "plush-backup-set-test-"),
  );
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};
function setFixture(root) {
  const set = privateDirectory(path.join(root, "set"));
  fs.mkdirSync(path.join(set, "objects"));
  const key = "attachments/" + "a".repeat(32),
    content = Buffer.from([0, 255, 1, 13, 10]);
  const objects = {
    format: "plush.attachment-objects/v1",
    database: "plush_drill",
    files: [{ id: 1, key, size: content.length, sha256: hash(content) }],
    bytes: content.length,
    hasDatabaseContent: false,
  };
  fs.writeFileSync(path.join(set, "objects", path.basename(key)), content);
  fs.writeFileSync(
    path.join(set, "objects/manifest.json"),
    JSON.stringify(objects),
  );
  fs.writeFileSync(
    path.join(set, "database.dump"),
    "synthetic dump for archive-only checks",
  );
  const files = [
    "database.dump",
    "objects/manifest.json",
    `objects/${path.basename(key)}`,
  ].map((file) => ({
    path: file,
    size: fs.statSync(path.join(set, file)).size,
    sha256: hashFile(path.join(set, file)),
  }));
  const manifest = {
    schemaVersion: "plush.backup-set/v1",
    consistency: "app-stopped-no-other-database-clients",
    snapshotAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    backupId: `plush-set-20261017T000000Z-${randomUUID()}`,
    project: "plush-drill",
    database: "plush_drill",
    releaseSha: "a".repeat(40),
    appImageId: "b".repeat(64),
    runtimeEnvSha256: "c".repeat(64),
    migrationVersion: "20261016150000",
    attachmentRowsSha256: "d".repeat(64),
    attachmentCount: 1,
    attachmentBytes: content.length,
    files,
  };
  fs.writeFileSync(path.join(set, "manifest.json"), JSON.stringify(manifest));
  return { set, manifest, objects };
}

test("paired archive round trip preserves binary files and rejects corruption before restore", async (t) => {
  const root = fixture(t),
    { set, manifest } = setFixture(root);
  const archive = path.join(root, "set.tar");
  await packSet(set, archive);
  assert.deepEqual(
    await unpackSet(archive, path.join(root, "restored")),
    manifest,
  );
  fs.writeFileSync(path.join(set, "database.dump"), "different dump");
  assert.throws(() => validateSet(set), /checksum_mismatch/u);
});

for (const kind of ["symlink", "hardlink", "unexpected", "traversal"]) {
  test(`archive rejects ${kind} members before extraction`, async (t) => {
    const root = fixture(t),
      { set } = setFixture(root),
      archive = path.join(root, "bad.tar");
    if (kind === "symlink")
      fs.symlinkSync("/etc/passwd", path.join(set, "objects", "link"));
    if (kind === "hardlink")
      fs.linkSync(
        path.join(set, "database.dump"),
        path.join(set, "objects", "link"),
      );
    if (kind === "unexpected")
      fs.writeFileSync(path.join(set, "untracked"), "extra");
    await command([
      "tar",
      "--format=ustar",
      "-cf",
      archive,
      "-C",
      set,
      ...(kind === "unexpected"
        ? ["manifest.json", "database.dump", "objects", "untracked"]
        : ["manifest.json", "database.dump", "objects"]),
    ]);
    if (kind === "traversal") {
      // Rewrite a header with a valid checksum to exercise traversal rejection.
      const bytes = fs.readFileSync(archive);
      bytes.fill(0, 0, 100);
      bytes.write("../escape", 0);
      bytes.fill(32, 148, 156);
      const sum = bytes.subarray(0, 512).reduce((n, b) => n + b, 0);
      bytes.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
      fs.writeFileSync(archive, bytes);
    }
    await assert.rejects(
      unpackSet(archive, path.join(root, "unpacked")),
      /unsafe_archive_path|links_or_special/u,
    );
    assert.equal(fs.existsSync(path.join(root, "unpacked")), false);
  });
}

test("cipher checksum, offsite marker and distinct filesystem fail closed", (t) => {
  const root = fixture(t),
    offsite = privateDirectory(path.join(root, "offsite"));
  fs.writeFileSync(
    path.join(offsite, ".plush-toy-erp-offsite-target"),
    "plush-toy-erp-offsite-v1\n",
  );
  assert.throws(() => checkOffsite(offsite, root), /same_filesystem/u);
  const name = `plush-set-20261017T000000Z-${randomUUID()}.tar.age`,
    source = path.join(root, name);
  fs.writeFileSync(source, "encrypted fixture");
  const copied = publishCipher(source, offsite);
  assert.equal(verifyCipher(copied), hashFile(source));
  fs.writeFileSync(copied, "corrupt");
  assert.throws(() => latestSet(offsite, 36), /checksum_mismatch/u);
});

test("retention keeps seven recovery points and never removes legacy or unmanaged files", (t) => {
  const root = fixture(t),
    source = privateDirectory(path.join(root, "source")),
    dest = privateDirectory(path.join(root, "dest"));
  for (let n = 1; n <= 9; n++) {
    const name = `plush-set-2026090${n}T000000Z-${randomUUID()}.tar.age`,
      file = path.join(source, name);
    fs.writeFileSync(file, String(n));
    const published = publishCipher(file, dest);
    fs.utimesSync(published, new Date(0), new Date(0));
  }
  fs.writeFileSync(path.join(dest, "plush_erp-old.dump.age"), "legacy PG only");
  fs.writeFileSync(path.join(dest, ".incomplete.tmp"), "incomplete");
  const preview = pruneSets(dest, 7, { execute: false });
  assert.equal(
    preview.records.filter((row) => row.state === "eligible").length,
    2,
  );
  assert.equal(
    fs.readdirSync(dest).filter((f) => f.endsWith(".tar.age")).length,
    9,
  );
  assert.equal(fs.existsSync(path.join(dest, "retention-ledger.json")), false);
  pruneSets(dest, 7);
  assert.equal(
    fs.readdirSync(dest).filter((f) => f.endsWith(".tar.age")).length,
    7,
  );
  assert.equal(fs.existsSync(path.join(dest, "plush_erp-old.dump.age")), true);
  assert.equal(fs.existsSync(path.join(dest, ".incomplete.tmp")), true);
});

test("backup role rejects writes and unpinned PostgreSQL", () => {
  const valid = "erp_backup|18.6 (Debian)|180006|on|f|f|f|f|f|f|0";
  assert.doesNotThrow(() => assertBackupRole(valid));
  for (const changed of [
    valid.replace("|on|", "|off|"),
    valid.replace("180006", "180007"),
    valid.replace(/\|0$/u, "|1"),
    valid.replace("|f|", "|t|"),
  ])
    assert.throws(() => assertBackupRole(changed));
});

for (const failure of [
  "dump_failed",
  "objects_failed",
  "metadata_changed",
  "interrupted",
  "resume_failed",
]) {
  test(`backup ${failure} resumes application and cannot publish a successful set`, async (t) => {
    const root = fixture(t),
      recipient = path.join(root, "recipient.txt"),
      calls = [];
    fs.writeFileSync(recipient, "age1" + "a".repeat(58));
    let rowReads = 0;
    const factory = async () => ({
      identity: {},
      stop: async () => {
        calls.push("stop");
      },
      resume: async () => {
        calls.push("resume");
        if (failure === "resume_failed") throw Error(failure);
      },
      psql: async (sql) =>
        sql === ROWS_SQL
          ? rowReads++
            ? "changed"
            : "original"
          : sql === CONFIG_SQL
            ? "[]"
            : sql === MIGRATION_SQL
              ? "20261016150000"
              : "",
      dump: async () => {
        if (["dump_failed", "interrupted", "resume_failed"].includes(failure))
          throw Error(failure);
      },
      tool: async () => {
        if (failure === "objects_failed") throw Error(failure);
        if (failure === "metadata_changed") return;
        throw Error("unexpected");
      },
    });
    await assert.rejects(
      createSet(
        {
          backupDir: root,
          recipientFile: recipient,
          allowLocalOnly: true,
          database: "plush_drill",
        },
        { sourceFactory: factory },
      ),
    );
    assert.deepEqual(calls, ["stop", "resume"]);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "latest-set-status.json")))
        .status,
      "failed",
    );
    assert.equal(
      fs.readdirSync(root).some((f) => f.endsWith(".tar.age")),
      false,
    );
  });
}
