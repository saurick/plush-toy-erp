import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  activateRuntimeBundle,
  readActiveRuntimeBundle,
  readRuntimeBundle,
  readRuntimeSource,
  readLocalRuntimeEnvironment,
  runtimeBundleDirectory,
} from "./local-runtime-bundle.mjs";

import { fixtureBundle } from "./qa/test-fixtures/local-runtime-bundle.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plush-fixed-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("activation requires the same artifact, database, health and business proof", (t) => {
  const root = fixture(t);
  const bundle = fixtureBundle(root);
  assert.throws(() =>
    activateRuntimeBundle(root, bundle.id, { health: true, ready: true }),
  );
  assert.equal(readActiveRuntimeBundle(root), null);
  const proof = {
    artifactHash: bundle.artifactHash,
    migrationVersion: bundle.migrationVersion,
    health: true,
    ready: true,
    business: true,
  };
  activateRuntimeBundle(root, bundle.id, proof);
  assert.equal(readActiveRuntimeBundle(root).id, bundle.id);
  fs.writeFileSync(
    path.join(bundle.directory, "runtime/server"),
    "unverified change",
  );
  assert.throws(() => readActiveRuntimeBundle(root), /校验/u);
});

test("unlisted assets and path traversal cannot enter a fixed runtime", (t) => {
  const root = fixture(t);
  const bundle = fixtureBundle(root);
  fs.writeFileSync(
    path.join(bundle.directory, "runtime/web/extra.js"),
    "unverified",
  );
  assert.throws(() => readRuntimeBundle(root, bundle.id), /校验/u);
  assert.throws(() => runtimeBundleDirectory(root, "../outside"));
});

test("business code, seed, pages and private configuration invalidate evidence; documentation does not", async (t) => {
  const root = fixture(t);
  execFileSync("git", ["init", "--quiet"], {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  fs.mkdirSync(path.join(root, "web/src"), { recursive: true });
  fs.writeFileSync(path.join(root, "server/main.go"), "original");
  const initial = await readRuntimeSource(root);
  fs.writeFileSync(
    path.join(root, "server/README.md"),
    "unrelated documentation",
  );
  assert.equal(
    (await readRuntimeSource(root)).fingerprint,
    initial.fingerprint,
  );
  fs.writeFileSync(path.join(root, "web/src/page.jsx"), "candidate page");
  assert.notEqual(
    (await readRuntimeSource(root)).fingerprint,
    initial.fingerprint,
  );
  const page = await readRuntimeSource(root);
  fs.writeFileSync(path.join(root, "server/seed.go"), "candidate quantities");
  assert.notEqual(
    (await readRuntimeSource(root)).fingerprint,
    page.fingerprint,
  );
  const seed = await readRuntimeSource(root);
  fs.mkdirSync(path.join(root, "scripts/build"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "scripts/build/config.mjs"),
    "customer configuration injector",
  );
  const withBuildTools = await readRuntimeSource(root);
  assert.ok(withBuildTools.files.includes("scripts/build/config.mjs"));
  assert.notEqual(withBuildTools.fingerprint, seed.fingerprint);
});

test("private runtime configuration is data, never an executable shell file", (t) => {
  const root = fixture(t);
  const directory = path.join(root, "server");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, ".env");
  fs.writeFileSync(file, "ATTACHMENT_S3_BUCKET=private-development-bucket\n", {
    mode: 0o600,
  });
  assert.equal(
    readLocalRuntimeEnvironment(root, {}).ATTACHMENT_S3_BUCKET,
    "private-development-bucket",
  );
  fs.writeFileSync(file, "PATH=/malicious\n");
  assert.equal(readLocalRuntimeEnvironment(root, {}).PATH, undefined);
  fs.writeFileSync(
    file,
    'ATTACHMENT_S3_SECRET_ACCESS_KEY=\"$(touch /must-not-run)\"\n',
  );
  assert.equal(
    readLocalRuntimeEnvironment(root, {}).ATTACHMENT_S3_SECRET_ACCESS_KEY,
    "$(touch /must-not-run)",
  );
  fs.chmodSync(file, 0o644);
  assert.throws(() => readLocalRuntimeEnvironment(root, {}), /仅当前用户/u);
});

test("healthy responses alone cannot prove the expected runtime and database identity", async (t) => {
  const { verifyLocalRuntimeIdentity } =
    await import("./local-runtime-bundle.mjs");
  const bundle = fixtureBundle(fixture(t));
  await assert.rejects(
    verifyLocalRuntimeIdentity(
      bundle,
      "http://127.0.0.1:8300",
      "plush_erp",
      async () => ({ ok: true, headers: new Headers() }),
    ),
    /运行身份/u,
  );
  let digest;
  const fetchProof = async (_url, options) => {
    digest = options.headers["X-ERP-Expected-Runtime-Identity-SHA256"];
    return {
      ok: true,
      headers: new Headers({ "X-ERP-Runtime-Identity-Proof": "matched-v1" }),
    };
  };
  await verifyLocalRuntimeIdentity(
    bundle,
    "http://127.0.0.1:8300",
    "plush_erp",
    fetchProof,
  );
  const first = digest;
  await verifyLocalRuntimeIdentity(
    bundle,
    "http://127.0.0.1:8300",
    "different_db",
    fetchProof,
  );
  assert.notEqual(digest, first);
});
