import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  parseGitlabReleaseCLI,
  resolveGitlabReleaseCredential,
  runGitlabReleaseCLI,
  verifyGitlabReleaseCredential,
} from "./gitlab-release-cli.mjs";

const sha = "a".repeat(40);
const identity = { commit: sha, dirty: false, fingerprint: "b".repeat(64) };
const readToken = "fixture-read-credential";
const writeToken = "fixture-release-credential";
const version = "2026.10.18-2";
const root = path.resolve(import.meta.dirname, "../..");

function dependencies(overrides = {}) {
  const calls = [];
  const provider = {
    listPipelineTimings: async () => ({}),
    getReleaseStatus: async () => ({ status: "missing" }),
    listVersions: async () => [{ version: "2026.10.18-1" }],
  };
  return {
    calls,
    provider,
    env: {},
    readRepository: async () => identity,
    readCredential: async () => ({ source: "keychain", token: readToken }),
    readWriteCredential: async () => ({
      source: "keychain",
      token: writeToken,
    }),
    verifyCredential: async () => ({
      status: "passed",
      expiresAt: "2026-11-17",
    }),
    createProvider: () => provider,
    projectCI: () => ({
      status: "passed",
      current: true,
      coversWorkingTree: true,
      pipeline: { id: 99 },
    }),
    now: () => "2026-10-18T08:00:00Z",
    createService: (options) => ({
      act: async (request) => {
        calls.push({ options, request });
        return {
          operation: {
            id: "11111111-1111-4111-8111-111111111111",
            status: "waiting",
            action: "release",
          },
        };
      },
    }),
    ...overrides,
  };
}

test("release CLI rejects unknown, duplicate and credential-bearing arguments", () => {
  for (const args of [
    ["other"],
    ["publish", "--execute", "--execute"],
    ["publish", "--sha", sha, "--sha", sha],
    ["publish", "--sha", "short"],
    ["publish", "--token", writeToken],
    ["publish", "--version", "custom"],
    ["status", "--execute"],
    ["status", "--version", version],
    ["check-credentials", "--sha", sha],
    ["help", "--sha", sha],
  ])
    assert.throws(() => parseGitlabReleaseCLI(args), {
      code: "arguments_invalid",
    });
  assert.deepEqual(parseGitlabReleaseCLI([]), {
    command: "plan",
    execute: false,
  });
});

test("release plan and unconfirmed publish do not read credentials, call GitLab or create operations", async () => {
  const deps = dependencies({
    readCredential: () => assert.fail("read credential accessed"),
    readWriteCredential: () => assert.fail("write credential accessed"),
    createProvider: () => assert.fail("GitLab accessed"),
    createService: () => assert.fail("operation created"),
  });
  for (const command of ["plan", "publish"]) {
    const result = await runGitlabReleaseCLI(
      parseGitlabReleaseCLI([command]),
      deps,
    );
    assert.equal(result.mode, "plan");
    assert.equal(result.readsCredentials, false);
    assert.equal(result.dispatchesPipeline, false);
  }
});

test("dirty or mismatched source stops before credential access", async () => {
  for (const repo of [
    { ...identity, dirty: true },
    { ...identity, commit: "c".repeat(40) },
  ]) {
    await assert.rejects(
      runGitlabReleaseCLI(
        parseGitlabReleaseCLI(["publish", "--execute", "--sha", sha]),
        dependencies({
          readRepository: async () => repo,
          readCredential: () => assert.fail("credential accessed"),
        }),
      ),
      { code: "source_not_clean" },
    );
  }
});

test("publish requires the existing complete current CI projection", async () => {
  for (const ci of [
    { status: "docs_passed", current: true, coversWorkingTree: true },
    { status: "passed", current: false, coversWorkingTree: true },
    { status: "passed", current: true, coversWorkingTree: false },
  ]) {
    await assert.rejects(
      runGitlabReleaseCLI(
        parseGitlabReleaseCLI(["publish", "--execute"]),
        dependencies({
          projectCI: () => ci,
          createService: () => assert.fail("dispatch started"),
        }),
      ),
      { code: "ci_not_complete" },
    );
  }
});

