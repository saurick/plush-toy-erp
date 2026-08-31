import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildTargetReleaseCacheIdentityFromEvidence,
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
const cacheSource = readFileSync(
  new URL("./target-release-cache.mjs", import.meta.url),
  "utf8",
);

test("target cache identity uses only validated control evidence", () => {
  const serverArchive = "d".repeat(64);
  const webArchive = "e".repeat(64);
  const sourceArchive = "f".repeat(64);
  const sbom = "1".repeat(64);
  const controls = {
    releaseManifestSha256: "2".repeat(64),
    releaseArtifactSha256: "3".repeat(64),
    checksumsSha256: "4".repeat(64),
    releaseRehearsalSha256: "5".repeat(64),
  };
  const formalFiles = [
    ["checksums.sha256", controls.checksumsSha256, 10],
    ["release-artifact.json", controls.releaseArtifactSha256, 20],
    ["release-manifest.json", controls.releaseManifestSha256, 30],
    ["release-rehearsal.json", controls.releaseRehearsalSha256, 40],
    ["sbom.cdx.json", sbom, 50],
    ["server-image.tar", serverArchive, 60],
    ["web-image.tar", webArchive, 70],
  ].map(([name, sha256, size]) => ({ name, sha256, size }));
  const manifest = {
    gitSha: SHA,
    version: "2026.08.09-1",
    images: [
      { kind: "server", digest: IMAGE },
      { kind: "web", digest: IMAGE },
    ],
  };
  const artifact = {
    sourceArchive: { sha256: sourceArchive },
    sbom: { sha256: sbom },
    images: [
      {
        kind: "server",
        contentId: IMAGE,
        ref: `plush-toy-erp-server:yoyoosun-${SHA}`,
        archive: { sha256: serverArchive, sizeBytes: 60 },
      },
      {
        kind: "web",
        contentId: IMAGE,
        ref: `plush-toy-erp-web:yoyoosun-${SHA}`,
        archive: { sha256: webArchive, sizeBytes: 70 },
      },
    ],
  };
  const fetch = {
    gitSha: SHA,
    version: manifest.version,
    formal: { files: formalFiles },
    source: { file: { sha256: sourceArchive } },
  };
  const identity = buildTargetReleaseCacheIdentityFromEvidence({
    manifest,
    artifact,
    fetch,
    controlDigests: controls,
  });
  assert.equal(identity.sourceArchiveSha256, sourceArchive);
  assert.equal(identity.serverArchiveSha256, serverArchive);
  assert.equal(identity.webArchiveSha256, webArchive);
  assert.throws(
    () =>
      buildTargetReleaseCacheIdentityFromEvidence({
        manifest,
        artifact,
        fetch: {
          ...fetch,
          formal: {
            files: formalFiles.map((file) =>
              file.name === "server-image.tar"
                ? { ...file, sha256: HASH }
                : file,
            ),
          },
        },
        controlDigests: controls,
      }),
    /control evidence/u,
  );
  const identityBuilder = cacheSource.slice(
    cacheSource.indexOf("export function buildTargetReleaseCacheIdentity({"),
    cacheSource.indexOf("function identityArgs("),
  );
  for (const largeFile of [
    "source.tar",
    "sbom.cdx.json",
    "server-image.tar",
    "web-image.tar",
  ]) {
    assert.doesNotMatch(
      identityBuilder,
      new RegExp(`path[.]join\\(bundle, "${largeFile.replaceAll(".", "[.]")}"`, "u"),
    );
  }
});

test("target cache v2 isolates the exact eight-file formal cache from legacy v1", () => {
  assert.equal(TARGET_RELEASE_CACHE_CONTRACT, "plush.target-release-cache/v2");
});

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
      targetAcquisitionMode: "gitlab_internal",
      targetAcquisitionBytesPerSecond: 10 * 1024 ** 2,
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

test("both target cache paths use fixed SSH scripts and fail closed", () => {
  const identity = {
    contract: TARGET_RELEASE_CACHE_CONTRACT,
    gitSha: SHA,
    version: "2026.08.09-1",
    releaseManifestSha256: HASH,
    releaseArtifactSha256: HASH,
    checksumsSha256: HASH,
    releaseRehearsalSha256: HASH,
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
  for (const targetKey of ["demo-133", "customer-test-133"]) {
    const probe = probeTargetReleaseCache(identity, { runCommand, targetKey });
    prepareTargetReleaseIncoming(
      { operationId: "123e4567-e89b-42d3-a456-426614174000", identity, probe },
      { runCommand, targetKey },
    );
    cleanupPreparedTargetReleaseIncoming(
      "123e4567-e89b-42d3-a456-426614174000",
      { runCommand, targetKey },
    );
  }
  assert.equal(calls.length, 6);
  assert.equal(
    calls.every((call) => call.command === "ssh"),
    true,
  );
  assert.equal(
    calls.every((call) => call.args.includes("BatchMode=yes")),
    true,
  );
  for (const offset of [0, 3]) {
    assert.match(calls[offset].input, /invalid formal cache/u);
    assert.match(calls[offset].input, /cache_root=\$root\/release-cache-v2/u);
    assert.match(calls[offset].input, /has_exact_formal_inventory/u);
    assert.match(
      calls[offset].input,
      /checksums[.]sha256 release-artifact[.]json release-manifest[.]json release-rehearsal[.]json sbom[.]cdx[.]json server-image[.]tar source[.]tar web-image[.]tar/u,
    );
    assert.match(
      calls[offset].input,
      /[.]target-cache[.]json[\s\S]*plush[.]target-release-cache\/v2/u,
    );
    assert.match(calls[offset].input, /releaseVersion == \$version/u);
    assert.match(calls[offset + 1].input, /\.target-cache\.json/u);
    assert.match(calls[offset + 1].input, /release-cache-v2/u);
    assert.match(calls[offset + 1].input, /plush[.]target-release-cache\/v2/u);
    assert.match(calls[offset + 2].input, /rm -rf -- "\$incoming"/u);
    assert.match(calls[offset + 2].input, /! -L "\$incoming"/u);
  }
  assert.equal(
    calls
      .slice(0, 3)
      .every((call) =>
        call.input.includes("root=/home/simon/plush-toy-erp-demo-v1"),
      ),
    true,
  );
  assert.equal(
    calls
      .slice(3)
      .every((call) =>
        call.input.includes("root=/home/simon/plush-toy-erp-test-v1"),
      ),
    true,
  );
});
