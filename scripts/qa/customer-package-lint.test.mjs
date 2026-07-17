import assert from "node:assert/strict";
import test from "node:test";

import { customerPackageCatalog } from "../../config/catalog/customerPackageCatalog.mjs";
import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { referenceCustomerPackage } from "../../config/customers/reference-customer/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import {
  buildPreview,
  runCustomerPackageLint,
  runCustomerPackageLintMany,
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
  assert(
    preview.processPolicies.every(
      (policy) =>
        policy.ruleCount === policy.rules.length &&
        policy.rules.every((rule) => rule && typeof rule === "object"),
    ),
  );
  assert.equal(preview.printTemplateDefaults.length, 2);
  assert(
    preview.printTemplateDefaults.every((item) => item.status === "preview_only"),
  );
  assert(preview.guardrails.forbiddenTargets.includes("tenant_id"));
  assert(preview.guardrails.forbiddenTargets.includes("workflow_done_to_fact_posted"));
  validatePreview(preview);
});

test("customer-package-lint: page contracts may declare an any-capability gate", () => {
  validateCatalog(customerPackageCatalog);
  const productionOrders = customerPackageCatalog.pages.find(
    (page) => page.key === "production-orders",
  );
  assert.deepEqual(productionOrders.requiredCapabilityKeys, []);
  assert.deepEqual(productionOrders.requiredAnyCapabilityKeys, [
    "pmc.plan.read",
    "production.wip.read",
  ]);

  const invalid = structuredClone(customerPackageCatalog);
  const invalidPage = invalid.pages.find((page) => page.key === "production-orders");
  invalidPage.requiredAnyCapabilityKeys = [];
  assert.throws(
    () => validateCatalog(invalid),
    /must declare requiredCapabilityKeys or requiredAnyCapabilityKeys/u,
  );
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

test("customer-package-lint: reference package stays minimal and declarative", () => {
  validateCatalog(customerPackageCatalog);
  validatePackage(referenceCustomerPackage);

  const result = runCustomerPackageLint({
    customer: "reference-customer",
    mode: "compile",
    out: "",
  });
  assert.equal(result.preview.identity.packageKey, "reference-customer-package-v1");
  assert.equal(result.preview.workflows.length, 1);
  assert.equal(result.preview.businessFlows.length, 0);
  assert.equal(result.preview.stateMachines.length, 0);
  assert.equal(result.preview.processPolicies.length, 0);
  assert.equal(result.preview.printTemplateDefaults.length, 2);
  const serializedReference = JSON.stringify(referenceCustomerPackage);
  assert.match(serializedReference, /SIM-REF-/u);
  assert.match(serializedReference, /\.example\.invalid/u);
});

test("customer-package-lint: repeated customer flags validate every requested package", () => {
  const results = runCustomerPackageLintMany({
    customers: ["yoyoosun", "demo"],
    mode: "compile",
    out: "",
  });

  assert.deepEqual(
    results.map((result) => result.config.customerKey),
    ["yoyoosun", "demo"],
  );
  assert.deepEqual(
    results.map((result) => result.mode),
    ["compile", "compile"],
  );
  results.forEach((result) => validatePreview(result.preview));
});

test("customer-package-lint: --all follows the customer package index", () => {
  const results = runCustomerPackageLintMany({
    all: true,
    customers: [],
    mode: "compile",
    out: "",
  });

  assert.deepEqual(
    results.map((result) => result.config.customerKey),
    ["demo", "reference-customer", "yoyoosun"],
  );
});

test("customer-package-lint: multi-customer preview output must use separate files", () => {
  assert.throws(
    () =>
      runCustomerPackageLintMany({
        customers: ["yoyoosun", "demo"],
        mode: "preview",
        out: "output/customers/customer-package-preview.json",
      }),
    /--out only supports one customer package/,
  );
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
    "extensionPoints",
    "guardrails",
    "identity",
    "printTemplateDefaults",
    "processPolicies",
    "runtimeProcessSelections",
    "stateMachines",
    "workflows",
  ]);
});

test("customer-package-lint: package key must be namespaced by customer key", () => {
  validatePackage(referenceCustomerPackage);
  assert.throws(
    () => validatePackage({
      ...demoCustomerPackage,
      packageKey: "yoyoosun-customer-package-v1",
    }),
    /packageKey must be namespaced by customerKey/,
  );
  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        packageKey: "demo-package-v0",
      }),
    /end with package-v<positive integer>/,
  );
});