test("publish derives the version and invokes the canonical service once with stable intent", async () => {
  const deps = dependencies();
  const args = parseGitlabReleaseCLI(["publish", "--execute"]);
  const first = await runGitlabReleaseCLI(args, deps);
  await runGitlabReleaseCLI(args, deps);
  assert.equal(first.version, version);
  assert.equal(first.status, "waiting");
  assert.equal(first.targetWrites, false);
  assert.equal(first.ciPipeline, 99);
  assert.equal(deps.calls.length, 2);
  assert.deepEqual(deps.calls[0].request, deps.calls[1].request);
  assert.equal(deps.calls[0].request.action, "dispatch-release");
  assert.equal(deps.calls[0].options.env.PLUSH_GITLAB_TOKEN, writeToken);
  assert.equal(deps.calls[0].options.env.PLUSH_GITLAB_READ_TOKEN, readToken);
  assert.equal(deps.calls[0].options.readProvider, deps.provider);
  assert.ok(!JSON.stringify(first).includes(writeToken));
  assert.ok(!JSON.stringify(first).includes(readToken));
});

test("source drift or version mismatch never creates a release operation", async () => {
  let reads = 0;
  const deps = dependencies({
    readRepository: async () =>
      ++reads === 1 ? identity : { ...identity, fingerprint: "d".repeat(64) },
    createService: () => assert.fail("dispatch started"),
  });
  await assert.rejects(
    runGitlabReleaseCLI(parseGitlabReleaseCLI(["publish", "--execute"]), deps),
    { code: "source_changed" },
  );
  await assert.rejects(
    runGitlabReleaseCLI(
      parseGitlabReleaseCLI([
        "publish",
        "--execute",
        "--version",
        "2026.10.18-9",
      ]),
      dependencies({ createService: () => assert.fail("dispatch started") }),
    ),
    { code: "version_mismatch" },
  );
});

test("running and failed releases are never automatically dispatched again", async () => {
  const deps = dependencies({
    createService: () => assert.fail("dispatch started"),
  });
  deps.provider.getReleaseStatus = async () => ({
    status: "running",
    run: { id: 88 },
  });
  const result = await runGitlabReleaseCLI(
    parseGitlabReleaseCLI(["publish", "--execute"]),
    deps,
  );
  assert.equal(result.status, "already_running");
  assert.equal(result.dispatchesPipeline, false);
  deps.provider.getReleaseStatus = async () => ({ status: "failed" });
  await assert.rejects(
    runGitlabReleaseCLI(parseGitlabReleaseCLI(["publish", "--execute"]), deps),
    { code: "release_failed" },
  );
});

test("unknown dispatch is reported without retrying or exposing provider diagnostics", async () => {
  let attempts = 0;
  const deps = dependencies({
    createService: () => ({
      act: async () => {
        attempts++;
        throw new Error(writeToken);
      },
    }),
  });
  await assert.rejects(
    runGitlabReleaseCLI(parseGitlabReleaseCLI(["publish", "--execute"]), deps),
    (error) => {
      assert.equal(error.code, "dispatch_not_proven");
      assert.equal(error.sha, sha);
      assert.equal(error.version, version);
      assert.match(error.idempotencyKey, /^cli-release-[0-9a-f]{32}$/u);
      assert.ok(!error.message.includes(writeToken));
      return true;
    },
  );
  assert.equal(attempts, 1);
});

test("status only uses read credentials and does not create operations", async () => {
  const deps = dependencies({
    readWriteCredential: () => assert.fail("write credential accessed"),
    createService: () => assert.fail("operation created"),
  });
  deps.provider.getReleaseStatus = async () => ({
    status: "published",
    release: { version, completeAssets: true, promotionEligible: true },
  });
  const result = await runGitlabReleaseCLI(
    parseGitlabReleaseCLI(["status", "--sha", sha]),
    deps,
  );
  assert.equal(result.promotionEligible, true);
  assert.equal(result.version, version);
});

test("write credential resolution never substitutes the read-only token", async () => {
  const missing = Object.assign(new Error("missing"), { code: 44 });
  const result = await resolveGitlabReleaseCredential({
    env: { PLUSH_GITLAB_READ_TOKEN: readToken },
    platform: "darwin",
    readKeychain: async () => {
      throw missing;
    },
  });
  assert.deepEqual(result, { source: "missing", token: "" });
  assert.deepEqual(
    await resolveGitlabReleaseCredential({
      env: { PLUSH_GITLAB_TOKEN: writeToken },
      readKeychain: () => assert.fail("keychain read"),
    }),
    { source: "environment", token: writeToken },
  );
  await assert.rejects(
    resolveGitlabReleaseCredential({
      env: {},
      platform: "darwin",
      readKeychain: async () => {
        throw new Error(writeToken);
      },
    }),
    { code: "credential_read_failed" },
  );
});

