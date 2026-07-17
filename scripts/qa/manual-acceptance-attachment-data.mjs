#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  CUSTOMER_TRIAL_133_TARGET,
  assertManualAcceptanceDatabaseIdentity,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  manualAcceptanceRuntimeCapabilitiesFromAttestation,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

export const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS";
export const ATTACHMENT_NOTE = "样例附件，只用于查看和下载。";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const CUSTOMER_KEY = "yoyoosun";
const FACT_REFERENCE_KEYS = Object.freeze([
  "productionOrders",
  "productionFacts",
  "purchaseReceipts",
  "purchaseReturns",
  "purchaseReceiptAdjustments",
  "qualityInspections",
  "inventoryLots",
  "inventoryBalances",
  "inventoryTxns",
  "stockReservations",
  "shipments",
  "financeFacts",
]);
const ATTACHMENT_REQUIRED_MODULES = Object.freeze([
  "production_orders",
  "production",
  "inventory",
  "shipments",
  "finance",
  "purchase_receipts",
  "quality_inspections",
  "workflow_tasks",
]);
export const SOURCE_DRIVEN_FACT_REPORT_CONTRACT =
  "source-driven-operational-facts-v1";

export function normalizeLocalBackendURL(value) {
  const url = new URL(String(value || "http://127.0.0.1:8300"));
  if (
    url.protocol !== "http:" ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error("attachment apply only accepts a loopback HTTP backend");
  }
  return url.origin;
}

function fixture(name, mimeType, content, sizeClass = "small") {
  return { file_name: name, mime_type: mimeType, content, sizeClass };
}

function fixtureDigest(item) {
  return createHash("sha256").update(item.content).digest("hex");
}

export function assertAttachmentFixtureIntegrity({
  fixture: item,
  attachment,
  downloadedAttachment,
}) {
  const expectedHash = fixtureDigest(item);
  const expectedSize = item.content.length;
  const metadata = [attachment, downloadedAttachment];
  for (const [index, value] of metadata.entries()) {
    const label = index === 0 ? "attachment metadata" : "download metadata";
    if (
      String(value?.file_name || "") !== item.file_name ||
      String(value?.mime_type || "") !== item.mime_type ||
      Number(value?.file_size) !== expectedSize ||
      String(value?.sha256 || "").toLowerCase() !== expectedHash ||
      String(value?.note || "") !== ATTACHMENT_NOTE
    ) {
      throw new Error(`${item.file_name} ${label} conflicts with the current fixture`);
    }
  }
  const encoded = String(downloadedAttachment?.content_base64 || "");
  if (!encoded) {
    throw new Error(`${item.file_name} downloaded content is empty`);
  }
  const downloaded = Buffer.from(encoded, "base64");
  if (
    downloaded.length !== expectedSize ||
    createHash("sha256").update(downloaded).digest("hex") !== expectedHash
  ) {
    throw new Error(`${item.file_name} downloaded content conflicts with the current fixture`);
  }
  return Object.freeze({ sha256: expectedHash, fileSize: expectedSize });
}

export function buildAttachmentFixtures({ includeNearLimit = true } = {}) {
  const fixtures = [
    fixture(
      "订单要求.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4\n% simulated acceptance evidence\n%%EOF\n"),
    ),
    fixture(
      "产品正面图.png",
      "image/png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    ),
    fixture(
      "包装唛头.jpg",
      "image/jpeg",
      Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==", "base64"),
    ),
    fixture(
      "数量交期表.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      Buffer.from("PK\u0003\u0004simulated-xlsx-acceptance-sheet"),
    ),
  ];
  if (includeNearLimit) {
    fixtures.push(
      fixture(
        "补充说明-云朵小熊大号礼盒装数量与交期.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Buffer.concat([
          Buffer.from("PK\u0003\u0004"),
          Buffer.alloc(4_500_000, 0x41),
        ]),
        "near-limit",
      ),
    );
  }
  return fixtures;
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function firstStepID(report, target) {
  const step = report.steps?.find(
    (item) => item.target === target && Number(item.id) > 0,
  );
  if (!step) throw new Error(`source report is missing ${target}`);
  return Number(step.id);
}

