import assert from "node:assert/strict";
import test from "node:test";

import {
  GITLAB_RELEASE_CANDIDATE_SCHEMA,
  validateGitlabReleaseCandidateManifest,
  validateReleaseRehearsalReceipt,
} from "./gitlab-release-candidate.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);

test("candidate manifest requires one build and exact five-file digest set", () => {
  const manifest = {
    schemaVersion: GITLAB_RELEASE_CANDIDATE_SCHEMA,
    status: "frozen",
    gitSha: sha,
    version: "2026.08.29",
    customer: "yoyoosun",
    platform: "linux/amd64",
    createdAt: "2026-08-29T00:00:00.000Z",
    build: { pipelineId: "1", jobId: "2", runnerId: "3", buildCount: 1 },
    artifact: {
      schemaVersion: "plush-release-artifact/v1",
      manifestSha256: digest,
      serverContentId: `sha256:${"c".repeat(64)}`,
      webContentId: `sha256:${"d".repeat(64)}`,
      migrationSequenceSha256: "e".repeat(64),
      sourceArchiveSha256: "f".repeat(64),
    },
    files: [
      "checksums.sha256",
      "release-artifact.json",
      "sbom.cdx.json",
      "server-image.tar",
      "web-image.tar",
    ].map((name) => ({ name, size: 1, sha256: digest })),
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
    },
  };
  assert.equal(validateGitlabReleaseCandidateManifest(manifest), manifest);
  assert.throws(
    () => validateGitlabReleaseCandidateManifest({ ...manifest, files: manifest.files.slice(1) }),
    /contract/u,
  );
  assert.throws(
    () =>
      validateGitlabReleaseCandidateManifest({
        ...manifest,
        files: [...manifest.files, manifest.files[0]],
      }),
    /contract/u,
  );
});

test("rehearsal receipt requires migration, two runtime reads, backup restore, restart and cleanup", () => {
  const artifact = {
    schemaVersion: "plush-release-artifact/v1",
    releaseVersion: "2026.08.29",
    migration: { latest: "20260829000000", sequenceSha256: digest },
    sbom: { sha256: "c".repeat(64) },
    images: [
      { kind: "server", contentId: `sha256:${"d".repeat(64)}` },
      { kind: "web", contentId: `sha256:${"e".repeat(64)}` },
    ],
  };
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
    generatedAt: "2026-08-29T00:00:00.000Z",
    finishedAt: "2026-08-29T00:05:00.000Z",
    git: { commit: sha, head: sha, worktreeClean: true },
    artifact: {
      manifestSchema: artifact.schemaVersion,
      server: artifact.images[0].contentId,
      web: artifact.images[1].contentId,
      migrationSequenceSha256: digest,
      sbomSha256: artifact.sbom.sha256,
    },
    environment: {
      kind: "local-isolated-release-compose",
      databaseIdentityBound: true,
      composeSource: "server/deploy/compose/prod/compose.yml",
    },
    migration: {
      latest: artifact.migration.latest,
      sequenceSha256: digest,
      directoryValidation: "passed",
      dryRun: "passed",
      apply: "passed",
      readback: "passed",
    },
    runtime: { initial: runtime, steadyStateRestart: runtime },
    backupRestore: {
      status: "passed",
      backupSha256: "f".repeat(64),
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
  assert.equal(
    validateReleaseRehearsalReceipt(receipt, artifact, {
      sha,
      version: "2026.08.29",
      customer: "yoyoosun",
    }),
    receipt,
  );
  assert.throws(
    () =>
      validateReleaseRehearsalReceipt(
        { ...receipt, cleanup: { ...receipt.cleanup, residualContainers: 1 } },
        artifact,
        { sha, version: "2026.08.29", customer: "yoyoosun" },
      ),
    /incomplete/u,
  );
});
