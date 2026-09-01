import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  GITLAB_DELIVERY_BASE_URL,
  GITLAB_DELIVERY_PACKAGE,
  GITLAB_LEGACY_RELEASE_ASSETS,
  GITLAB_DELIVERY_PROJECT,
  GITLAB_RELEASE_ASSETS,
  GITLAB_SOURCE_PACKAGE,
  createGitlabDeliveryProvider,
} from "./gitlab-delivery-provider.mjs";
import { buildReleaseManifest } from "./release-catalog.mjs";
import { buildTargetReleaseCacheIdentity } from "./target-release-cache.mjs";

const SHA = "a".repeat(40);
const TOKEN = "test-token-never-returned";

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function releaseFixture() {
  return {
    tag_name: `artifact-${SHA}`,
    name: "2026.08.27-1",
    created_at: "2026-08-27T01:00:00Z",
    released_at: "2026-08-27T02:00:00Z",
    upcoming_release: false,
    commit: { id: SHA },
    _links: {
      self: `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}/-/releases/artifact-${SHA}`,
    },
  };
}

function packageFiles() {
  return GITLAB_RELEASE_ASSETS.map((file_name, index) => ({
    file_name,
    size: (index + 1) * 100,
    file_sha256: "0".repeat(64),
  }));
}

function releaseDetailFixture() {
  const hash = "b".repeat(64);
  const serverDigest = `sha256:${"1".repeat(64)}`;
  const webDigest = `sha256:${"2".repeat(64)}`;
  const counts = { executed: 1, passed: 1, failed: 0, skipped: 0 };
  const artifact = {
    schemaVersion: "plush-release-artifact/v1",
    git: { commit: SHA },
    performance: {
      build: {
        schemaVersion: "plush.release-build-performance/v1",
        durationMs: 42_000,
        cacheMode: "builder",
        completedVertexCount: 20,
        cacheHitCount: 16,
        cacheMissCount: 4,
        cacheHitRateBasisPoints: 8_000,
      },
    },
  };
  const manifest = {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: "2026.08.27-1",
    gitSha: SHA,
    strict: {
      contract: "plush.exact-sha-strict/v3",
      status: "passed",
      fingerprint: "3".repeat(64),
      receiptSha256: "4".repeat(64),
      identity: {
        repository: GITLAB_DELIVERY_PROJECT,
        gitSha: SHA,
        sourceArchiveSha256: hash,
        policyFingerprint: "3".repeat(64),
        workflowFingerprint: "5".repeat(64),
        toolchainFingerprint: "6".repeat(64),
        migrationSequenceSha256: hash,
        dependencyLockFingerprint: "7".repeat(64),
        customerConfigFingerprint: hash,
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
          checkedAt: "2026-08-27T00:00:00.000Z",
          validUntil: "2026-08-28T00:00:00.000Z",
        },
      },
      provenance: {
        source: "gitlab-ci",
        repository: GITLAB_DELIVERY_PROJECT,
        workflowRef: `${GITLAB_DELIVERY_PROJECT}/.gitlab-ci.yml@refs/heads/main`,
        runId: "91",
        runAttempt: "17",
        job: "strict",
        eventName: "web",
        ref: "refs/heads/main",
        refName: "main",
        headRepository: GITLAB_DELIVERY_PROJECT,
        conclusion: "success",
      },
    },
    artifact: { manifestSha256: "8".repeat(64), sourceArchiveSha256: hash },
    migration: { latest: "20260730161955", sequenceSha256: hash },
    customerConfig: { sourceSha256: hash },
    images: [
      {
        kind: "server",
        repository: "ghcr.io/saurick/plush-toy-erp-server",
        digest: serverDigest,
        ref: `ghcr.io/saurick/plush-toy-erp-server@${serverDigest}`,
        sourceContentId: `sha256:${"8".repeat(64)}`,
      },
      {
        kind: "web",
        repository: "ghcr.io/saurick/plush-toy-erp-web",
        digest: webDigest,
        ref: `ghcr.io/saurick/plush-toy-erp-web@${webDigest}`,
        sourceContentId: `sha256:${"9".repeat(64)}`,
      },
    ],
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
    },
  };
  Object.assign(artifact, {
    passed: true,
    releaseVersion: "2026.08.27-1",
    git: { commit: SHA, head: SHA, worktreeClean: true },
    sourceArchive: { sha256: hash, secretScan: "passed" },
    migration: { latest: "20260730161955", sequenceSha256: hash },
    customerConfig: { sourceSha256: hash },
    sbom: { file: "sbom.cdx.json", sha256: hash },
    images: [
      {
        kind: "server",
        ref: `plush-toy-erp-server:yoyoosun-${SHA}`,
        contentId: `sha256:${"8".repeat(64)}`,
        gitSha: SHA,
        releaseVersion: "2026.08.27-1",
        platform: "linux/amd64",
        archive: {
          file: "server-image.tar",
          sha256: "a".repeat(64),
          sizeBytes: 100,
        },
        metadataSecretScan: { passed: true },
      },
      {
        kind: "web",
        ref: `plush-toy-erp-web:yoyoosun-${SHA}`,
        contentId: `sha256:${"9".repeat(64)}`,
        gitSha: SHA,
        releaseVersion: "2026.08.27-1",
        platform: "linux/amd64",
        archive: {
          file: "web-image.tar",
          sha256: "b".repeat(64),
          sizeBytes: 100,
        },
        metadataSecretScan: { passed: true },
      },
    ],
  });
  const runtime = {
    serverHealth: "passed",
    serverReady: "passed",
    webHealth: "passed",
    webRoot: "passed",
    runtimeIdentity: "passed",
    authenticatedAdmin: "passed",
    embeddedGitSha: SHA,
  };
  const receipt = {
    schemaVersion: "plush-local-release-rehearsal/v1",
    passed: true,
    customer: "yoyoosun",
    generatedAt: "2026-08-27T01:30:00.000Z",
    finishedAt: "2026-08-27T01:45:00.000Z",
    git: { commit: SHA, head: SHA, worktreeClean: true },
    artifact: {
      manifestSchema: artifact.schemaVersion,
      server: artifact.images[0].contentId,
      web: artifact.images[1].contentId,
      migrationSequenceSha256: hash,
      sbomSha256: hash,
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
      backupSha256: "c".repeat(64),
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
  const strictTerminal = {
    contract: "plush.exact-sha-strict/v3",
    profile: "strict",
    gitSha: SHA,
    fingerprint: "3".repeat(64),
    status: "passed",
    receipt: { sha256: "4".repeat(64) },
    identity: manifest.strict.identity,
    checks: manifest.strict.checks,
    timeSensitiveChecks: manifest.strict.timeSensitiveChecks,
    provenance: {
      ...manifest.strict.provenance,
      job: "quality_aggregate",
      eventName: "push",
    },
  };
  const receiptSha256 = createHash("sha256")
    .update(JSON.stringify(receipt))
    .digest("hex");
  const artifactManifestSha256 = createHash("sha256")
    .update(JSON.stringify(artifact))
    .digest("hex");
  return {
    artifact,
    manifest: buildReleaseManifest({
      version: "2026.08.27-1",
      gitSha: SHA,
      strictTerminal,
      artifactManifest: artifact,
      artifactManifestSha256,
      images: manifest.images.map(({ kind, repository, digest }) => ({
        kind,
        repository,
        digest,
      })),
      rehearsalReceipt: receipt,
      rehearsalReceiptSha256: receiptSha256,
    }),
    receipt,
    serverDigest,
    webDigest,
  };
}

test("GitLab provider lists immutable releases from the fixed project and package", async () => {
  const seen = [];
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url, options) => {
      seen.push({ url, options });
      if (url.includes("/releases?")) return json([releaseFixture()]);
      if (url.includes("/packages?")) {
        return json([
          {
            id: 41,
            package_type: "generic",
            name: GITLAB_DELIVERY_PACKAGE,
            version: `artifact-${SHA}`,
          },
        ]);
      }
      if (url.includes("/packages/41/package_files")) {
        return json(packageFiles());
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });

  const [version] = await provider.listVersions({ limit: 100 });
  assert.equal(version.gitSha, SHA);
  assert.equal(version.completeAssets, true);
  assert.equal(version.artifactSummary.totalBytes, 2_800);
  assert.equal(provider.provider, "gitlab");
  assert.equal(
    seen.some(({ url }) => url.includes("/releases?per_page=100")),
    true,
  );
  assert.equal(
    seen.every(
      ({ url, options }) =>
        url.startsWith(`${GITLAB_DELIVERY_BASE_URL}/api/v4/projects/`) &&
        options.headers["PRIVATE-TOKEN"] === TOKEN,
    ),
    true,
  );
  assert.equal(JSON.stringify(version).includes(TOKEN), false);
});

