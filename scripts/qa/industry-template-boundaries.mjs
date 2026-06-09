#!/usr/bin/env node

import { plushIndustryTemplateConfig } from "../../config/industry-templates/plush/templateConfig.mjs";
import { getNavigationSections } from "../../web/src/erp/config/seedData.mjs";

const ALLOWED_CLASSIFICATIONS = new Set([
  "industry_default_candidate",
  "customer_sample_only",
  "deferred",
]);
const ALLOWED_DECISIONS = new Set(["review_required", "deferred"]);
const FORBIDDEN_DEFAULT_TERMS = ["yoyoosun", "永绅"];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNonEmptyString(value, path) {
  assert(
    typeof value === "string" && value.trim() !== "",
    `${path} must be a non-empty string`,
  );
}

function assertClassification(value, path) {
  assert(
    ALLOWED_CLASSIFICATIONS.has(value),
    `${path} must be one of ${[...ALLOWED_CLASSIFICATIONS].join(", ")}`,
  );
}

function assertNoCustomerTerm(value, path) {
  if (typeof value !== "string") {
    return;
  }
  const normalized = value.toLowerCase();
  for (const term of FORBIDDEN_DEFAULT_TERMS) {
    assert(
      !normalized.includes(term.toLowerCase()),
      `${path} must not contain customer-specific term ${term}`,
    );
  }
}

function assertStringList(values, path) {
  assert(Array.isArray(values), `${path} must be an array`);
  assert(values.length > 0, `${path} must not be empty`);
  values.forEach((value, index) => {
    assertNonEmptyString(value, `${path}[${index}]`);
  });
}

function collectNavigationItemKeys() {
  const keys = new Set();
  getNavigationSections(null).forEach((section) => {
    (section.items || []).forEach((item) => {
      if (item?.key) {
        keys.add(item.key);
      }
    });
  });
  return keys;
}

