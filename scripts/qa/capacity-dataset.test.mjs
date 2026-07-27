import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPACITY_DATASET_SCHEMA,
  CAPACITY_DATASET_TARGETS,
  CAPACITY_DATASET_VERSION,
  buildCapacityDatasetSQL,
  capacityDatasetConfirmation,
  runCapacityDataset,
} from "./capacity-dataset.mjs";

const databaseName = "plush_erp_capacity_20260728_fixture";
const databaseURL =
  `postgres://postgres:secret@127.0.0.1:55432/${databaseName}?sslmode=disable`;

test("capacity SQL stays simulated, fixed-size, and leaves Fact rows draft", () => {
  const sql = buildCapacityDatasetSQL({
    taskSourceID: 77,
    taskSourceType: "capacity_fixture",
  });
  assert.match(sql, /SIM-CAP-V1-/u);
  assert.match(sql, /'simulated_only', true/u);
  assert.match(sql, /'real_customer_data', false/u);
  assert.match(sql, /'DRAFT'/u);
  assert.match(sql, /'production_ready'/u);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b/u);
  for (const minimum of Object.values(CAPACITY_DATASET_TARGETS)) {
    assert.match(sql, new RegExp(String(minimum), "u"));
  }
});

test("capacity dataset binds confirmation, database identity, and post-load counts", () => {
  let executed = "";
  let reads = 0;
  const report = runCapacityDataset({
    confirmation: capacityDatasetConfirmation(databaseName),
    databaseName,
    databaseURL,
    generatedAt: new Date("2026-07-28T00:00:00Z"),
    taskSourceID: 77,
    runtime: {
      execute: (sql) => {
        executed = sql;
      },
      counts: () => {
        reads += 1;
        return reads === 1
          ? {
              workflowTasks: 100,
              productionFacts: 100,
              financeFacts: 100,
              attachments: 10,
            }
          : {
              ...CAPACITY_DATASET_TARGETS,
              capacityTasks: 4900,
              capacityAttachmentOwnerID: 77,
              postedCapacityProductionFacts: 0,
              postedCapacityFinanceFacts: 0,
            };
      },
    },
  });
  assert.equal(report.schemaVersion, CAPACITY_DATASET_SCHEMA);
  assert.equal(report.status, "passed");
  assert.equal(report.datasetVersion, CAPACITY_DATASET_VERSION);
  assert.match(report.datasetHash, /^[0-9a-f]{64}$/u);
  assert.equal(report.databaseRunIdentity, "capacity:20260728_fixture");
  assert.equal(report.factBoundary.capacityFactsRemainDraft, true);
  assert.equal(report.factBoundary.postsInventoryOrLedger, false);
  assert.equal(report.containsSecrets, false);
  assert.match(executed, /BEGIN;/u);
});

test("capacity dataset rejects long-lived, remote, unconfirmed, and invalid source identities", () => {
  const runtime = {
    execute: () => {},
    counts: () => ({
      ...CAPACITY_DATASET_TARGETS,
      capacityTasks: 1,
      capacityAttachmentOwnerID: 1,
      postedCapacityProductionFacts: 0,
      postedCapacityFinanceFacts: 0,
    }),
  };
  assert.throws(
    () =>
      runCapacityDataset({
        confirmation: "yes",
        databaseName,
        databaseURL,
        runtime,
      }),
    /confirmation/u,
  );
  assert.throws(
    () =>
      runCapacityDataset({
        confirmation: capacityDatasetConfirmation(databaseName),
        databaseName,
        databaseURL: databaseURL.replace("127.0.0.1", "192.168.0.133"),
        runtime,
      }),
    /loopback/u,
  );
  assert.throws(
    () =>
      capacityDatasetConfirmation("plush_erp"),
    /exact capacity database/u,
  );
  assert.throws(
    () => buildCapacityDatasetSQL({ taskSourceID: 0 }),
    /positive integer/u,
  );
});
