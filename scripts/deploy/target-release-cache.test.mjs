import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildTargetReleaseCacheIdentity,
  buildTargetReleaseCacheIdentityFromEvidence,
  cleanupPreparedTargetReleaseIncoming,
  estimateAvoidedTransferDuration,
  prepareTargetReleaseIncoming,
  probeTargetReleaseCache,
  TARGET_RELEASE_CACHE_CONTRACT,
  TARGET_RELEASE_CACHE_MODES,
  targetReleaseCacheEvidenceFingerprint,
  validateTargetCacheProbe,
} from "./target-release-cache.mjs";
import {
  envWithLinuxStat,
  installLinuxStatShim,
} from "./remote-linux-script.test-support.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const IMAGE = `sha256:${"c".repeat(64)}`;
const cacheSource = readFileSync(
  new URL("./target-release-cache.mjs", import.meta.url),
  "utf8",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writePortableImageArchive(root, kind) {
  const ref = `plush-toy-erp-${kind}:yoyoosun-${SHA}`;
  const tree = path.join(root, `${kind}-docker-archive`);
  const blobs = path.join(tree, "blobs", "sha256");
  mkdirSync(blobs, { recursive: true, mode: 0o700 });
  const config = Buffer.from(`{"kind":"${kind}","gitSha":"${SHA}"}\n`);
  const contentHex = sha256(config);
  const contentId = `sha256:${contentHex}`;
  writeFileSync(path.join(blobs, contentHex), config, { mode: 0o600 });
  const imageManifest = Buffer.from(
    `${JSON.stringify({ schemaVersion: 2, config: { digest: contentId } })}\n`,
  );
  const manifestHex = sha256(imageManifest);
  const digest = `sha256:${manifestHex}`;
  writeFileSync(path.join(blobs, manifestHex), imageManifest, { mode: 0o600 });
  writeFileSync(
    path.join(tree, "manifest.json"),
    `${JSON.stringify([
      {
        Config: `blobs/sha256/${contentHex}`,
        RepoTags: [ref],
      },
    ])}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    path.join(tree, "index.json"),
    `${JSON.stringify({ manifests: [{ digest }] })}\n`,
    { mode: 0o600 },
  );
  const archivePath = path.join(root, `${kind}-image.tar`);
  const archived = spawnSync(
    "tar",
    ["-cf", archivePath, "-C", tree, "manifest.json", "index.json", "blobs"],
    { encoding: "utf8" },
  );
  assert.equal(archived.status, 0, archived.stderr);
  const archive = readFileSync(archivePath);
  return { archive, contentId, digest, ref };
}

function createExecutableCacheFixture(
  root,
  { cacheMode, sourceKind = "formal", retainedOperation = null },
) {
  const version = "2026.08.09-1";
  const server = writePortableImageArchive(root, "server");
  const web = writePortableImageArchive(root, "web");
  const source = Buffer.from("source archive fixture\n");
  const sbom = Buffer.from("{}\n");
  const releaseArtifact = Buffer.from(
    `${JSON.stringify({
      schemaVersion: "plush-release-artifact/v1",
      git: { commit: SHA },
      releaseVersion: version,
      sourceArchive: { sha256: sha256(source) },
      sbom: { sha256: sha256(sbom) },
      images: [
        {
          kind: "server",
          contentId: server.contentId,
          ref: server.ref,
          archive: { sha256: sha256(server.archive), sizeBytes: server.archive.length },
        },
        {
          kind: "web",
          contentId: web.contentId,
          ref: web.ref,
          archive: { sha256: sha256(web.archive), sizeBytes: web.archive.length },
        },
      ],
    })}\n`,
  );
  const releaseManifest = Buffer.from(
    `${JSON.stringify({
      schemaVersion:
        cacheMode === TARGET_RELEASE_CACHE_MODES.direct
          ? "plush.release-manifest/v2"
          : "plush.release-manifest/v1",
      gitSha: SHA,
      version,
      images: [
        { kind: "server", digest: server.digest },
        { kind: "web", digest: web.digest },
      ],
    })}\n`,
  );
  const checksums = Buffer.from("checksums control fixture\n");
  const rehearsal = Buffer.from("{}\n");
  const payload = {
    "checksums.sha256": checksums,
    "release-manifest.json": releaseManifest,
    "release-artifact.json": releaseArtifact,
    "release-rehearsal.json": rehearsal,
    "source.tar": source,
    "sbom.cdx.json": sbom,
    "server-image.tar": server.archive,
    "web-image.tar": web.archive,
  };
  const releaseManifestSha256 = sha256(releaseManifest);
  const cacheRoot =
    cacheMode === TARGET_RELEASE_CACHE_MODES.direct
      ? "release-cache-v2"
      : "release-cache";
  const candidate =
    sourceKind === "retained_operation"
      ? path.join(root, "incoming", retainedOperation)
      : path.join(root, cacheRoot, releaseManifestSha256);
  mkdirSync(candidate, { recursive: true, mode: 0o700 });
  const formalFiles =
    cacheMode === TARGET_RELEASE_CACHE_MODES.direct
      ? Object.keys(payload)
      : [
          "release-manifest.json",
          "release-artifact.json",
          "source.tar",
          "sbom.cdx.json",
          "server-image.tar",
          "web-image.tar",
        ];
  for (const name of formalFiles) {
    writeFileSync(path.join(candidate, name), payload[name], { mode: 0o600 });
  }
  if (sourceKind === "retained_operation") {
    writeFileSync(path.join(candidate, "promotion-manifest.json"), "{}\n", {
      mode: 0o600,
    });
    writeFileSync(
      path.join(candidate, ".target-cache.json"),
      `${JSON.stringify({
        schemaVersion: TARGET_RELEASE_CACHE_CONTRACT,
        operationId: retainedOperation,
        cacheMode: TARGET_RELEASE_CACHE_MODES.direct,
        releaseManifestSha256,
      })}\n`,
      { mode: 0o600 },
    );
  }
  return {
    candidate,
    payload: Object.fromEntries(formalFiles.map((name) => [name, payload[name]])),
    identity: {
      contract: TARGET_RELEASE_CACHE_CONTRACT,
      cacheMode,
      gitSha: SHA,
      version,
      releaseManifestSha256,
      releaseArtifactSha256: sha256(releaseArtifact),
      checksumsSha256: sha256(checksums),
      releaseRehearsalSha256:
        cacheMode === TARGET_RELEASE_CACHE_MODES.direct
          ? sha256(rehearsal)
          : null,
      sourceArchiveSha256: sha256(source),
      sbomSha256: sha256(sbom),
      serverArchiveSha256: sha256(server.archive),
      webArchiveSha256: sha256(web.archive),
      serverContentId: server.contentId,
      webContentId: web.contentId,
      serverDigest: server.digest,
      webDigest: web.digest,
      serverRef: server.ref,
      webRef: web.ref,
    },
  };
}

function executableCacheRunCommand(root, statBin = installLinuxStatShim(root)) {
  return (_command, args, options) => {
    const separator = args.lastIndexOf("--");
    assert.notEqual(separator, -1);
    const quotedRoot = `'${root.replaceAll("'", `'\"'\"'`)}'`;
    const source = options.input.replace(
      /^root=\/home\/simon\/plush-toy-erp-demo-v1$/mu,
      `root=${quotedRoot}`,
    );
    return spawnSync("bash", ["-s", "--", ...args.slice(separator + 1)], {
      encoding: "utf8",
      env: envWithLinuxStat(statBin),
      input: source,
    });
  };
}

test("target cache identity rejects symlinked bundle and manifest inputs", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-target-cache-link-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bundle = path.join(root, "bundle");
  const bundleLink = path.join(root, "bundle-link");
  mkdirSync(bundle);
  symlinkSync(bundle, bundleLink);
  assert.throws(
    () =>
      buildTargetReleaseCacheIdentity({
        bundleDir: bundleLink,
        releaseManifestPath: path.join(bundleLink, "release-manifest.json"),
      }),
    /bundle is invalid/u,
  );
  const manifestTarget = path.join(root, "manifest-target.json");
  writeFileSync(manifestTarget, "{}\n");
  symlinkSync(manifestTarget, path.join(bundle, "release-manifest.json"));
  assert.throws(
    () =>
      buildTargetReleaseCacheIdentity({
        bundleDir: bundle,
        releaseManifestPath: path.join(bundle, "release-manifest.json"),
      }),
    /identity input is invalid/u,
  );
});

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