function sourceDrivenFactOwnerID(report, key) {
  if (report?.reportContract !== SOURCE_DRIVEN_FACT_REPORT_CONTRACT) {
    throw new Error(
      `fact report must use ${SOURCE_DRIVEN_FACT_REPORT_CONTRACT}`,
    );
  }
  const id = Number(report?.referenceRecords?.attachmentOwners?.[key]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(
      `fact report is missing referenceRecords.attachmentOwners.${key}`,
    );
  }
  const listKey =
    key === "productionFactId" ? "productionFacts" : "financeFacts";
  const record = report?.referenceRecords?.[listKey]?.find(
    (item) => Number(item?.id) === id,
  );
  if (!record || String(record.status || "").toUpperCase() !== "POSTED") {
    throw new Error(
      `referenceRecords.attachmentOwners.${key} must reference a POSTED ${listKey} record from this batch`,
    );
  }
  return id;
}

function requiredReportText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function resolveAttachmentCredentials({
  attestation,
  adminPassword,
  rolePassword,
  password,
  env = process.env,
} = {}) {
  const effectiveRolePassword = rolePassword || env.MANUAL_ACCEPTANCE_PASSWORD;
  if (typeof effectiveRolePassword !== "string" || !effectiveRolePassword) {
    throw new Error("MANUAL_ACCEPTANCE_PASSWORD is required");
  }
  const effectiveAdminPassword =
    adminPassword || password || env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD;
  if (typeof effectiveAdminPassword !== "string" || !effectiveAdminPassword) {
    throw new Error("MANUAL_ACCEPTANCE_ADMIN_PASSWORD is required");
  }
  if (effectiveAdminPassword === effectiveRolePassword) {
    throw new Error(
      "manual acceptance admin and role passwords must be independent",
    );
  }
  return {
    adminPassword: effectiveAdminPassword,
    rolePassword: effectiveRolePassword,
  };
}

function validateAttachmentFactReport(report) {
  if (
    report?.reportContract !== SOURCE_DRIVEN_FACT_REPORT_CONTRACT ||
    report?.mode !== "apply" ||
    report?.simulatedOnly !== true ||
    report?.realCustomerImport !== false
  ) {
    throw new Error(
      `fact report must use ${SOURCE_DRIVEN_FACT_REPORT_CONTRACT} apply contract`,
    );
  }
  for (const key of [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
    "semanticDigest",
  ]) {
    requiredReportText(report[key], `fact report ${key}`);
  }
  if (
    !report.runtime ||
    !requiredReportText(
      report.runtime.environment,
      "fact report runtime.environment",
    ) ||
    report.runtime.customerKey !== CUSTOMER_KEY ||
    !requiredReportText(
      report.runtime.configRevision,
      "fact report runtime.configRevision",
    ) ||
    report.runtime.source !== "active_customer_config_revision"
  ) {
    throw new Error("fact report runtime is invalid");
  }
  for (const key of FACT_REFERENCE_KEYS) {
    const items = report.referenceRecords?.[key];
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`fact report referenceRecords.${key} is required`);
    }
    for (const [index, item] of items.entries()) {
      if (!Number.isSafeInteger(Number(item?.id)) || Number(item.id) <= 0) {
        throw new Error(
          `fact report referenceRecords.${key}[${index}].id is invalid`,
        );
      }
    }
  }
  sourceDrivenFactOwnerID(report, "productionFactId");
  sourceDrivenFactOwnerID(report, "financeFactId");
  return report;
}

function validateAttachmentInputReport(report, name) {
  if (
    report?.mode !== "apply" ||
    report?.simulatedOnly !== true ||
    report?.realCustomerImport !== false
  ) {
    throw new Error(`${name} is not a simulated apply report`);
  }
  for (const key of [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
  ]) {
    requiredReportText(report[key], `${name}.${key}`);
  }
  return report;
}

