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
const ALLOWED_MODULE_STATES = new Set(["enabled", "read_only", "disabled"]);

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
    customers: [],
    mode: "",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--customer") {
      const customerKey = argv[index + 1] || "";
      args.customer = customerKey;
      args.customers.push(customerKey);
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
  if (args.customers.length === 0) {
    args.customers = [args.customer];
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/customer-package-lint.mjs --customer demo
  node scripts/qa/customer-package-lint.mjs --customer demo --customer yoyoosun
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

function validateModuleStates(config, moduleKeys) {
  if (config.moduleStates == null) {
    return;
  }
  assert(Array.isArray(config.moduleStates), "moduleStates must be an array");
  const seen = new Set();
  config.moduleStates.forEach((item, index) => {
    const path = `moduleStates[${index}]`;
    assert(item && typeof item === "object" && !Array.isArray(item), `${path} must be an object`);
    assertNonEmptyString(item.moduleKey, `${path}.moduleKey`);
    assert(moduleKeys.has(item.moduleKey), `${path}.moduleKey contains unknown module ${item.moduleKey}`);
    assert(!seen.has(item.moduleKey), `${path}.moduleKey must not be duplicated`);
    seen.add(item.moduleKey);
    assertNonEmptyString(item.state, `${path}.state`);
    assert(ALLOWED_MODULE_STATES.has(item.state), `${path}.state must be enabled, read_only or disabled`);
    if (item.state !== "enabled") {
      assertNonEmptyString(item.reason, `${path}.reason`);
    }
  });
}

function validatePrintTemplateDefaults(config, schema = customerPackageSchema) {
  if (config.printTemplateDefaults == null) {
    return;
  }
  assert(Array.isArray(config.printTemplateDefaults), "printTemplateDefaults must be an array");
  const allowedTemplateKeys = new Set(schema.allowedPrintTemplateKeys || []);
  const allowedPartyKeys = new Set(schema.allowedPrintPartyDefaultKeys || []);
  const requiredPartyKeys = new Set(schema.requiredPrintPartyDefaultKeys || []);
  const seen = new Set();
  config.printTemplateDefaults.forEach((item, index) => {
    const itemPath = `printTemplateDefaults[${index}]`;
    assert(item && typeof item === "object" && !Array.isArray(item), `${itemPath} must be an object`);
    assertNonEmptyString(item.templateKey, `${itemPath}.templateKey`);
    assert(allowedTemplateKeys.has(item.templateKey), `${itemPath}.templateKey contains unsupported template ${item.templateKey}`);
    assert(!seen.has(item.templateKey), `${itemPath}.templateKey must not be duplicated`);
    seen.add(item.templateKey);
    assert(item.status === "preview_only", `${itemPath}.status must stay preview_only`);
    assertNonEmptyString(item.guardrail, `${itemPath}.guardrail`);
    assert(
      item.partyDefaults && typeof item.partyDefaults === "object" && !Array.isArray(item.partyDefaults),
      `${itemPath}.partyDefaults must be an object`,
    );
    const partyDefaultEntries = Object.entries(item.partyDefaults);
    assert(partyDefaultEntries.length > 0, `${itemPath}.partyDefaults must not be empty`);
    partyDefaultEntries.forEach(([key, value]) => {
      assert(allowedPartyKeys.has(key), `${itemPath}.partyDefaults.${key} is not an allowed print party default`);
      assert(typeof value === "string", `${itemPath}.partyDefaults.${key} must be a string`);
    });
    requiredPartyKeys.forEach((key) =>
      assertNonEmptyString(item.partyDefaults[key], `${itemPath}.partyDefaults.${key}`),
    );
    assert(
      item.supplierDefaults == null,
      `${itemPath}.supplierDefaults must not override supplier snapshots from business records`,
    );
  });
}

function validateRoleProfiles(config, catalog) {
  if (config.roleProfiles == null) {
    return;
  }
  assert(Array.isArray(config.roleProfiles), "roleProfiles must be an array");
  const knownPools = toKeySet(catalog.workPools);
  const seenRoles = new Set();
  config.roleProfiles.forEach((profile, index) => {
    const path = `roleProfiles[${index}]`;
    assert(profile && typeof profile === "object" && !Array.isArray(profile), `${path} must be an object`);
    assertNonEmptyString(profile.roleKey, `${path}.roleKey`);
    assert(!seenRoles.has(profile.roleKey), `${path}.roleKey must not be duplicated`);
    seenRoles.add(profile.roleKey);
    assertNonEmptyString(profile.displayName, `${path}.displayName`);
    assertStringList(profile.ownerPools, `${path}.ownerPools`);
    profile.ownerPools.forEach((poolKey) =>
      assert(knownPools.has(poolKey), `${path}.ownerPools contains unknown pool ${poolKey}`),
    );
    assertStringList(profile.capabilityKeys, `${path}.capabilityKeys`);
    assert(
      profile.capabilityKeys.includes("workflow.task.read"),
      `${path}.capabilityKeys must include workflow.task.read`,
    );
  });
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

function normalizeProcessPolicyRule(rule, schema = customerPackageSchema) {
  const normalized = {};
  for (const key of schema.allowedProcessPolicyRuleKeys) {
    if (rule[key] != null) {
      normalized[key] = String(rule[key]).trim();
    }
  }
  return normalized;
}

function assertProcessPolicyRules(rules, policyPath, schema = customerPackageSchema) {
  assert(Array.isArray(rules), `${policyPath}.rules must be an array`);
  assert(rules.length > 0, `${policyPath}.rules must not be empty`);
  const allowedKeys = new Set(schema.allowedProcessPolicyRuleKeys);
  const forbiddenKeys = new Set(schema.forbiddenProcessPolicyRuleKeys || []);
  const triggerKeys = schema.requiredProcessPolicyRuleTriggerKeys || [];
  const resultKeys = schema.requiredProcessPolicyRuleResultKeys || [];

  rules.forEach((rule, ruleIndex) => {
    const rulePath = `${policyPath}.rules[${ruleIndex}]`;
    assert(rule && typeof rule === "object" && !Array.isArray(rule), `${rulePath} must be a rule object`);
    for (const [key, value] of Object.entries(rule)) {
      assert(!forbiddenKeys.has(key), `${rulePath}.${key} must not register executable policy behavior`);
      assert(allowedKeys.has(key), `${rulePath}.${key} is not an allowed process policy rule field`);
      assertNonEmptyString(value, `${rulePath}.${key}`);
    }
    assert(
      triggerKeys.some((key) => typeof rule[key] === "string" && rule[key].trim() !== ""),
      `${rulePath} must declare key or when`,
    );
    assert(
      resultKeys.some((key) => typeof rule[key] === "string" && rule[key].trim() !== ""),
      `${rulePath} must declare decision or action`,
    );
  });
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

  validateModuleStates(config, moduleKeys);
  validatePrintTemplateDefaults(config, schema);
  validateRoleProfiles(config, catalog);

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
    assertProcessPolicyRules(policy.rules, policyPath, schema);
    assertNonEmptyString(policy.guardrail, `${policyPath}.guardrail`);
  });

  assert(Array.isArray(config.extensionPoints), "extensionPoints must be an array");
  config.extensionPoints.forEach((extensionPoint, index) => {
    const extensionPath = `extensionPoints[${index}]`;
    assertNonEmptyString(extensionPoint.key, `${extensionPath}.key`);
    assertNonEmptyString(extensionPoint.label, `${extensionPath}.label`);
    assert(extensionPoint.status === "preview_only", `${extensionPath}.status must stay preview_only`);
    assert(
      extensionPoint.runtimeEnabled === false,
      `${extensionPath}.runtimeEnabled must stay false until an extension contract is reviewed`,
    );
    assert(
      extensionPoint.handler == null && extensionPoint.module == null,
      `${extensionPath} must not register executable extension handlers`,
    );
    assertNonEmptyString(extensionPoint.guardrail, `${extensionPath}.guardrail`);
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
      rules: policy.rules.map((rule) => normalizeProcessPolicyRule(rule)),
      guardrail: policy.guardrail,
    })),
    extensionPoints: config.extensionPoints.map((extensionPoint) => ({
      key: extensionPoint.key,
      label: extensionPoint.label,
      runtimeEnabled: extensionPoint.runtimeEnabled,
      guardrail: extensionPoint.guardrail,
    })),
    printTemplateDefaults: (config.printTemplateDefaults || []).map((item) => ({
      templateKey: item.templateKey,
      status: item.status,
      defaultFieldCount: Object.keys(item.partyDefaults || {}).length,
      guardrail: item.guardrail,
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
  assert(Array.isArray(preview.extensionPoints), "preview.extensionPoints must be an array");
  assert(Array.isArray(preview.printTemplateDefaults), "preview.printTemplateDefaults must be an array");
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

function normalizeCustomerKeys(args = {}) {
  const customerKeys = (
    Array.isArray(args.customers) && args.customers.length > 0
      ? args.customers
      : [args.customer || "yoyoosun"]
  ).map((customerKey) => String(customerKey || "").trim());
  assert(customerKeys.length > 0, "at least one customer package must be selected");
  const seen = new Set();
  for (const customerKey of customerKeys) {
    assert(customerKey !== "", "customer package key must not be empty");
    assert(!seen.has(customerKey), `customer package key is duplicated: ${customerKey}`);
    seen.add(customerKey);
  }
  return customerKeys;
}

function runSingleCustomerPackageLint(args, customer) {
  const mode = normalizeMode(args);
  assert(
    mode !== "activate" && mode !== "rollback",
    `customer package ${mode} is disabled: current gate only supports validate, compile and preview`,
  );
  const config = CUSTOMER_PACKAGES[customer];
  assert(config, `unknown customer package: ${customer}`);

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

function runCustomerPackageLint(args) {
  return runSingleCustomerPackageLint(args, args.customer || "yoyoosun");
}

function runCustomerPackageLintMany(args) {
  const customerKeys = normalizeCustomerKeys(args);
  assert(
    customerKeys.length === 1 || !args.out,
    "--out only supports one customer package; run separate preview commands for multiple customers",
  );
  return customerKeys.map((customerKey) =>
    runSingleCustomerPackageLint(args, customerKey),
  );
}

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const results = runCustomerPackageLintMany(args);
  for (const result of results) {
    const config = result.config;
    console.log(
      `customer package ${result.mode} ok: ${config.customerKey}, workflows=${config.workflows.length}, businessFlows=${config.businessFlows.length}, stateMachines=${config.stateMachines.length}, policies=${config.processPolicies.length}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  buildPreview,
  runCustomerPackageLint,
  runCustomerPackageLintMany,
  validateCatalog,
  validatePackage,
  validatePreview,
};
