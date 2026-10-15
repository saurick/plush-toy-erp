import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCapacityCustomerConfigManifest,
  capacityConfigConfirmation,
  normalizeCapacityBackendURL,
} from "./capacity-customer-config.mjs";

const databaseName = "plush_erp_capacity_20260728_fixture";
const datasetHash = "a".repeat(64);
const datasetReceipt = {
  status: "passed",
  databaseName,
  databaseRunIdentity: "capacity:20260728_fixture",
  datasetVersion: "capacity-read-model-v1",
  datasetHash,
};

test("capacity config manifest stays explicitly simulated and dataset-bound", () => {
  const manifest = buildCapacityCustomerConfigManifest({
    commit: "b".repeat(40),
    datasetReceipt,
  });
  assert.equal(manifest.manifest_status, "runtime_compile_ready");
  assert.equal(manifest.runtime_enabled, true);
  assert.equal(manifest.publishable, true);
  assert.equal(manifest.customer_key, "yoyoosun");
  assert.match(manifest.revision, /^simulated-capacity-/u);
  assert.match(manifest.product_version, /^simulated-capacity-/u);
  assert.deepEqual(manifest.compiled_snapshot.capacityFixture, {
    simulatedOnly: true,
    realCustomerData: false,
    datasetVersion: datasetReceipt.datasetVersion,
    datasetHash,
    databaseRunIdentity: datasetReceipt.databaseRunIdentity,
  });
  assert.equal(manifest.compiled_snapshot.applyPurpose, undefined);
});

test("capacity config binds exact loopback backend and destructive confirmation", () => {
  assert.equal(
    normalizeCapacityBackendURL("http://127.0.0.1:18320"),
    "http://127.0.0.1:18320",
  );
  for (const value of [
    "https://127.0.0.1:18320",
    "http://192.168.0.133:8300",
    "http://user:pass@localhost:8300",
  ]) {
    assert.throws(() => normalizeCapacityBackendURL(value));
  }
  assert.equal(
    capacityConfigConfirmation(databaseName, datasetHash),
    `ACTIVATE_SIMULATED_CAPACITY_CONFIG:${databaseName}:${datasetHash}`,
  );
  assert.throws(() => capacityConfigConfirmation("plush_erp", datasetHash));
  assert.throws(() => capacityConfigConfirmation(databaseName, "short"));
});

test("capacity config manifest rejects unbound inputs", () => {
  assert.throws(() =>
    buildCapacityCustomerConfigManifest({
      commit: "short",
      datasetReceipt,
    }),
  );
  assert.throws(() =>
    buildCapacityCustomerConfigManifest({
      commit: "b".repeat(40),
      datasetReceipt: { ...datasetReceipt, status: "failed" },
    }),
  );
});
