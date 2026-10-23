import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  planRetention,
  readRetentionLedger,
  saveRetentionLedger,
} from "./backup-replica/retention.mjs";
import { rotateScheduled, rotateFiles } from "./retention-files.mjs";
import {
  rotateGitlabArtifacts,
  gitlabExportItems,
} from "./retention-server.mjs";

function temporary(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "retention-policy-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
const date = (i) => `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`;

test("GitLab encrypted exports include the checksums.sha256.age recovery member", async (t) => {
  const root = temporary(t),
    id = "backup-20261023T103251Z",
    directory = path.join(root, id);
  fs.mkdirSync(directory);
  const names = [
    "checksums.sha256.age",
    "config.tar.gz.age",
    "manifest.env.age",
    "repository.tar.age",
  ];
  for (const name of names) fs.writeFileSync(path.join(directory, name), name);
  fs.writeFileSync(
    path.join(directory, "encrypted.sha256"),
    names.map((name) => `${hash(name)}  ${name}\n`).join(""),
  );
  const items = await gitlabExportItems(root);
  assert.equal(items[0].valid, true);
  assert.equal(items[0].files.length, 5);
  await rotateFiles(root, "gitlab-export", items, { execute: true });
  assert.equal(
    readRetentionLedger(root, "gitlab-export").records[id].state,
    "retained",
  );
  const ledger = readRetentionLedger(root, "gitlab-export");
  ledger.records[id].state = "cleaning";
  saveRetentionLedger(root, ledger);
  fs.unlinkSync(path.join(directory, "encrypted.sha256"));
  assert.deepEqual(await gitlabExportItems(root), []);
});

test("seven complete copies plus active and upgrade recovery points; failed replacements consume no slot", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    createdAt: date(i),
    valid: i !== 11,
    reasons: i === 0 ? ["当前运行"] : i === 1 ? ["升级前恢复点"] : [],
  }));
  const plan = planRetention(items);
  assert.equal(plan.filter((x) => x.state === "retained").length, 7);
  assert.deepEqual(
    plan.filter((x) => x.state === "eligible").map((x) => x.id),
    ["3", "2"],
  );
  assert.equal(plan.find((x) => x.id === "11").state, "unverified");
  assert.equal(plan.find((x) => x.id === "0").state, "protected");
});

test("actual file rotation retains checksums and deletion history across reruns and independent environments", async (t) => {
  const root = temporary(t),
    other = temporary(t);
  const names = [];
  for (let i = 0; i < 10; i++) {
    const name = `plush_erp-202610${String(i + 1).padStart(2, "0")}T000000Z-1.dump`;
    const content = `backup ${i}`;
    names.push(name);
    fs.writeFileSync(path.join(root, name), content);
    fs.utimesSync(path.join(root, name), new Date(date(i)), new Date(date(i)));
    fs.writeFileSync(
      path.join(root, name.replace(".dump", ".sha256")),
      `${hash(content)}  ${name}\n`,
    );
  }
  fs.writeFileSync(
    path.join(root, "retention-protection.json"),
    JSON.stringify({
      schemaVersion: "plush.retention-protection/v1",
      protected: { [names[0]]: ["升级前恢复点"] },
    }),
  );
  fs.writeFileSync(path.join(root, "original-record.json"), "original");
  fs.writeFileSync(path.join(other, names[1]), "other environment");
  const preview = await rotateScheduled(root);
  assert.equal(preview.records.filter((x) => x.state === "eligible").length, 2);
  assert.equal(
    fs.readdirSync(root).filter((x) => x.endsWith(".dump")).length,
    10,
  );
  await rotateScheduled(root, { execute: true });
  assert.equal(
    fs.readdirSync(root).filter((x) => x.endsWith(".dump")).length,
    8,
  );
  const ledger = readRetentionLedger(root, "scheduled-database");
  assert.equal(Object.keys(ledger.records).length, 10);
  assert.equal(ledger.records[names[1]].state, "cleaned");
  assert.ok(ledger.records[names[1]].cleanedAt);
  const repeated = await rotateScheduled(root, { execute: true });
  assert.equal(repeated.records.length, 10);
  assert.equal(
    fs.readFileSync(path.join(root, "original-record.json"), "utf8"),
    "original",
  );
  assert.equal(
    fs.readFileSync(path.join(other, names[1]), "utf8"),
    "other environment",
  );
});

test("the installed current symlink executes file rotation instead of silently skipping its CLI", (t) => {
  const root = temporary(t),
    link = path.join(root, "retention-current.mjs");
  fs.symlinkSync(
    fileURLToPath(new URL("./retention-files.mjs", import.meta.url)),
    link,
  );
  const output = execFileSync(
    process.execPath,
    [link, "scheduled", root, "--execute"],
    { encoding: "utf8" },
  );
  assert.equal(JSON.parse(output).status, "passed");
  assert.ok(fs.existsSync(path.join(root, "retention-last-run.json")));
});

