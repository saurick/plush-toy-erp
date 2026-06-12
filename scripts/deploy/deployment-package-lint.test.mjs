import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findForbiddenFiles, validateDeploymentPackage } from "./deployment-package-lint.mjs";

test("yoyoosun deployment package passes lint", () => {
  const result = validateDeploymentPackage({ customer: "yoyoosun" });

  assert.equal(result.customer, "yoyoosun");
  assert(result.requiredFiles > 30);
  assert(result.checkedFiles >= result.requiredFiles);
});

test("deployment package lint rejects runtime env files and raw customer files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-package-lint-"));
  fs.mkdirSync(path.join(root, "deployments/yoyoosun"), { recursive: true });
  fs.writeFileSync(path.join(root, "deployments/yoyoosun/.env"), "APP_JWT_SECRET=real-secret\n");
  fs.writeFileSync(path.join(root, "deployments/yoyoosun/customer.xlsx"), "");

  const forbidden = findForbiddenFiles(path.join(root, "deployments/yoyoosun")).sort();

  assert.deepEqual(forbidden, [".env", "customer.xlsx"]);
});
