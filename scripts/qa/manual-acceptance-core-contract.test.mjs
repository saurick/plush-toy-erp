import assert from "node:assert/strict";
import test from "node:test";

import {
  MANUAL_ACCEPTANCE_CORE_CONTRACT,
  MANUAL_ACCEPTANCE_CORE_SEMANTIC_DIGEST,
  MANUAL_ACCEPTANCE_CORE_UNITS,
  MANUAL_ACCEPTANCE_PRIMARY_UNIT,
  validateManualAcceptanceCoreContract,
} from "./manual-acceptance-core-contract.mjs";

test("canonical units merge spelling aliases and preserve physical units", () => {
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion, "2026.09.27-v8");
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.runId, "20260927-V8");
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.simulatedOnly, true);
  assert.equal(MANUAL_ACCEPTANCE_CORE_CONTRACT.realCustomerImport, false);
  assert.equal(MANUAL_ACCEPTANCE_CORE_UNITS.length, 8);
  assert.equal(MANUAL_ACCEPTANCE_PRIMARY_UNIT.name, "个");
  assert.deepEqual(
    MANUAL_ACCEPTANCE_CORE_UNITS.map((item) => item.sourceLabel).sort(),
    ["个", "套", "对", "片", "条", "块", "码", "千克"].sort(),
  );
  assert.match(MANUAL_ACCEPTANCE_CORE_SEMANTIC_DIGEST, /^[a-f0-9]{64}$/u);
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

  const copiedCounter = structuredClone(MANUAL_ACCEPTANCE_CORE_CONTRACT);
  copiedCounter.customerTrial133["previous" + "ConfigRevision"] = "hand-maintained";
  assert.throws(() => validateManualAcceptanceCoreContract(copiedCounter), /customer-trial target/u);
});

test("core contract accepts a coherent next version without code changes", () => {
  const next = structuredClone(MANUAL_ACCEPTANCE_CORE_CONTRACT);
  next.dataVersion = "2026.10.01-v8";
  next.runId = "20261001-V8";
  next.anchorDateUtc = "2026-10-01T12:00:00.000Z";
  next.visiblePrefix = "YS8";
  next.units.forEach((unit) => {
    unit.code = unit.code.replace(/^YS7-/u, "YS8-");
  });
  next.warehouses.forEach((warehouse) => {
    warehouse.code = warehouse.code.replace(/^YS7-/u, "YS8-");
  });

  assert.equal(validateManualAcceptanceCoreContract(next), next);
  assert.equal(
    next.schemaVersion,
    MANUAL_ACCEPTANCE_CORE_CONTRACT.schemaVersion,
  );
  next.dataVersion = "2026.09.16-v8";
  next.runId = "20260916-V8";
  next.anchorDateUtc = "2026-09-16T12:00:00.000Z";
  assert.equal(validateManualAcceptanceCoreContract(next), next);
  assert.equal(validateManualAcceptanceCoreContract(next), next);
  next.runId = "20261001-V7";
  assert.throws(
    () => validateManualAcceptanceCoreContract(next),
    /core contract is invalid/u,
  );
});
