import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanProductionArtifact } from "./dev-workbench-production-boundary.mjs";

function withArtifact(files, callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), "plush-dev-boundary-"));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const file = path.join(root, relativePath);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, source);
    }
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("production artifact boundary: accepts a product-only artifact", () => {
  withArtifact(
    {
      "index.html": "<main>毛绒玩具管理系统</main>",
      "assets/index.js": "console.info('product runtime')",
      "assets/index.css": ".erp-admin-page{display:block}",
    },
    (root) => {
      const result = scanProductionArtifact(root);
      assert.equal(result.status, "passed");
      assert.equal(result.filesScanned, 3);
    },
  );
});

test("production artifact boundary: rejects DEV routes, styles and private paths", () => {
  for (const marker of [
    "/__dev",
    "/__dev/quality-gates",
    "__PLUSH_DEV_DATABASE_MIGRATION_RECOVERY_ACTIVE__",
    "dev_runtime_recovery_active",
    "erp-dev-workspace-nav",
    "erp-dev-quality-gates",
    "质量门禁",
    "erp-dev-permission-relationships",
    "权限关系 / Effective Access",
    "customer-yoyoosun-private",
    "/Users/simon/",
  ]) {
    withArtifact(
      {
        "index.html": "<main>product</main>",
        "assets/index.js": `const leaked = ${JSON.stringify(marker)}`,
      },
      (root) => {
        assert.throws(
          () => scanProductionArtifact(root),
          /contains DEV\/private markers/u,
        );
      },
    );
  }
});

test("production artifact boundary: fails closed without index", () => {
  withArtifact({ "assets/index.js": "product" }, (root) => {
    assert.throws(
      () => scanProductionArtifact(root),
      /production artifact index is missing/u,
    );
  });
});
