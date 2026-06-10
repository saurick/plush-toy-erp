#!/usr/bin/env node

import { yoyoosunFieldNumberingConfig } from "../../config/customers/yoyoosun/fieldNumberingConfig.mjs";
import { yoyoosunImportConfig } from "../../config/customers/yoyoosun/importConfig.mjs";

const ALLOWED_FIELD_DECISIONS = new Set(["review_required", "defer_runtime"]);
const ALLOWED_NUMBERING_DECISIONS = new Set(["review_required", "deferred"]);
const ALLOWED_IMPORT_CLASSIFICATIONS = new Set([
  "runtime_active_display_config",
  "draft_customer_config",
  "data_import_adapter",
  "deferred_runtime",
  "print_template_input",
  "forbidden_auto_import",
]);
const ALLOWED_IMPORT_DECISIONS = new Set([
  "runtime_active",
  "review_required",
  "draft_only",
  "deferred",
  "forbidden_auto_import",
]);
const FORBIDDEN_RAW_DATA_KEYS = new Set([
  "rows",
  "rawRows",
  "rawValues",
  "records",
  "sources",
]);

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

function assertStringList(values, path) {
  assert(Array.isArray(values), `${path} must be an array`);
  assert(values.length > 0, `${path} must not be empty`);
  values.forEach((value, index) => {
    assertNonEmptyString(value, `${path}[${index}]`);
  });
}

function assertNoRawDataPayload(value, path = "importConfig") {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    assert(
      !FORBIDDEN_RAW_DATA_KEYS.has(key),
      `${path}.${key} must not embed raw source rows or records`,
    );
    assertNoRawDataPayload(nestedValue, `${path}.${key}`);
  }
}

