#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plushIndustryTemplateConfig } from "../../config/industry-templates/plush/templateConfig.mjs";

const DEFAULT_OUT_DIR = "output/customers/yoyoosun/industry-template-closure";

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa/industry-template-closure.mjs [--out <dir>]

Purpose:
  Generate industry template simulation evidence.

Boundaries:
  - reads only config/industry-templates/plush/templateConfig.mjs
  - does not connect to DB or backend
  - does not execute real import
  - does not write business_records or fact tables
`);
}

function countByClassification(items = []) {
  return items.reduce((acc, item) => {
    const key = item.classification || "unspecified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function createReport(config) {
  const desktopSections = config.desktopMenuTemplate.sections || [];
  const desktopMenuItems = desktopSections.flatMap((section) => section.items || []);
  const fieldModules = config.fieldDisplayTemplate || [];
  const numberingRules = config.numberingRuleTemplate || [];
  const mobilePatterns = config.mobileTaskPatternTemplate || [];

  return {
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    templateKey: config.templateKey,
    reviewMilestone: config.reviewMilestone,
    status: config.status,
    runtimeEnabled: config.runtimeEnabled,
    sourcePolicy: config.sourcePolicy,
    boundaries: config.boundaries,
    summary: {
      roles: config.defaultRoles.length,
      desktopMenuSections: desktopSections.length,
      desktopMenuItems: desktopMenuItems.length,
      mobileTaskPatterns: mobilePatterns.length,
      fieldModules: fieldModules.length,
      numberingRules: numberingRules.length,
      importSources: config.importTemplate.sources.length,
      deferredItems: config.deferredItems.length,
    },
    classificationCounts: {
      roles: countByClassification(config.defaultRoles),
      mobileTaskPatterns: countByClassification(mobilePatterns),
      fieldModules: countByClassification(fieldModules),
      numberingRules: countByClassification(numberingRules),
      desktopMenuSections: countByClassification(desktopSections),
    },
    simulatedAcceptance: {
      noRealImport: config.importTemplate.canExecuteRealImport === false,
      dryRunOnly: config.importTemplate.mode === "dry_run_only",
      noTenant: config.boundaries.createsTenant === false,
      noSchemaChange: config.boundaries.changesSchema === false,
      noMigrationChange: config.boundaries.changesMigration === false,
      noRuntimeMenuLoaderChange: config.boundaries.changesRuntimeMenuLoader === false,
      noWorkflowFactChange: config.boundaries.changesWorkflowFactRules === false,
      noBusinessRecordWrite: config.boundaries.writesBusinessRecords === false,
      noFactWrite: config.boundaries.writesFacts === false,
    },
    roleKeys: config.defaultRoles.map((role) => role.key),
    desktopMenuSections: desktopSections.map((section) => ({
      title: section.title,
      classification: section.classification || config.desktopMenuTemplate.classification,
      items: section.items,
    })),
    deferredItems: config.deferredItems,
  };
}

function renderMarkdown(report) {
  return `# 行业模板模拟闭环报告 / Industry Template Simulation Report

## 摘要

| 项目 | 结果 |
| --- | --- |
| templateKey | ${report.templateKey} |
| reviewMilestone | ${report.reviewMilestone} |
| status | ${report.status} |
| runtimeEnabled | ${report.runtimeEnabled} |
| roles | ${report.summary.roles} |
| desktopMenuSections | ${report.summary.desktopMenuSections} |
| mobileTaskPatterns | ${report.summary.mobileTaskPatterns} |
| fieldModules | ${report.summary.fieldModules} |
| numberingRules | ${report.summary.numberingRules} |
| importMode | dry_run_only |

## 模拟验收

| 检查 | 结果 |
| --- | --- |
| 不执行真实导入 | ${report.simulatedAcceptance.noRealImport ? "PASS" : "FAIL"} |
| 只允许 dry-run 模板 | ${report.simulatedAcceptance.dryRunOnly ? "PASS" : "FAIL"} |
| 不创建 tenant | ${report.simulatedAcceptance.noTenant ? "PASS" : "FAIL"} |
| 不改 schema | ${report.simulatedAcceptance.noSchemaChange ? "PASS" : "FAIL"} |
| 不改 migration | ${report.simulatedAcceptance.noMigrationChange ? "PASS" : "FAIL"} |
| 不改运行时菜单 loader | ${report.simulatedAcceptance.noRuntimeMenuLoaderChange ? "PASS" : "FAIL"} |
| 不改 Workflow / Fact 规则 | ${report.simulatedAcceptance.noWorkflowFactChange ? "PASS" : "FAIL"} |
| 不写 business_records | ${report.simulatedAcceptance.noBusinessRecordWrite ? "PASS" : "FAIL"} |
| 不写事实表 | ${report.simulatedAcceptance.noFactWrite ? "PASS" : "FAIL"} |

## 桌面菜单模板

${report.desktopMenuSections
  .map(
    (section) =>
      `- ${section.title}: ${section.items.join(", ")} (${section.classification})`,
  )
  .join("\n")}

## Deferred

${report.deferredItems.map((item) => `- ${item}`).join("\n")}
`;
}

export function runIndustryTemplateClosure(options) {
  const report = createReport(plushIndustryTemplateConfig);
  const outDir = path.resolve(options.out || DEFAULT_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "industry-template-report.json");
  const mdPath = path.join(outDir, "industry-template-report.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));

  return {
    outDir,
    jsonPath,
    mdPath,
    report,
  };
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = runIndustryTemplateClosure(options);
    console.log(
      `industry template closure ok: ${result.report.templateKey}, roles=${result.report.summary.roles}, menuSections=${result.report.summary.desktopMenuSections}, out=${result.outDir}`,
    );
  } catch (error) {
    console.error(`[industry-template-closure] ${error.message}`);
    process.exit(1);
  }
}
