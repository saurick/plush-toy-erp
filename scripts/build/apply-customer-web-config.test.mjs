import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyCustomerWebConfig } from "./apply-customer-web-config.mjs";

async function setupCustomerPackage() {
  const root = await mkdtemp(path.join(os.tmpdir(), "customer-web-config-"));
  const configRoot = path.join(root, "config");
  const customerDir = path.join(configRoot, "customers", "yoyoosun");
  const assetsDir = path.join(customerDir, "assets");
  const webBuildDir = path.join(root, "web", "build");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(webBuildDir, { recursive: true });
  fs.writeFileSync(
    path.join(customerDir, "customer-config.example.js"),
    "window.__PLUSH_ERP_CUSTOMER_CONFIG__={customerKey:'yoyoosun'};\n",
  );
  fs.writeFileSync(path.join(assetsDir, "favicon-yoyoosun.svg"), "<svg />\n");
  return { root, configRoot, webBuildDir };
}

test("applyCustomerWebConfig skips when no customer is selected", () => {
  const result = applyCustomerWebConfig({ customer: "" });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no customer selected");
});

test("applyCustomerWebConfig overlays customer-config.js and assets", async () => {
  const { root, configRoot, webBuildDir } = await setupCustomerPackage();
  try {
    const result = applyCustomerWebConfig({
      customer: "yoyoosun",
      configRoot,
      webBuildDir,
    });

    assert.equal(result.applied, true);
    assert.equal(result.customer, "yoyoosun");
    assert.match(
      await readFile(path.join(webBuildDir, "customer-config.js"), "utf8"),
      /customerKey:'yoyoosun'/,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          webBuildDir,
          "customer-assets",
          "yoyoosun",
          "favicon-yoyoosun.svg",
        ),
      ),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCustomerWebConfig rejects missing customer config", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "customer-web-config-"));
  const configRoot = path.join(root, "config");
  const webBuildDir = path.join(root, "web", "build");
  fs.mkdirSync(path.join(configRoot, "customers", "yoyoosun", "assets"), {
    recursive: true,
  });
  fs.mkdirSync(webBuildDir, { recursive: true });
  try {
    assert.throws(
      () =>
        applyCustomerWebConfig({
          customer: "yoyoosun",
          configRoot,
          webBuildDir,
        }),
      /customer web config does not exist/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
