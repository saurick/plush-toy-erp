import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const workflowSourceFiles = [
  ...readdirSync(path.join(repoRoot, "server/internal/biz"))
    .filter((fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"))
    .map((fileName) => `server/internal/biz/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/data"))
    .filter((fileName) => fileName.startsWith("workflow") && fileName.endsWith(".go"))
    .map((fileName) => `server/internal/data/${fileName}`),
  ...readdirSync(path.join(repoRoot, "server/internal/service"))
    .filter((fileName) => fileName.startsWith("jsonrpc_workflow") && fileName.endsWith(".go"))
    .map((fileName) => `server/internal/service/${fileName}`),
];

const forbiddenRuntimeFactReferences = [
  "OperationalFactUsecase",
  "OperationalFactRepo",
  "CreateProductionFactDraft",
  "CreateOutsourcingFactDraft",
  "CreateFinanceFactDraft",
  "PostProductionFact",
  "PostOutsourcingFact",
  "PostFinanceFact",
  "ShipShipment",
  "inventory_txns",
  "inventory_balances",
  "inventory_lots",
  "production_facts",
  "outsourcing_facts",
  "finance_facts",
  "shipment_items",
];

test("workflow fact boundary: workflow runtime does not post domain facts", () => {
  assert(workflowSourceFiles.length > 0, "expected workflow runtime files");
  for (const relativePath of workflowSourceFiles) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    for (const forbidden of forbiddenRuntimeFactReferences) {
      assert(
        !source.includes(forbidden),
        `${relativePath} must not reference ${forbidden}; call domain usecases from explicit domain entries instead`,
      );
    }
  }
});

test("workflow fact boundary: workflow explain exposes guarded domain command entry", () => {
  const source = readFileSync(
    path.join(repoRoot, "server/internal/service/jsonrpc_workflow_task.go"),
    "utf8",
  );
  for (const expected of [
    "domain_command_entry",
    "action_domain_command_entries",
    "guarded_no_domain_command_contract",
    "domain_command_contract_not_configured",
    "workflow_payload_command_key_ignored",
    "will_write_fact",
  ]) {
    assert(
      source.includes(expected),
      `jsonrpc_workflow_task.go should expose guarded domain command entry token ${expected}`,
    );
  }
});

test("status architecture is target-only and separates delivery evidence", () => {
  const statusIndex = readFileSync(
    path.join(repoRoot, "docs/architecture/状态字典与生命周期索引.md"),
    "utf8",
  );
  const workflowBoundary = readFileSync(
    path.join(repoRoot, "docs/architecture/状态工作流事实边界.md"),
    "utf8",
  );
  const roleProjection = readFileSync(
    path.join(repoRoot, "docs/product/多甲方角色能力与流程编排.md"),
    "utf8",
  );

  function extractH2Section(source, heading) {
    const marker = `## ${heading}`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing section ${heading}`);
    const end = source.indexOf("\n## ", start + marker.length);
    return source.slice(start, end === -1 ? source.length : end);
  }

  function extractTextTree(source, heading) {
    const marker = `### ${heading}`;
    const headingStart = source.indexOf(marker);
    assert.notEqual(headingStart, -1, `missing tree heading ${heading}`);
    const fenceStart = source.indexOf("```text", headingStart + marker.length);
    assert.notEqual(fenceStart, -1, `missing text fence for ${heading}`);
    const contentStart = source.indexOf("\n", fenceStart) + 1;
    const fenceEnd = source.indexOf("\n```", contentStart);
    assert.notEqual(fenceEnd, -1, `missing closing fence for ${heading}`);
    return source.slice(contentStart, fenceEnd);
  }

  function requireUniqueLine(scopeName, source, label, required, forbidden = []) {
    const matches = source.split("\n").filter((line) => line.includes(label));
    assert.equal(matches.length, 1, `${scopeName} must contain one ${label} line`);
    const line = matches[0];
    for (const token of required) {
      assert(line.includes(token), `${scopeName} ${label} line must include ${token}`);
    }
    for (const token of forbidden) {
      assert(!line.includes(token), `${scopeName} ${label} line must exclude ${token}`);
    }
  }

  function requirePrefixedLine(scopeName, source, prefix, required) {
    const matches = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith(prefix));
    assert.equal(matches.length, 1, `${scopeName} must contain one ${prefix} line`);
    for (const token of required) {
      assert(
        matches[0].includes(token),
        `${scopeName} ${prefix} line must include ${token}`,
      );
    }
  }

  const chineseTree = extractTextTree(statusIndex, "中文状态字典树");
  const englishTree = extractTextTree(statusIndex, "English Status Dictionary Tree");
  for (const [treeName, tree] of [
    ["Chinese tree", chineseTree],
    ["English tree", englishTree],
  ]) {
    assert.doesNotMatch(
      tree,
      /\[(?:C|L|P|D)(?:\s*\/\s*(?:C|L|P|D))*\]/iu,
      `${treeName} must not use availability markers`,
    );
    for (const term of ["current", "legacy", "compatibility", "planned", "deferred"]) {
      assert(!tree.toLowerCase().includes(term), `${treeName} must exclude ${term}`);
    }
    assert(!tree.includes("WorkflowReconcileJob"), `${treeName} must exclude draft jobs`);
  }

  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "协同任务",
    ["创建", "可执行", "阻塞", "已完成", "已退回"],
    ["待开始", "处理中", "已取消", "已关闭"],
  );
  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "物料清单",
    ["草稿", "生效", "已归档"],
    ["已停用"],
  );
  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "流程实例",
    ["运行中", "已完成", "已阻塞"],
    ["已取消"],
  );
  requireUniqueLine(
    "Chinese tree",
    chineseTree,
    "流程节点",
    ["等待中", "运行中", "已完成", "已阻塞"],
    ["已跳过", "已失败"],
  );

  requireUniqueLine(
    "English tree",
    englishTree,
    "task:",
    ["create", "ready", "blocked", "done", "rejected"],
    ["pending", "processing", "cancelled", "closed"],
  );
  requireUniqueLine(
    "English tree",
    englishTree,
    "BOM:",
    ["DRAFT", "ACTIVE", "ARCHIVED"],
    ["DISABLED"],
  );
  requireUniqueLine(
    "English tree",
    englishTree,
    "instance:",
    ["active", "completed", "blocked"],
    ["cancelled"],
  );
  requireUniqueLine(
    "English tree",
    englishTree,
    "node:",
    ["waiting", "active", "completed", "blocked"],
    ["skipped", "failed"],
  );

  assert(
    roleProjection.includes("状态字典与生命周期索引.md"),
    "role projection document must link the status dictionary source of truth",
  );

  const taskContract = extractH2Section(
    statusIndex,
    "Workflow 任务合同 / Workflow Task Contract",
  );
  requirePrefixedLine("task contract", taskContract, "ready", [
    "blocked",
    "done",
    "rejected",
  ]);
  requirePrefixedLine("task contract", taskContract, "blocked", ["ready"]);
  requireUniqueLine(
    "task contract",
    taskContract,
    "任务看板只接受",
    ["all", "ready", "blocked", "rejected", "done", "overdue", "dueSoon"],
  );
  requireUniqueLine(
    "task contract",
    taskContract,
    "`resume`",
    ["blocked → ready", "business_status_key", "workflow_business_states", "保持 `blocked`"],
  );

  const evidence = extractH2Section(
    statusIndex,
    "实现、迁移与发布证据 / Implementation, Migration And Release Evidence",
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "中央状态合同",
    ["registry", "transition", "只证明中央允许集合与转换图"],
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "跨层调用方与生成物",
    ["已收口", "repo", "service", "API", "UI", "seed", "fixture", "tests", "Ent generated"],
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "| versioned migration |",
    ["20260714055504", "不能证明", "目标数据库"],
  );
  requireUniqueLine("implementation evidence", evidence, "| 目标环境 |", ["未发布"]);
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "一次性转换完成后",
    ["usecase", "repo", "API", "UI", "查询筛选"],
  );
  requireUniqueLine(
    "implementation evidence",
    evidence,
    "正式运行代码只识别目标集合",
    ["集合外 key", "失败"],
  );

  const dataBoundary = extractH2Section(
    workflowBoundary,
    "数据、迁移与发布边界",
  );
  requireUniqueLine(
    "workflow data boundary",
    dataBoundary,
    "中央 registry",
    ["transition", "跨层调用方", "Ent generated", "versioned migration", "本地 Product Core"],
  );
  requireUniqueLine(
    "workflow data boundary",
    dataBoundary,
    "运行时只接受目标状态集合",
    ["集合外 key", "失败"],
  );
  requireUniqueLine(
    "workflow data boundary",
    dataBoundary,
    "一次性转换只服务迁移窗口",
    ["usecase", "repo", "API", "UI", "查询筛选"],
  );
  requireUniqueLine("workflow data boundary", dataBoundary, "正式 Atlas migration", [
    "20260714055504",
    "不能证明",
    "目标数据库已迁移",
  ]);
  requireUniqueLine("workflow data boundary", dataBoundary, "发布证据", ["未发布"]);
});
