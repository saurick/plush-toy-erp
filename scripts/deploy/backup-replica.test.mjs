import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import {
  loadConfig,
  ReplicaError,
  resolveVolume,
} from "./backup-replica/config.mjs";
import {
  atomicJSON,
  destination,
  digest,
  privateDirectory,
} from "./backup-replica/storage.mjs";
import { backupTime, synchronize } from "./backup-replica/sync.mjs";
import {
  inventoryScript,
  parseInventory,
  quote,
  SSHSource,
  validateInventory,
} from "./backup-replica/transport.mjs";
import { restoreDue, lockArguments } from "./backup-replica/cli.mjs";
import { requireIdleAgent, agentValue } from "./backup-replica/install.mjs";
import { verifyRestore } from "./backup-replica/restore.mjs";
import { command } from "./backup-replica/process.mjs";

const stamp = (value) =>
  new Date(value)
    .toISOString()
    .replaceAll(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
const hash = (value) => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "backup-replica-test-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = JSON.parse(
    fs.readFileSync(
      new URL(
        "../../deployments/yoyoosun/env/backup-replica.example.json",
        import.meta.url,
      ),
    ),
  );
  config.source.directory = path.join(root, "source");
  config.stateDirectory = path.join(root, "state");
  config.restore.identityFile = path.join(root, "identity");
  fs.writeFileSync(config.restore.identityFile, "fixture", { mode: 0o600 });
  const file = path.join(root, "config.json");
  atomicJSON(file, config);
  const mount = path.join(root, "mount");
  fs.mkdirSync(mount);
  const target = destination(config, mount, true);
  fs.mkdirSync(config.source.directory);
  const clock = Date.now();
  const files = new Map();
  const add = (time = clock - 60_000, suffix = "42") => {
    const name = `plush_erp-${stamp(time)}-${suffix}.dump.age`,
      bytes = Buffer.from("encrypted fixture " + name);
    files.set(name, bytes);
    return name;
  };
  const name = add();
  const source = {
    async inventory() {
      return [...files].map(([name, bytes]) => ({
        name,
        sizeBytes: bytes.length,
        sha256: hash(bytes),
        fingerprint: `${bytes.length}:1:2026-10-17 00:00:00.000 +0000`,
      }));
    },
    async download(item, output) {
      fs.writeFileSync(output, files.get(item.name), {
        flag: "wx",
        mode: 0o600,
      });
    },
  };
  return {
    root,
    config,
    file,
    mount,
    target,
    clock,
    files,
    name,
    add,
    source,
    sync: () => synchronize(config, target, source, { clock }),
  };
}

