import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildImageDigestsEvidence,
  writeImageDigestsEvidence,
} from "./image-digests-evidence.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "scripts/deploy/image-digests-evidence.mjs");
const SERVER_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WEB_DIGEST = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function runScript(args = []) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validOptions(overrides = {}) {
  return {
    serverImage: "registry.example.invalid/plush/server:20260629T1200",
    serverDigest: SERVER_DIGEST,
    webImage: "registry.example.invalid/plush/web:20260629T1200",
    webDigest: WEB_DIGEST,
    ...overrides,
  };
}

function writeReleaseEvidence(dir, { serverDigest = SERVER_DIGEST, webDigest = WEB_DIGEST } = {}) {
  fs.writeFileSync(
    path.join(dir, "release-evidence.md"),
    `# Release Evidence

| 字段 | 值 |
| --- | --- |
| serverImageDigest | ${serverDigest} |
| webImageDigest | ${webDigest} |
`,
  );
}

test("image digests evidence help is runnable", () => {
  const result = runScript(["--help"]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /--server-image <ref>/);
  assert.match(result.stdout, /does not build images/);
});

test("buildImageDigestsEvidence validates digest shape", () => {
  assert.throws(
    () => buildImageDigestsEvidence(validOptions({ serverDigest: "server:latest", out: "image-digests.txt" })),
    /--server-digest must be sha256:<64-hex>/,
  );
});

test("buildImageDigestsEvidence rejects image refs with credentials or whitespace", () => {
  assert.throws(
    () =>
      buildImageDigestsEvidence(validOptions({
        serverImage: "https://deploy:secret@registry.example.invalid/plush/server:20260629T1200",
        out: "image-digests.txt",
      })),
    /--server-image must not contain URL credentials/,
  );
  assert.throws(
    () =>
      buildImageDigestsEvidence(validOptions({
        webImage: "registry.example.invalid/plush/web:20260629T1200\nMALICIOUS=value",
        out: "image-digests.txt",
      })),
    /--web-image must not contain whitespace/,
  );
});

test("writeImageDigestsEvidence writes release-gate compatible key values", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-digests-evidence-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-29");
  fs.mkdirSync(evidenceDir, { recursive: true });
  writeReleaseEvidence(evidenceDir);

  const result = await writeImageDigestsEvidence(validOptions({
    evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
  }), { repoRoot: root });

  assert.equal(result.outputPath, path.join(evidenceDir, "image-digests.txt"));
  assert.equal(fs.readFileSync(result.outputPath, "utf8"), [
    "serverImage=registry.example.invalid/plush/server:20260629T1200",
    `serverImageDigest=${SERVER_DIGEST}`,
    "webImage=registry.example.invalid/plush/web:20260629T1200",
    `webImageDigest=${WEB_DIGEST}`,
    "",
  ].join("\n"));
});

test("writeImageDigestsEvidence rejects mismatch with filled release evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-digests-evidence-mismatch-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-29");
  fs.mkdirSync(evidenceDir, { recursive: true });
  writeReleaseEvidence(evidenceDir, {
    serverDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  });

  await assert.rejects(
    () => writeImageDigestsEvidence(validOptions({
      evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
    }), { repoRoot: root }),
    /server digest must match release-evidence\.md serverImageDigest/,
  );
});

test("writeImageDigestsEvidence rejects mismatch without overwriting existing artifact", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-digests-evidence-no-partial-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-29");
  const imageDigestsPath = path.join(evidenceDir, "image-digests.txt");
  const existingImageDigests = [
    "serverImage=registry.example.invalid/plush/server:existing",
    "serverImageDigest=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "webImage=registry.example.invalid/plush/web:existing",
    "webImageDigest=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "",
  ].join("\n");
  fs.mkdirSync(evidenceDir, { recursive: true });
  writeReleaseEvidence(evidenceDir, {
    serverDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  });
  fs.writeFileSync(imageDigestsPath, existingImageDigests);

  await assert.rejects(
    () => writeImageDigestsEvidence(validOptions({
      evidenceDir: "deployments/yoyoosun/evidence/releases/2026-06-29",
    }), { repoRoot: root }),
    /server digest must match release-evidence\.md serverImageDigest/,
  );

  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), existingImageDigests);
});

test("image digests CLI rejects credentialed image ref without writing artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-digests-evidence-cli-invalid-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-29");
  fs.mkdirSync(evidenceDir, { recursive: true });

  const result = spawnSync("node", [
    scriptPath,
    "--server-image",
    "https://deploy:secret@registry.example.invalid/plush/server:20260629T1200",
    "--server-digest",
    SERVER_DIGEST,
    "--web-image",
    "registry.example.invalid/plush/web:20260629T1200",
    "--web-digest",
    WEB_DIGEST,
    "--evidence-dir",
    "deployments/yoyoosun/evidence/releases/2026-06-29",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--server-image must not contain URL credentials/);
  assert.equal(fs.existsSync(path.join(evidenceDir, "image-digests.txt")), false);
});

test("image digests CLI rejects release evidence mismatch without overwriting artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-digests-evidence-cli-mismatch-"));
  const evidenceDir = path.join(root, "deployments/yoyoosun/evidence/releases/2026-06-29");
  const imageDigestsPath = path.join(evidenceDir, "image-digests.txt");
  const existingImageDigests = [
    "serverImage=registry.example.invalid/plush/server:existing",
    "serverImageDigest=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "webImage=registry.example.invalid/plush/web:existing",
    "webImageDigest=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "",
  ].join("\n");
  fs.mkdirSync(evidenceDir, { recursive: true });
  writeReleaseEvidence(evidenceDir, {
    serverDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  });
  fs.writeFileSync(imageDigestsPath, existingImageDigests);

  const result = spawnSync("node", [
    scriptPath,
    "--server-image",
    "registry.example.invalid/plush/server:20260629T1200",
    "--server-digest",
    SERVER_DIGEST,
    "--web-image",
    "registry.example.invalid/plush/web:20260629T1200",
    "--web-digest",
    WEB_DIGEST,
    "--evidence-dir",
    "deployments/yoyoosun/evidence/releases/2026-06-29",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server digest must match release-evidence\.md serverImageDigest/);
  assert.equal(fs.readFileSync(imageDigestsPath, "utf8"), existingImageDigests);
});
