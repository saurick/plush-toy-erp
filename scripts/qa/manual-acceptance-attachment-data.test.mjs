import assert from "node:assert/strict";
import test from "node:test";
import { buildAttachmentFixtures, buildAttachmentTargets, normalizeLocalBackendURL } from "./manual-acceptance-attachment-data.mjs";

test("attachment apply URL fails closed outside loopback", () => {
  assert.equal(normalizeLocalBackendURL("http://localhost:8300"), "http://localhost:8300");
  for (const value of ["https://example.com", "http://192.168.0.133:8300", "http://user:pass@localhost:8300"]) assert.throws(() => normalizeLocalBackendURL(value));
});

test("attachment fixtures include multiple formats and one near-limit sample", () => {
  const fixtures = buildAttachmentFixtures();
  assert.equal(fixtures.length, 5);
  assert(new Set(fixtures.map((item) => item.mime_type)).size >= 4);
  assert(fixtures.some((item) => item.sizeClass === "near-limit" && item.content.length > 4_000_000));
});

test("attachment targets require seven business owners and workflow version", () => {
  const sourceReport = { referenceRecords: { salesOrders: [{ id: 11, items: Array(25).fill({}) }] }, steps: [
    { target: "purchase_order", id: 12 }, { target: "outsourcing_order", id: 13 }, { target: "bom_version", id: 14 },
  ] };
  const factReport = { operationalSteps: [{ steps: [{ method: "create_production_fact", id: 15 }, { method: "create_finance_fact", id: 16 }] }] };
  const targets = buildAttachmentTargets({ sourceReport, factReport, workflowTask: { id: 17, version: 3 } });
  assert.equal(targets.length, 7);
  assert.equal(targets.reduce((sum, item) => sum + item.files, 0), 27);
  assert.equal(targets.find((item) => item.owner_type === "workflow_task")?.expected_version, 3);
});
