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

const REQUIRED_CUSTOMER_DOCS = ["README.md", "差异与边界.md", "实施测试部署验收.md"];
const REQUIRED_CUSTOMER_CONFIG_FILES = [
  "README.md",
  "customerPackage.mjs",
  "customer-config.example.js",
];
const REQUIRED_DEPLOYMENT_DOCS = ["README.md", "reference-customer.env.example"];

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

function assertExactStringList(values, expected, key) {
  assertStringList(values, key);
  assert(
    JSON.stringify(values) === JSON.stringify(expected),
    `${key} must stay the minimal reviewed list: ${expected.join(", ")}`,
  );
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
  assertExactStringList(config.requiredCustomerDocs, REQUIRED_CUSTOMER_DOCS, "requiredCustomerDocs");
  assertExactStringList(
    config.requiredCustomerConfigFiles,
    REQUIRED_CUSTOMER_CONFIG_FILES,
    "requiredCustomerConfigFiles",
  );
  assertExactStringList(config.requiredDeploymentDocs, REQUIRED_DEPLOYMENT_DOCS, "requiredDeploymentDocs");
  assert(Array.isArray(config.reusableSources), "reusableSources must be an array");
  assert(config.reusableSources.length >= 4, "reusableSources must include core reusable inputs");
  assertStringList(config.boundaryReviewChecks, "boundaryReviewChecks");

  for (const relativePath of FORBIDDEN_SIMULATED_DIRS) {
    assert(!fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} must not be created`);
  }

  assert(
    !fs.existsSync(path.join(repoRoot, "deployments/reference-customer")),
    "deployments/reference-customer must not be created for the engineering reference",
  );

  for (const relativePath of [
    "docs/customers/yoyoosun/README.md",
    "config/customers/yoyoosun/README.md",
    "deployments/yoyoosun/README.md",
    "config/industry-templates/plush/templateConfig.mjs",
    "server/deploy/compose/prod/README.md",
    "config/private-deployment-template/reference-customer.env.example",
    "config/private-deployment-template/reference-customer.override.example.yml",
  ]) {
    assertPathExists(repoRoot, relativePath);
  }

  const referenceEnv = fs.readFileSync(
    path.join(
      repoRoot,
      "config/private-deployment-template/reference-customer.env.example",
    ),
    "utf8",
  );
  assert(
    referenceEnv.includes("COMPOSE_PROJECT_NAME=plush-toy-erp-reference-customer"),
    "reference env must isolate the Compose project",
  );
  assert(
    referenceEnv.includes("ERP_CUSTOMER_KEY=reference-customer"),
    "reference env must pin ERP_CUSTOMER_KEY",
  );
  assert(
    !referenceEnv.includes("FILE_STORAGE_DIR"),
    "reference env must not invent an application file store",
  );

  const referenceOverride = fs.readFileSync(
    path.join(
      repoRoot,
      "config/private-deployment-template/reference-customer.override.example.yml",
    ),
    "utf8",
  );
  assert(
    referenceOverride.includes("x-reference-logging") &&
      referenceOverride.includes("max-size") &&
      referenceOverride.includes("max-file"),
    "reference override must remain a bounded container log policy",
  );
  assert(
    !referenceOverride.includes("/app/files") &&
      !referenceOverride.includes("volumes:"),
    "reference override must not mount a storage path the application does not consume",
  );
}

validateTemplate(privateDeploymentPackageTemplate);

console.log(
  `private deployment boundaries ok: ${privateDeploymentPackageTemplate.templateKey}, roots=${privateDeploymentPackageTemplate.requiredPackageRoots.length}, simulatedKey=${privateDeploymentPackageTemplate.simulatedCustomerKey}`,
);

export { validateTemplate };
