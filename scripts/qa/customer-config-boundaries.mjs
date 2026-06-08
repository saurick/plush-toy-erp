#!/usr/bin/env node

import { yoyoosunFieldNumberingConfig } from "../../config/customers/yoyoosun/fieldNumberingConfig.mjs";

const ALLOWED_FIELD_DECISIONS = new Set(["review_required", "defer_runtime"]);
const ALLOWED_NUMBERING_DECISIONS = new Set(["review_required", "deferred"]);

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

validateYoyoosunFieldNumberingConfig(yoyoosunFieldNumberingConfig);

console.log(
  `customer config boundaries ok: ${yoyoosunFieldNumberingConfig.customerKey}, field modules=${yoyoosunFieldNumberingConfig.fieldDisplayReview.length}, numbering rules=${yoyoosunFieldNumberingConfig.numberingRuleReview.length}`,
);
