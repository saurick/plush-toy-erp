import assert from "node:assert/strict";
import test from "node:test";

import { customerPackageCatalog } from "../../config/catalog/customerPackageCatalog.mjs";
import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import {
  buildPreview,
  runCustomerPackageLint,
  validateCatalog,
  validatePackage,
  validatePreview,
} from "./customer-package-lint.mjs";

test("customer-package-lint: yoyoosun package stays preview-only", () => {
  validateCatalog(customerPackageCatalog);
  validatePackage(yoyoosunCustomerPackage);

  const preview = buildPreview(yoyoosunCustomerPackage);
  assert.equal(preview.identity.customerKey, "yoyoosun");
  assert.equal(preview.identity.runtimeEnabled, false);
  assert.equal(preview.identity.previewOnly, true);
  assert.equal(preview.workflows.length, 4);
  assert(preview.workflows.some((workflow) => workflow.key === "finished_goods_delivery"));
  assert.equal(preview.businessFlows.length, 4);
  assert.equal(preview.stateMachines.length, 3);
  assert.equal(preview.processPolicies.length, 3);
  assert(preview.guardrails.forbiddenTargets.includes("tenant_id"));
  assert(preview.guardrails.forbiddenTargets.includes("workflow_done_to_fact_posted"));
  validatePreview(preview);
});

test("customer-package-lint: demo package proves customer package validation is not yoyoosun-only", () => {
  validateCatalog(customerPackageCatalog);
  validatePackage(demoCustomerPackage);

  const result = runCustomerPackageLint({ customer: "demo", mode: "compile", out: "" });
  assert.equal(result.mode, "compile");
  assert.equal(result.preview.identity.customerKey, "demo");
  assert.equal(result.preview.identity.runtimeEnabled, false);
  assert.equal(result.preview.identity.previewOnly, true);
  assert.equal(result.preview.workflows.length, 4);
  assert(result.preview.workflows.some((workflow) => workflow.key === "demo_finished_goods_delivery"));
  validatePreview(result.preview);
});

test("customer-package-lint: finished goods delivery commands stay catalog-registered and preview-only", () => {
  const commandByKey = new Map(
    customerPackageCatalog.commands.map((command) => [command.key, command]),
  );

  for (const commandKey of [
    "finished_goods_quality_decide",
    "release_shipment_finance",
    "ship_shipment",
    "create_receivable_lead",
  ]) {
    assert.equal(commandByKey.get(commandKey)?.runtimeEnabled, false);
  }
});

test("customer-package-lint: compile mode returns bounded preview only", () => {
  const result = runCustomerPackageLint({ customer: "yoyoosun", mode: "compile", out: "" });

  assert.equal(result.mode, "compile");
  assert.equal(result.preview.identity.previewOnly, true);
  assert.equal(result.preview.identity.runtimeEnabled, false);
  assert.deepEqual(Object.keys(result.preview).sort(), [
    "businessFlows",
    "guardrails",
    "identity",
    "processPolicies",
    "stateMachines",
    "workflows",
  ]);
});

test("customer-package-lint: package key must be namespaced by customer key", () => {
  assert.throws(
    () => validatePackage({
      ...demoCustomerPackage,
      packageKey: "yoyoosun-customer-package-v1",
    }),
    /packageKey must be namespaced by customerKey/,
  );
});

test("customer-package-lint: activate and rollback modes are blocked", () => {
  assert.throws(
    () => runCustomerPackageLint({ customer: "yoyoosun", mode: "activate", out: "" }),
    /activate is disabled/,
  );
  assert.throws(
    () => runCustomerPackageLint({ customer: "yoyoosun", mode: "rollback", out: "" }),
    /rollback is disabled/,
  );
});

test("customer-package-lint: preview output requires preview mode", () => {
  assert.throws(
    () => runCustomerPackageLint({ customer: "yoyoosun", mode: "compile", out: "output/customers/yoyoosun/preview.json" }),
    /--out requires --mode preview/,
  );
});

test("customer-package-lint: package cannot carry executable or raw payloads", () => {
  const badWorkflow = {
    ...yoyoosunCustomerPackage.workflows[0],
    rows: [{ id: 1 }],
  };
  assert.throws(
    () => validatePackage({
      ...yoyoosunCustomerPackage,
      workflows: [badWorkflow, ...yoyoosunCustomerPackage.workflows.slice(1)],
    }),
    /must not embed raw rows, secrets, SQL or executable code payloads/,
  );
});

test("customer-package-lint: moduleStates stay catalog-bound and explain non-enabled modules", () => {
  validatePackage({
    ...demoCustomerPackage,
    moduleStates: Object.freeze([
      Object.freeze({
        moduleKey: "shipments",
        state: "read_only",
        reason: "trial package keeps shipment history visible without writes",
      }),
    ]),
  });

  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        moduleStates: [{ moduleKey: "unknown_module", state: "disabled", reason: "invalid" }],
      }),
    /moduleStates\[0\]\.moduleKey contains unknown module unknown_module/,
  );
  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        moduleStates: [{ moduleKey: "shipments", state: "paused", reason: "invalid" }],
      }),
    /moduleStates\[0\]\.state must be enabled, read_only or disabled/,
  );
  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        moduleStates: [{ moduleKey: "shipments", state: "disabled" }],
      }),
    /moduleStates\[0\]\.reason must be a non-empty string/,
  );
});

test("customer-package-lint: publish activate rollback switches stay disabled", () => {
  assert.throws(
    () => validatePackage({
      ...yoyoosunCustomerPackage,
      sourcePolicy: {
        ...yoyoosunCustomerPackage.sourcePolicy,
        activateEnabled: true,
      },
    }),
    /activate must stay disabled/,
  );
});
