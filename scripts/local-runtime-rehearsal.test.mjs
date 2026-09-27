import assert from "node:assert/strict";
import test from "node:test";
import {
  waitForRehearsalStorage,
  verifyRuntimeBusiness,
} from "./local-runtime-rehearsal.mjs";

test("restoration waits for temporary storage readiness after container creation", async () => {
  let checks = 0;
  await waitForRehearsalStorage(
    async () => {
      checks += 1;
      if (checks < 3) throw new Error("bucket not initialized");
    },
    { timeoutMs: 1000, intervalMs: 1 },
  );
  assert.equal(checks, 3);
});

test("storage readiness failure stops before attachment restoration", async () => {
  let restored = false;
  await assert.rejects(async () => {
    await waitForRehearsalStorage(
      async () => {
        throw new Error("unavailable");
      },
      { timeoutMs: 10, intervalMs: 1 },
    );
    restored = true;
  }, /临时附件恢复存储未就绪/u);
  assert.equal(restored, false);
});

test("successful RPC responses cannot substitute for an active customer business session", async () => {
  for (const context of [
    {},
    {
      customer: { key: "different" },
      source: "active_customer_config_revision",
      configRevision: "r1",
    },
    { customer: { key: "yoyoosun" }, source: "builtin", configRevision: "r1" },
    {
      customer: { key: "yoyoosun" },
      source: "active_customer_config_revision",
      configRevision: "r1",
    },
  ]) {
    const methods = [];
    const proof = verifyRuntimeBusiness("http://fixture.invalid", {
      customerKey: "yoyoosun",
      fetchImpl: async (_url, options) => {
        const method = JSON.parse(options.body).method;
        methods.push(method);
        const data =
          method === "admin_login"
            ? { access_token: "fixture" }
            : { session: context };
        return { ok: true, json: async () => ({ result: { code: 0, data } }) };
      },
    });
    if (
      context.customer?.key === "yoyoosun" &&
      context.source === "active_customer_config_revision"
    ) {
      assert.equal((await proof).business, true);
      assert.ok(methods.includes("list_units"));
    } else {
      await assert.rejects(proof, /已激活配置/u);
      assert.ok(!methods.includes("list_units"));
    }
    assert.equal(methods.at(-1), "logout");
  }
});
