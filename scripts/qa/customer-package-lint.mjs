#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { customerPackageCatalog } from "../../config/catalog/customerPackageCatalog.mjs";
import { customerPackageSchema } from "../../config/schemas/customerPackageSchema.mjs";
import { demoCustomerPackage } from "../../config/customers/demo/customerPackage.mjs";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const CUSTOMER_PACKAGES = Object.freeze({
  demo: demoCustomerPackage,
  yoyoosun: yoyoosunCustomerPackage,
});

const ALLOWED_MODES = Object.freeze(["validate", "compile", "preview", "activate", "rollback"]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNonEmptyString(value, key) {
  assert(typeof value === "string" && value.trim() !== "", `${key} must be a non-empty string`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    customer: "yoyoosun",
    mode: "",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--customer") {
      args.customer = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--mode") {
      args.mode = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/customer-package-lint.mjs --customer demo
  node scripts/qa/customer-package-lint.mjs --customer yoyoosun
  node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile
  node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-package-preview.json

Modes:
  validate  validate package structure and guardrails only
  compile   validate and compile a bounded preview object without writing runtime state
  preview   validate, compile and optionally write preview JSON under output/
  activate  rejected in this repo until publish/activate design is reviewed
  rollback  rejected in this repo until rollback design is reviewed`);
}

function toKeySet(items = []) {
  return new Set(items.map((item) => item.key));
}

function assertStringList(values, key) {
  assert(Array.isArray(values), `${key} must be an array`);
  assert(values.length > 0, `${key} must not be empty`);
  values.forEach((value, index) => assertNonEmptyString(value, `${key}[${index}]`));
}

function assertNoForbiddenPayload(value, currentPath = "customerPackage") {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    assert(
      !customerPackageSchema.forbiddenPayloadKeys.includes(key),
      `${currentPath}.${key} must not embed raw rows, secrets, SQL or executable code payloads`,
    );
    assertNoForbiddenPayload(nestedValue, `${currentPath}.${key}`);
  }
}

function validateCatalog(catalog) {
  assert(catalog.catalogKey === "customer-package-catalog-v1", "catalogKey must stay customer-package-catalog-v1");
  assert(catalog.status === "draft_catalog", "catalog status must stay draft_catalog");
  assert(catalog.runtimeEnabled === false, "catalog must not be runtime-enabled");
  for (const key of [
    "changesSchema",
    "changesMigration",
    "changesBackendRbac",
    "changesWorkflowFactRules",
    "createsTenant",
    "executesImport",
    "writesFacts",
  ]) {
    assert(catalog.boundaries?.[key] === false, `catalog.boundaries.${key} must stay false`);
  }
  for (const section of ["modules", "capabilities", "pages", "fields", "workPools", "policies", "commands"]) {
    assert(Array.isArray(catalog[section]), `catalog.${section} must be an array`);
    assert(catalog[section].length > 0, `catalog.${section} must not be empty`);
  }
}

function validatePackage(config, catalog = customerPackageCatalog, schema = customerPackageSchema) {
  for (const key of schema.requiredTopLevelKeys) {
    assert(config[key] !== undefined, `customer package missing ${key}`);
  }
  assertNonEmptyString(config.customerKey, "customerKey");
  assert(config.customerKey !== "current", "customerKey must not use legacy current alias");
  assert(config.customerKey !== "tenant", "customerKey must not be treated as a SaaS tenant");
  assertNonEmptyString(config.packageKey, "packageKey");
  assert(
    config.packageKey.startsWith(`${config.customerKey}-customer-package-`),
    "packageKey must be namespaced by customerKey",
  );
  assert(schema.allowedStatuses.includes(config.status), `status must be one of ${schema.allowedStatuses.join(", ")}`);
  assert(config.runtimeEnabled === false, "customer package must not be runtime-enabled");
  assert(config.sourcePolicy?.externalImportAllowsCode === false, "external import must not allow code");
  assert(config.sourcePolicy?.externalImportAllowsSql === false, "external import must not allow SQL");
  assert(config.sourcePolicy?.externalImportAllowsSecrets === false, "external import must not allow secrets");
  assert(config.sourcePolicy?.externalImportAllowsRawCustomerFiles === false, "external import must not allow raw customer files");
  assert(config.sourcePolicy?.previewOnly === true, "customer package must stay preview-only");
  assert(config.sourcePolicy?.publishEnabled === false, "publish must stay disabled");
  assert(config.sourcePolicy?.activateEnabled === false, "activate must stay disabled");
  assert(config.sourcePolicy?.rollbackEnabled === false, "rollback must stay disabled");

  for (const key of schema.requiredBoundaryFalseKeys) {
    assert(config.boundaries?.[key] === false, `boundaries.${key} must stay false`);
  }
  assertNoForbiddenPayload(config);

  const moduleKeys = toKeySet(catalog.modules);
  const workPoolKeys = toKeySet(catalog.workPools);
  const policyKeys = toKeySet(catalog.policies);
  const commandKeys = toKeySet(catalog.commands);

  assert(Array.isArray(config.workflows), "workflows must be an array");
  assert(config.workflows.length >= 3, "workflows must include the initial three preview workflows");
  for (const [workflowIndex, workflow] of config.workflows.entries()) {
    const workflowPath = `workflows[${workflowIndex}]`;
    assertNonEmptyString(workflow.key, `${workflowPath}.key`);
    assertNonEmptyString(workflow.label, `${workflowPath}.label`);
    assert(workflow.status === "preview_only", `${workflowPath}.status must stay preview_only`);
    assert(workflow.factBoundary === "workflow_only", `${workflowPath}.factBoundary must stay workflow_only`);
    assertStringList(workflow.sourceModules, `${workflowPath}.sourceModules`);
    workflow.sourceModules.forEach((moduleKey) =>
      assert(moduleKeys.has(moduleKey), `${workflowPath}.sourceModules contains unknown module ${moduleKey}`),
    );
    assertStringList(workflow.ownerPools, `${workflowPath}.ownerPools`);
    workflow.ownerPools.forEach((poolKey) =>
      assert(workPoolKeys.has(poolKey), `${workflowPath}.ownerPools contains unknown work pool ${poolKey}`),
    );
    assert(Array.isArray(workflow.nodes), `${workflowPath}.nodes must be an array`);
    assert(workflow.nodes.length >= 2, `${workflowPath}.nodes must include task and end nodes`);
    workflow.nodes.forEach((node, nodeIndex) => {
      const nodePath = `${workflowPath}.nodes[${nodeIndex}]`;
      assertNonEmptyString(node.key, `${nodePath}.key`);
      assert(schema.allowedWorkflowNodeTypes.includes(node.type), `${nodePath}.type is not allowed`);
      assert(workPoolKeys.has(node.ownerPool), `${nodePath}.ownerPool is not registered`);
      if (node.command) {
        assert(commandKeys.has(node.command), `${nodePath}.command is not registered`);
      }
    });
    assertNonEmptyString(workflow.guardrail, `${workflowPath}.guardrail`);
  }

  assert(Array.isArray(config.businessFlows), "businessFlows must be an array");
  assert(config.businessFlows.length >= 4, "businessFlows must include the four reviewed business flows");
  config.businessFlows.forEach((flow, index) => {
    const flowPath = `businessFlows[${index}]`;
    assertNonEmptyString(flow.key, `${flowPath}.key`);
    assertNonEmptyString(flow.label, `${flowPath}.label`);
    assert(flow.status === "preview_only", `${flowPath}.status must stay preview_only`);
    assertStringList(flow.modules, `${flowPath}.modules`);
    flow.modules.forEach((moduleKey) =>
      assert(moduleKeys.has(moduleKey), `${flowPath}.modules contains unknown module ${moduleKey}`),
    );
    assertNonEmptyString(flow.guardrail, `${flowPath}.guardrail`);
  });

  assert(Array.isArray(config.stateMachines), "stateMachines must be an array");
  assert(config.stateMachines.length >= 3, "stateMachines must include sales, production and purchase lifecycles");
  config.stateMachines.forEach((stateMachine, index) => {
    const path = `stateMachines[${index}]`;
    assertNonEmptyString(stateMachine.key, `${path}.key`);
    assertNonEmptyString(stateMachine.label, `${path}.label`);
    assert(stateMachine.status === "preview_only", `${path}.status must stay preview_only`);
    assertStringList(stateMachine.states, `${path}.states`);
    assert(Array.isArray(stateMachine.transitions), `${path}.transitions must be an array`);
    stateMachine.transitions.forEach((transition, transitionIndex) => {
      assert(Array.isArray(transition) && transition.length === 2, `${path}.transitions[${transitionIndex}] must be a pair`);
      assert(stateMachine.states.includes(transition[0]), `${path}.transitions[${transitionIndex}] from state is unknown`);
      assert(stateMachine.states.includes(transition[1]), `${path}.transitions[${transitionIndex}] to state is unknown`);
    });
    assertNonEmptyString(stateMachine.guardrail, `${path}.guardrail`);
  });

  assert(Array.isArray(config.processPolicies), "processPolicies must be an array");
  assert(config.processPolicies.length >= 3, "processPolicies must include skip, auto-generate and close policies");
  config.processPolicies.forEach((policy, index) => {
    const policyPath = `processPolicies[${index}]`;
    assert(policyKeys.has(policy.key), `${policyPath}.key is not registered`);
    assert(schema.allowedPolicyKinds.includes(policy.kind), `${policyPath}.kind is not allowed`);
    assert(policy.status === "preview_only", `${policyPath}.status must stay preview_only`);
    assert(Array.isArray(policy.rules), `${policyPath}.rules must be an array`);
    assert(policy.rules.length > 0, `${policyPath}.rules must not be empty`);
    assertNonEmptyString(policy.guardrail, `${policyPath}.guardrail`);
  });
}

function buildPreview(config) {
  return {
    identity: {
      customerKey: config.customerKey,
      packageKey: config.packageKey,
      label: config.label,
      status: config.status,
      runtimeEnabled: config.runtimeEnabled,
      previewOnly: config.sourcePolicy.previewOnly,
    },
    workflows: config.workflows.map((workflow) => ({
      key: workflow.key,
      label: workflow.label,
      nodeCount: workflow.nodes.length,
      ownerPools: workflow.ownerPools,
      factBoundary: workflow.factBoundary,
      guardrail: workflow.guardrail,
    })),
    businessFlows: config.businessFlows.map((flow) => ({
      key: flow.key,
      label: flow.label,
      modules: flow.modules,
      guardrail: flow.guardrail,
    })),
    stateMachines: config.stateMachines.map((stateMachine) => ({
      key: stateMachine.key,
      label: stateMachine.label,
      stateCount: stateMachine.states.length,
      transitionCount: stateMachine.transitions.length,
      guardrail: stateMachine.guardrail,
    })),
    processPolicies: config.processPolicies.map((policy) => ({
      key: policy.key,
      kind: policy.kind,
      label: policy.label,
      ruleCount: policy.rules.length,
      guardrail: policy.guardrail,
    })),
    guardrails: {
      boundaries: config.boundaries,
      forbiddenTargets: customerPackageSchema.forbiddenTargets,
    },
  };
}

function validatePreview(preview, schema = customerPackageSchema) {
  const previewSections = Object.keys(preview).sort();
  const allowedSections = [...schema.previewSections].sort();
  assert(
    JSON.stringify(previewSections) === JSON.stringify(allowedSections),
    `preview sections must be ${allowedSections.join(", ")}`,
  );
  assert(preview.identity.runtimeEnabled === false, "preview must not enable runtime");
  assert(preview.identity.previewOnly === true, "preview must stay preview-only");
  assert(Array.isArray(preview.workflows), "preview.workflows must be an array");
  assert(Array.isArray(preview.businessFlows), "preview.businessFlows must be an array");
  assert(Array.isArray(preview.stateMachines), "preview.stateMachines must be an array");
  assert(Array.isArray(preview.processPolicies), "preview.processPolicies must be an array");
}

function writePreview(outPath, preview) {
  const absoluteOutPath = path.resolve(repoRoot, outPath);
  assert(
    absoluteOutPath.startsWith(path.join(repoRoot, "output") + path.sep),
    "--out must write under output/",
  );
  mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  writeFileSync(absoluteOutPath, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
}

function assertDocsExist() {
  for (const relativePath of [
    "config/catalog/README.md",
    "config/catalog/customerPackageCatalog.mjs",
    "config/schemas/README.md",
    "config/schemas/customerPackageSchema.mjs",
    "config/customers/demo/customerPackage.mjs",
    "config/customers/yoyoosun/customerPackage.mjs",
  ]) {
    assert(existsSync(path.join(repoRoot, relativePath)), `${relativePath} must exist`);
  }
  const configReadme = readFileSync(path.join(repoRoot, "config/README.md"), "utf8");
  assert(configReadme.includes("config/catalog"), "config/README.md must mention config/catalog");
  assert(configReadme.includes("config/schemas"), "config/README.md must mention config/schemas");
}

function normalizeMode(args) {
  const mode = args.mode || (args.out ? "preview" : "validate");
  assert(ALLOWED_MODES.includes(mode), `unsupported mode: ${mode}`);
  return mode;
}

function runCustomerPackageLint(args) {
  const mode = normalizeMode(args);
  assert(
    mode !== "activate" && mode !== "rollback",
    `customer package ${mode} is disabled: current gate only supports validate, compile and preview`,
  );
  const config = CUSTOMER_PACKAGES[args.customer];
  assert(config, `unknown customer package: ${args.customer}`);

  validateCatalog(customerPackageCatalog);
  validatePackage(config);
  assertDocsExist();
  const preview = buildPreview(config);
  validatePreview(preview);
  if (mode === "preview" && args.out) {
    writePreview(args.out, preview);
  }
  assert(!args.out || mode === "preview", "--out requires --mode preview");
  return {
    mode,
    config,
    preview,
  };
}

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const result = runCustomerPackageLint(args);
  const config = result.config;
  console.log(
    `customer package ${result.mode} ok: ${config.customerKey}, workflows=${config.workflows.length}, businessFlows=${config.businessFlows.length}, stateMachines=${config.stateMachines.length}, policies=${config.processPolicies.length}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { buildPreview, runCustomerPackageLint, validateCatalog, validatePackage, validatePreview };