export function validateAttachmentReportBatch({
  backendURL,
  databaseName,
  sourceReport,
  factReport,
  taskReport,
  targetConfirmation,
  targetAttestation,
}) {
  validateAttachmentInputReport(sourceReport, "source report");
  validateAttachmentFactReport(factReport);
  validateAttachmentInputReport(taskReport, "task report");
  for (const key of [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
  ]) {
    const values = [sourceReport, factReport, taskReport].map((report) =>
      String(report[key] || "").trim(),
    );
    if (new Set(values).size !== 1) {
      throw new Error(
        "source, fact, and task reports must use the same dataset batch",
      );
    }
  }
  let policy;
  try {
    policy = resolveManualAcceptanceTarget({
      backendURL,
      target: factReport.target,
      datasetKey: factReport.datasetKey,
      dataVersion: factReport.dataVersion,
      runId: factReport.runId,
      databaseName: databaseName || factReport.databaseName,
    });
    if (
      policy.backendURL !== factReport.backendURL ||
      policy.databaseName !== factReport.databaseName
    ) {
      throw new Error(
        "backendURL and databaseName must exactly match the bound fact report",
      );
    }
    assertManualAcceptanceMutationTarget(policy, {
      confirmation:
        targetConfirmation || process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    });
    const parsed = parseManualAcceptanceTargetAttestation(
      targetAttestation ??
        process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    );
    if (policy.target === CUSTOMER_TRIAL_133_TARGET) {
      const attestation = assertManualAcceptanceTargetAttestation({
        policy,
        attestation: parsed,
      });
      const capabilities = manualAcceptanceRuntimeCapabilitiesFromAttestation({
        policy,
        attestation,
      });
      if (
        factReport.runtime.environment !== capabilities.environment ||
        factReport.runtime.targetAttestation?.source !== "out-of-band" ||
        factReport.runtime.targetAttestation?.release !== attestation.release ||
        factReport.runtime.targetAttestation?.migration !==
          attestation.migration
      ) {
        throw new Error(
          "fact report runtime attestation does not match customer-trial-133",
        );
      }
      return { policy, attestation };
    }
    if (parsed) {
      throw new Error(
        "target attestation is only valid for customer-trial-133",
      );
    }
    return { policy, attestation: undefined };
  } catch (error) {
    throw new Error(String(error?.message || error));
  }
}

export function buildAttachmentTargets({
  sourceReport,
  factReport,
  workflowTask,
}) {
  const richSales = sourceReport.referenceRecords?.salesOrders?.find(
    (item) => item.items?.length === 25,
  );
  const productionFactID = sourceDrivenFactOwnerID(
    factReport,
    "productionFactId",
  );
  const financeFactID = sourceDrivenFactOwnerID(factReport, "financeFactId");
  if (!richSales || !workflowTask?.id || !workflowTask?.version) {
    throw new Error("attachment target reports are incomplete");
  }
  return [
    { owner_type: "sales_order", owner_id: Number(richSales.id), files: 5 },
    {
      owner_type: "purchase_order",
      owner_id: firstStepID(sourceReport, "purchase_order"),
      files: 4,
    },
    {
      owner_type: "outsourcing_order",
      owner_id: firstStepID(sourceReport, "outsourcing_order"),
      files: 4,
    },
    {
      owner_type: "bom_header",
      owner_id: firstStepID(sourceReport, "bom_version"),
      files: 3,
    },
    { owner_type: "production_fact", owner_id: productionFactID, files: 3 },
    { owner_type: "finance_fact", owner_id: financeFactID, files: 3 },
    {
      owner_type: "workflow_task",
      owner_id: Number(workflowTask.id),
      expected_version: Number(workflowTask.version),
      files: 5,
    },
  ];
}

export function selectAttachmentWorkflowTask(
  tasks = [],
  { sourceType, sourceID } = {},
) {
  const expectedSourceType = String(sourceType || "").trim();
  const expectedSourceID = Number(sourceID);
  if (
    !expectedSourceType ||
    !Number.isSafeInteger(expectedSourceID) ||
    expectedSourceID <= 0
  ) {
    return undefined;
  }
  return (Array.isArray(tasks) ? tasks : []).find(
    (item) =>
      item?.task_group === "trial_pmc_work" &&
      item?.task_status_key === "ready" &&
      item?.owner_role_key === "pmc" &&
      item?.source_type === expectedSourceType &&
      Number(item?.source_id) === expectedSourceID &&
      item?.payload?.simulated_only === true &&
      item?.payload?.real_customer_data === false &&
      item?.payload?.trial_task === true,
  );
}

async function rpc({ backendURL, domain, method, params = {}, token = "" }) {
  const response = await fetch(`${backendURL}/rpc/${domain}`, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `attachment-${Date.now()}`,
      method,
      params,
    }),
  });
  const body = await response.json();
  if (!response.ok || body?.result?.code !== 0) {
    throw new Error(
      `${domain}.${method} code=${body?.result?.code ?? response.status} message=${body?.result?.message || "request failed"}`,
    );
  }
  return body.result.data || {};
}

