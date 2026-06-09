#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateDeploymentPackageTemplate } from "../../config/private-deployment-template/templateConfig.mjs";
import { plushIndustryTemplateConfig } from "../../config/industry-templates/plush/templateConfig.mjs";

const DEFAULT_OUT_DIR = "output/customers/yoyoosun/phase11-private-deployment-closure";

function parseArgs(argv) {
  const options = { out: DEFAULT_OUT_DIR };

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
  node scripts/qa/phase11-private-deployment-closure.mjs [--out <dir>]

Purpose:
  Generate Phase 11 private deployment package simulation evidence.

Boundaries:
  - reads only private deployment and industry template configs
  - does not create a real customer directory
  - does not connect to DB or backend
  - does not execute real import
  - does not change schema, migration, RBAC, workflow or facts
`);
}

function createReport(packageTemplate, industryTemplate) {
  const acceptance = {
    noTenant: packageTemplate.boundaries.createsTenant === false,
    noSaas: packageTemplate.boundaries.startsSaas === false,
    noSchemaChange: packageTemplate.boundaries.changesSchema === false,
    noMigrationChange: packageTemplate.boundaries.changesMigration === false,
    noRbacChange: packageTemplate.boundaries.changesBackendRbac === false,
    noWorkflowFactChange: packageTemplate.boundaries.changesWorkflowFactRules === false,
    noRuntimeLoaderChange: packageTemplate.boundaries.changesRuntimeMenuLoader === false,
    noCodeFork: packageTemplate.boundaries.forksCodebase === false,
    noRealImport: packageTemplate.boundaries.executesRealImport === false,
    noBusinessRecordWrite: packageTemplate.boundaries.writesBusinessRecords === false,
    noFactWrite: packageTemplate.boundaries.writesFacts === false,
    noTargetBuild: packageTemplate.boundaries.buildsOnTargetServer === false,
    industryTemplateStillCandidate:
      industryTemplate.status === "candidate" && industryTemplate.runtimeEnabled === false,
    simulatedKeyNotRuntime:
      packageTemplate.sourcePolicy.simulatedCustomerKeyMustNotBecomeDirectory === true,
  };

  return {
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    phase: packageTemplate.phase,
    templateKey: packageTemplate.templateKey,
    status: packageTemplate.status,
    runtimeEnabled: packageTemplate.runtimeEnabled,
    simulatedCustomerKey: packageTemplate.simulatedCustomerKey,
    sourcePolicy: packageTemplate.sourcePolicy,
    boundaries: packageTemplate.boundaries,
    packageChecklist: {
      packageRoots: packageTemplate.requiredPackageRoots,
      customerDocs: packageTemplate.requiredCustomerDocs,
      customerConfigFiles: packageTemplate.requiredCustomerConfigFiles,
      deploymentDocs: packageTemplate.requiredDeploymentDocs,
      reusableSources: packageTemplate.reusableSources,
      simulatedAcceptanceChecks: packageTemplate.simulatedAcceptanceChecks,
    },
    summary: {
      packageRoots: packageTemplate.requiredPackageRoots.length,
      customerDocs: packageTemplate.requiredCustomerDocs.length,
      customerConfigFiles: packageTemplate.requiredCustomerConfigFiles.length,
      deploymentDocs: packageTemplate.requiredDeploymentDocs.length,
      reusableSources: packageTemplate.reusableSources.length,
      industryRoles: industryTemplate.defaultRoles.length,
      industryMenuSections: industryTemplate.desktopMenuTemplate.sections.length,
    },
    simulatedAcceptance: acceptance,
    finalDecision: {
      phase11ClosedBySimulation: Object.values(acceptance).every(Boolean),
      nextStep: "post-delivery customer usage feedback or Phase 12 SaaS review only after private deployments mature",
      stillNotAllowed: [
        "real customer data import",
        "tenant_id",
        "SaaS multi-tenancy",
        "license / billing",
        "core schema fork",
        "core usecase fork",
        "target-server build",
      ],
    },
  };
}

function renderMarkdown(report) {
  const acceptanceRows = Object.entries(report.simulatedAcceptance)
    .map(([key, value]) => `| ${key} | ${value ? "PASS" : "FAIL"} |`)
    .join("\n");

  return `# Phase 11 多客户私有化复制模拟闭环报告 / Phase 11 Private Deployment Package Simulation Report

## 摘要

| 项目 | 结果 |
| --- | --- |
| phase | ${report.phase} |
| templateKey | ${report.templateKey} |
| status | ${report.status} |
| runtimeEnabled | ${report.runtimeEnabled} |
| simulatedCustomerKey | ${report.simulatedCustomerKey} |
| packageRoots | ${report.summary.packageRoots} |
| customerDocs | ${report.summary.customerDocs} |
| customerConfigFiles | ${report.summary.customerConfigFiles} |
| deploymentDocs | ${report.summary.deploymentDocs} |
| reusableSources | ${report.summary.reusableSources} |

## 模拟验收

| 检查 | 结果 |
| --- | --- |
${acceptanceRows}

## 客户包根目录

${report.packageChecklist.packageRoots.map((item) => `- ${item}`).join("\n")}

## 部署包必备文档

${report.packageChecklist.deploymentDocs.map((item) => `- ${item}`).join("\n")}

## 仍不允许

${report.finalDecision.stillNotAllowed.map((item) => `- ${item}`).join("\n")}
`;
}

export function runPhase11PrivateDeploymentClosure(options) {
  const report = createReport(privateDeploymentPackageTemplate, plushIndustryTemplateConfig);
  const outDir = path.resolve(options.out || DEFAULT_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "phase11-private-deployment-report.json");
  const mdPath = path.join(outDir, "phase11-private-deployment-report.md");
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
    const result = runPhase11PrivateDeploymentClosure(options);
    console.log(
      `phase11 private deployment closure ok: ${result.report.templateKey}, packageRoots=${result.report.summary.packageRoots}, simulatedKey=${result.report.simulatedCustomerKey}, out=${result.outDir}`,
    );
  } catch (error) {
    console.error(`[phase11-private-deployment-closure] ${error.message}`);
    process.exit(1);
  }
}