test("customer-package-lint: field visibility overrides stay catalog-bound", () => {
  const validateOverride = (override) =>
    validatePackage({
      ...referenceCustomerPackage,
      fieldPolicyOverrides: [override],
    });

  validateOverride({
    surfaceKey: "suppliers.default",
    fieldKey: "supplier_type",
    visible: false,
    reason: "低风险字段隐藏",
  });
  assert.throws(
    () =>
      validateOverride({
        surfaceKey: "unknown.default",
        fieldKey: "supplier_type",
        visible: false,
        reason: "无效 surface",
      }),
    /contains unknown surface unknown\.default/,
  );
  assert.throws(
    () =>
      validateOverride({
        surfaceKey: "suppliers.default",
        fieldKey: "unknown_field",
        visible: false,
        reason: "无效字段",
      }),
    /contains unknown field unknown_field/,
  );
  assert.throws(
    () =>
      validatePackage({
        ...referenceCustomerPackage,
        fieldPolicyOverrides: [
          referenceCustomerPackage.fieldPolicyOverrides[0],
          referenceCustomerPackage.fieldPolicyOverrides[0],
        ],
      }),
    /duplicates suppliers\.default\.supplier_type/,
  );
  assert.throws(
    () =>
      validateOverride({
        surfaceKey: "suppliers.default",
        fieldKey: "supplier_type",
        visible: "false",
        reason: "错误类型",
      }),
    /\.visible must be a boolean/,
  );
  assert.throws(
    () =>
      validateOverride({
        surfaceKey: "suppliers.default",
        fieldKey: "supplier_code",
        visible: false,
        reason: "不得隐藏保护字段",
      }),
    /must not hide protected field suppliers\.default\.supplier_code/,
  );
  assert.throws(
    () =>
      validateOverride({
        surfaceKey: "suppliers.default",
        fieldKey: "supplier_type",
        visible: false,
      }),
    /\.reason must be a non-empty string/,
  );
  assert.throws(
    () =>
      validateOverride({
        surfaceKey: "suppliers.default",
        fieldKey: "supplier_type",
        visible: false,
        reason: "不允许 label",
        label: "供应商类型",
      }),
    /\.label is not allowed/,
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

test("customer-package-lint: process policy rules must stay structured and non-executable", () => {
  assert.throws(
    () =>
      validatePackage({
        ...yoyoosunCustomerPackage,
        processPolicies: [
          {
            ...yoyoosunCustomerPackage.processPolicies[0],
            rules: [{}],
          },
          ...yoyoosunCustomerPackage.processPolicies.slice(1),
        ],
      }),
    /processPolicies\[0\]\.rules\[0\] must declare key or when/,
  );

  assert.throws(
    () =>
      validatePackage({
        ...yoyoosunCustomerPackage,
        processPolicies: [
          {
            ...yoyoosunCustomerPackage.processPolicies[0],
            rules: [
              {
                key: "invalid_executable_policy",
                decision: "preview_only",
                handler: "customerPolicyHandler",
              },
            ],
          },
          ...yoyoosunCustomerPackage.processPolicies.slice(1),
        ],
      }),
    /processPolicies\[0\]\.rules\[0\]\.handler must not register executable policy behavior/,
  );

  assert.throws(
    () =>
      validatePackage({
        ...yoyoosunCustomerPackage,
        processPolicies: [
          {
            ...yoyoosunCustomerPackage.processPolicies[0],
            rules: [
              {
                key: "unknown_field_policy",
                decision: "preview_only",
                scope: "not allowed",
              },
            ],
          },
          ...yoyoosunCustomerPackage.processPolicies.slice(1),
        ],
      }),
    /processPolicies\[0\]\.rules\[0\]\.scope is not an allowed process policy rule field/,
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

test("customer-package-lint: print template defaults stay bounded to party defaults", () => {
  validatePackage(demoCustomerPackage);

  validatePackage({
    ...demoCustomerPackage,
    printTemplateDefaults: [
      {
        templateKey: "material-purchase-contract",
        status: "preview_only",
        partyDefaults: {
          buyerCompany: "演示买方公司",
          buyerContact: "采购负责人",
          buyerPhone: "",
          buyerAddress: "演示地址",
          buyerSigner: "",
        },
        guardrail: "个人电话与签名由启用后的有效配置或源单快照提供",
      },
    ],
  });

  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        printTemplateDefaults: [
          {
            templateKey: "sales-order-confirmation",
            status: "preview_only",
            partyDefaults: { buyerCompany: "演示买方公司" },
            guardrail: "invalid template",
          },
        ],
      }),
    /printTemplateDefaults\[0\]\.templateKey contains unsupported template sales-order-confirmation/,
  );
  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        printTemplateDefaults: [
          {
            templateKey: "material-purchase-contract",
            status: "preview_only",
            partyDefaults: { supplierName: "不允许覆盖供应商" },
            guardrail: "invalid supplier default",
          },
        ],
      }),
    /partyDefaults\.supplierName is not an allowed print party default/,
  );
  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        printTemplateDefaults: [
          {
            templateKey: "material-purchase-contract",
            status: "preview_only",
            partyDefaults: {
              buyerCompany: "演示买方公司",
              buyerContact: "采购负责人",
              buyerAddress: "演示地址",
            },
            supplierDefaults: { supplierName: "不允许覆盖供应商" },
            guardrail: "invalid supplier default",
          },
        ],
      }),
    /supplierDefaults must not override supplier snapshots from business records/,
  );
  assert.throws(
    () =>
      validatePackage({
        ...demoCustomerPackage,
        printTemplateDefaults: [
          {
            templateKey: "material-purchase-contract",
            status: "preview_only",
            partyDefaults: {
              buyerCompany: "演示买方公司",
              buyerContact: "采购负责人",
              buyerPhone: "",
              buyerSigner: "",
            },
            guardrail: "缺少机构地址",
          },
        ],
      }),
    /partyDefaults\.buyerAddress must be a non-empty string/,
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