test("GitLab provider enriches the newest release with build and digest evidence", async () => {
  const detail = releaseDetailFixture();
  const bodies = {
    "release-artifact.json": JSON.stringify(detail.artifact),
    "release-manifest.json": JSON.stringify(detail.manifest),
    "release-rehearsal.json": JSON.stringify(detail.receipt),
  };
  const files = packageFiles().map((file) => ({
    ...file,
    size: bodies[file.file_name]
      ? Buffer.byteLength(bodies[file.file_name])
      : file.size,
    file_sha256: bodies[file.file_name]
      ? createHash("sha256").update(bodies[file.file_name]).digest("hex")
      : file.file_sha256,
  }));
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url) => {
      if (url.includes("/releases?")) return json([releaseFixture()]);
      if (url.includes("/packages?") && url.includes("package_name=plush-release-source")) {
        return json([{
          id: 42,
          package_type: "generic",
          name: GITLAB_SOURCE_PACKAGE,
          version: `artifact-${SHA}`,
        }]);
      }
      if (url.includes("/packages?")) {
        return json([
          {
            id: 41,
            package_type: "generic",
            name: GITLAB_DELIVERY_PACKAGE,
            version: `artifact-${SHA}`,
          },
        ]);
      }
      if (url.includes("/packages/41/package_files")) return json(files);
      if (url.includes("/packages/42/package_files")) {
        return json([{
          file_name: "source.tar",
          size: 101,
          file_sha256: detail.artifact.sourceArchive.sha256,
        }]);
      }
      const asset = Object.keys(bodies).find((name) => url.endsWith(`/${name}`));
      if (asset) return new Response(bodies[asset], { status: 200 });
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const [version] = await provider.listVersions();
  assert.equal(version.buildPerformance.cacheHitRateBasisPoints, 8_000);
  assert.deepEqual(version.imageDigests, {
    server: detail.serverDigest,
    web: detail.webDigest,
  });
  assert.equal(version.promotionEligible, true);
});