function validateYoyoosunFieldNumberingConfig(config) {
  assert(config.customerKey === "yoyoosun", "customerKey must stay yoyoosun");
  assert(
    config.status === "draft",
    "fieldNumberingConfig status must stay draft",
  );
  assert(
    config.runtimeEnabled === false,
    "fieldNumberingConfig must not be runtime-enabled",
  );

  const boundaries = config.boundaries;
  assert(
    boundaries && typeof boundaries === "object",
    "boundaries must be present",
  );
  for (const key of [
    "createsTenant",
    "changesSchema",
    "changesMigration",
    "changesBackendRbac",
    "changesWorkflowFactRules",
    "executesImport",
  ]) {
    assert(boundaries[key] === false, `boundaries.${key} must stay false`);
  }

  assert(
    Array.isArray(config.fieldDisplayReview),
    "fieldDisplayReview must be an array",
  );
  assert(
    config.fieldDisplayReview.length > 0,
    "fieldDisplayReview must not be empty",
  );

  for (const [
    moduleIndex,
    moduleConfig,
  ] of config.fieldDisplayReview.entries()) {
    const modulePath = `fieldDisplayReview[${moduleIndex}]`;
    assertNonEmptyString(moduleConfig.module, `${modulePath}.module`);
    assertNonEmptyString(moduleConfig.label, `${modulePath}.label`);
    assert(
      Array.isArray(moduleConfig.candidates),
      `${modulePath}.candidates must be an array`,
    );
    assert(
      moduleConfig.candidates.length > 0,
      `${modulePath}.candidates must not be empty`,
    );

    for (const [
      candidateIndex,
      candidate,
    ] of moduleConfig.candidates.entries()) {
      const candidatePath = `${modulePath}.candidates[${candidateIndex}]`;
      assertNonEmptyString(candidate.key, `${candidatePath}.key`);
      assertNonEmptyString(candidate.label, `${candidatePath}.label`);
      assert(
        ALLOWED_FIELD_DECISIONS.has(candidate.decision),
        `${candidatePath}.decision must be one of ${[...ALLOWED_FIELD_DECISIONS].join(", ")}`,
      );
      assertNonEmptyString(candidate.source, `${candidatePath}.source`);
      assert(
        candidate.source.endsWith(".md"),
        `${candidatePath}.source must point to a Markdown source`,
      );
      assertNonEmptyString(candidate.note, `${candidatePath}.note`);
    }
  }

  assert(
    Array.isArray(config.numberingRuleReview),
    "numberingRuleReview must be an array",
  );
  assert(
    config.numberingRuleReview.length > 0,
    "numberingRuleReview must not be empty",
  );

  for (const [index, item] of config.numberingRuleReview.entries()) {
    const itemPath = `numberingRuleReview[${index}]`;
    assertNonEmptyString(item.domain, `${itemPath}.domain`);
    assertNonEmptyString(item.key, `${itemPath}.key`);
    assertNonEmptyString(item.label, `${itemPath}.label`);
    assert(
      ALLOWED_NUMBERING_DECISIONS.has(item.currentDecision),
      `${itemPath}.currentDecision must be one of ${[...ALLOWED_NUMBERING_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(
      item.unresolvedQuestion,
      `${itemPath}.unresolvedQuestion`,
    );
  }
}

function validateYoyoosunImportConfig(config) {
  assert(config.customerKey === "yoyoosun", "importConfig customerKey must stay yoyoosun");
  assert(config.status === "draft", "importConfig status must stay draft");
  assert(config.runtimeEnabled === false, "importConfig must not be runtime-enabled");
  assertNoRawDataPayload(config);

  const sourcePolicy = config.sourcePolicy;
  assert(sourcePolicy, "importConfig.sourcePolicy must be present");
  assertNonEmptyString(sourcePolicy.rawSourceRoot, "sourcePolicy.rawSourceRoot");
  assertNonEmptyString(
    sourcePolicy.extractedEvidenceRoot,
    "sourcePolicy.extractedEvidenceRoot",
  );
  assert(
    sourcePolicy.noRawRowsInConfig === true,
    "sourcePolicy.noRawRowsInConfig must stay true",
  );
  assert(
    sourcePolicy.usesExtractedEvidenceOnly === true,
    "sourcePolicy.usesExtractedEvidenceOnly must stay true",
  );
  assert(
    sourcePolicy.requiresExistingV1SnapshotBeforeApproval === true,
    "sourcePolicy.requiresExistingV1SnapshotBeforeApproval must stay true",
  );
  assert(
    sourcePolicy.requiresHumanApprovalForRealImport === true,
    "sourcePolicy.requiresHumanApprovalForRealImport must stay true",
  );
  assert(
    sourcePolicy.pdfImageOcrEnabled === false,
    "sourcePolicy.pdfImageOcrEnabled must stay false",
  );

  for (const key of [
    "createsTenant",
    "changesSchema",
    "changesMigration",
    "changesBackendRbac",
    "changesWorkflowFactRules",
    "changesRuntimeLoader",
    "executesImport",
    "executesRealImport",
    "canExecuteRealImport",
    "writesBusinessRecords",
    "writesFacts",
    "writesInventoryFacts",
    "writesShipmentFacts",
    "writesFinanceFacts",
    "createsProductSkus",
    "createsPurchaseOrderRuntime",
  ]) {
    assert(config.boundaries?.[key] === false, `importConfig.boundaries.${key} must stay false`);
  }

  const stats = config.globalScan?.extractedSourceStats;
  assert(stats, "globalScan.extractedSourceStats must be present");
  assert(stats.workbooks === 5, "extractedSourceStats.workbooks must stay 5");
  assert(stats.sheets === 20, "extractedSourceStats.sheets must stay 20");
  assert(stats.sourceRows === 5800, "extractedSourceStats.sourceRows must stay 5800");
  assert(
    stats.sourceTypes?.dataImportSource === 5794,
    "extractedSourceStats.sourceTypes.dataImportSource must stay 5794",
  );
  assert(
    stats.sourceTypes?.printTemplateInput === 6,
    "extractedSourceStats.sourceTypes.printTemplateInput must stay 6",
  );
  for (const [domain, count] of Object.entries({
    products: 369,
    units: 11,
    materials: 438,
    bom: 91,
    purchase_orders: 1971,
    suppliers: 970,
    outsourcing: 1266,
    contacts: 684,
  })) {
    assert(
      stats.countsByDomain?.[domain] === count,
      `extractedSourceStats.countsByDomain.${domain} must stay ${count}`,
    );
  }

  const dryRun = config.globalScan?.dryRunPreview;
  assert(dryRun, "globalScan.dryRunPreview must be present");
  assert(dryRun.totalSources === 5800, "dryRunPreview.totalSources must stay 5800");
  assert(dryRun.normalizedRows === 5800, "dryRunPreview.normalizedRows must stay 5800");
  assert(dryRun.canExecuteRealImport === false, "dryRunPreview.canExecuteRealImport must stay false");
  assert(dryRun.canProceedToManualReview === true, "dryRunPreview.canProceedToManualReview must stay true");
  assert(dryRun.blockerCount === 969, "dryRunPreview.blockerCount must stay 969");
  assert(dryRun.forbiddenCount === 6, "dryRunPreview.forbiddenCount must stay 6");
  assert(dryRun.candidateCountsByAction?.defer === 3231, "dryRunPreview defer count must stay 3231");
  assert(dryRun.unresolvedCountsBySeverity?.block === 963, "dryRunPreview block count must stay 963");

  const freeze = config.globalScan?.freezeCheck;
  assert(freeze, "globalScan.freezeCheck must be present");
  assert(freeze.valid === true, "freezeCheck.valid must stay true");
  assert(freeze.sourceCount === 5800, "freezeCheck.sourceCount must stay 5800");
  assert(freeze.blockerCount === 0, "freezeCheck.blockerCount must stay 0");
  assert(freeze.sensitiveFieldCount === 4417, "freezeCheck.sensitiveFieldCount must stay 4417");

  assert(Array.isArray(config.configItems), "configItems must be an array");
  assert(config.configItems.length >= 9, "configItems must cover core customer config groups");
  const itemIds = new Set();
  const itemGroups = new Set();
  for (const [index, item] of config.configItems.entries()) {
    const itemPath = `configItems[${index}]`;
    assertNonEmptyString(item.id, `${itemPath}.id`);
    assert(!itemIds.has(item.id), `${itemPath}.id must be unique`);
    itemIds.add(item.id);
    assertNonEmptyString(item.group, `${itemPath}.group`);
    itemGroups.add(item.group);
    assertNonEmptyString(item.label, `${itemPath}.label`);
    assert(
      ALLOWED_IMPORT_CLASSIFICATIONS.has(item.classification),
      `${itemPath}.classification must be one of ${[...ALLOWED_IMPORT_CLASSIFICATIONS].join(", ")}`,
    );
    assert(
      ALLOWED_IMPORT_DECISIONS.has(item.decision),
      `${itemPath}.decision must be one of ${[...ALLOWED_IMPORT_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(item.source, `${itemPath}.source`);
    assertStringList(item.appliesTo, `${itemPath}.appliesTo`);
    assert(
      item.productCoreImpact === "none",
      `${itemPath}.productCoreImpact must stay none`,
    );
    assertNonEmptyString(item.guardrail, `${itemPath}.guardrail`);
  }

  for (const group of [
    "brand_menu",
    "field_display",
    "numbering_rules",
    "source_extract_adapter",
    "master_data_import_defaults",
    "purchase_outsourcing_source_documents",
    "print_template_inputs",
    "role_permission_template",
    "forbidden_auto_import",
  ]) {
    assert(itemGroups.has(group), `configItems must include ${group}`);
  }

  assert(Array.isArray(config.sourceSheetGroups), "sourceSheetGroups must be an array");
  const sheetGroupKeys = new Set(config.sourceSheetGroups.map((item) => item.key));
  for (const key of [
    "material_bom_analysis",
    "purchase_material_summary",
    "supplier_contact_directory",
    "outsourcing_summary",
    "contract_print_samples",
  ]) {
    assert(sheetGroupKeys.has(key), `sourceSheetGroups must include ${key}`);
  }
  for (const [index, group] of config.sourceSheetGroups.entries()) {
    const groupPath = `sourceSheetGroups[${index}]`;
    assertNonEmptyString(group.key, `${groupPath}.key`);
    assertNonEmptyString(group.label, `${groupPath}.label`);
    assertStringList(group.domains, `${groupPath}.domains`);
    assertStringList(group.mappedFields, `${groupPath}.mappedFields`);
    assert(
      ALLOWED_IMPORT_DECISIONS.has(group.decision),
      `${groupPath}.decision must be one of ${[...ALLOWED_IMPORT_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(group.guardrail, `${groupPath}.guardrail`);
  }

  assert(
    Array.isArray(config.recommendedImportSequence),
    "recommendedImportSequence must be an array",
  );
  assert(
    config.recommendedImportSequence.length === 5,
    "recommendedImportSequence must keep the five reviewed steps",
  );
  config.recommendedImportSequence.forEach((step, index) => {
    const stepPath = `recommendedImportSequence[${index}]`;
    assert(step.step === index + 1, `${stepPath}.step must be sequential`);
    assertStringList(step.domains, `${stepPath}.domains`);
    assert(
      ALLOWED_IMPORT_DECISIONS.has(step.decision),
      `${stepPath}.decision must be one of ${[...ALLOWED_IMPORT_DECISIONS].join(", ")}`,
    );
    assertNonEmptyString(step.reason, `${stepPath}.reason`);
  });

  assert(Array.isArray(config.reviewQueues), "reviewQueues must be an array");
  const reviewQueueKeys = new Set(config.reviewQueues.map((item) => item.key));
  for (const key of [
    "unit_normalization",
    "supplier_role_split",
    "contact_owner_match",
    "bom_product_material_unit_match",
    "sensitive_contact_bank_fields",
    "existing_v1_snapshot",
  ]) {
    assert(reviewQueueKeys.has(key), `reviewQueues must include ${key}`);
  }
  for (const [index, item] of config.reviewQueues.entries()) {
    const itemPath = `reviewQueues[${index}]`;
    assertNonEmptyString(item.key, `${itemPath}.key`);
    assert(["block", "review"].includes(item.severity), `${itemPath}.severity must be block or review`);
    assertStringList(item.domains, `${itemPath}.domains`);
    assert(Number.isInteger(item.evidenceCount) && item.evidenceCount > 0, `${itemPath}.evidenceCount must be positive`);
    assert(item.decision === "review_required", `${itemPath}.decision must stay review_required`);
    assertNonEmptyString(item.owner, `${itemPath}.owner`);
    assertNonEmptyString(item.note, `${itemPath}.note`);
  }

  assertStringList(config.forbiddenAutoImportTargets, "forbiddenAutoImportTargets");
  for (const forbidden of [
    "tenant_id",
    "business_records",
    "product_skus",
    "purchase_orders",
    "outsourcing_facts",
    "shipments",
    "shipment_items",
    "stock_reservations",
    "inventory_txns",
    "inventory_balances",
    "inventory_lots",
    "finance_facts",
    "workflow_facts",
    "shipping_released_to_shipped",
    "workflow_done_to_fact_posted",
  ]) {
    assert(
      config.forbiddenAutoImportTargets.includes(forbidden),
      `forbiddenAutoImportTargets must include ${forbidden}`,
    );
  }
  assertStringList(config.deferredRuntimeTargets, "deferredRuntimeTargets");
}

validateYoyoosunFieldNumberingConfig(yoyoosunFieldNumberingConfig);
validateYoyoosunImportConfig(yoyoosunImportConfig);

console.log(
  `customer config boundaries ok: ${yoyoosunFieldNumberingConfig.customerKey}, field modules=${yoyoosunFieldNumberingConfig.fieldDisplayReview.length}, numbering rules=${yoyoosunFieldNumberingConfig.numberingRuleReview.length}, import config items=${yoyoosunImportConfig.configItems.length}, extracted rows=${yoyoosunImportConfig.globalScan.extractedSourceStats.sourceRows}`,
);
