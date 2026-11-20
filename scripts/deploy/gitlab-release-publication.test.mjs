import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RELEASE_ASSET_NAMES } from "./github-release-asset-set.mjs";
import {
  planGitlabReleasePublication,
  planGitlabReleaseSourcePublication,
  selectGitlabReleasePackage,
  validateGitlabReleaseSourceBackfill,
  verifyGitlabReleasePublication,
  verifyGitlabReleaseSourcePublication,
} from "./gitlab-release-publication.mjs";
import { buildReleaseManifest } from "./release-catalog.mjs";

const sha = "a".repeat(40);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-source-package-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.tar");
  const artifactFile = path.join(root, "release-artifact.json");
  writeFileSync(sourceFile, "exact source\n");
  writeFileSync(
    artifactFile,
    `${JSON.stringify({
      schemaVersion: "plush-release-artifact/v1",
      passed: true,
      customer: "yoyoosun",
      releaseVersion: "2026.09.01-1",
      git: { commit: sha, head: sha, worktreeClean: true },
      sourceArchive: { secretScan: "passed", sha256: digest("exact source\n") },
      migration: { latest: "20260901000000", sequenceSha256: "b".repeat(64) },
      customerConfig: { sourceSha256: "c".repeat(64) },
      sbom: { file: "sbom.cdx.json", sha256: "d".repeat(64) },
      images: ["server", "web"].map((kind, index) => ({
        kind,
        ref: `plush-toy-erp-${kind}:yoyoosun-${sha}`,
        contentId: `sha256:${String(index + 1).repeat(64)}`,
        platform: "linux/amd64",
        gitSha: sha,
        releaseVersion: "2026.09.01-1",
        archive: { file: `${kind}-image.tar`, sha256: String(index + 3).repeat(64), sizeBytes: 1 },
        metadataSecretScan: { passed: true },
      })),
    })}\n`,
  );
  return { artifactFile, sourceFile, packageVersion: `artifact-${sha}` };
}

function localAssets() {
  return {
    status: "passed",
    state: "local",
    assets: RELEASE_ASSET_NAMES.map((name, index) => ({
      name,
      size: index + 100,
      digest: `sha256:${String(index + 1).padStart(64, "0")}`,
    })),
  };
}

function remoteAssets(names = RELEASE_ASSET_NAMES) {
  const local = new Map(localAssets().assets.map((asset) => [asset.name, asset]));
  return names.map((name) => ({
    file_name: name,
    size: local.get(name).size,
    file_sha256: local.get(name).digest.slice(7),
  }));
}