test("private closed configuration rejects unexpected fields", (t) => {
  const f = fixture(t);
  assert.deepEqual(loadConfig(f.file), f.config);
  atomicJSON(f.file, { ...f.config, password: "invalid" });
  assert.throws(() => loadConfig(f.file), /invalid_config_fields/u);
});
test("private configuration rejects permissive files and symlinks", (t) => {
  const f = fixture(t);
  fs.chmodSync(f.file, 0o644);
  assert.throws(() => loadConfig(f.file), /unsafe_private_file/u);
  fs.chmodSync(f.file, 0o600);
  const link = path.join(f.root, "link");
  fs.symlinkSync(f.file, link);
  assert.throws(() => loadConfig(link), /unsafe_private_file/u);
});
test("SSH source alias cannot introduce commands or options", (t) => {
  const f = fixture(t);
  for (const host of ["-oProxyCommand=bad", "host;bad", "host name", 123]) {
    atomicJSON(f.file, { ...f.config, source: { ...f.config.source, host } });
    assert.throws(() => loadConfig(f.file), /invalid_ssh_alias/u);
  }
});
test("destination paths cannot escape the mounted volume", (t) => {
  const f = fixture(t);
  for (const relativeDirectory of [
    "../outside",
    "/outside",
    "a/../outside",
    "a//b",
  ]) {
    atomicJSON(f.file, {
      ...f.config,
      destination: { ...f.config.destination, relativeDirectory },
    });
    assert.throws(() => loadConfig(f.file), /invalid_relative_directory/u);
  }
});
test("missing volume is a distinct pre-write outcome", (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      resolveVolume(f.config, () => {
        throw new Error("missing");
      }),
    /volume_not_mounted/u,
  );
});
test("internal and mismatched volumes fail closed", (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      resolveVolume(f.config, () => ({
        VolumeUUID: f.config.destination.volumeUUID,
        Internal: true,
        Writable: true,
      })),
    /volume_not_external_writable/u,
  );
  assert.throws(
    () =>
      resolveVolume(f.config, () => ({
        VolumeUUID: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      })),
    /volume_identity_mismatch/u,
  );
});
test("unknown nonempty directories remain intact", (t) => {
  const f = fixture(t);
  const c = structuredClone(f.config);
  c.destination.relativeDirectory = "personal";
  fs.mkdirSync(path.join(f.mount, "personal"));
  fs.writeFileSync(path.join(f.mount, "personal/keep"), "unique");
  assert.throws(
    () => destination(c, f.mount, true),
    /unowned_destination_not_empty/u,
  );
  assert.equal(
    fs.readFileSync(path.join(f.mount, "personal/keep"), "utf8"),
    "unique",
  );
});
test("destination and state paths reject symlink ancestors", (t) => {
  const f = fixture(t);
  fs.symlinkSync(f.config.source.directory, path.join(f.mount, "shortcut"));
  const c = structuredClone(f.config);
  c.destination.relativeDirectory = "shortcut";
  assert.throws(() => destination(c, f.mount, true), /unsafe_directory/u);
  assert.throws(
    () => privateDirectory(path.join(f.mount, "shortcut/child")),
    /unsafe_directory/u,
  );
});
test("destination source identity must match", (t) => {
  const f = fixture(t);
  const c = structuredClone(f.config);
  c.source.id = "other-source";
  assert.throws(() => destination(c, f.mount), /destination_marker_mismatch/u);
});
test("inventory binds source and rejects duplicate or unsafe names", async (t) => {
  const f = fixture(t),
    files = await f.source.inventory();
  assert.throws(
    () => parseInventory("wrong\n", f.config.source.id),
    /inventory_identity_mismatch/u,
  );
  assert.throws(
    () => validateInventory([...files, ...files]),
    /unsafe_inventory_name/u,
  );
  for (const name of ["../file.age", "/file.age", "file.dump", 42])
    assert.throws(
      () => validateInventory([{ ...files[0], name }]),
      /unsafe_inventory_name/u,
    );
});
test("inventory validates digest and bounded file size", async (t) => {
  const f = fixture(t),
    files = await f.source.inventory();
  for (const patch of [
    { sha256: "bad" },
    { sizeBytes: -1 },
    { sizeBytes: 2 ** 54 },
    { fingerprint: "bad\ncommand" },
  ])
    assert.throws(() => validateInventory([{ ...files[0], ...patch }]));
});
test("SSH quoting preserves literal shell metacharacters", () => {
  const value = "directory ' $HOME $(false) ; literal";
  const result = spawnSync("sh", ["-c", `printf '%s' ${quote(value)}`], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, value);
});
test("sync replays without copying an existing verified file", async (t) => {
  const f = fixture(t);
  assert.equal((await f.sync()).copiedFiles, 1);
  assert.equal((await f.sync()).copiedFiles, 0);
  assert.equal(
    await digest(path.join(f.target, f.name)),
    hash(f.files.get(f.name)),
  );
});
test("source deletion never propagates to retained history", async (t) => {
  const f = fixture(t),
    old = f.add(f.clock - 86400_000, "41");
  await f.sync();
  f.files.delete(old);
  assert.equal((await f.sync()).retainedFiles, 2);
  assert.ok(fs.existsSync(path.join(f.target, old)));
});
test("retention expires only owned database copies", async (t) => {
  const f = fixture(t),
    old = f.add(f.clock - 120 * 86400_000, "40");
  fs.writeFileSync(path.join(f.target, "personal.txt"), "keep");
  const result = await f.sync();
  assert.equal(result.expiredFiles, 1);
  assert.ok(!fs.existsSync(path.join(f.target, old)));
  assert.equal(
    fs.readFileSync(path.join(f.target, "personal.txt"), "utf8"),
    "keep",
  );
  assert.equal((await f.sync()).retainedFiles, 1);
});
test("corrupt incoming files cannot become committed replicas", async (t) => {
  const f = fixture(t);
  f.source.download = async (_, file) => fs.writeFileSync(file, "corrupt");
  await assert.rejects(f.sync, /transfer_checksum_mismatch/u);
  assert.ok(!fs.existsSync(path.join(f.target, f.name)));
  assert.ok(!fs.readdirSync(f.target).some((x) => x.startsWith(".incoming-")));
});
test("existing corrupt data is preserved and reported", async (t) => {
  const f = fixture(t);
  await f.sync();
  fs.writeFileSync(path.join(f.target, f.name), "unique corrupt data");
  await assert.rejects(f.sync, /replica_checksum_mismatch/u);
  assert.equal(
    fs.readFileSync(path.join(f.target, f.name), "utf8"),
    "unique corrupt data",
  );
});
test("stale source never becomes a successful sync", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    synchronize(f.config, f.target, f.source, {
      clock: f.clock + 4 * 86400_000,
    }),
    /source_backup_stale/u,
  );
});
test("new volume cannot reuse a previous restore proof", (t) => {
  const f = fixture(t),
    proof = {
      status: "passed",
      sourceId: f.config.source.id,
      destinationId: f.config.destination.id,
      volumeUUID: f.config.destination.volumeUUID,
      checkedAt: new Date().toISOString(),
    };
  assert.equal(restoreDue(f.config, proof), false);
  assert.equal(restoreDue(f.config, { ...proof, volumeUUID: "other" }), true);
  assert.equal(restoreDue(f.config, { ...proof, status: "failed" }), true);
  assert.equal(restoreDue(f.config, null), true);
});
test("installer never interrupts an active backup", () => {
  requireIdleAgent("state = not running\nlast exit code = 0\nstate = active");
  for (const output of ["state = running", "state = waiting\n pid = 234"])
    assert.throws(() => requireIdleAgent(output), /backup_job_running/u);
});
test("agent separates calendar, mounting and runtime configuration", (t) => {
  const f = fixture(t),
    value = agentValue(f.config, f.file, "/runtime/frozen", "/logs");
  assert.deepEqual(value.StartCalendarInterval, { Hour: 11, Minute: 15 });
  assert.equal(value.StartOnMount, true);
  assert.deepEqual(value.ProgramArguments.slice(1), [
    "/runtime/frozen/cli.mjs",
    "run",
    "--config",
    f.file,
  ]);
  assert.equal(value.KeepAlive, undefined);
});
test("OS kernel lock excludes a second process and releases on exit", async (t) => {
  const f = fixture(t),
    state = privateDirectory(path.join(f.root, "lock-state")),
    script = path.join(f.root, "worker.mjs");
  fs.writeFileSync(
    script,
    "console.log(process.pid);process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)",
  );
  const args = lockArguments(state, script, "run", f.file),
    first = spawn(args[0], args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
  const pid = await new Promise((resolve) =>
    first.stdout.once("data", (x) => resolve(Number(x.toString()))),
  );
  try {
    assert.notEqual(
      spawnSync(args[0], args.slice(1), { timeout: 3000 }).status,
      0,
    );
  } finally {
    process.kill(pid, "SIGTERM");
    await new Promise((resolve) => first.once("exit", resolve));
  }
  const utility =
    process.platform === "darwin"
      ? [
          "/usr/bin/lockf",
          "-s",
          "-t",
          "0",
          "-k",
          path.join(state, "replica.lock"),
          "true",
        ]
      : ["flock", "-n", path.join(state, "replica.lock"), "true"];
  assert.equal(spawnSync(utility[0], utility.slice(1)).status, 0);
});
test("restore failure cleans plaintext and removes owned anonymous volumes", async (t) => {
  const f = fixture(t);
  await f.sync();
  privateDirectory(f.config.stateDirectory);
  const calls = [];
  let present = false;
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "age")
      fs.writeFileSync(args[args.indexOf("--output") + 1], "decrypted");
    if (args[1] === "run") present = true;
    if (args[1] === "inspect")
      return Buffer.from(
        JSON.stringify([{ Type: "volume", Name: "a".repeat(64) }]),
      );
    if (args.includes("pg_restore"))
      throw new ReplicaError("restore_command_failed");
    if (args[1] === "rm") present = false;
    return Buffer.from(args[1] === "ps" && present ? "container" : "");
  };
  await assert.rejects(
    verifyRestore(f.config, f.target, f.config.stateDirectory, { run }),
    /restore_command_failed/u,
  );
  assert.ok(
    calls.some((args) => args.slice(1, 4).join(" ") === "rm --force --volumes"),
  );
  assert.deepEqual(
    fs.readdirSync(path.join(f.config.stateDirectory, "restore-tmp")),
    [],
  );
  assert.ok(
    !fs.existsSync(path.join(f.config.stateDirectory, "latest-restore.json")),
  );
});

