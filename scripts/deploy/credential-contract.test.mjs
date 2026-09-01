import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultYoyoosunCredentialContractPath,
  loadYoyoosunCredentialContract,
  selectYoyoosunCredentialTarget,
} from "../../deployments/yoyoosun/scripts/credential-contract.mjs";

test("credential contract exposes isolated demo and customer-test projections", () => {
  const loaded = loadYoyoosunCredentialContract();
  const demo = selectYoyoosunCredentialTarget(loaded, "demo-133");
  const customerTest = selectYoyoosunCredentialTarget(
    loaded,
    "customer-test-133",
  );

  assert.equal(demo.database, "plush_erp_demo_v1");
  assert.equal(demo.nonAdmin.policy, "rotate");
  assert.equal(demo.nonAdmin.usernames.length, 10);
  assert.equal(demo.sms.policy, "bind-when-configured");
  assert.equal(customerTest.database, "plush_erp_customer_test_v1");
  assert.equal(customerTest.nonAdmin.policy, "preserve");
  assert.deepEqual(customerTest.nonAdmin.usernames, []);
  assert.equal(customerTest.sms.policy, "not-managed");
  assert.equal("datasetVersion" in customerTest, false);
  assert.equal("credential" in customerTest.nonAdmin, false);
  assert.equal("identity" in customerTest.sms, false);
  assert.equal(Object.isFrozen(loaded.contract), true);
});

test("credential contract rejects schema additions and unsupported targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "credential-contract-"));
  try {
    const contract = JSON.parse(
      fs.readFileSync(defaultYoyoosunCredentialContractPath(), "utf8"),
    );
    contract.targets.admin = { deploymentTarget: "admin" };
    const file = path.join(root, "credential.contract.json");
    fs.writeFileSync(file, `${JSON.stringify(contract)}\n`);
    assert.throws(
      () => loadYoyoosunCredentialContract({ contractPath: file }),
      /invalid yoyoosun credential contract/u,
    );
    const loaded = loadYoyoosunCredentialContract();
    assert.throws(
      () => selectYoyoosunCredentialTarget(loaded, "admin"),
      /unsupported yoyoosun credential target/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("credential contract binds target databases to deployment registry", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "credential-registry-"));
  try {
    const contract = JSON.parse(
      fs.readFileSync(defaultYoyoosunCredentialContractPath(), "utf8"),
    );
    contract.targets["demo-133"].database = "wrong_database";
    const file = path.join(root, "credential.contract.json");
    fs.writeFileSync(file, `${JSON.stringify(contract)}\n`);
    assert.throws(
      () => loadYoyoosunCredentialContract({ contractPath: file }),
      /invalid yoyoosun credential contract/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
