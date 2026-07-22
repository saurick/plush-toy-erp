import assert from "node:assert/strict";
import test from "node:test";

import {
  YOYOOSUN_ROLE_JSONRPC_ACCESS_MATRIX,
  buildYoyoosunRoleJSONRPCAccessPlan,
  normalizeRoleAccessBackendURL,
  runYoyoosunRoleJSONRPCAccessAudit,
} from "./yoyoosun-role-jsonrpc-access.mjs";

function mockJSONRPCFetch({ overrideDenied } = {}) {
  const tokenToEntry = new Map();
  const calls = [];
  const fetchImpl = async (url, options) => {
    const domain = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    const body = JSON.parse(options.body);
    const authorization = options.headers.Authorization || "";
    const token = authorization.replace(/^Bearer\s+/u, "");
    calls.push({ domain, method: body.method, params: body.params, token });

    let result;
    if (domain === "auth" && body.method === "admin_login") {
      const entry = YOYOOSUN_ROLE_JSONRPC_ACCESS_MATRIX.find(
        (item) => item.username === body.params.username,
      );
      assert(entry, `unexpected login ${body.params.username}`);
      const accessToken = `token-${entry.roleKey}`;
      tokenToEntry.set(accessToken, entry);
      result = {
        code: 0,
        message: "OK",
        data: {
          username: entry.username,
          is_super_admin: false,
          roles: [{ role_key: entry.roleKey, name: entry.roleKey }],
          access_token: accessToken,
        },
      };
    } else {
      const entry = tokenToEntry.get(token);
      assert(entry, `missing token for ${domain}.${body.method}`);
      const isRead =
        domain === entry.read.domain && body.method === entry.read.method;
      const isDenied =
        domain === entry.deniedMutation.domain &&
        body.method === entry.deniedMutation.method;
      assert(isRead || isDenied, `unexpected call ${domain}.${body.method}`);
      result = isRead
        ? {
            code: 0,
            message: "OK",
            data: { [entry.read.totalField]: 7 },
          }
        : overrideDenied?.(entry) || {
            code: 40304,
            message: "权限不足",
            data: {},
          };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { jsonrpc: "2.0", id: body.id, result };
      },
    };
  };
  return { fetchImpl, calls };
}

test("role access plan is a safe exact nine-role matrix", () => {
  const plan = buildYoyoosunRoleJSONRPCAccessPlan();
  assert.equal(plan.accountCount, 9);
  assert.equal(plan.expectedBusinessWrites, 0);
  assert.equal(plan.authenticationSessionWritesExpected, true);
  assert.equal(plan.callsRealLogin, true);
  assert.equal(plan.callsReadRPC, true);
  assert.equal(plan.callsDeniedMutationRPC, true);
  assert.equal(plan.storesPassword, false);
  assert.equal(plan.storesAccessToken, false);
  assert.deepEqual(plan.accounts.map((entry) => entry.roleKey).sort(), [
    "boss",
    "engineering",
    "finance",
    "pmc",
    "production",
    "purchase",
    "quality",
    "sales",
    "warehouse",
  ]);
  for (const entry of plan.accounts) {
    assert.match(entry.username, /^demo_[a-z]+$/u);
    assert(entry.read.domain && entry.read.method && entry.read.totalField);
    assert(
      entry.deniedMutation.domain &&
        entry.deniedMutation.method &&
        entry.deniedMutation.safety,
    );
  }
});

test("role access backend is local-only", () => {
  assert.equal(
    normalizeRoleAccessBackendURL("http://localhost:8300"),
    "http://localhost:8300",
  );
  assert.throws(
    () => normalizeRoleAccessBackendURL("https://erp.example.com"),
    /only accepts a local backend/u,
  );
  assert.throws(
    () => normalizeRoleAccessBackendURL("http://127.0.0.1:8300/rpc"),
    /must be an origin/u,
  );
});

test("role access audit logs in all roles, proves reads, denial, and unchanged totals", async () => {
  const runtime = mockJSONRPCFetch();
  const report = await runYoyoosunRoleJSONRPCAccessAudit({
    password: "local-test-password",
    fetchImpl: runtime.fetchImpl,
  });
  assert.equal(report.passed, true);
  assert.equal(report.accountCount, 9);
  assert.equal(report.expectedBusinessWrites, 0);
  assert.equal(report.storesPassword, false);
  assert.equal(report.storesAccessToken, false);
  assert.equal(runtime.calls.length, 36);
  assert.equal(
    runtime.calls.filter(
      (call) => call.domain === "auth" && call.method === "admin_login",
    ).length,
    9,
  );
  assert(
    report.accounts.every(
      (entry) =>
        entry.permissionDeniedCode === 40304 &&
        entry.beforeTotal === entry.afterTotal &&
        entry.businessWriteObserved === false,
    ),
  );
  assert.doesNotMatch(JSON.stringify(report), /local-test-password|token-/u);
});

test("role access audit fails closed when a denied mutation is not permission denied", async () => {
  const runtime = mockJSONRPCFetch({
    overrideDenied(entry) {
      if (entry.roleKey === "boss") {
        return { code: 40001, message: "参数错误", data: {} };
      }
      return null;
    },
  });
  await assert.rejects(
    () =>
      runYoyoosunRoleJSONRPCAccessAudit({
        password: "local-test-password",
        fetchImpl: runtime.fetchImpl,
      }),
    /must be permission denied/u,
  );
});