test("write credential files require owned private regular files and never follow symlinks", async () => {
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "plush-release-credential-"),
  );
  try {
    const file = path.join(temp, "credential");
    await fs.writeFile(file, writeToken, { mode: 0o600 });
    const options = {
      env: { PLUSH_GITLAB_TOKEN_FILE: file },
      platform: "linux",
    };
    assert.equal(
      (await resolveGitlabReleaseCredential(options)).token,
      writeToken,
    );
    await fs.chmod(file, 0o644);
    await assert.rejects(resolveGitlabReleaseCredential(options), {
      code: "credential_read_failed",
    });
    await fs.chmod(file, 0o600);
    const link = path.join(temp, "link");
    await fs.symlink(file, link);
    await assert.rejects(
      resolveGitlabReleaseCredential({
        ...options,
        env: { PLUSH_GITLAB_TOKEN_FILE: link },
      }),
      { code: "credential_read_failed" },
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

function capabilityRequest(overrides = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["PRIVATE-TOKEN"], writeToken);
    let value;
    if (url.endsWith("/self"))
      value = {
        id: 41,
        user_id: 51,
        active: true,
        revoked: false,
        scopes: ["api"],
        expires_at: "2026-11-17",
        ...overrides.self,
      };
    else if (url.includes("/access_tokens?"))
      value = [
        {
          id: 41,
          active: true,
          revoked: false,
          access_level: 40,
          ...overrides.scoped,
        },
      ];
    else if (url.endsWith("/branches/main"))
      value = { name: "main", protected: true, ...overrides.branch };
    else if (url.endsWith("/protected_branches/main"))
      value = {
        push_access_levels: [{ access_level: 40 }],
        merge_access_levels: [],
        ...overrides.protection,
      };
    else
      value = {
        path_with_namespace: "saurick/plush-toy-erp",
        default_branch: "main",
        ci_pipeline_variables_minimum_override_role: "developer",
        ...overrides.project,
      };
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "x-request-id": "fixture-request-id" },
    });
  };
}

test("credential capability verifies project scope, role, expiry and protected main", async () => {
  const now = () => new Date("2026-10-18T08:00:00Z");
  const result = await verifyGitlabReleaseCredential(writeToken, {
    request: capabilityRequest(),
    now,
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(result.requestIds, ["fixture-request-id"]);
  assert.ok(!JSON.stringify(result).includes(writeToken));
  for (const overrides of [
    { self: { scopes: ["read_api"] } },
    { self: { expires_at: null } },
    { self: { expires_at: "2026-10-17" } },
    { scoped: { id: 42 } },
    { scoped: { access_level: 30 } },
    { scoped: { revoked: true } },
    { scoped: { access_level: 50 } },
    { self: { active: "true" } },
    { self: { scopes: "api" } },
    { branch: { protected: "false" } },
    { project: { path_with_namespace: "other/project" } },
    { branch: { protected: false } },
    {
      project: {
        ci_pipeline_variables_minimum_override_role: "no_one_allowed",
      },
    },
    { protection: { push_access_levels: [{ access_level: 50 }] } },
    { protection: { push_access_levels: [{ user_id: 52 }] } },
  ])
    await assert.rejects(
      verifyGitlabReleaseCredential(writeToken, {
        request: capabilityRequest(overrides),
        now,
      }),
      { code: "credential_scope_invalid" },
    );
});

test("credential check does not expose rejected HTTP bodies or connection diagnostics", async () => {
  await assert.rejects(
    verifyGitlabReleaseCredential(writeToken, {
      request: async () =>
        new Response(writeToken, {
          status: 403,
          headers: { "x-request-id": "fixture-rejected-id" },
        }),
    }),
    (error) => {
      assert.equal(error.code, "credential_check_rejected");
      assert.equal(error.requestId, "fixture-rejected-id");
      assert.ok(!error.message.includes(writeToken));
      return true;
    },
  );
  await assert.rejects(
    verifyGitlabReleaseCredential(writeToken, {
      request: async () => {
        throw new Error(writeToken);
      },
    }),
    { code: "credential_check_unavailable" },
  );
  await assert.rejects(
    verifyGitlabReleaseCredential(writeToken, {
      request: async () => new Response(writeToken, { status: 200 }),
    }),
    { code: "credential_response_invalid" },
  );
});

test("real command plan completes without loading an inherited write secret", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [path.join(import.meta.dirname, "gitlab-release-cli.mjs"), "plan"],
    {
      cwd: root,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        PLUSH_GITLAB_TOKEN: writeToken,
        PLUSH_DELIVERY_PROVIDER: "gitlab",
      },
      timeout: 20000,
    },
  );
  const result = JSON.parse(stdout);
  assert.equal(result.mode, "plan");
  assert.equal(result.readsCredentials, false);
  assert.ok(!stdout.includes(writeToken));
});
