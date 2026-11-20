import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyRestoredBusiness } from "./backup-set/business-smoke.mjs";

function fixture(t, { corrupt = false, revision = "active" } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "restore-business-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const content = Buffer.from("synthetic attachment"),
    methods = [],
    invocations = [];
  const responses = {
    admin_login: { access_token: "private-test-token" },
    get_effective_session: {
      session: {
        configRevision: revision,
        source: "active_customer_config_revision",
      },
    },
    list_units: { units: [{ id: 1 }] },
    list_sales_orders: { sales_orders: [{ id: 1 }] },
    download_attachment: {
      attachment: {
        content_base64: (corrupt ? Buffer.from("corrupt") : content).toString(
          "base64",
        ),
      },
    },
    logout: undefined,
  };
  return {
    methods,
    invocations,
    options: {
      work,
      appImage: "sha256:" + "a".repeat(64),
      app: "isolated-app",
      pg: "isolated-pg",
      s3: "isolated-s3",
      network: "isolated-network",
      access: "isolated-access",
      secret: "isolated-secret",
      credentials: { username: "synthetic", password: "private-test-password" },
      manifest: {
        customer: "yoyoosun",
        database: "restored_fixture",
        releaseSha: "a".repeat(40),
        backupId: "backup-fixture",
        attachmentCount: 1,
        activeCustomerConfig: [
          { customer_key: "yoyoosun", revision: "active" },
        ],
      },
      scalar: async (sql) =>
        sql.includes("sales_orders")
          ? "1"
          : JSON.stringify([
              {
                id: 1,
                file_size: content.length,
                sha256: createHash("sha256").update(content).digest("hex"),
              },
            ]),
      run: async (args, options = {}) => {
        invocations.push(args);
        if (args[1] === "network") return JSON.stringify([{ Internal: true }]);
        const data = options.input
          ?.split("\n")
          .find((line) => line.startsWith("data = "));
        if (!data) return "{}";
        const request = JSON.parse(JSON.parse(data.slice(7)));
        methods.push(request.method);
        return JSON.stringify({
          result: { code: 0, data: responses[request.method] },
        });
      },
    },
  };
}
test("restored business proof uses isolated services, authenticated reads and keeps credentials out of arguments and receipt", async (t) => {
  const f = fixture(t),
    receipt = await verifyRestoredBusiness(f.options);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.checks.length, 8);
  assert.equal(
    receipt.checks.find((v) => v.key === "attachment-download").sampled,
    1,
  );
  assert.deepEqual(f.methods, [
    "admin_login",
    "get_effective_session",
    "list_units",
    "list_sales_orders",
    "download_attachment",
    "logout",
  ]);
  assert(!JSON.stringify(f.invocations).includes("private-test"));
  assert(!JSON.stringify(receipt).includes("private-test"));
  const dockerRun = f.invocations.find((a) => a[1] === "run");
  assert(!dockerRun.includes("-p"));
  assert.equal(
    dockerRun[dockerRun.indexOf("--network") + 1],
    "isolated-network",
  );
});
for (const [name, options, error] of [
  ["corrupt attachment", { corrupt: true }, /download_mismatch/],
  ["wrong active config", { revision: "wrong" }, /config_mismatch/],
])
  test(`restored business proof rejects ${name} and logs out`, async (t) => {
    const f = fixture(t, options);
    await assert.rejects(verifyRestoredBusiness(f.options), error);
    assert.equal(f.methods.at(-1), "logout");
  });

test("trial recovery preserves the published database identity inside the internal network", async (t) => {
  const f = fixture(t);
  f.options.manifest.database = "plush_erp_demo_v1";
  f.options.manifest.activeCustomerConfig[0].product_version =
    "customer-trial-133-test-2026.09.27-v8";
  await verifyRestoredBusiness(f.options);
  const env = fs.readFileSync(path.join(f.options.work, "app.env"), "utf8");
  assert.match(env, /@postgres:5432\/plush_erp_demo_v1\?sslmode=disable/u);
  assert.match(env, /ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=1/u);
  assert.match(env, /ERP_CUSTOMER_TRIAL_TARGET=customer-trial-133/u);
  assert.equal(
    f.invocations.filter((a) => a.includes("reconcile") || a.includes("verify"))
      .length,
    2,
  );
});

test("business recovery rejects a network with external connectivity before starting the app", async (t) => {
  const f = fixture(t);
  f.options.run = async () => JSON.stringify([{ Internal: false }]);
  await assert.rejects(
    verifyRestoredBusiness(f.options),
    /restore_network_not_internal/u,
  );
  assert(!fs.existsSync(path.join(f.options.work, "app.env")));
});
