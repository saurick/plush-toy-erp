import assert from "node:assert/strict";
import test from "node:test";

import { retirePublishedCandidate } from "./gitlab-release-candidate.mjs";

const options = {
  sha: "a".repeat(40),
  version: "2026.09.06",
  customer: "yoyoosun",
};
const packageVersion = `artifact-${options.sha}`;
const candidate = {
  id: 7,
  name: "plush-release-candidate",
  version: packageVersion,
  package_type: "generic",
};
const env = {
  CI_API_V4_URL: "https://gitlab.saurick.me/api/v4",
  CI_PROJECT_ID: "1",
  GITLAB_RELEASE_TOKEN: "test-only-token",
};

function fixture({
  packages = [candidate],
  remains = [],
  verifyError,
  deleteStatus = 204,
} = {}) {
  const calls = [];
  let deleted = false;
  return {
    calls,
    env,
    async inspectPublishedRelease(received) {
      calls.push("verify-published");
      assert.deepEqual(received, options);
      if (verifyError) throw verifyError;
      return { status: "published", releaseTag: packageVersion };
    },
    async request(url, init = {}) {
      assert.equal(init.headers["PRIVATE-TOKEN"], env.GITLAB_RELEASE_TOKEN);
      assert.ok(!url.includes(env.GITLAB_RELEASE_TOKEN));
      const method = init.method || "GET";
      calls.push(`${method} ${url}`);
      if (method === "DELETE") {
        assert.equal(
          url,
          "https://gitlab.saurick.me/api/v4/projects/1/packages/7",
        );
        deleted = true;
        return { ok: deleteStatus === 204, status: deleteStatus };
      }
      if (url.includes("/package_files?")) {
        return {
          ok: true,
          json: async () => [
            {
              file_name: "candidate.tar",
              size: 123,
              file_sha256: "b".repeat(64),
            },
          ],
        };
      }
      assert.ok(url.includes("package_name=plush-release-candidate"));
      assert.ok(url.includes(`package_version=${packageVersion}`));
      return { ok: true, json: async () => (deleted ? remains : packages) };
    },
  };
}

test("retirement verifies published recovery inputs before deleting only the exact candidate and reading back", async () => {
  const runtime = fixture();
  assert.deepEqual(await retirePublishedCandidate(options, runtime), {
    status: "retired",
    packageId: 7,
    bytes: 123,
  });
  assert.equal(runtime.calls[0], "verify-published");
  assert.equal(
    runtime.calls.filter((call) => call.startsWith("DELETE ")).length,
    1,
  );
  assert.ok(runtime.calls.at(-1).startsWith("GET "));
});

test("incomplete recovery evidence retains the candidate without any deletion request", async () => {
  const runtime = fixture({
    verifyError: new Error("release source package is missing"),
  });
  await assert.rejects(
    retirePublishedCandidate(options, runtime),
    /source package is missing/u,
  );
  assert.deepEqual(runtime.calls, ["verify-published"]);
});

test("the real published verifier rejects a missing release before retirement", async () => {
  const calls = [];
  await assert.rejects(
    retirePublishedCandidate(options, {
      env,
      request: async (url, init) => {
        calls.push({ url, method: init.method || "GET" });
        return { ok: false, status: 404 };
      },
    }),
  );
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.method === "GET"));
});

test("a previously retired candidate is an idempotent success", async () => {
  const runtime = fixture({ packages: [] });
  assert.deepEqual(await retirePublishedCandidate(options, runtime), {
    status: "already-retired",
  });
  assert.ok(runtime.calls.every((call) => !call.startsWith("DELETE ")));
});

test("duplicate identities block retirement", async () => {
  const runtime = fixture({ packages: [candidate, { ...candidate, id: 8 }] });
  await assert.rejects(
    retirePublishedCandidate(options, runtime),
    /not unique/u,
  );
  assert.ok(runtime.calls.every((call) => !call.startsWith("DELETE ")));
});

test("failed deletion and residual readback cannot be reported as retirement", async () => {
  await assert.rejects(
    retirePublishedCandidate(options, fixture({ deleteStatus: 500 })),
    /status 500/u,
  );
  await assert.rejects(
    retirePublishedCandidate(options, fixture({ remains: [candidate] })),
    /readback/u,
  );
});
