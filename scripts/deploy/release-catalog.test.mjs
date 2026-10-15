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
    releaseVersion: "2026.08.29-1",
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
      source: "gitlab-ci",
      repository: "saurick/plush-toy-erp",
      workflowRef:
        "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
      runId: "456",
      runAttempt: "1",
      job: "quality_aggregate",
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

function releaseRehearsalReceipt() {
  const runtime = {
    serverHealth: "passed",
    serverReady: "passed",
    webHealth: "passed",
    webRoot: "passed",
    runtimeIdentity: "passed",
    authenticatedAdmin: "passed",
    embeddedGitSha: SHA,
  };
  return {
    schemaVersion: "plush-local-release-rehearsal/v1",
    passed: true,
    customer: "yoyoosun",
    generatedAt: "2026-08-29T00:00:00.000Z",
    finishedAt: "2026-08-29T00:05:00.000Z",
    git: { commit: SHA, head: SHA, worktreeClean: true },
    artifact: {
      manifestSchema: "plush-release-artifact/v1",
      server: `sha256:${"c".repeat(64)}`,
      web: `sha256:${"d".repeat(64)}`,
      migrationSequenceSha256: HASH,
      sbomSha256: HASH,
    },
    environment: {
      kind: "local-isolated-release-compose",
      composeSource: "server/deploy/compose/prod/compose.yml",
      databaseIdentityBound: true,
    },
    migration: {
      latest: "20260729000000",
      sequenceSha256: HASH,
      directoryValidation: "passed",
      dryRun: "passed",
      apply: "passed",
      readback: "passed",
    },
    runtime: { initial: runtime, steadyStateRestart: runtime },
    backupRestore: {
      status: "passed",
      backupSha256: "7".repeat(64),
      backupSizeBytes: 1024,
      dumpRetained: false,
    },
    recoveryRestart: {
      status: "passed",
      bootstrapSecretRemoved: true,
      sameServerContentId: true,
      sameWebContentId: true,
      healthReadyAndLoginRecovered: true,
      customerConfigRecovered: true,
    },
    cleanup: {
      attempted: true,
      passed: true,
      residualContainers: 0,
      temporaryDatabaseRetained: false,
    },
    failure: null,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsFullDsn: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawCustomerRows: false,
    },
  };
}

function buildCurrentRelease(overrides = {}) {
  const version = overrides.version || "2026.08.29-1";
  const artifactManifest = fixtureManifest();
  artifactManifest.releaseVersion = version;
  return buildReleaseManifest({
    version,
    gitSha: SHA,
    strictTerminal: ciStrictTerminal(),
    artifactManifest,
    artifactManifestSha256: HASH,
    images: registryImages(),
    rehearsalReceipt: releaseRehearsalReceipt(),
    rehearsalReceiptSha256: "8".repeat(64),
    ...overrides,
  });
}

test("release catalog binds strict, artifact, registry digests and rollback boundary", () => {
  const manifest = buildCurrentRelease({ version: "2026.07.29-1" });
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
  const manifest = buildCurrentRelease({ version: "2026.08.09-1" });
  assert.equal(manifest.strict.contract, "plush.exact-sha-strict/v3");
  assert.equal(manifest.strict.provenance.job, "quality_aggregate");
  assert.equal(validateReleaseManifest(manifest), manifest);
  const drifted = structuredClone(manifest);
  drifted.strict.identity.policyFingerprint = "9".repeat(64);
  assert.throws(() => validateReleaseManifest(drifted), /identity/u);
  const sourceDrifted = structuredClone(manifest);
  sourceDrifted.strict.identity.sourceArchiveSha256 = "8".repeat(64);
  assert.throws(() => validateReleaseManifest(sourceDrifted), /identity/u);
});

test("release catalog keeps legacy v1 GitLab strict provenance readable", () => {
  const terminal = ciStrictTerminal();
  terminal.provenance = {
    source: "gitlab-ci",
    repository: "saurick/plush-toy-erp",
    workflowRef:
      "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
    runId: "9001",
    runAttempt: "27",
    job: "strict",
    eventName: "web",
    ref: "refs/heads/main",
    refName: "main",
    headRepository: "saurick/plush-toy-erp",
    conclusion: "success",
  };
  const manifest = buildCurrentRelease({ version: "2026.08.09-gitlab" });
  manifest.schemaVersion = "plush.release-manifest/v1";
  manifest.strict.provenance = terminal.provenance;
  delete manifest.rehearsal;
  assert.equal(validateReleaseManifest(manifest), manifest);
});

test("release catalog v2 binds canonical GitLab push CI to one rehearsal receipt", () => {
  const terminal = ciStrictTerminal();
  terminal.provenance = {
    source: "gitlab-ci",
    repository: "saurick/plush-toy-erp",
    workflowRef:
      "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
    runId: "9002",
    runAttempt: "28",
    job: "quality_aggregate",
    eventName: "push",
    ref: "refs/heads/main",
    refName: "main",
    headRepository: "saurick/plush-toy-erp",
    conclusion: "success",
  };
  const manifest = buildCurrentRelease({ strictTerminal: terminal });
  assert.equal(manifest.schemaVersion, "plush.release-manifest/v2");
  assert.equal(manifest.rehearsal.status, "passed");
  assert.equal(manifest.rehearsal.receiptSha256, "8".repeat(64));
  assert.equal(validateReleaseManifest(manifest), manifest);
  const drifted = structuredClone(manifest);
  drifted.rehearsal.cleanup.residualContainers = 1;
  assert.throws(() => validateReleaseManifest(drifted), /rehearsal/u);
});

test("release catalog rejects failed strict and mutable image refs", () => {
  const artifactManifest = fixtureManifest();
  artifactManifest.releaseVersion = "2026.07.29-1";
  assert.throws(
    () =>
      buildReleaseManifest({
        version: "2026.07.29-1",
        gitSha: SHA,
        strictTerminal: strictTerminal("failed"),
        artifactManifest,
        artifactManifestSha256: HASH,
        images: registryImages(),
        rehearsalReceipt: releaseRehearsalReceipt(),
        rehearsalReceiptSha256: "8".repeat(64),
      }),
    /passed exact-SHA/u,
  );
  const manifest = buildCurrentRelease({ version: "2026.07.29-1" });
  manifest.images[0].ref = `${manifest.images[0].repository}:latest`;
  assert.throws(() => validateReleaseManifest(manifest), /image is invalid/u);
});

test("release catalog write is idempotent but never overwrites another identity", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-release-catalog-"));
  try {
    const file = path.join(root, "release-manifest.json");
    const manifest = buildCurrentRelease({ version: "2026.07.29-1" });
    assert.equal(writeReleaseManifest(file, manifest).reused, false);
    assert.equal(writeReleaseManifest(file, manifest).reused, true);
    const legacy = structuredClone(manifest);
    legacy.schemaVersion = "plush.release-manifest/v1";
    delete legacy.rehearsal;
    assert.throws(
      () => writeReleaseManifest(path.join(root, "legacy.json"), legacy),
      /only release manifest v2/u,
    );
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
