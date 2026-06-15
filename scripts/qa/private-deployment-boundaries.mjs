#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { privateDeploymentPackageTemplate } from "../../config/private-deployment-template/templateConfig.mjs";
import { plushIndustryTemplateConfig } from "../../config/industry-templates/plush/templateConfig.mjs";

const FORBIDDEN_SIMULATED_DIRS = [
  "docs/customers/SIM-PRIVATE-DEPLOYMENT",
  "config/customers/SIM-PRIVATE-DEPLOYMENT",
  "deployments/SIM-PRIVATE-DEPLOYMENT",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNonEmptyString(value, key) {
  assert(typeof value === "string" && value.trim() !== "", `${key} must be a non-empty string`);
}

function assertStringList(values, key) {
  assert(Array.isArray(values), `${key} must be an array`);
  assert(values.length > 0, `${key} must not be empty`);
  values.forEach((value, index) => assertNonEmptyString(value, `${key}[${index}]`));
}

function assertPathExists(repoRoot, relativePath) {
  assert(fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} must exist`);
}

function validateTemplate(config, repoRoot = process.cwd()) {
  assert(config.templateKey === "private-customer-package", "templateKey must stay private-customer-package");
  assert(
    config.reviewMilestone === "private-deployment-package-candidate",
    "reviewMilestone must stay private-deployment-package-candidate",
  );
  assert(config["phase"] === undefined, "phase must not be used in active templates");
  assert(config.status === "template_candidate", "status must stay template_candidate");
  assert(config.runtimeEnabled === false, "runtimeEnabled must stay false");
  assert(config.simulatedCustomerKey === "SIM-PRIVATE-DEPLOYMENT", "simulatedCustomerKey must stay simulation-only");

  assert(config.sourcePolicy?.industryTemplateKey === "plush", "industryTemplateKey must stay plush");
  assert(config.sourcePolicy?.industryTemplateMustRemainCandidate === true, "industry template must remain candidate");
  assert(config.sourcePolicy?.requiresHumanImportApprovalForRealData === true, "real data must require human approval");
  assert(config.sourcePolicy?.simulatedCustomerKeyMustNotBecomeDirectory === true, "simulated key must not become directory");

  for (const key of [
    "createsTenant",
    "startsSaas",
    "changesSchema",
    "changesMigration",
    "changesBackendRbac",
    "changesWorkflowFactRules",
    "changesRuntimeMenuLoader",
    "forksCodebase",
    "executesRealImport",
    "writesBusinessRecords",
    "writesFacts",
    "buildsOnTargetServer",
  ]) {
    assert(config.boundaries?.[key] === false, `boundaries.${key} must stay false`);
  }

  assert(plushIndustryTemplateConfig.status === "candidate", "plush industry template must remain candidate");
  assert(plushIndustryTemplateConfig.runtimeEnabled === false, "plush industry template runtimeEnabled must stay false");

  assertStringList(config.requiredPackageRoots, "requiredPackageRoots");
  assertStringList(config.requiredCustomerDocs, "requiredCustomerDocs");
  assertStringList(config.requiredCustomerConfigFiles, "requiredCustomerConfigFiles");
  assertStringList(config.requiredDeploymentDocs, "requiredDeploymentDocs");
  assert(Array.isArray(config.reusableSources), "reusableSources must be an array");
  assert(config.reusableSources.length >= 4, "reusableSources must include core reusable inputs");
  assertStringList(config.simulatedAcceptanceChecks, "simulatedAcceptanceChecks");

  for (const relativePath of FORBIDDEN_SIMULATED_DIRS) {
    assert(!fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} must not be created`);
  }

  for (const relativePath of [
    "docs/customers/yoyoosun/README.md",
    "config/customers/yoyoosun/README.md",
    "deployments/yoyoosun/README.md",
    "config/industry-templates/plush/templateConfig.mjs",
    "server/deploy/compose/prod/README.md",
  ]) {
    assertPathExists(repoRoot, relativePath);
  }
}

validateTemplate(privateDeploymentPackageTemplate);

console.log(
  `private deployment boundaries ok: ${privateDeploymentPackageTemplate.templateKey}, roots=${privateDeploymentPackageTemplate.requiredPackageRoots.length}, simulatedKey=${privateDeploymentPackageTemplate.simulatedCustomerKey}`,
);

export { validateTemplate };
