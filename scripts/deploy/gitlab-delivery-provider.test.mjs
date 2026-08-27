import assert from "node:assert/strict";
import test from "node:test";

import {
  GITLAB_DELIVERY_BASE_URL,
  GITLAB_DELIVERY_PACKAGE,
  GITLAB_DELIVERY_PROJECT,
  GITLAB_RELEASE_ASSETS,
  createGitlabDeliveryProvider,
} from "./gitlab-delivery-provider.mjs";

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
    _links: {
      self: `${GITLAB_DELIVERY_BASE_URL}/${GITLAB_DELIVERY_PROJECT}/-/releases/artifact-${SHA}`,
    },
  };
}

function packageFiles() {
  return GITLAB_RELEASE_ASSETS.map((file_name, index) => ({
    file_name,
    size: (index + 1) * 100,
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
  return { artifact, manifest, serverDigest, webDigest };
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

  const [version] = await provider.listVersions();
  assert.equal(version.gitSha, SHA);
  assert.equal(version.completeAssets, true);
  assert.equal(version.artifactSummary.totalBytes, 2_100);
  assert.equal(provider.provider, "gitlab");
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
  };
  const files = packageFiles().map((file) => ({
    ...file,
    size: bodies[file.file_name]
      ? Buffer.byteLength(bodies[file.file_name])
      : file.size,
  }));
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url) => {
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
      if (url.includes("/packages/41/package_files")) return json(files);
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
  let dispatchBody;
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async (url, options) => {
      if (url.endsWith("/repository/branches/main")) {
        return json({ commit: { id: SHA } });
      }
      if (url.endsWith("/pipeline")) {
        dispatchBody = String(options.body);
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
  });
  assert.equal(result.provider, "gitlab");
  assert.match(dispatchBody, /RELEASE_SHA/u);
  assert.match(dispatchBody, new RegExp(SHA, "u"));
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("GitLab provider rejects release downloads outside the fixed output root", async () => {
  const provider = createGitlabDeliveryProvider({
    projectRoot: process.cwd(),
    env: { PLUSH_GITLAB_TOKEN: TOKEN },
    request: async () => json([]),
  });
  await assert.rejects(
    provider.downloadRelease(SHA, "/tmp/plush-release"),
    /fixed output root/u,
  );
});
