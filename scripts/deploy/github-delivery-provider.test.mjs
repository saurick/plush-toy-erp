import assert from "node:assert/strict";
import test from "node:test";

import {
  GITHUB_API_VERSION,
  GITHUB_DELIVERY_REPOSITORY,
  GITHUB_RELEASE_WORKFLOW,
  createGithubDeliveryProvider,
} from "./github-delivery-provider.mjs";

const SHA = "a".repeat(40);

function releaseResponse() {
  return JSON.stringify([
    {
      tag_name: `artifact-${SHA}`,
      target_commitish: SHA,
      name: "2026.07.29-1",
      draft: false,
      prerelease: false,
      published_at: "2026-07-29T05:00:00Z",
      html_url: `https://github.com/${GITHUB_DELIVERY_REPOSITORY}/releases/tag/artifact-${SHA}`,
      assets: [
        "release-manifest.json",
        "release-artifact.json",
        "sbom.cdx.json",
        "checksums.sha256",
        "server-image.tar",
        "web-image.tar",
      ].map((name, index) => ({ name, size: (index + 1) * 100 })),
    },
  ]);
}

test("GitHub provider lists only immutable exact-SHA releases", () => {
  let invocation;
  const provider = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    runCommand: (command, args, options) => {
      invocation = { command, args, options };
      return { status: 0, stdout: releaseResponse(), stderr: "" };
    },
  });
  const versions = provider.listVersions();
  assert.equal(versions.length, 1);
  assert.equal(versions[0].gitSha, SHA);
  assert.equal(versions[0].completeAssets, true);
  assert.deepEqual(versions[0].artifactSummary, {
    totalBytes: 2_100,
    serverImageBytes: 500,
    webImageBytes: 600,
    sbomBytes: 300,
  });
  assert.equal(versions[0].buildPerformance, null);
  assert.equal(versions[0].imageDigests, null);
  assert.equal(invocation.command, "gh");
  assert(
    invocation.args.includes(`X-GitHub-Api-Version: ${GITHUB_API_VERSION}`),
  );
  assert.equal(
    Object.keys(invocation.options).some((key) =>
      /token|secret|password/iu.test(key),
    ),
    false,
  );
});

test("GitHub provider enriches the newest immutable release with build and digest evidence", () => {
  const serverDigest = `sha256:${"1".repeat(64)}`;
  const webDigest = `sha256:${"2".repeat(64)}`;
  const releases = JSON.parse(releaseResponse());
  releases[0].assets = releases[0].assets.map((asset, index) => ({
    ...asset,
    id: index + 101,
  }));
  const artifact = {
    schemaVersion: "plush-release-artifact/v1",
    git: { commit: SHA },
    performance: {
      build: {
        schemaVersion: "plush.release-build-performance/v1",
        durationMs: 42_000,
        cacheMode: "gha",
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
    version: "2026.07.29-1",
    gitSha: SHA,
    strict: {
      contract: "plush.exact-sha-strict/v2",
      status: "passed",
      fingerprint: "3".repeat(64),
      receiptSha256: "4".repeat(64),
      provenance: {
        source: "github-actions",
        repository: GITHUB_DELIVERY_REPOSITORY,
        workflowRef: `${GITHUB_DELIVERY_REPOSITORY}/.github/workflows/release.yml@refs/heads/main`,
        runId: "321",
        runAttempt: "1",
        job: "strict",
      },
    },
    artifact: { manifestSha256: "5".repeat(64) },
    migration: {
      latest: "20260730161955",
      sequenceSha256: "6".repeat(64),
    },
    customerConfig: { sourceSha256: "7".repeat(64) },
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
  let assetReads = 0;
  const provider = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    runCommand: (_command, args) => {
      const endpoint = String(args.at(-1));
      if (endpoint.includes("/releases?")) {
        return { status: 0, stdout: JSON.stringify(releases), stderr: "" };
      }
      assetReads += 1;
      const artifactAsset = releases[0].assets.find(
        (asset) => asset.name === "release-artifact.json",
      );
      return {
        status: 0,
        stdout: JSON.stringify(
          endpoint.endsWith(`/${artifactAsset.id}`) ? artifact : manifest,
        ),
        stderr: "",
      };
    },
  });
  const [version] = provider.listVersions();
  assert.equal(version.buildPerformance.cacheHitRateBasisPoints, 8_000);
  assert.deepEqual(version.imageDigests, {
    server: serverDigest,
    web: webDigest,
  });
  provider.listVersions();
  assert.equal(assetReads, 2, "immutable detail is read once per SHA");
});

test("GitHub provider returns bounded run, job and step timings", () => {
  const calls = [];
  const provider = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    now: () => "2026-08-08T02:05:00.000Z",
    runCommand: (_command, args) => {
      calls.push(args);
      if (String(args.at(-1)).includes("/actions/runs?")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            total_count: 1,
            workflow_runs: [
              {
                id: 321,
                run_attempt: 2,
                path: ".github/workflows/release.yml",
                event: "workflow_dispatch",
                status: "completed",
                conclusion: "success",
                head_sha: SHA,
                created_at: "2026-08-08T02:00:00.000Z",
                run_started_at: "2026-08-08T02:00:10.000Z",
                updated_at: "2026-08-08T02:04:10.000Z",
                html_url: `https://github.com/${GITHUB_DELIVERY_REPOSITORY}/actions/runs/321`,
              },
            ],
          }),
          stderr: "",
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({
          total_count: 1,
          jobs: [
            {
              id: 654,
              name: "Publish immutable release",
              status: "completed",
              conclusion: "success",
              started_at: "2026-08-08T02:00:20.000Z",
              completed_at: "2026-08-08T02:04:00.000Z",
              steps: [
                {
                  number: 1,
                  name: "Build both images",
                  status: "completed",
                  conclusion: "success",
                  started_at: "2026-08-08T02:00:30.000Z",
                  completed_at: "2026-08-08T02:03:30.000Z",
                },
              ],
            },
          ],
        }),
        stderr: "",
      };
    },
  });

  const timings = provider.listPipelineTimings({ limit: 1 });
  assert.equal(timings.schemaVersion, "plush.delivery-pipeline-timings/v1");
  assert.equal(timings.generatedAt, "2026-08-08T02:05:00.000Z");
  assert.equal(timings.runs[0].workflow, "release");
  assert.equal(timings.runs[0].queueMs, 10_000);
  assert.equal(timings.runs[0].durationMs, 240_000);
  assert.equal(timings.runs[0].jobs[0].durationMs, 220_000);
  assert.equal(timings.runs[0].jobs[0].steps[0].durationMs, 180_000);
  assert.equal(calls.length, 2);
  assert.match(String(calls[1].at(-1)), /runs\/321\/attempts\/2\/jobs/u);
});

