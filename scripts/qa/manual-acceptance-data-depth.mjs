#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { buildManualAcceptanceSourceDataPlan } from "./manual-acceptance-source-data.mjs";
import { buildManualAcceptanceTaskDataPlan } from "./manual-acceptance-task-data.mjs";

export const ATTACHMENT_FIXTURES = Object.freeze([
  Object.freeze({ fileName: "试用-客户确认的订单要求.pdf", mimeType: "application/pdf", sizeClass: "small" }),
  Object.freeze({ fileName: "试用-产品正面参考图.png", mimeType: "image/png", sizeClass: "medium" }),
  Object.freeze({ fileName: "试用-包装与唛头参考图.jpg", mimeType: "image/jpeg", sizeClass: "medium" }),
  Object.freeze({ fileName: "试用-数量与交期核对表.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeClass: "small" }),
  Object.freeze({ fileName: "试用-补充说明-名称较长用于检查完整显示与下载.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeClass: "near-limit" }),
]);

export const ATTACHMENT_OWNER_SCENARIOS = Object.freeze([
  Object.freeze({ ownerType: "sales_order", files: 5 }),
  Object.freeze({ ownerType: "purchase_order", files: 4 }),
  Object.freeze({ ownerType: "outsourcing_order", files: 4 }),
  Object.freeze({ ownerType: "bom_header", files: 3 }),
  Object.freeze({ ownerType: "production_fact", files: 3 }),
  Object.freeze({ ownerType: "finance_fact", files: 3 }),
  Object.freeze({ ownerType: "workflow_task", files: 5, requiresExpectedVersion: true }),
]);

export const CAPACITY_PROFILES = Object.freeze({
  manual: Object.freeze({
    purpose: "甲方逐页手工验收",
    sourceDocuments: 45,
    maximumLinesPerDocument: 25,
    workflowTasks: 180,
    factsPerBusinessPage: 45,
    attachments: 27,
    concurrentUsers: 1,
  }),
  capacity: Object.freeze({
    purpose: "分页、筛选、导出和长列表容量回归",
    sourceDocuments: 1000,
    maximumLinesPerDocument: 100,
    workflowTasks: 5000,
    factsPerBusinessPage: 2000,
    attachments: 1000,
    concurrentUsers: 20,
  }),
  stress: Object.freeze({
    purpose: "独立环境并发压测，不写共享试用库",
    sourceDocuments: 10000,
    maximumLinesPerDocument: 200,
    workflowTasks: 50000,
    factsPerBusinessPage: 20000,
    attachments: 10000,
    concurrentUsers: 100,
  }),
});

function lineCounts(records = []) {
  return records.map((record) => record.items?.length || 0);
}

function distribution(values = []) {
  return Object.fromEntries(
    [...new Set(values)].sort((a, b) => a - b).map((value) => [
      value,
      values.filter((item) => item === value).length,
    ]),
  );
}

export function buildManualAcceptanceDataDepthReport(options = {}) {
  const source = buildManualAcceptanceSourceDataPlan({
    runId: options.runId || "DEPTH-AUDIT",
    backendURL: options.backendURL || "http://127.0.0.1:8300",
  });
  const tasks = buildManualAcceptanceTaskDataPlan({
    runId: options.taskRunId || "DEPTH-TASKS",
    backendURL: options.backendURL || "http://127.0.0.1:8300",
  });
  const documentDepth = Object.fromEntries(
    ["salesOrders", "purchaseOrders", "outsourcingOrders", "bomVersions"].map(
      (key) => [key, distribution(lineCounts(source.records[key]))],
    ),
  );
  const contactDepth = Object.fromEntries(
    ["customers", "suppliers"].map((key) => [
      key,
      distribution(source.records[key].map((record) => record.contacts.length)),
    ]),
  );
  const taskGroups = Object.fromEntries(
    [...new Set(tasks.tasks.map((task) => task.createParams.task_group))]
      .sort()
      .map((group) => [
        group,
        tasks.tasks.filter((task) => task.createParams.task_group === group).length,
      ]),
  );

  return {
    scope: "manual-acceptance-data-depth",
    runId: source.runId,
    simulatedOnly: true,
    writesBackend: false,
    evidence: {
      documentDepth,
      contactDepth,
      taskGroups,
      fieldScenarios: [
        "必填字段完整",
        "允许为空的选填字段",
        "长名称与长备注",
        "小数数量与金额",
        "过去、今天与未来日期",
        "启用、停用与完整业务状态",
      ],
      attachmentFixtures: ATTACHMENT_FIXTURES,
      attachmentOwners: ATTACHMENT_OWNER_SCENARIOS,
    },
    capacityProfiles: CAPACITY_PROFILES,
    pressureTestClaim: {
      manualProfileIsPressureTest: false,
      capacityProfileRequiresIsolatedDatabase: true,
      stressProfileRequiresIsolatedDatabase: true,
      requiredMetrics: [
        "请求总数与成功率",
        "每秒吞吐量",
        "p50、p95、p99 响应时间",
        "超时与业务错误分布",
        "数据库连接池等待与锁等待",
        "幂等重试是否产生重复事实",
        "压测前后业务数量与金额一致性",
      ],
    },
  };
}

function main() {
  process.stdout.write(`${JSON.stringify(buildManualAcceptanceDataDepthReport(), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