async function shellSource(t) {
  const f = fixture(t),
    bin = path.join(f.root, "bin");
  fs.mkdirSync(bin);
  const script = `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');const kind=path.basename(process.argv[1]),file=process.argv.at(-1);if(kind==='stat'){const s=fs.statSync(file),m=process.argv[process.argv.indexOf('-c')+1];console.log(m==='%s'?s.size:s.size+':'+s.ino+':'+s.mtime.toISOString().replace('T',' ').replace('Z',' +0000'));}else if(kind==='realpath'){console.log(fs.realpathSync(file));}else{console.log(createHash('sha256').update(fs.readFileSync(file)).digest('hex')+'  '+file);}`;
  for (const name of ["stat", "realpath", "sha256sum"])
    fs.writeFileSync(path.join(bin, name), script, { mode: 0o700 });
  fs.writeFileSync(
    path.join(f.config.source.directory, ".plush-backup-source"),
    `plush.backup-source/v1:${f.config.source.id}\n`,
  );
  const bytes = f.files.get(f.name);
  fs.writeFileSync(path.join(f.config.source.directory, f.name), bytes);
  fs.writeFileSync(
    path.join(
      f.config.source.directory,
      f.name.replace(".dump.age", ".sha256"),
    ),
    `${hash(bytes)}  ${f.name}\n`,
  );
  return {
    ...f,
    invoke: (script) =>
      command(["sh", "-s"], {
        input: script,
        env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
      }),
  };
}
test("remote shell inventory ignores incomplete database pairs", async (t) => {
  const f = await shellSource(t);
  fs.writeFileSync(
    path.join(
      f.config.source.directory,
      `plush_erp-${stamp(f.clock)}-99.dump.age`,
    ),
    "in flight",
  );
  const files = parseInventory(
    (await f.invoke(inventoryScript(f.config))).toString(),
    f.config.source.id,
  );
  assert.equal(files.length, 1);
  assert.equal(files[0].name, f.name);
});
test("remote shell rejects wrong checksum filenames and symlinks", async (t) => {
  const f = await shellSource(t),
    checksum = path.join(
      f.config.source.directory,
      f.name.replace(".dump.age", ".sha256"),
    );
  fs.writeFileSync(checksum, "a".repeat(64) + "  ../secret\n");
  await assert.rejects(f.invoke(inventoryScript(f.config)));
  fs.unlinkSync(checksum);
  fs.symlinkSync(f.config.restore.identityFile, checksum);
  await assert.rejects(f.invoke(inventoryScript(f.config)));
});
test("remote source identity marker is mandatory", async (t) => {
  const f = await shellSource(t);
  fs.writeFileSync(
    path.join(f.config.source.directory, ".plush-backup-source"),
    "wrong",
  );
  await assert.rejects(f.invoke(inventoryScript(f.config)));
});
test("SSH connection does not forward an agent or configured ports", (t) => {
  const f = fixture(t),
    args = new SSHSource(f.config).args();
  assert.ok(args.includes("-oForwardAgent=no"));
  assert.ok(args.includes("-oClearAllForwardings=yes"));
  assert.ok(args.includes("-oStrictHostKeyChecking=yes"));
});
test("backup timestamps preserve canonical UTC identity", () => {
  assert.equal(
    backupTime("plush_erp-20261017T100000Z-42.dump.age"),
    Date.UTC(2026, 9, 17, 10),
  );
  assert.throws(() => backupTime("unsafe"), /invalid_backup_name/u);
});
