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
      ].map((name) => ({ name })),
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
  assert.equal(invocation.command, "gh");
  assert(invocation.args.includes(`X-GitHub-Api-Version: ${GITHUB_API_VERSION}`));
  assert.equal(
    Object.keys(invocation.options).some((key) =>
      /token|secret|password/iu.test(key),
    ),
    false,
  );
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
        !/401|403|429|ghp_|secret|token|authorization/iu.test(
          error.message,
        ),
    );
  }
});