function backfillFixture(t) {
  const source = sourceFixture(t);
  const artifact = JSON.parse(readFileSync(source.artifactFile, "utf8"));
  const hash = artifact.sourceArchive.sha256;
  const runtime = {
    serverHealth: "passed",
    serverReady: "passed",
    webHealth: "passed",
    webRoot: "passed",
    runtimeIdentity: "passed",
    authenticatedAdmin: "passed",
    embeddedGitSha: sha,
  };
  const receipt = {
    schemaVersion: "plush-local-release-rehearsal/v1",
    passed: true,
    customer: "yoyoosun",
    generatedAt: "2026-09-01T00:00:00.000Z",
    finishedAt: "2026-09-01T00:05:00.000Z",
    git: { commit: sha, head: sha, worktreeClean: true },
    artifact: {
      manifestSchema: artifact.schemaVersion,
      server: artifact.images[0].contentId,
      web: artifact.images[1].contentId,
      migrationSequenceSha256: artifact.migration.sequenceSha256,
      sbomSha256: artifact.sbom.sha256,
    },
    environment: {
      kind: "local-isolated-release-compose",
      composeSource: "server/deploy/compose/prod/compose.yml",
      databaseIdentityBound: true,
    },
    migration: {
      ...artifact.migration,
      directoryValidation: "passed",
      dryRun: "passed",
      apply: "passed",
      readback: "passed",
    },
    runtime: { initial: runtime, steadyStateRestart: runtime },
    backupRestore: {
      status: "passed",
      backupSha256: "7".repeat(64),
      backupSizeBytes: 1,
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
  const counts = { executed: 1, passed: 1, failed: 0, skipped: 0 };
  const strictTerminal = {
    contract: "plush.exact-sha-strict/v3",
    profile: "strict",
    gitSha: sha,
    fingerprint: "e".repeat(64),
    status: "passed",
    exitCode: 0,
    receipt: { sha256: "f".repeat(64) },
    identity: {
      repository: "saurick/plush-toy-erp",
      gitSha: sha,
      sourceArchiveSha256: hash,
      policyFingerprint: "e".repeat(64),
      workflowFingerprint: "1".repeat(64),
      toolchainFingerprint: "2".repeat(64),
      migrationSequenceSha256: artifact.migration.sequenceSha256,
      dependencyLockFingerprint: "3".repeat(64),
      customerConfigFingerprint: artifact.customerConfig.sourceSha256,
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
        checkedAt: "2026-09-01T00:00:00.000Z",
        validUntil: "2026-09-02T00:00:00.000Z",
      },
    },
    provenance: {
      source: "gitlab-ci",
      repository: "saurick/plush-toy-erp",
      workflowRef: "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
      runId: "123",
      runAttempt: "1",
      job: "quality_aggregate",
      eventName: "push",
      ref: "refs/heads/main",
      refName: "main",
      headRepository: "saurick/plush-toy-erp",
      conclusion: "success",
    },
  };
  const controlsDir = path.join(path.dirname(source.artifactFile), "controls");
  mkdirSync(controlsDir, { mode: 0o700 });
  const artifactFile = path.join(controlsDir, "release-artifact.json");
  const receiptFile = path.join(controlsDir, "release-rehearsal.json");
  writeFileSync(artifactFile, readFileSync(source.artifactFile));
  writeFileSync(receiptFile, JSON.stringify(receipt));
  const manifest = buildReleaseManifest({
    version: artifact.releaseVersion,
    gitSha: sha,
    strictTerminal,
    artifactManifest: artifact,
    artifactManifestSha256: digest(readFileSync(artifactFile)),
    images: [
      {
        kind: "server",
        repository: "ghcr.io/saurick/plush-toy-erp-server",
        digest: `sha256:${"5".repeat(64)}`,
      },
      {
        kind: "web",
        repository: "ghcr.io/saurick/plush-toy-erp-web",
        digest: `sha256:${"6".repeat(64)}`,
      },
    ],
    rehearsalReceipt: receipt,
    rehearsalReceiptSha256: digest(readFileSync(receiptFile)),
    createdAt: "2026-09-01T00:06:00.000Z",
  });
  const manifestFile = path.join(controlsDir, "release-manifest.json");
  writeFileSync(manifestFile, JSON.stringify(manifest));
  const large = new Map([
    ["sbom.cdx.json", { size: 1, sha256: artifact.sbom.sha256 }],
    ["server-image.tar", { size: 1, sha256: artifact.images[0].archive.sha256 }],
    ["web-image.tar", { size: 1, sha256: artifact.images[1].archive.sha256 }],
  ]);
  const checksumsFile = path.join(controlsDir, "checksums.sha256");
  writeFileSync(
    checksumsFile,
    `${[
      ["release-artifact.json", digest(readFileSync(artifactFile))],
      ["release-manifest.json", digest(readFileSync(manifestFile))],
      ["release-rehearsal.json", digest(readFileSync(receiptFile))],
      ...[...large].map(([name, value]) => [name, value.sha256]),
    ]
      .map(([name, sha256]) => `${sha256}  ${name}`)
      .join("\n")}\n`,
  );
  const formalRemote = RELEASE_ASSET_NAMES.map((name) => {
    const file = path.join(controlsDir, name);
    if (large.has(name)) {
      return {
        file_name: name,
        size: large.get(name).size,
        file_sha256: large.get(name).sha256,
      };
    }
    return {
      file_name: name,
      size: statSync(file).size,
      file_sha256: digest(readFileSync(file)),
    };
  });
  return { ...source, controlsDir, formalRemote };
}

test("selects at most one exact immutable GitLab package identity", () => {
  assert.deepEqual(
    selectGitlabReleasePackage(
      [
        {
          id: 17,
          package_type: "generic",
          name: "plush-release",
          version: `artifact-${sha}`,
        },
        {
          id: 18,
          package_type: "generic",
          name: "another-package",
          version: `artifact-${sha}`,
        },
      ],
      `artifact-${sha}`,
    ),
    { id: 17 },
  );
  assert.equal(selectGitlabReleasePackage([], `artifact-${sha}`), null);
  assert.throws(
    () =>
      selectGitlabReleasePackage(
        [
          {
            id: 17,
            package_type: "generic",
            name: "plush-release",
            version: `artifact-${sha}`,
          },
          {
            id: 19,
            package_type: "generic",
            name: "plush-release",
            version: `artifact-${sha}`,
          },
        ],
        `artifact-${sha}`,
      ),
    /not unique/u,
  );
});

test("plans only missing assets from an exact verified remote subset", () => {
  const existing = RELEASE_ASSET_NAMES.slice(0, 3);
  const result = planGitlabReleasePublication({
    local: localAssets(),
    remote: remoteAssets(existing),
  });
  assert.equal(result.state, "partial");
  assert.equal(result.existingCount, 3);
  assert.deepEqual(result.missingAssets, RELEASE_ASSET_NAMES.slice(3));
});

test("blocks unknown, duplicate or mismatched existing package files", () => {
  const local = localAssets();
  assert.throws(
    () =>
      planGitlabReleasePublication({
        local,
        remote: [
          {
            file_name: "unexpected.txt",
            size: 1,
            file_sha256: "1".repeat(64),
          },
        ],
      }),
    /invalid file/u,
  );
  assert.throws(
    () =>
      planGitlabReleasePublication({
        local,
        remote: [
          ...remoteAssets([RELEASE_ASSET_NAMES[0]]),
          ...remoteAssets([RELEASE_ASSET_NAMES[0]]),
        ],
      }),
    /invalid file/u,
  );
  const mismatched = remoteAssets([RELEASE_ASSET_NAMES[0]]);
  mismatched[0].file_sha256 = "f".repeat(64);
  assert.throws(
    () => planGitlabReleasePublication({ local, remote: mismatched }),
    /mismatch/u,
  );
});

test("requires an exact seven-asset readback before publication is complete", () => {
  assert.equal(
    verifyGitlabReleasePublication({
      local: localAssets(),
      remote: remoteAssets(),
    }).state,
    "complete",
  );
  assert.throws(
    () =>
      verifyGitlabReleasePublication({
        local: localAssets(),
        remote: remoteAssets(RELEASE_ASSET_NAMES.slice(0, -1)),
      }),
    /incomplete/u,
  );
});

test("publishes source through one exact internal package without changing seven assets", (t) => {
  const fixture = sourceFixture(t);
  const missing = planGitlabReleaseSourcePublication({ ...fixture, remote: [] });
  assert.deepEqual(missing.missingAssets, ["source.tar"]);
  const remote = [{
    file_name: "source.tar",
    size: Buffer.byteLength("exact source\n"),
    file_sha256: digest("exact source\n"),
  }];
  assert.equal(
    verifyGitlabReleaseSourcePublication({ ...fixture, remote }).state,
    "complete",
  );
  assert.throws(
    () => planGitlabReleaseSourcePublication({ ...fixture, remote: [...remote, ...remote] }),
    /not exact/u,
  );
  assert.throws(
    () => planGitlabReleaseSourcePublication({
      ...fixture,
      remote: [{ ...remote[0], file_sha256: "f".repeat(64) }],
    }),
    /mismatch/u,
  );
});

test("select keeps formal and source package identities separate", () => {
  const packages = [
    { id: 1, package_type: "generic", name: "plush-release", version: `artifact-${sha}` },
    { id: 2, package_type: "generic", name: "plush-release-source", version: `artifact-${sha}` },
  ];
  assert.deepEqual(
    selectGitlabReleasePackage(packages, `artifact-${sha}`, "plush-release-source"),
    { id: 2 },
  );
  assert.throws(
    () => selectGitlabReleasePackage(packages, `artifact-${sha}`, "other"),
    /catalog/u,
  );
});

test("backfills source only for one exact historical v2 seven-asset release", (t) => {
  const fixture = backfillFixture(t);
  const result = validateGitlabReleaseSourceBackfill(fixture);
  assert.equal(result.state, "eligible");
  assert.equal(result.gitSha, sha);
  assert.equal(result.sourceSha256, digest("exact source\n"));

  assert.throws(
    () =>
      validateGitlabReleaseSourceBackfill({
        ...fixture,
        formalRemote: [...fixture.formalRemote, fixture.formalRemote[0]],
      }),
    /not exact/u,
  );
  writeFileSync(fixture.sourceFile, "drifted source\n");
  assert.throws(
    () => validateGitlabReleaseSourceBackfill(fixture),
    /source identity/u,
  );
});