test("checksum mismatch blocks all deletion and symbolic links never enter cleanup", async (t) => {
  const root = temporary(t),
    items = [];
  for (let i = 0; i < 9; i++) {
    fs.writeFileSync(path.join(root, String(i)), `backup-${i}`);
    items.push({
      id: String(i),
      createdAt: date(i),
      valid: true,
      reasons: [],
      files: [{ name: String(i), sizeBytes: 8, sha256: hash(`backup-${i}`) }],
    });
  }
  fs.writeFileSync(path.join(root, "8"), "broken-8");
  await assert.rejects(
    rotateFiles(root, "test", items, { execute: true }),
    /retention_file_changed/u,
  );
  assert.equal(fs.readdirSync(root).length, 9);
  fs.unlinkSync(path.join(root, "8"));
  fs.symlinkSync(path.join(root, "7"), path.join(root, "8"));
  await assert.rejects(
    rotateFiles(root, "test", items, { execute: true }),
    /unsafe_retention_file/u,
  );
  assert.ok(fs.existsSync(path.join(root, "0")));
});

test("an interrupted cleanup resumes only after replacement verification and rechecks new protection", async (t) => {
  const root = temporary(t),
    items = [];
  for (let i = 0; i < 8; i++) {
    const name = String(i),
      content = `data-${i}`;
    fs.writeFileSync(path.join(root, name), content);
    items.push({
      id: name,
      createdAt: date(i),
      valid: true,
      reasons: [],
      files: [{ name, sizeBytes: content.length, sha256: hash(content) }],
    });
  }
  const interrupted = { ...items[0], state: "cleaning" };
  saveRetentionLedger(root, {
    schemaVersion: "plush.retention-ledger/v1",
    sourceId: "test",
    records: { 0: interrupted },
  });
  await assert.rejects(
    rotateFiles(root, "test", items, {
      execute: true,
      protection: { 0: ["new recovery point"] },
    }),
    /pending_cleanup_protection_changed/u,
  );
  assert.ok(fs.existsSync(path.join(root, "0")));
  fs.unlinkSync(path.join(root, "0"));
  await rotateFiles(root, "test", items.slice(1), { execute: true });
  assert.equal(readRetentionLedger(root, "test").records[0].state, "cleaned");
  assert.ok(fs.existsSync(path.join(root, "7")));
  saveRetentionLedger(root, {
    schemaVersion: "plush.retention-ledger/v1",
    sourceId: "test",
    records: {
      bad: { ...interrupted, id: "bad", files: [{ name: "../outside" }] },
    },
  });
  await assert.rejects(
    rotateFiles(root, "test", items.slice(1), { execute: true }),
    /unsafe_retention_path/u,
  );
});

test("GitLab deletes only payload files; releases, tags, CI and deployment evidence remain", async (t) => {
  const state = temporary(t),
    releases = [],
    packages = [],
    files = new Map(),
    calls = [];
  for (let i = 0; i < 10; i++) {
    const sha = i.toString(16).repeat(40),
      tag = `artifact-${sha}`;
    releases.push({
      tag_name: tag,
      commit: { id: sha },
      name: `2026.10.${i + 1}`,
      released_at: date(i),
    });
    packages.push({
      id: i + 1,
      name: "plush-release",
      version: tag,
      status: "default",
    });
    files.set(
      i + 1,
      [
        "checksums.sha256",
        "release-artifact.json",
        "release-manifest.json",
        "release-rehearsal.json",
        "sbom.cdx.json",
        "server-image.tar",
        "web-image.tar",
      ].map((name, j) => ({
        id: i * 10 + j + 1,
        file_name: name,
        size: 100,
        file_sha256: "a".repeat(64),
      })),
    );
  }
  const request = async (url, options) => {
    const u = new URL(url),
      endpoint = u.pathname.replace("/api/v4/projects/1", "");
    calls.push([options.method, endpoint]);
    if (endpoint === "/pipelines") return { ok: true, json: async () => [] };
    if (endpoint === "/releases")
      return { ok: true, json: async () => releases };
    if (endpoint === "/packages")
      return { ok: true, json: async () => packages };
    const m = /^\/packages\/(\d+)\/package_files(?:\/(\d+))?$/u.exec(endpoint);
    assert.ok(m, `unexpected endpoint ${endpoint}`);
    const id = Number(m[1]);
    if (options.method === "DELETE")
      files.set(
        id,
        files.get(id).filter((x) => x.id !== Number(m[2])),
      );
    return { ok: true, json: async () => files.get(id) };
  };
  const result = await rotateGitlabArtifacts(
    new Map([["0".repeat(40), ["当前运行"]]]),
    { state, execute: true, request, token: "test" },
  );
  assert.equal(result.filter((x) => x.state === "cleaned").length, 2);
  assert.equal(calls.filter(([m]) => m === "DELETE").length, 4);
  assert.equal(releases.length, 10);
  assert.equal(files.get(2).length, 5);
  assert.equal(files.get(1).length, 7);
  const repeated = await rotateGitlabArtifacts(
    new Map([["0".repeat(40), ["当前运行"]]]),
    { state, execute: true, request, token: "test" },
  );
  assert.equal(repeated.length, 10);
  assert.equal(calls.filter(([m]) => m === "DELETE").length, 4);
});
