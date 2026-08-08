import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReleaseManifest,
  validateReleaseManifest,
  writeReleaseManifest,
} from "./release-catalog.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);

function fixtureManifest() {
  return {
    schemaVersion: "plush-release-artifact/v1",
    passed: true,
    git: { commit: SHA },
    sourceArchive: { sha256: HASH },
    migration: { latest: "20260729000000", sequenceSha256: HASH },
    customerConfig: { sourceSha256: HASH },
    sbom: { file: "sbom.cdx.json", sha256: HASH },
    images: [
      {
        kind: "server",
        contentId: `sha256:${"c".repeat(64)}`,
        platform: "linux/amd64",
      },
      {
        kind: "web",
        contentId: `sha256:${"d".repeat(64)}`,
        platform: "linux/amd64",
      },
    ],
  };
}

function strictTerminal(status = "passed") {
  return {
    contract: "plush.exact-sha-strict/v2",
    profile: "strict",
    gitSha: SHA,
    fingerprint: "e".repeat(64),
    status,
    receipt: { sha256: "f".repeat(64) },
    provenance: {
      source: "github-actions",
      repository: "saurick/plush-toy-erp",
      workflowRef:
        "saurick/plush-toy-erp/.github/workflows/release.yml@refs/heads/main",
      runId: "123",
      runAttempt: "1",
      job: "strict",
    },
  };
}

function ciStrictTerminal() {
  const counts = { executed: 1, passed: 1, failed: 0, skipped: 0 };
  return {
    ...strictTerminal(),
    contract: "plush.exact-sha-strict/v3",
    exitCode: 0,
    identity: {
      repository: "saurick/plush-toy-erp",
      gitSha: SHA,
      sourceArchiveSha256: HASH,
      policyFingerprint: "e".repeat(64),
      workflowFingerprint: "1".repeat(64),
      toolchainFingerprint: "2".repeat(64),
      migrationSequenceSha256: HASH,
      dependencyLockFingerprint: "3".repeat(64),
      customerConfigFingerprint: HASH,
    },
    checks: Object.fromEntries(
      ["web", "server", "database", "browser", "security"].map((key) => [
        key,
        counts,
      ]),
    ),
    timeSensitiveChecks: {
      vulnerabilityDatabase: {
        status: "passed",
        checkedAt: "2026-08-09T00:00:00.000Z",
        validUntil: "2026-08-10T00:00:00.000Z",
      },
    },
    provenance: {
      source: "github-actions",
      repository: "saurick/plush-toy-erp",
      workflowRef:
        "saurick/plush-toy-erp/.github/workflows/ci.yml@refs/heads/main",
      runId: "456",
      runAttempt: "1",
      job: "quality",
      eventName: "push",
      ref: "refs/heads/main",
      refName: "main",
      headRepository: "saurick/plush-toy-erp",
      conclusion: "success",
    },
  };
}

function registryImages() {
  return [
    {
      kind: "server",
      repository: "ghcr.io/saurick/plush-toy-erp-server",
      digest: `sha256:${"1".repeat(64)}`,
    },
    {
      kind: "web",
      repository: "ghcr.io/saurick/plush-toy-erp-web",
      digest: `sha256:${"2".repeat(64)}`,
    },
  ];
}

test("release catalog binds strict, artifact, registry digests and rollback boundary", () => {
  const manifest = buildReleaseManifest({
    version: "2026.07.29-1",
    gitSha: SHA,
    strictTerminal: strictTerminal(),
    artifactManifest: fixtureManifest(),
    artifactManifestSha256: HASH,
    images: registryImages(),
  });
  assert.equal(validateReleaseManifest(manifest), manifest);
  assert.deepEqual(
    manifest.images.map(({ kind, ref }) => ({ kind, ref })),
    [
      {
        kind: "server",
        ref: `ghcr.io/saurick/plush-toy-erp-server@sha256:${"1".repeat(64)}`,
      },
      {
        kind: "web",
        ref: `ghcr.io/saurick/plush-toy-erp-web@sha256:${"2".repeat(64)}`,
      },
    ],
  );
  assert.equal(manifest.rollback.databaseDownMigrationAutomatic, false);
});

test("release catalog accepts CI v3 strict identity while preserving v2 rollback manifests", () => {
  const manifest = buildReleaseManifest({
    version: "2026.08.09-1",
    gitSha: SHA,
    strictTerminal: ciStrictTerminal(),
    artifactManifest: fixtureManifest(),
    artifactManifestSha256: HASH,
    images: registryImages(),
  });
  assert.equal(manifest.strict.contract, "plush.exact-sha-strict/v3");
  assert.equal(manifest.strict.provenance.job, "quality");
  assert.equal(validateReleaseManifest(manifest), manifest);
  const drifted = structuredClone(manifest);
  drifted.strict.identity.policyFingerprint = "9".repeat(64);
  assert.throws(() => validateReleaseManifest(drifted), /identity/u);
  const sourceDrifted = structuredClone(manifest);
  sourceDrifted.strict.identity.sourceArchiveSha256 = "8".repeat(64);
  assert.throws(() => validateReleaseManifest(sourceDrifted), /identity/u);
});

test("release catalog rejects failed strict and mutable image refs", () => {
  assert.throws(
    () =>
      buildReleaseManifest({
        version: "2026.07.29-1",
        gitSha: SHA,
        strictTerminal: strictTerminal("failed"),
        artifactManifest: fixtureManifest(),
        artifactManifestSha256: HASH,
        images: registryImages(),
      }),
    /passed exact-SHA/u,
  );
  const manifest = buildReleaseManifest({
    version: "2026.07.29-1",
    gitSha: SHA,
    strictTerminal: strictTerminal(),
    artifactManifest: fixtureManifest(),
    artifactManifestSha256: HASH,
    images: registryImages(),
  });
  manifest.images[0].ref = `${manifest.images[0].repository}:latest`;
  assert.throws(() => validateReleaseManifest(manifest), /image is invalid/u);
});

test("release catalog write is idempotent but never overwrites another identity", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-release-catalog-"));
  try {
    const file = path.join(root, "release-manifest.json");
    const manifest = buildReleaseManifest({
      version: "2026.07.29-1",
      gitSha: SHA,
      strictTerminal: strictTerminal(),
      artifactManifest: fixtureManifest(),
      artifactManifestSha256: HASH,
      images: registryImages(),
    });
    assert.equal(writeReleaseManifest(file, manifest).reused, false);
    assert.equal(writeReleaseManifest(file, manifest).reused, true);
    const changed = JSON.parse(readFileSync(file, "utf8"));
    changed.version = "2026.07.29-2";
    assert.throws(
      () => writeReleaseManifest(file, changed),
      /different content/u,
    );
    writeFileSync(file, "not-json\n", "utf8");
    assert.throws(() => writeReleaseManifest(file, manifest));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