export async function applyAttachmentData({
  backendURL,
  databaseName,
  password,
  adminPassword,
  rolePassword,
  sourceReportPath,
  factReportPath,
  taskReportPath,
  confirm,
  targetConfirmation,
  targetAttestation,
}) {
  if (confirm !== CONFIRM_PHRASE)
    throw new Error(`confirmation must equal ${CONFIRM_PHRASE}`);
  const sourceReport = readJSON(sourceReportPath);
  const factReport = readJSON(factReportPath);
  const taskReport = readJSON(taskReportPath);
  const { policy, attestation } = validateAttachmentReportBatch({
    backendURL,
    databaseName,
    sourceReport,
    factReport,
    taskReport,
    targetConfirmation,
    targetAttestation,
  });
  const credentials = resolveAttachmentCredentials({
    attestation,
    adminPassword,
    rolePassword,
    password,
  });
  backendURL = policy.backendURL;
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy,
    attestation,
    fetchImpl: fetch,
  });
  buildAttachmentTargets({
    sourceReport,
    factReport,
    workflowTask: { id: 1, version: 1 },
  });
  if (
    !String(taskReport?.sourceType || "").trim() ||
    !Number.isSafeInteger(Number(taskReport?.sourceID)) ||
    Number(taskReport.sourceID) <= 0
  ) {
    throw new Error("task report is missing a stable source reference");
  }
  const adminLogin = await rpc({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username: "admin", password: credentials.adminPassword },
  });
  if (adminLogin.is_super_admin !== true) {
    throw new Error("admin must be a local super admin");
  }
  const runtimeAdminToken = adminLogin.access_token || adminLogin.token;
  if (!runtimeAdminToken) {
    throw new Error("admin login response is missing access token");
  }
  const capabilities = await rpc({
    backendURL,
    domain: "debug",
    method: "capabilities",
    token: runtimeAdminToken,
  });
  assertManualAcceptanceDatabaseIdentity({ policy, capabilities });
  const pmcLogin = await rpc({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username: "demo_pmc", password: credentials.rolePassword },
  });
  const pmcToken = pmcLogin.access_token || pmcLogin.token;
  if (!pmcToken)
    throw new Error("demo_pmc login response is missing access token");
  const actorTokens = {
    sales_order: runtimeAdminToken,
    purchase_order: runtimeAdminToken,
    outsourcing_order: runtimeAdminToken,
    bom_header: runtimeAdminToken,
    production_fact: runtimeAdminToken,
    finance_fact: runtimeAdminToken,
    workflow_task: pmcToken,
  };
  const sessionData = await rpc({
    backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    params: { customer_key: CUSTOMER_KEY },
    token: runtimeAdminToken,
  });
  const session = sessionData.session || {};
  let runtime;
  try {
    runtime = assertManualAcceptanceRuntimePolicy({
      policy,
      capabilities,
      session,
      requiredModules: ATTACHMENT_REQUIRED_MODULES,
      customerKey: CUSTOMER_KEY,
    });
  } catch (error) {
    throw new Error(String(error?.message || error));
  }
  if (
    runtime.environment !== factReport.runtime.environment ||
    runtime.customerKey !== factReport.runtime.customerKey ||
    runtime.configRevision !== factReport.runtime.configRevision ||
    runtime.source !== factReport.runtime.source
  ) {
    throw new Error("current runtime does not match the bound fact report");
  }
  if (attestation) {
    runtime = {
      ...runtime,
      targetAttestation: {
        source: "out-of-band",
        release: attestation.release,
        migration: attestation.migration,
      },
    };
  }
  const taskList = await rpc({
    backendURL,
    domain: "workflow",
    method: "list_tasks",
    params: {
      source_type: taskReport.sourceType,
      source_id: taskReport.sourceID,
      limit: 200,
    },
    token: actorTokens.workflow_task,
  });
  const workflowTask = selectAttachmentWorkflowTask(taskList.tasks, {
    sourceType: taskReport.sourceType,
    sourceID: taskReport.sourceID,
  });
  const targets = buildAttachmentTargets({
    sourceReport,
    factReport,
    workflowTask,
  });
  const fixtures = buildAttachmentFixtures();
  const steps = [];
  for (const target of targets) {
    const actorToken = actorTokens[target.owner_type];
    const listed = await rpc({ backendURL, domain: "attachment", method: "list_attachments", params: { owner_type: target.owner_type, owner_id: target.owner_id }, token: actorToken });
    const existing = new Map();
    for (const listedItem of listed.attachments || []) {
      if (existing.has(listedItem.file_name)) {
        throw new Error(
          `${target.owner_type}:${target.owner_id} has duplicate attachment name ${listedItem.file_name}`,
        );
      }
      existing.set(listedItem.file_name, listedItem);
    }
    for (const item of fixtures.slice(0, target.files)) {
      let attachment = existing.get(item.file_name);
      let operation = "reuse";
      if (!attachment) {
        let uploaded;
        try {
          uploaded = await rpc({
            backendURL,
            domain: "attachment",
            method: "upload_attachment",
            params: {
              customer_key: CUSTOMER_KEY,
              owner_type: target.owner_type,
              owner_id: target.owner_id,
              ...(target.expected_version
                ? { expected_version: target.expected_version }
                : {}),
              attachment_type: "manual_acceptance_evidence",
              file_name: item.file_name,
              mime_type: item.mime_type,
              content_base64: item.content.toString("base64"),
              note: ATTACHMENT_NOTE,
            },
            token: actorToken,
          });
        } catch (error) {
          throw new Error(
            `${target.owner_type}:${target.owner_id} upload ${item.file_name} failed: ${error.message}`,
          );
        }
        attachment = uploaded.attachment;
        operation = "upload";
      }
      const downloaded = await rpc({ backendURL, domain: "attachment", method: "download_attachment", params: { id: attachment.id }, token: actorToken });
      const integrity = assertAttachmentFixtureIntegrity({
        fixture: item,
        attachment,
        downloadedAttachment: downloaded.attachment,
      });
      steps.push({
        ownerType: target.owner_type,
        ownerId: target.owner_id,
        attachmentId: attachment.id,
        fileName: item.file_name,
        sizeClass: item.sizeClass,
        mimeType: item.mime_type,
        fileSize: integrity.fileSize,
        sha256: integrity.sha256,
        operation,
        actor: target.owner_type === "workflow_task" ? "demo_pmc" : "admin",
      });
    }
    const verified = await rpc({
      backendURL,
      domain: "attachment",
      method: "list_attachments",
      params: { owner_type: target.owner_type, owner_id: target.owner_id },
      token: actorToken,
    });
    if (
      (verified.attachments || []).filter((item) =>
        fixtures.some(
          (fixtureItem) => fixtureItem.file_name === item.file_name,
        ),
      ).length < target.files
    ) {
      throw new Error(
        `${target.owner_type}:${target.owner_id} attachment readback is incomplete`,
      );
    }
  }
  return { scope: "manual-acceptance-attachment-data", customerKey: CUSTOMER_KEY, simulatedOnly: true, datasetKey: factReport.datasetKey, dataVersion: factReport.dataVersion, runId: factReport.runId, target: factReport.target, backendURL: policy.backendURL, databaseName: policy.databaseName, semanticDigest: factReport.semanticDigest, runtime, actorPolicy: { crossDomainSeed: "admin", workflowTask: "demo_pmc", rolePageAccessVerifiedElsewhere: true }, summary: { targets: targets.length, attachments: steps.length, uploaded: steps.filter((item) => item.operation === "upload").length, reused: steps.filter((item) => item.operation === "reuse").length }, steps };
}