test("GitLab provider normalizes pipeline and job timings", async () => {
  const pipeline = {
    id: 91,
    iid: 17,
    sha: SHA,
    source: "push",
    status: "success",
    created_at: "2026-08-27T01:00:00Z",
    started_at: "2026-08-27T01:00:03Z",
    finished_at: "2026-08-27T01:01:03Z",
    updated_at: "2026-08-27T01:01:03Z",
    duration: 60,
    queued_duration: 3,
    web_url: `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}/-/pipelines/91`,
  };
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url) => {
      if (url.endsWith("/pipelines?ref=main&order_by=id&sort=desc&per_page=8")) {
        return json([{ id: 91 }]);
      }
      if (url.endsWith("/pipelines/91")) return json(pipeline);
      if (url.includes("/pipelines/91/jobs?")) {
        return json([
          {
            id: 301,
            name: "quality",
            status: "success",
            started_at: "2026-08-27T01:00:03Z",
            finished_at: "2026-08-27T01:01:03Z",
            duration: 60,
          },
          {
            id: 302,
            name: "plan-retry",
            status: "waiting_for_callback",
            started_at: null,
            finished_at: null,
            duration: null,
          },
        ]);
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const timings = await provider.listPipelineTimings();
  assert.equal(timings.runs[0].workflow, "ci");
  assert.equal(timings.runs[0].status, "completed");
  assert.equal(timings.runs[0].queueMs, 3_000);
  assert.equal(timings.runs[0].jobs[0].steps.length, 0);
  assert.equal(timings.runs[0].jobs[1].status, "queued");
});

test("GitLab provider dispatches only the exact current main SHA", async () => {
  let dispatchOptions;
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url, options) => {
      if (url.endsWith("/repository/branches/main")) {
        return json({ commit: { id: SHA } });
      }
      if (url.endsWith("/pipeline")) {
        dispatchOptions = options;
        return json({
          id: 92,
          sha: SHA,
          web_url: `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}/-/pipelines/92`,
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const result = await provider.dispatchRelease({
    gitSha: SHA,
    version: "2026.08.27-1",
    customer: "yoyoosun",
    versionReference: "2026-08-27T01:00:00.000Z",
  });
  assert.equal(result.provider, "gitlab");
  assert.equal(dispatchOptions.method, "POST");
  assert.equal(dispatchOptions.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(dispatchOptions.body), {
    ref: "main",
    variables: [
      { key: "RELEASE_SHA", value: SHA },
      { key: "RELEASE_VERSION", value: "2026.08.27-1" },
      { key: "RELEASE_CUSTOMER", value: "yoyoosun" },
      {
        key: "RELEASE_VERSION_REFERENCE",
        value: "2026-08-27T01:00:00.000Z",
      },
    ],
  });
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("GitLab provider exposes no Mac full-release download path", () => {
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async () => json([]),
  });
  assert.equal(provider.downloadRelease, undefined);
  assert.equal(typeof provider.downloadReleaseControl, "function");
});

test("GitLab provider rejects duplicate formal package identities", async () => {
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url) => {
      if (url.includes("/packages?")) {
        return json([41, 42].map((id) => ({
          id,
          package_type: "generic",
          name: GITLAB_DELIVERY_PACKAGE,
          version: `artifact-${SHA}`,
        })));
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const destination = path.join(
    process.cwd(),
    "output",
    "dev-workbench",
    "release-controls",
    "duplicate-formal-package",
  );
  await assert.rejects(
    provider.downloadReleaseControl(SHA, destination),
    /not unique/u,
  );
});

test("GitLab provider downloads only bounded control evidence for target-direct acquisition", async () => {
  const detail = releaseDetailFixture();
  const bodies = {
    "release-artifact.json": JSON.stringify(detail.artifact),
    "release-manifest.json": JSON.stringify(detail.manifest),
    "release-rehearsal.json": JSON.stringify(detail.receipt),
  };
  const digests = Object.fromEntries(
    Object.entries(bodies).map(([name, body]) => [
      name,
      createHash("sha256").update(body).digest("hex"),
    ]),
  );
  const largeDigests = {
    "sbom.cdx.json": detail.artifact.sbom.sha256,
    "server-image.tar": detail.artifact.images[0].archive.sha256,
    "web-image.tar": detail.artifact.images[1].archive.sha256,
  };
  bodies["checksums.sha256"] = `${Object.entries({
    ...digests,
    ...largeDigests,
  })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${digest}  ${name}`)
    .join("\n")}\n`;
  digests["checksums.sha256"] = createHash("sha256")
    .update(bodies["checksums.sha256"])
    .digest("hex");
  const formalFiles = GITLAB_RELEASE_ASSETS.map((file_name) => {
    const body = bodies[file_name];
    const archive = detail.artifact.images.find(
      (image) => image.archive.file === file_name,
    );
    return {
      file_name,
      size: body ? Buffer.byteLength(body) : archive?.archive?.sizeBytes || 101,
      file_sha256: digests[file_name] || largeDigests[file_name],
    };
  });
  const sourcePackage = {
    file_name: "source.tar",
    size: 1_048_576,
    file_sha256: detail.artifact.sourceArchive.sha256,
  };
  const requestedAssets = [];
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url) => {
      if (url.includes("/packages?") && url.includes("package_name=plush-release-source")) {
        return json([
          {
            id: 42,
            package_type: "generic",
            name: GITLAB_SOURCE_PACKAGE,
            version: `artifact-${SHA}`,
          },
        ]);
      }
      if (url.includes("/packages?")) {
        return json([
          {
            id: 41,
            package_type: "generic",
            name: GITLAB_DELIVERY_PACKAGE,
            version: `artifact-${SHA}`,
          },
        ]);
      }
      if (url.includes("/packages/41/package_files")) return json(formalFiles);
      if (url.includes("/packages/42/package_files")) return json([sourcePackage]);
      const asset = Object.keys(bodies).find((name) => url.endsWith(`/${name}`));
      if (asset) {
        requestedAssets.push(asset);
        return new Response(bodies[asset], { status: 200 });
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const outputRoot = path.join(
    process.cwd(),
    "output",
    "dev-workbench",
    "release-controls",
  );
  mkdirSync(outputRoot, { recursive: true });
  const temporaryRoot = mkdtempSync(path.join(outputRoot, "provider-control-"));
  const destination = path.join(temporaryRoot, SHA);
  try {
    const result = await provider.downloadReleaseControl(SHA, destination);
    assert.equal(result.reused, false);
    assert.equal(result.transportMode, "v2_direct");
    assert.deepEqual(requestedAssets.sort(), Object.keys(bodies).sort());
    assert.equal(result.fetch.source.file.size, sourcePackage.size);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
    assert.deepEqual(result.assets, [
      "checksums.sha256",
      "release-artifact.json",
      "release-manifest.json",
      "release-rehearsal.json",
      "target-release-fetch.json",
    ]);
    const cacheIdentity = buildTargetReleaseCacheIdentity({
      bundleDir: destination,
      releaseManifestPath: path.join(destination, "release-manifest.json"),
    });
    assert.equal(cacheIdentity.gitSha, SHA);
    assert.equal(
      cacheIdentity.sourceArchiveSha256,
      detail.artifact.sourceArchive.sha256,
    );
    const reused = await provider.downloadReleaseControl(SHA, destination);
    assert.equal(reused.reused, true);
    assert.deepEqual(requestedAssets.sort(), Object.keys(bodies).sort());

    const fetchFile = path.join(destination, "target-release-fetch.json");
    const stale = JSON.parse(readFileSync(fetchFile, "utf8"));
    stale.source.file.sha256 = "e".repeat(64);
    writeFileSync(fetchFile, `${JSON.stringify(stale)}\n`);
    await assert.rejects(
      provider.downloadReleaseControl(SHA, destination),
      /stale or invalid/u,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("GitLab provider reads legacy release controls without source lookup or Mac payload transfer", async () => {
  const detail = releaseDetailFixture();
  const legacyManifest = structuredClone(detail.manifest);
  legacyManifest.schemaVersion = "plush.release-manifest/v1";
  delete legacyManifest.rehearsal;
  const bodies = {
    "release-artifact.json": JSON.stringify(detail.artifact),
    "release-manifest.json": JSON.stringify(legacyManifest),
  };
  const digests = Object.fromEntries(
    Object.entries(bodies).map(([name, body]) => [
      name,
      createHash("sha256").update(body).digest("hex"),
    ]),
  );
  const payloadDigests = {
    "sbom.cdx.json": detail.artifact.sbom.sha256,
    "server-image.tar": detail.artifact.images[0].archive.sha256,
    "web-image.tar": detail.artifact.images[1].archive.sha256,
  };
  bodies["checksums.sha256"] = `${Object.entries({
    ...digests,
    ...payloadDigests,
  })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${digest}  ${name}`)
    .join("\n")}\n`;
  digests["checksums.sha256"] = createHash("sha256")
    .update(bodies["checksums.sha256"])
    .digest("hex");
  const formalFiles = GITLAB_LEGACY_RELEASE_ASSETS.map((file_name) => ({
    file_name,
    size: bodies[file_name]
      ? Buffer.byteLength(bodies[file_name])
      : file_name === "server-image.tar"
        ? detail.artifact.images[0].archive.sizeBytes
        : file_name === "web-image.tar"
          ? detail.artifact.images[1].archive.sizeBytes
          : 101,
    file_sha256: digests[file_name] || payloadDigests[file_name],
  }));
  const requestedAssets = [];
  let sourceQueries = 0;
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url) => {
      if (url.includes("package_name=plush-release-source")) {
        sourceQueries += 1;
        throw new Error("legacy release must not query the source package");
      }
      if (url.includes("/packages?")) {
        return json([
          {
            id: 41,
            package_type: "generic",
            name: GITLAB_DELIVERY_PACKAGE,
            version: `artifact-${SHA}`,
          },
        ]);
      }
      if (url.includes("/packages/41/package_files")) return json(formalFiles);
      const asset = Object.keys(bodies).find((name) =>
        url.endsWith(`/${name}`),
      );
      if (asset) {
        requestedAssets.push(asset);
        return new Response(bodies[asset], { status: 200 });
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const outputRoot = path.join(
    process.cwd(),
    "output",
    "dev-workbench",
    "release-controls",
  );
  mkdirSync(outputRoot, { recursive: true });
  const temporaryRoot = mkdtempSync(path.join(outputRoot, "provider-legacy-"));
  const destination = path.join(temporaryRoot, SHA);
  try {
    const result = await provider.downloadReleaseControl(SHA, destination);
    assert.equal(result.transportMode, "legacy_v1_cache_only");
    assert.equal(result.fetch, null);
    assert.equal(sourceQueries, 0);
    assert.deepEqual(requestedAssets.sort(), Object.keys(bodies).sort());
    assert.deepEqual(result.assets, [
      "checksums.sha256",
      "release-artifact.json",
      "release-manifest.json",
    ]);
    assert.equal(
      buildTargetReleaseCacheIdentity({
        bundleDir: destination,
        releaseManifestPath: path.join(destination, "release-manifest.json"),
      }).cacheMode,
      "legacy_v1_existing_only",
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