test("GitHub provider dispatch is fixed to main release workflow and customer", () => {
  let invocation;
  const provider = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    runCommand: (command, args) => {
      invocation = { command, args };
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  const report = provider.dispatchRelease({
    gitSha: SHA,
    version: "2026.07.29-1",
    customer: "yoyoosun",
  });
  assert.equal(report.status, "accepted");
  assert.deepEqual(invocation.args, [
    "workflow",
    "run",
    GITHUB_RELEASE_WORKFLOW,
    "--repo",
    GITHUB_DELIVERY_REPOSITORY,
    "--ref",
    "main",
    "-f",
    `sha=${SHA}`,
    "-f",
    "version=2026.07.29-1",
    "-f",
    "customer=yoyoosun",
  ]);
  assert.throws(
    () =>
      provider.dispatchRelease({
        gitSha: SHA,
        version: "2026.07.29-1",
        customer: "other",
      }),
    /invalid/u,
  );
});

test("GitHub provider reports workflow state without exposing CLI stderr", () => {
  let call = 0;
  const provider = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    runCommand: (_command, args) => {
      call += 1;
      if (args[0] === "api") {
        return { status: 0, stdout: "[]", stderr: "" };
      }
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            databaseId: 123,
            status: "in_progress",
            conclusion: "",
            url: `https://github.com/${GITHUB_DELIVERY_REPOSITORY}/actions/runs/123`,
            createdAt: "2026-07-29T05:00:00Z",
            headSha: SHA,
          },
        ]),
        stderr: "",
      };
    },
  });
  const status = provider.getReleaseStatus(SHA);
  assert.equal(call, 2);
  assert.equal(status.status, "running");
  assert.equal(status.run.id, 123);

  const broken = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    runCommand: () => ({
      status: 1,
      stdout: "",
      stderr: "ghp_example-secret-token",
    }),
  });
  assert.throws(
    () => broken.listVersions(),
    (error) =>
      /exit 1/u.test(error.message) &&
      !/ghp_|secret|token/iu.test(error.message),
  );
});

test("GitHub provider selects the newest run when workflow status is unordered", () => {
  const provider = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    runCommand: (_command, args) => {
      if (args[0] === "api") {
        return { status: 0, stdout: "[]", stderr: "" };
      }
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            databaseId: 120,
            status: "completed",
            conclusion: "failure",
            url: `https://github.com/${GITHUB_DELIVERY_REPOSITORY}/actions/runs/120`,
            createdAt: "2026-07-29T04:00:00Z",
            headSha: SHA,
          },
          {
            databaseId: 123,
            status: "in_progress",
            conclusion: "",
            url: `https://github.com/${GITHUB_DELIVERY_REPOSITORY}/actions/runs/123`,
            createdAt: "2026-07-29T05:00:00Z",
            headSha: SHA,
          },
        ]),
        stderr: "",
      };
    },
  });
  const status = provider.getReleaseStatus(SHA);
  assert.equal(status.status, "running");
  assert.equal(status.run.id, 123);
});

test("GitHub provider sanitizes timeout, authentication and rate-limit failures", () => {
  const timeout = createGithubDeliveryProvider({
    projectRoot: process.cwd(),
    runCommand: () => ({
      error: Object.assign(new Error("ghp_sensitive timed out"), {
        code: "ETIMEDOUT",
      }),
      status: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
    }),
  });
  assert.throws(
    () => timeout.listVersions(),
    (error) =>
      /timed out/u.test(error.message) &&
      !/ghp_|sensitive|token/iu.test(error.message),
  );

  for (const rawFailure of [
    "HTTP 401 token ghp_sensitive",
    "HTTP 403 secret rate limit",
    "HTTP 429 authorization exhausted",
  ]) {
    const provider = createGithubDeliveryProvider({
      projectRoot: process.cwd(),
      runCommand: () => ({
        status: 1,
        stdout: "",
        stderr: rawFailure,
      }),
    });
    assert.throws(
      () => provider.listVersions(),
      (error) =>
        /exit 1/u.test(error.message) &&
        !/401|403|429|ghp_|secret|token|authorization/iu.test(error.message),
    );
  }
});