async function main() {
  const args = new Map(
    process.argv.slice(2).map((value, index, all) => [value, all[index + 1]]),
  );
  const report = await applyAttachmentData({
    backendURL: args.get("--backend-url") || "http://127.0.0.1:8300",
    databaseName:
      args.get("--database-name") ||
      process.env.MANUAL_ACCEPTANCE_DATABASE_NAME,
    adminPassword: process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    rolePassword: process.env.MANUAL_ACCEPTANCE_PASSWORD,
    confirm: process.env.MANUAL_ACCEPTANCE_ATTACHMENT_CONFIRM,
    sourceReportPath:
      args.get("--source-report") ||
      "output/qa/manual-acceptance/source-data/apply-report.json",
    factReportPath:
      args.get("--fact-report") ||
      "output/qa/manual-acceptance/fact-data/apply-report.json",
    taskReportPath:
      args.get("--task-report") ||
      "output/qa/manual-acceptance/task-data-production/apply-report.json",
  });
  const out =
    args.get("--out") ||
    "output/qa/manual-acceptance/attachment-data/apply-report.json";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `[qa:manual-acceptance-attachment-data] complete attachments=${report.summary.attachments} report=${out}\n`,
  );
}

if (process.argv[1]?.endsWith("manual-acceptance-attachment-data.mjs"))
  main().catch((error) => {
    console.error(
      `[qa:manual-acceptance-attachment-data][fatal] ${error.stack || error}`,
    );
    process.exitCode = 1;
  });
