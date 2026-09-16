import assert from "node:assert/strict";
import test from "node:test";

import {
  MANUAL_ACCEPTANCE_CORE_CONTRACT,
  MANUAL_ACCEPTANCE_CORE_SEMANTIC_DIGEST,
  MANUAL_ACCEPTANCE_CORE_UNITS,
  MANUAL_ACCEPTANCE_PRIMARY_UNIT,
  validateManualAcceptanceCoreContract,
} from "./manual-acceptance-core-contract.mjs";

test("V7 core contract keeps source units distinct and simulation-only", () => {
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion, "2026.09.16-v7");
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.runId, "20260916-V7");
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.simulatedOnly, true);
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.realCustomerImport, false);
  assert.deepEqual(MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133, {
    target: "customer-trial-133",
    deploymentTarget: "demo-133",
    databaseName: "plush_erp_demo_v1",
    databaseLifecycle: "long-lived-registered-target",
    minimumMigration: "20260916090000",
    configRevision:
      "yoyoosun-customer-trial-133-package-v9.runtime-manifest-v1",
    configProductVersion: "customer-trial-133-test-2026.09.16-v7",
    previousConfigRevision:
      "yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1",
    previousConfigProductVersion:
      "customer-trial-133-test-2026.08.15-v6",
    previousDatasetVersion: "2026.08.15-v6",
  });
  assert.equal(MANUAL_ACCEPTANCE_CORE_UNITS.length, 11);
  assert.equal(MANUAL_ACCEPTANCE_PRIMARY_UNIT.name, "件");
  assert.deepEqual(
    MANUAL_ACCEPTANCE_CORE_UNITS.map((item) => item.sourceLabel).sort(),
    ["PCS", "Y", "kg", "个", "件", "块", "套", "对", "条", "片", "码"].sort(),
  );
  assert.equal(
    MANUAL_ACCEPTANCE_CORE_SEMANTIC_DIGEST,
    "a68ad6d6a86e0e88c391491b3f4e3c7859ec75a2b984eb9e3fadc56e32ee8b8c",
  );
  assert.equal(Object.isFrozen(MANUAL_ACCEPTANCE_CORE_CONTRACT.units), true);
});

test("core contract rejects merged source labels and target drift", () => {
  const merged = structuredClone(MANUAL_ACCEPTANCE_CORE_CONTRACT);
  merged.units[1].sourceLabel = merged.units[6].sourceLabel;
  assert.throws(
    () => validateManualAcceptanceCoreContract(merged),
    /unit or warehouse contract/u,
  );

  const wrongTarget = structuredClone(MANUAL_ACCEPTANCE_CORE_CONTRACT);
  wrongTarget.customerTrial133.databaseName = "plush_erp";
  assert.throws(
    () => validateManualAcceptanceCoreContract(wrongTarget),
    /customer-trial target/u,
  );

  const wrongPreviousIdentity = structuredClone(
    MANUAL_ACCEPTANCE_CORE_CONTRACT,
  );
  wrongPreviousIdentity.customerTrial133.previousDatasetVersion =
    "2026.09.16-v7";
  assert.throws(
    () => validateManualAcceptanceCoreContract(wrongPreviousIdentity),
    /customer-trial target/u,
  );
});
