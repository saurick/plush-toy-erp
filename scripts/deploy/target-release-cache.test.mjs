import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupPreparedTargetReleaseIncoming,
  estimateAvoidedTransferDuration,
  prepareTargetReleaseIncoming,
  probeTargetReleaseCache,
  TARGET_RELEASE_CACHE_CONTRACT,
  validateTargetCacheProbe,
} from "./target-release-cache.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const IMAGE = `sha256:${"c".repeat(64)}`;

test("target cache probe distinguishes miss, package hit and image hit", () => {
  const miss = {
    schemaVersion: TARGET_RELEASE_CACHE_CONTRACT,
    releaseManifestSha256: HASH,
    packageHit: false,
    imageHit: false,
    cacheSource: "none",
    sourceToken: "none",
    avoidedBytes: 0,
    basis: [],
  };
  assert.equal(validateTargetCacheProbe(miss, HASH).packageHit, false);
  const hit = {
    ...miss,
    packageHit: true,
    imageHit: true,
    cacheSource: "formal",
    sourceToken: "formal",
    avoidedBytes: 1_325_933_239,
    basis: [
      "release_manifest_sha256",
      "archive_sha256",
      "registry_digest",
      "docker_content_id",
      "embedded_git_sha",
    ],
  };
  assert.equal(validateTargetCacheProbe(hit, HASH).imageHit, true);
  assert.throws(
    () => validateTargetCacheProbe({ ...hit, avoidedBytes: 0 }, HASH),
    /contract/u,
  );
});

test("avoided transfer time is estimated only from a measured cold target operation", () => {
  const operation = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    action: "promote",
    status: "passed",
    updatedAt: "2026-08-09T02:00:00.000Z",
    metadata: {
      targetCacheHit: false,
      transferBytesPerSecond: 10 * 1024 ** 2,
    },
  };
  assert.deepEqual(
    estimateAvoidedTransferDuration(620 * 1024 ** 2, [operation]),
    { durationMs: 62_000, baselineOperationId: operation.id },
  );
  assert.deepEqual(estimateAvoidedTransferDuration(1, []), {
    durationMs: null,
    baselineOperationId: null,
  });
  assert.deepEqual(
    estimateAvoidedTransferDuration(1, [
      {
        ...operation,
        metadata: { ...operation.metadata, targetCacheHit: true },
      },
    ]),
    { durationMs: null, baselineOperationId: null },
  );
});

test("target cache probe and prepare use fixed SSH scripts and fail closed", () => {
  const identity = {
    contract: TARGET_RELEASE_CACHE_CONTRACT,
    gitSha: SHA,
    version: "2026.08.09-1",
    releaseManifestSha256: HASH,
    releaseArtifactSha256: HASH,
    sourceArchiveSha256: HASH,
    sbomSha256: HASH,
    serverArchiveSha256: HASH,
    webArchiveSha256: HASH,
    serverContentId: IMAGE,
    webContentId: IMAGE,
    serverDigest: IMAGE,
    webDigest: IMAGE,
    serverRef: `plush-toy-erp-server:yoyoosun-${SHA}`,
    webRef: `plush-toy-erp-web:yoyoosun-${SHA}`,
  };
  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push({ command, args, input: options.input });
    return {
      status: 0,
      stdout: `${JSON.stringify({
        schemaVersion: TARGET_RELEASE_CACHE_CONTRACT,
        releaseManifestSha256: HASH,
        packageHit: false,
        imageHit: false,
        cacheSource: "none",
        sourceToken: "none",
        avoidedBytes: 0,
        basis: [],
      })}\n`,
    };
  };
  const probe = probeTargetReleaseCache(identity, { runCommand });
  prepareTargetReleaseIncoming(
    { operationId: "123e4567-e89b-42d3-a456-426614174000", identity, probe },
    { runCommand },
  );
  cleanupPreparedTargetReleaseIncoming("123e4567-e89b-42d3-a456-426614174000", {
    runCommand,
  });
  assert.equal(calls.length, 3);
  assert.equal(
    calls.every((call) => call.command === "ssh"),
    true,
  );
  assert.equal(
    calls.every((call) => call.args.includes("BatchMode=yes")),
    true,
  );
  assert.match(calls[0].input, /invalid formal cache/u);
  assert.match(calls[0].input, /releaseVersion == \$version/u);
  assert.match(calls[1].input, /\.target-cache\.json/u);
  assert.match(calls[2].input, /rm -rf -- "\$incoming"/u);
  assert.match(calls[2].input, /! -L "\$incoming"/u);
});