function validateTemplate(config) {
  assert(config.templateKey === "plush", "templateKey must stay plush");
  assert(config.phase === "Phase 10", "phase must stay Phase 10");
  assert(config.status === "candidate", "status must stay candidate");
  assert(config.runtimeEnabled === false, "runtimeEnabled must stay false");

  const sourcePolicy = config.sourcePolicy;
  assert(sourcePolicy, "sourcePolicy must be present");
  assert(
    sourcePolicy.singleCustomerMayOnlyCreateCandidate === true,
    "single customer input must only create candidates",
  );
  assert(
    sourcePolicy.requiresHumanIndustryReview === true,
    "human industry review must stay required",
  );
  assert(
    sourcePolicy.requiresMultiCustomerRepeatForDefault === true,
    "multi-customer repeat must stay required for defaults",
  );
  assert(
    sourcePolicy.customerSpecificTermsAllowedInDefaults === false,
    "customer-specific terms must not be allowed in defaults",
  );

  for (const key of [
    "createsTenant",
    "changesSchema",
    "changesMigration",
    "changesBackendRbac",
    "changesWorkflowFactRules",
    "changesRuntimeMenuLoader",
    "executesImport",
    "writesBusinessRecords",
    "writesFacts",
  ]) {
    assert(config.boundaries?.[key] === false, `boundaries.${key} must stay false`);
  }

  assertStringList(config.sourcePolicy.seedCustomerKeys, "sourcePolicy.seedCustomerKeys");
  assert(
    config.sourcePolicy.seedCustomerKeys.includes("yoyoosun"),
    "yoyoosun may remain a seed customer source",
  );

  const roleKeys = new Set();
  assert(Array.isArray(config.defaultRoles), "defaultRoles must be an array");
  assert(config.defaultRoles.length >= 8, "defaultRoles must include core roles");
  for (const [index, role] of config.defaultRoles.entries()) {
    const path = `defaultRoles[${index}]`;
    assertNonEmptyString(role.key, `${path}.key`);
    assertNonEmptyString(role.label, `${path}.label`);
    assertNoCustomerTerm(role.label, `${path}.label`);
    assertClassification(role.classification, `${path}.classification`);
    assertNonEmptyString(role.evidence, `${path}.evidence`);
    assertNonEmptyString(role.boundary, `${path}.boundary`);
    roleKeys.add(role.key);
  }
  for (const key of [
    "boss",
    "sales",
    "purchase",
    "warehouse",
    "quality",
    "finance",
    "pmc",
    "production",
  ]) {
    assert(roleKeys.has(key), `defaultRoles must include ${key}`);
  }

  const navigationKeys = collectNavigationItemKeys();
  assert(
    config.desktopMenuTemplate?.classification === "industry_default_candidate",
    "desktopMenuTemplate classification must be industry_default_candidate",
  );
  assert(
    Array.isArray(config.desktopMenuTemplate.sections),
    "desktopMenuTemplate.sections must be an array",
  );
  for (const [sectionIndex, section] of config.desktopMenuTemplate.sections.entries()) {
    const sectionPath = `desktopMenuTemplate.sections[${sectionIndex}]`;
    assertNonEmptyString(section.title, `${sectionPath}.title`);
    assertNoCustomerTerm(section.title, `${sectionPath}.title`);
    assertStringList(section.items, `${sectionPath}.items`);
    if (section.classification) {
      assertClassification(section.classification, `${sectionPath}.classification`);
    }
    section.items.forEach((itemKey, itemIndex) => {
      assert(
        navigationKeys.has(itemKey),
        `${sectionPath}.items[${itemIndex}] unknown menu item ${itemKey}`,
      );
    });
  }

  for (const [index, item] of config.mobileTaskPatternTemplate.entries()) {
    const path = `mobileTaskPatternTemplate[${index}]`;
    assertNonEmptyString(item.key, `${path}.key`);
    assertNonEmptyString(item.label, `${path}.label`);
    assertNoCustomerTerm(item.label, `${path}.label`);
    assertStringList(item.roles, `${path}.roles`);
    assertClassification(item.classification, `${path}.classification`);
    assertNonEmptyString(item.factBoundary, `${path}.factBoundary`);
    assertNonEmptyString(item.note, `${path}.note`);
  }

  for (const [index, item] of config.fieldDisplayTemplate.entries()) {
    const path = `fieldDisplayTemplate[${index}]`;
    assertNonEmptyString(item.module, `${path}.module`);
    assertNonEmptyString(item.label, `${path}.label`);
    assertNoCustomerTerm(item.label, `${path}.label`);
    assertClassification(item.classification, `${path}.classification`);
    assertStringList(item.fields, `${path}.fields`);
  }

  for (const [index, item] of config.numberingRuleTemplate.entries()) {
    const path = `numberingRuleTemplate[${index}]`;
    assertNonEmptyString(item.domain, `${path}.domain`);
    assertNonEmptyString(item.key, `${path}.key`);
    assertNonEmptyString(item.label, `${path}.label`);
    assertNoCustomerTerm(item.label, `${path}.label`);
    assertClassification(item.classification, `${path}.classification`);
    assert(
      ALLOWED_DECISIONS.has(item.decision),
      `${path}.decision must be one of ${[...ALLOWED_DECISIONS].join(", ")}`,
    );
  }

  assert(
    config.importTemplate?.canExecuteRealImport === false,
    "importTemplate.canExecuteRealImport must stay false",
  );
  assert(
    config.importTemplate?.mode === "dry_run_only",
    "importTemplate.mode must stay dry_run_only",
  );
  assertStringList(config.importTemplate.sources, "importTemplate.sources");
  assertStringList(
    config.importTemplate.forbiddenAutoTargets,
    "importTemplate.forbiddenAutoTargets",
  );
  for (const forbidden of [
    "tenant_id",
    "business_records",
    "shipments",
    "inventory_txns",
    "finance_facts",
  ]) {
    assert(
      config.importTemplate.forbiddenAutoTargets.includes(forbidden),
      `importTemplate.forbiddenAutoTargets must include ${forbidden}`,
    );
  }

  assert(
    Array.isArray(config.trainingAcceptanceTemplate) &&
      config.trainingAcceptanceTemplate.length >= 4,
    "trainingAcceptanceTemplate must include core checks",
  );
  assertStringList(config.deferredItems, "deferredItems");
}

validateTemplate(plushIndustryTemplateConfig);

console.log(
  `industry template boundaries ok: ${plushIndustryTemplateConfig.templateKey}, roles=${plushIndustryTemplateConfig.defaultRoles.length}, menuSections=${plushIndustryTemplateConfig.desktopMenuTemplate.sections.length}, importMode=${plushIndustryTemplateConfig.importTemplate.mode}`,
);
