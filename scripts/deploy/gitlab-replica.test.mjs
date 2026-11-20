import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { loadConfig } from "./backup-replica/config.mjs";
import { atomicJSON, destination } from "./backup-replica/storage.mjs";
import {
  bundleFiles,
  bundleTime,
  gitlabIndex,
  gitlabInventoryScript,
  synchronizeGitlab,
  validateGitlabInventory,
} from "./backup-replica/gitlab-sync.mjs";
import {
  parseGitlabManifest,
  validateRuntime,
  verifyGitlab,
} from "./backup-replica/gitlab-restore.mjs";
import { command } from "./backup-replica/process.mjs";
import { checkHealth } from "./backup-replica/health.mjs";

const hash = (b) => createHash("sha256").update(b).digest("hex");
const stamp = (t) =>
  new Date(t).toISOString().replace(/[-:]/gu, "").replace(".000Z", "Z");
function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "gitlab-replica-test-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const c = {
    schemaVersion: "plush.backup-replica/v1",
    source: {
      id: "gitlab-r740xd",
      kind: "gitlab",
      transport: "ssh-directory",
      host: "fixture",
      directory: path.join(root, "source"),
    },
    destination: {
      id: "gitlab-external",
      volumeUUID: "A653F57E-6928-486B-BA15-61DB8DCFAB3A",
      relativeDirectory: "gitlab",
    },
    stateDirectory: path.join(root, "state"),
    retentionCount: 7,
    minimumFreeBytes: 1024 ** 3,
    maxSourceAgeHours: 36,
    transferTimeoutSeconds: 3600,
    restore: {
      identityFile: path.join(root, "identity"),
      host: "fixture",
      directory: "/srv/raid5/gitlab/restore-drills",
      everyDays: 30,
      timeoutSeconds: 14400,
    },
    schedule: { hour: 14, minute: 15 },
  };
  fs.writeFileSync(c.restore.identityFile, "fixture", { mode: 0o600 });
  const config = path.join(root, "config.json");
  atomicJSON(config, c);
  const mount = path.join(root, "mount");
  fs.mkdirSync(mount);
  const target = destination(c, mount, true),
    bytes = new Map();
  const clock = Math.floor(Date.now() / 1000) * 1000;
  const add = (ageHours = 1) => {
    const name = `backup-${stamp(clock - ageHours * 3600_000)}`;
    for (const file of bundleFiles)
      bytes.set(
        `${name}/${file}`,
        Buffer.from(`encrypted fixture ${name} ${file}`),
      );
    return name;
  };
  const inventory = () =>
    [...bytes].map(([name, data]) => ({
      name,
      sizeBytes: data.length,
      sha256: hash(data),
      fingerprint: `${data.length}:1:2026-10-23 00:00:00.000 +0000`,
    }));
  const source = {
    inventory: async () => inventory(),
    download: async (item, out) =>
      fs.writeFileSync(out, bytes.get(item.name), { flag: "wx", mode: 0o600 }),
  };
  const sync = (options = {}) =>
    synchronizeGitlab(c, target, source, {
      clock,
      available: () => 1024 ** 4,
      ...options,
    });
  return {
    root,
    c,
    config,
    target,
    clock,
    bytes,
    add,
    source,
    inventory,
    sync,
  };
}
test("GitLab configuration keeps its source, recovery target and count-based retention explicit", (t) => {
  const f = fixture(t);
  assert.deepEqual(loadConfig(f.config), f.c);
  atomicJSON(f.config, {
    ...f.c,
    restore: { ...f.c.restore, directory: "/srv/gitlab/data" },
  });
  assert.throws(() => loadConfig(f.config), /invalid_restore_directory/u);
});
test("copying eight available backups retains the newest seven and preserves unrelated files", async (t) => {
  const f = fixture(t);
  for (let i = 1; i <= 8; i++) f.add(i);
  fs.writeFileSync(path.join(f.target, "existing-user-record.txt"), "keep");
  const first = await f.sync();
  assert.equal(first.copiedBundles, 7);
  assert.equal(first.retainedBundles, 7);
  const old = Object.keys(gitlabIndex(f.target, f.c.source.id)).sort()[0];
  const newest = f.add(0);
  const result = await f.sync();
  assert.equal(result.retainedBundles, 7);
  assert.equal(result.expiredBundles, 1);
  assert.equal(result.latestBackup, newest);
  assert.equal(fs.existsSync(path.join(f.target, old)), false);
  assert.equal(
    fs.readFileSync(path.join(f.target, "existing-user-record.txt"), "utf8"),
    "keep",
  );
  const index = gitlabIndex(f.target, f.c.source.id);
  for (const name of [...f.bytes.keys()])
    if (!name.startsWith(newest + "/")) f.bytes.delete(name);
  await f.sync();
  assert.deepEqual(gitlabIndex(f.target, f.c.source.id), index);
});
test("space failure preserves the existing seven backups and does not begin a transfer", async (t) => {
  const f = fixture(t);
  for (let i = 1; i <= 7; i++) f.add(i);
  await f.sync();
  f.add(0);
  const before = fs.readFileSync(
    path.join(f.target, "gitlab-replica-index.json"),
  );
  let transfers = 0;
  f.source.download = async () => {
    transfers++;
  };
  await assert.rejects(
    f.sync({ available: () => f.c.minimumFreeBytes }),
    /destination_space_insufficient/u,
  );
  assert.equal(transfers, 0);
  assert.deepEqual(
    fs.readFileSync(path.join(f.target, "gitlab-replica-index.json")),
    before,
  );
});
test("an interrupted or corrupt copy never prunes old backups or publishes an incomplete bundle", async (t) => {
  const f = fixture(t);
  for (let i = 1; i <= 7; i++) f.add(i);
  await f.sync();
  const latest = f.add(0);
  const before = fs.readFileSync(
    path.join(f.target, "gitlab-replica-index.json"),
  );
  f.source.download = async (item, out) =>
    fs.writeFileSync(
      out,
      item.name.endsWith("repository.tar.age")
        ? "damaged"
        : f.bytes.get(item.name),
    );
  await assert.rejects(f.sync(), /transfer_checksum_mismatch/u);
  assert.equal(fs.existsSync(path.join(f.target, latest)), false);
  assert.deepEqual(
    fs.readFileSync(path.join(f.target, "gitlab-replica-index.json")),
    before,
  );
  assert.equal(
    fs.readdirSync(f.target).some((n) => n.startsWith(".incoming-")),
    false,
  );
});
test("a remounted target stops copying before any retention cleanup", async (t) => {
  const f = fixture(t);
  f.add();
  await assert.rejects(
    f.sync({
      ensureTarget: () => {
        throw new Error("volume_identity_mismatch");
      },
    }),
    /volume_identity_mismatch/u,
  );
  assert.deepEqual(gitlabIndex(f.target, f.c.source.id), {});
});
test("corrupt old bundles with unknown content are preserved for investigation", async (t) => {
  const f = fixture(t);
  for (let i = 1; i <= 7; i++) f.add(i);
  await f.sync();
  const oldest = Object.keys(gitlabIndex(f.target, f.c.source.id)).sort()[0];
  fs.writeFileSync(path.join(f.target, oldest, "unique.txt"), "keep");
  f.add(0);
  await assert.rejects(f.sync(), /gitlab_bundle_inventory_mismatch/u);
  assert.equal(
    fs.readFileSync(path.join(f.target, oldest, "unique.txt"), "utf8"),
    "keep",
  );
});
test("inventory validation rejects traversal, duplicate files, incomplete sets and invalid dates", (t) => {
  const f = fixture(t);
  f.add();
  const rows = f.inventory();
  validateGitlabInventory(rows);
  assert.throws(
    () => validateGitlabInventory([...rows, rows[0]]),
    /invalid_gitlab_inventory_name/u,
  );
  assert.throws(
    () => validateGitlabInventory(rows.slice(1)),
    /incomplete_gitlab_bundle/u,
  );
  assert.throws(
    () =>
      validateGitlabInventory([{ ...rows[0], name: "../repository.tar.age" }]),
    /invalid_gitlab_bundle_name/u,
  );
  assert.throws(
    () => bundleTime("backup-20260231T000000Z"),
    /invalid_gitlab_bundle_date/u,
  );
});
test("manifest and image identity cannot be substituted by another backup or arbitrary software", () => {
  const manifest = `schemaVersion=plush.gitlab-offsite-backup/v1\nstatus=passed\nbackupId=gitlab-20261023T000000Z\ncompletedAt=2026-10-23T01:00:00Z\nrepositorySha256=${"a".repeat(64)}\nrepositorySizeBytes=100\nconfigSha256=${"b".repeat(64)}\nconfigSizeBytes=10\n`;
  assert.equal(
    parseGitlabManifest(manifest, "backup-20261023T000000Z")
      .repositorySizeBytes,
    "100",
  );
  assert.throws(
    () => parseGitlabManifest(manifest, "backup-20261022T000000Z"),
    /gitlab_manifest_identity_mismatch/u,
  );
  assert.throws(
    () =>
      parseGitlabManifest(
        manifest + "status=passed\n",
        "backup-20261023T000000Z",
      ),
    /invalid_gitlab_manifest/u,
  );
  assert.throws(
    () =>
      validateRuntime({
        schemaVersion: "plush.gitlab-backup-runtime/v1",
        image: "unknown/image:latest",
        version: "19.3.6",
        hostname: "gitlab.saurick.me",
      }),
    /invalid_gitlab_restore_runtime/u,
  );
});
test("large archive transfer streams its input without loading it into the command output buffer", async (t) => {
  const f = fixture(t),
    input = path.join(f.root, "large.tar"),
    output = path.join(f.root, "copy.tar");
  fs.writeFileSync(input, Buffer.alloc(3 * 1024 ** 2, 83));
  const fd = fs.openSync(output, "wx", 0o600);
  try {
    await command(["cat"], { inputFile: input, output: fd });
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(hash(fs.readFileSync(output)), hash(fs.readFileSync(input)));
});

test("the real inventory shell reads only complete packages from the registered source", async (t) => {
  const f = fixture(t),
    name = f.add();
  fs.mkdirSync(path.join(f.c.source.directory, name), { recursive: true });
  fs.writeFileSync(
    path.join(f.c.source.directory, ".plush-backup-source"),
    `plush.backup-source/v1:${f.c.source.id}\n`,
  );
  for (const [file, bytes] of f.bytes)
    fs.writeFileSync(path.join(f.c.source.directory, file), bytes);
  const checksum = path.join(f.c.source.directory, name, "encrypted.sha256");
  fs.writeFileSync(
    checksum,
    f
      .inventory()
      .map((i) => `${i.sha256}  ${path.basename(i.name)}\n`)
      .join(""),
  );
  const output = (
    await command(["sh"], { input: gitlabInventoryScript(f.c) })
  ).toString();
  assert.equal(output.trim().split("\n").length, 5);
  assert.match(output, /plush.gitlab-replica-inventory\/v1/u);
  fs.writeFileSync(checksum, "corrupt\n");
  await assert.rejects(
    command(["sh"], { input: gitlabInventoryScript(f.c) }),
    /command_failed/u,
  );
});

test("deployment health uses the current external bundle and a restore receipt for the same volume", async (t) => {
  const f = fixture(t);
  f.add();
  const sync = await f.sync();
  fs.mkdirSync(f.c.stateDirectory);
  const identity = { ...sync, checkedAt: new Date(f.clock).toISOString() };
  for (const name of [
    "latest-operation.json",
    "latest-sync.json",
    "latest-restore.json",
  ])
    atomicJSON(path.join(f.c.stateDirectory, name), identity);
  assert.equal(checkHealth(f.c, f.target, { clock: f.clock }).status, "passed");
  atomicJSON(path.join(f.c.stateDirectory, "latest-restore.json"), {
    ...identity,
    volumeUUID: "00000000-0000-0000-0000-000000000000",
  });
  assert.throws(
    () => checkHealth(f.c, f.target, { clock: f.clock }),
    /backup_receipt_identity_mismatch/u,
  );
});

test("decryption failure uses a private state directory and removes temporary plaintext", async (t) => {
  const f = fixture(t);
  f.add();
  await f.sync();
  let entered = false;
  await assert.rejects(
    verifyGitlab(f.c, f.target, f.c.stateDirectory, {
      run: async (args) => {
        entered = true;
        assert.equal(args[0], "age");
        const file = args[args.indexOf("--output") + 1];
        assert.ok(
          file.startsWith(
            path.join(f.c.stateDirectory, "restore-tmp") + path.sep,
          ),
        );
        fs.writeFileSync(file, "partial plaintext", { mode: 0o600 });
        throw new Error("decryption_failed");
      },
    }),
    /decryption_failed/u,
  );
  assert.equal(entered, true);
  assert.deepEqual(
    fs.readdirSync(path.join(f.c.stateDirectory, "restore-tmp")),
    [],
  );
});

test("native restored-data validation fails before completion when GitLab reports a failed check", (t) => {
  const f = fixture(t);
  const source = fs.readFileSync(
    new URL("./backup-replica/gitlab-restore.sh", import.meta.url),
    "utf8",
  );
  const checks = source.slice(source.indexOf("stage=validate_restored_data\n"));
  assert.ok(checks.startsWith("stage=validate_restored_data\n"));
  const healthy = [
    "All migrations up? ... yes",
    "Total: 0 row(s) affected",
    "Database contains orphaned GroupMembers? ... no",
    "",
  ].join("\n");
  for (const [name, output, expected] of [
    ["healthy", healthy, 0],
    ["migration pending", healthy + "  down 20261023000000\n", 1],
    ["secrets failure", healthy + "failures: 1\n", 1],
    ["service check failed", healthy + "Redis available? ... no\n", 1],
    ["missing native summary", "incomplete check output\n", 1],
  ]) {
    const receipt = path.join(f.root, "native-check-receipt");
    fs.rmSync(receipt + ".check.log", { force: true });
    const result = spawnSync(
      "bash",
      [
        "-c",
        `set -euo pipefail
docker() {
  case "$*" in
    *gitlab-rake*) printf '%s' "$CHECK_OUTPUT" ;;
    *gitlab-rails*) printf '{}\\n' ;;
  esac
}
wait_ready() { return 0; }
${checks}`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          root: f.root,
          receipt,
          name: "isolated-fixture",
          CHECK_OUTPUT: output,
        },
      },
    );
    assert.equal(result.status, expected, name);
    assert.equal(fs.existsSync(receipt + ".check.log"), expected === 0, name);
  }
});
