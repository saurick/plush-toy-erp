#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

export const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const CUSTOMER_KEY = "yoyoosun";

export function normalizeLocalBackendURL(value) {
  const url = new URL(String(value || "http://127.0.0.1:8300"));
  if (url.protocol !== "http:" || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error("attachment apply only accepts a loopback HTTP backend");
  }
  return url.origin;
}

function fixture(name, mimeType, content, sizeClass = "small") {
  return { file_name: name, mime_type: mimeType, content, sizeClass };
}

export function buildAttachmentFixtures({ includeNearLimit = true } = {}) {
  const fixtures = [
    fixture("试用-客户确认的订单要求.pdf", "application/pdf", Buffer.from("%PDF-1.4\n% simulated acceptance evidence\n%%EOF\n")),
    fixture("试用-产品正面参考图.png", "image/png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")),
    fixture("试用-包装与唛头参考图.jpg", "image/jpeg", Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==", "base64")),
    fixture("试用-数量与交期核对表.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from("PK\u0003\u0004simulated-xlsx-acceptance-sheet")),
  ];
  if (includeNearLimit) {
    fixtures.push(
      fixture(
        "试用-补充说明-名称较长用于检查完整显示与下载.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(4_500_000, 0x41)]),
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
  const step = report.steps?.find((item) => item.target === target && Number(item.id) > 0);
  if (!step) throw new Error(`source report is missing ${target}`);
  return Number(step.id);
}

export function buildAttachmentTargets({ sourceReport, factReport, workflowTask }) {
  const richSales = sourceReport.referenceRecords?.salesOrders?.find((item) => item.items?.length === 25);
  const operational = factReport.operationalSteps?.flatMap((item) => item.steps || []) || [];
  const production = operational.find((item) => item.method === "create_production_fact");
  const finance = operational.find((item) => item.method === "create_finance_fact");
  if (!richSales || !production?.id || !finance?.id || !workflowTask?.id || !workflowTask?.version) {
    throw new Error("attachment target reports are incomplete");
  }
  return [
    { owner_type: "sales_order", owner_id: Number(richSales.id), files: 5 },
    { owner_type: "purchase_order", owner_id: firstStepID(sourceReport, "purchase_order"), files: 4 },
    { owner_type: "outsourcing_order", owner_id: firstStepID(sourceReport, "outsourcing_order"), files: 4 },
    { owner_type: "bom_header", owner_id: firstStepID(sourceReport, "bom_version"), files: 3 },
    { owner_type: "production_fact", owner_id: Number(production.id), files: 3 },
    { owner_type: "finance_fact", owner_id: Number(finance.id), files: 3 },
    { owner_type: "workflow_task", owner_id: Number(workflowTask.id), expected_version: Number(workflowTask.version), files: 5 },
  ];
}

async function rpc({ backendURL, domain, method, params = {}, token = "" }) {
  const response = await fetch(`${backendURL}/rpc/${domain}`, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: `attachment-${Date.now()}`, method, params }),
  });
  const body = await response.json();
  if (!response.ok || body?.result?.code !== 0) {
    throw new Error(`${domain}.${method} code=${body?.result?.code ?? response.status} message=${body?.result?.message || "request failed"}`);
  }
  return body.result.data || {};
}

export async function applyAttachmentData({ backendURL, password, sourceReportPath, factReportPath, taskReportPath, confirm }) {
  if (confirm !== CONFIRM_PHRASE) throw new Error(`confirmation must equal ${CONFIRM_PHRASE}`);
  backendURL = normalizeLocalBackendURL(backendURL);
  if (!password) throw new Error("MANUAL_ACCEPTANCE_ADMIN_PASSWORD is required");
  const login = await rpc({ backendURL, domain: "auth", method: "admin_login", params: { username: "admin", password } });
  if (login.is_super_admin !== true) throw new Error("admin must be a local super admin");
  const token = login.access_token || login.token;
  if (!token) throw new Error("admin login response is missing access token");
  const capabilities = await rpc({ backendURL, domain: "debug", method: "capabilities", token });
  if (!new Set(["local", "dev"]).has(capabilities.environment)) throw new Error(`unsafe environment=${capabilities.environment || "unknown"}`);
  const sessionData = await rpc({ backendURL, domain: "customer_config", method: "get_effective_session", params: { customer_key: CUSTOMER_KEY }, token });
  const session = sessionData.session || {};
  if (session.source !== "active_customer_config_revision" || session.customer?.key !== CUSTOMER_KEY || !session.configRevision) {
    throw new Error("active yoyoosun revision is required");
  }
  const actorUsers = {
    sales_order: "demo_sales",
    purchase_order: "demo_purchase",
    outsourcing_order: "demo_production",
    bom_header: "demo_engineering",
    production_fact: "demo_production",
    finance_fact: "demo_finance",
    workflow_task: "demo_pmc",
  };
  const actorTokens = {};
  for (const [ownerType, username] of Object.entries(actorUsers)) {
    const actorLogin = await rpc({ backendURL, domain: "auth", method: "admin_login", params: { username, password } });
    actorTokens[ownerType] = actorLogin.access_token || actorLogin.token;
    if (!actorTokens[ownerType]) throw new Error(`${username} login response is missing access token`);
  }
  const taskReport = readJSON(taskReportPath);
  const taskList = await rpc({ backendURL, domain: "workflow", method: "list_tasks", params: { source_type: taskReport.sourceType, source_id: taskReport.sourceID, limit: 200 }, token: actorTokens.workflow_task });
  const workflowTask = taskList.tasks?.find(
    (item) =>
      item.task_group === "production_scheduling" &&
      ["ready", "processing"].includes(item.task_status_key),
  );
  const targets = buildAttachmentTargets({ sourceReport: readJSON(sourceReportPath), factReport: readJSON(factReportPath), workflowTask });
  const fixtures = buildAttachmentFixtures();
  const steps = [];
  for (const target of targets) {
    const actorToken = actorTokens[target.owner_type];
    const listed = await rpc({ backendURL, domain: "attachment", method: "list_attachments", params: { owner_type: target.owner_type, owner_id: target.owner_id }, token: actorToken });
    const existing = new Map((listed.attachments || []).map((item) => [item.file_name, item]));
    for (const item of fixtures.slice(0, target.files)) {
      let attachment = existing.get(item.file_name);
      let operation = "reuse";
      if (!attachment) {
        let uploaded;
        try {
          uploaded = await rpc({ backendURL, domain: "attachment", method: "upload_attachment", params: {
            customer_key: CUSTOMER_KEY,
            owner_type: target.owner_type,
            owner_id: target.owner_id,
            ...(target.expected_version ? { expected_version: target.expected_version } : {}),
            attachment_type: "manual_acceptance_evidence",
            file_name: item.file_name,
            mime_type: item.mime_type,
            content_base64: item.content.toString("base64"),
            note: "【试用】用于甲方手工验收附件列表、预览和下载。",
          }, token: actorToken });
        } catch (error) {
          throw new Error(`${target.owner_type}:${target.owner_id} upload ${item.file_name} failed: ${error.message}`);
        }
        attachment = uploaded.attachment;
        operation = "upload";
      }
      const downloaded = await rpc({ backendURL, domain: "attachment", method: "download_attachment", params: { id: attachment.id }, token: actorToken });
      if (!downloaded.attachment?.content_base64) throw new Error(`attachment ${attachment.id} download is empty`);
      steps.push({ ownerType: target.owner_type, ownerId: target.owner_id, attachmentId: attachment.id, fileName: item.file_name, sizeClass: item.sizeClass, operation });
    }
    const verified = await rpc({ backendURL, domain: "attachment", method: "list_attachments", params: { owner_type: target.owner_type, owner_id: target.owner_id }, token: actorToken });
    if ((verified.attachments || []).filter((item) => fixtures.some((fixtureItem) => fixtureItem.file_name === item.file_name)).length < target.files) {
      throw new Error(`${target.owner_type}:${target.owner_id} attachment readback is incomplete`);
    }
  }
  return { scope: "manual-acceptance-attachment-data", customerKey: CUSTOMER_KEY, simulatedOnly: true, runtime: { environment: capabilities.environment, configRevision: session.configRevision }, summary: { targets: targets.length, attachments: steps.length, uploaded: steps.filter((item) => item.operation === "upload").length, reused: steps.filter((item) => item.operation === "reuse").length }, steps };
}

async function main() {
  const args = new Map(process.argv.slice(2).map((value, index, all) => [value, all[index + 1]]));
  const report = await applyAttachmentData({
    backendURL: args.get("--backend-url") || "http://127.0.0.1:8300",
    password: process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    confirm: process.env.MANUAL_ACCEPTANCE_ATTACHMENT_CONFIRM,
    sourceReportPath: args.get("--source-report") || "output/qa/manual-acceptance/source-data/apply-report.json",
    factReportPath: args.get("--fact-report") || "output/qa/manual-acceptance/fact-data/apply-report.json",
    taskReportPath: args.get("--task-report") || "output/qa/manual-acceptance/task-data-production/apply-report.json",
  });
  const out = args.get("--out") || "output/qa/manual-acceptance/attachment-data/apply-report.json";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`[qa:manual-acceptance-attachment-data] complete attachments=${report.summary.attachments} report=${out}\n`);
}

if (process.argv[1]?.endsWith("manual-acceptance-attachment-data.mjs")) main().catch((error) => { console.error(`[qa:manual-acceptance-attachment-data][fatal] ${error.stack || error}`); process.exitCode = 1; });