test("both target cache paths use fixed SSH scripts and fail closed", (t) => {
  const originalFetchToken = process.env.PLUSH_GITLAB_TARGET_FETCH_TOKEN;
  const originalProviderToken = process.env.PLUSH_GITLAB_TOKEN;
  process.env.PLUSH_GITLAB_TARGET_FETCH_TOKEN = "must-not-reach-cache-ssh";
  process.env.PLUSH_GITLAB_TOKEN = "must-not-reach-cache-ssh";
  t.after(() => {
    if (originalFetchToken === undefined) {
      delete process.env.PLUSH_GITLAB_TARGET_FETCH_TOKEN;
    } else {
      process.env.PLUSH_GITLAB_TARGET_FETCH_TOKEN = originalFetchToken;
    }
    if (originalProviderToken === undefined) {
      delete process.env.PLUSH_GITLAB_TOKEN;
    } else {
      process.env.PLUSH_GITLAB_TOKEN = originalProviderToken;
    }
  });
  const identity = {
    contract: TARGET_RELEASE_CACHE_CONTRACT,
    cacheMode: TARGET_RELEASE_CACHE_MODES.direct,
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
    calls.push({
      command,
      args,
      input: options.input,
      inheritedFetchToken: Object.hasOwn(
        options.env,
        "PLUSH_GITLAB_TARGET_FETCH_TOKEN",
      ),
      inheritedProviderToken: Object.hasOwn(
        options.env,
        "PLUSH_GITLAB_TOKEN",
      ),
    });
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
  for (const call of calls) {
    const syntax = spawnSync("bash", ["-n"], {
      encoding: "utf8",
      input: call.input,
    });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  assert.equal(
    calls.every((call) => call.command === "ssh"),
    true,
  );
  assert.equal(
    calls.every((call) => call.args.includes("BatchMode=yes")),
    true,
  );
  assert.equal(
    calls.every((call) => call.inheritedFetchToken === false),
    true,
  );
  assert.equal(
    calls.every((call) => call.inheritedProviderToken === false),
    true,
  );
  for (const offset of [0, 3]) {
    assert.match(calls[offset].input, /invalid formal cache/u);
    assert.match(calls[offset].input, /owned_directory "\$root"/u);
    assert.match(calls[offset].input, /cache_root=\$root\/release-cache-v2/u);
    assert.match(calls[offset].input, /has_exact_formal_inventory/u);
    assert.match(calls[offset].input, /owned_plain_file "\$candidate\/\$required"/u);
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
    assert.match(calls[offset + 1].input, /owned_directory "\$root"/u);
    assert.match(calls[offset + 1].input, /owned_plain_file "\$source_dir\/\$file"/u);
    assert.match(calls[offset + 1].input, /owned_plain_file "\$incoming\/[.]target-cache[.]json"/u);
    assert.match(calls[offset + 1].input, /release-cache-v2/u);
    assert.match(calls[offset + 1].input, /plush[.]target-release-cache\/v2/u);
    assert.match(calls[offset + 2].input, /rm -rf -- "\$incoming"/u);
    assert.match(
      calls[offset + 2].input,
      /owned_directory "\$incoming_root"/u,
    );
    assert.match(calls[offset + 2].input, /owned_directory "\$incoming"/u);
    assert.match(calls[offset + 2].input, /readlink -f -- "\$candidate"/u);
    assert.match(calls[offset + 2].input, /8#022/u);
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

test("legacy target cache is exact, formal-only and fingerprint-bound", () => {
  const identity = {
    contract: TARGET_RELEASE_CACHE_CONTRACT,
    cacheMode: TARGET_RELEASE_CACHE_MODES.legacy,
    gitSha: SHA,
    version: "2026.08.09-1",
    releaseManifestSha256: HASH,
    releaseArtifactSha256: HASH,
    checksumsSha256: HASH,
    releaseRehearsalSha256: null,
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
  const hit = validateTargetCacheProbe(
    {
      schemaVersion: TARGET_RELEASE_CACHE_CONTRACT,
      releaseManifestSha256: HASH,
      packageHit: true,
      imageHit: false,
      cacheSource: "formal",
      sourceToken: "formal",
      avoidedBytes: 1,
      basis: [
        "release_manifest_sha256",
        "archive_sha256",
        "registry_digest",
        "docker_content_id",
        "embedded_git_sha",
      ],
    },
    HASH,
  );
  const fingerprint = targetReleaseCacheEvidenceFingerprint({
    targetKey: "demo-133",
    identity,
    probe: hit,
  });
  assert.match(fingerprint, /^[0-9a-f]{64}$/u);
  assert.notEqual(
    fingerprint,
    targetReleaseCacheEvidenceFingerprint({
      targetKey: "customer-test-133",
      identity,
      probe: hit,
    }),
  );

  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push({ command, args, input: options.input });
    return { status: 0, stdout: `${JSON.stringify(hit)}\n` };
  };
  const probe = probeTargetReleaseCache(identity, {
    runCommand,
    targetKey: "demo-133",
  });
  prepareTargetReleaseIncoming(
    {
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      identity,
      probe,
    },
    { runCommand, targetKey: "demo-133" },
  );
  assert.equal(calls.length, 2);
  assert.match(
    calls[0].input,
    /legacy_v1_existing_only\) cache_root=\$root\/release-cache/u,
  );
  assert.match(
    calls[1].input,
    /cache_files=\(release-manifest[.]json release-artifact[.]json source[.]tar sbom[.]cdx[.]json server-image[.]tar web-image[.]tar\)/u,
  );
  assert.doesNotMatch(calls[1].input, /mkdir[^\n]+release-cache/u);

  assert.throws(
    () =>
      prepareTargetReleaseIncoming(
        {
          operationId: "123e4567-e89b-42d3-a456-426614174001",
          identity,
          probe: {
            ...hit,
            packageHit: false,
            cacheSource: "none",
            sourceToken: "none",
            avoidedBytes: 0,
            basis: [],
          },
        },
        { runCommand, targetKey: "demo-133" },
      ),
    /legacy target release cache is unavailable/u,
  );
  assert.equal(calls.length, 2);
});

test("formal v1 and v2 caches execute probe and prepare with exact payloads", (t) => {
  const cases = [
    {
      cacheMode: TARGET_RELEASE_CACHE_MODES.legacy,
      operationId: "123e4567-e89b-42d3-a456-426614174001",
    },
    {
      cacheMode: TARGET_RELEASE_CACHE_MODES.direct,
      operationId: "123e4567-e89b-42d3-a456-426614174002",
    },
  ];
  for (const item of cases) {
    const root = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), "plush-formal-cache-")),
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const fixture = createExecutableCacheFixture(root, item);
    const runCommand = executableCacheRunCommand(root);
    const probe = probeTargetReleaseCache(fixture.identity, {
      runCommand,
      targetKey: "demo-133",
    });
    assert.equal(probe.packageHit, true);
    assert.equal(probe.cacheSource, "formal");
    prepareTargetReleaseIncoming(
      { operationId: item.operationId, identity: fixture.identity, probe },
      { runCommand, targetKey: "demo-133" },
    );
    const prepared = path.join(root, "incoming", item.operationId);
    for (const name of Object.keys(fixture.payload)) {
      assert.equal(
        statSync(path.join(prepared, name)).ino,
        statSync(path.join(fixture.candidate, name)).ino,
      );
    }
  }
});

test("retained v2 cache reuses only its verified payload inventory", (t) => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "plush-retained-cache-")),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const retainedOperation = "123e4567-e89b-42d3-a456-426614174000";
  const operationId = "123e4567-e89b-42d3-a456-426614174003";
  const fixture = createExecutableCacheFixture(root, {
    cacheMode: TARGET_RELEASE_CACHE_MODES.direct,
    sourceKind: "retained_operation",
    retainedOperation,
  });
  const runCommand = executableCacheRunCommand(root);
  const probe = probeTargetReleaseCache(fixture.identity, {
    runCommand,
    targetKey: "demo-133",
  });
  assert.equal(probe.packageHit, true);
  assert.equal(probe.cacheSource, "retained_operation");
  assert.equal(probe.sourceToken, retainedOperation);
  prepareTargetReleaseIncoming(
    { operationId, identity: fixture.identity, probe },
    { runCommand, targetKey: "demo-133" },
  );
  const prepared = path.join(root, "incoming", operationId);
  for (const name of Object.keys(fixture.payload)) {
    assert.equal(
      statSync(path.join(prepared, name)).ino,
      statSync(path.join(fixture.candidate, name)).ino,
    );
  }
  assert.equal(
    statSync(path.join(prepared, "promotion-manifest.json"), {
      throwIfNoEntry: false,
    }),
    undefined,
  );
  assert.equal(
    JSON.parse(readFileSync(path.join(prepared, ".target-cache.json"), "utf8"))
      .operationId,
    operationId,
  );
});
